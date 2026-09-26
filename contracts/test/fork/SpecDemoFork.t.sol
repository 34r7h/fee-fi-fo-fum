// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import { Vm } from "forge-std/Vm.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { Math } from "@openzeppelin/contracts/utils/math/Math.sol";
import { IAqua } from "@1inch/aqua/src/interfaces/IAqua.sol";
import { ISwapVM } from "@1inch/swap-vm/src/interfaces/ISwapVM.sol";
import { IHooks } from "@uniswap/v4-core/src/interfaces/IHooks.sol";
import { IPoolManager } from "@uniswap/v4-core/src/interfaces/IPoolManager.sol";
import { Hooks } from "@uniswap/v4-core/src/libraries/Hooks.sol";
import { TickMath } from "@uniswap/v4-core/src/libraries/TickMath.sol";
import { PoolKey } from "@uniswap/v4-core/src/types/PoolKey.sol";
import { Currency } from "@uniswap/v4-core/src/types/Currency.sol";
import { BalanceDelta } from "@uniswap/v4-core/src/types/BalanceDelta.sol";

import { CastleJITHook } from "../../src/CastleJITHook.sol";
import { CastleVault } from "../../src/CastleVault.sol";
import { OffchainQuoteResolver } from "../../src/OffchainQuoteResolver.sol";
import { PriceExtruction } from "../../src/PriceExtruction.sol";
import { CastleForkBase } from "./CastleVaultFork.t.sol";

interface IQuoteRegistry {
    function register(
        string calldata label,
        address owner,
        address registry,
        address resolver,
        uint256 roleBitmap,
        uint64 expiry
    ) external returns (uint256);
    function getResolver(string calldata label) external view returns (address);
}

interface IUniversalResolverV2 {
    function resolve(bytes calldata name, bytes calldata data) external view returns (bytes memory, address);
}

interface IPoolSwapTest {
    struct TestSettings {
        bool takeClaims;
        bool settleUsingBurn;
    }

    function swap(PoolKey memory key, IPoolManager.SwapParams memory params, TestSettings memory testSettings, bytes memory hookData)
        external
        payable
        returns (BalanceDelta);
}

interface ITextResolver {
    function text(bytes32 node, string calldata key) external view returns (string memory);
}

/// @notice One pass of the SPEC demo (09caa66) on a Sepolia fork: 80% harp, 80% hen, greedy 0.5x reverts,
///         quote register, OffchainLookup, harp fill, QuoteExpired, and a PoolSwapTest fill from hen.
///         viem against the live gateway, and the stream, are not in this pass.
/// @dev forge test --match-contract SpecDemoForkTest -vv
contract SpecDemoForkTest is CastleForkBase {
    address internal constant POOL_MANAGER = 0xE03A1074c86CFeDd5C142C4F04F1a1536e203543;
    address internal constant POOL_SWAP_TEST = 0x9B6b46e2c869aa39918Db7f52f5557FE577B6eEe;
    address internal constant CREATE2_DEPLOYER = 0x4e59b44847b379578588920cA78FbF26c0B4956C;
    address internal constant REGISTRY = 0x2F2164507471a1a46506f902aBfdfB9d22e4bE09;
    address internal constant REGISTRAR = 0x67Cc96887d3FFC0860Ebb25412c113f3cad80C99;
    address internal constant UR = 0x5d25C1D6aCBb71B7a28AA7899618a3412a8303e3;
    uint160 internal constant FLAGS =
        Hooks.BEFORE_ADD_LIQUIDITY_FLAG | Hooks.BEFORE_SWAP_FLAG | Hooks.BEFORE_SWAP_RETURNS_DELTA_FLAG;
    bytes32 internal constant SWAP_TOPIC =
        keccak256("Swap(bytes32,address,int128,int128,uint160,uint128,int24,uint24)");
    bytes internal constant DNS = hex"0571756f74650a6665656669666f66756d0365746800";
    bytes4 internal constant OFFCHAIN_LOOKUP = 0x556f1830;

    function test_fork_specDemo() public {
        uint256 w80 = HOARD_WETH * 80 / 100;
        uint256 u80 = HOARD_USDC * 80 / 100;
        uint256 w50 = HOARD_WETH / 2;
        uint256 u50 = HOARD_USDC / 2;

        vm.startPrank(FUM);
        vault.setLeverage(USDC, 2e4);
        vault.setLeverage(WETH, 2e4);
        vault.setCap(HARP, HOARD_WETH, HOARD_USDC);
        vault.setCap(HEN, HOARD_WETH, HOARD_USDC);
        vault.setCap(GREEDY, HOARD_WETH, HOARD_USDC);
        vm.stopPrank();

        (bytes memory pHarp, bytes memory pHen) = (programs.harp(address(priceEx)), programs.xyc(HEN_FEE));
        vm.startPrank(fi);
        uint256 g = gasleft();
        (bytes32 hHarp, ISwapVM.Order memory harp) = vault.ship(HARP, pHarp, w80, u80);
        emit log_named_uint("gas ship harp 80%", g - gasleft());
        g = gasleft();
        (bytes32 hHen, ISwapVM.Order memory hen) = vault.ship(HEN, pHen, w80, u80);
        emit log_named_uint("gas ship hen 80%", g - gasleft());
        vm.expectRevert(
            abi.encodeWithSelector(CastleVault.OverAllocated.selector, WETH, w80 * 2 + w50, HOARD_WETH * 2)
        );
        g = gasleft();
        vault.ship(GREEDY, pHen, w50, u50);
        emit log_named_uint("gas greedy revert", g - gasleft());
        vm.stopPrank();
        assertEq(vault.committed(WETH), w80 * 2, "promises are 1.6x WETH");
        assertEq(vault.strategyIn(GREEDY), bytes32(0));

        string[] memory urls = new string[](1);
        urls[0] = "https://handoff.lol/t/castle/ccip/{sender}/{data}.json";
        address[] memory signers = new address[](1);
        signers[0] = fi;
        OffchainQuoteResolver resolver = new OffchainQuoteResolver(urls, OWNER, signers);
        vm.prank(REGISTRAR);
        g = gasleft();
        IQuoteRegistry(REGISTRY).register("quote", REGISTRAR, address(0), address(resolver), 0, uint64(block.timestamp + 365 days));
        emit log_named_uint("gas register quote", g - gasleft());
        assertEq(IQuoteRegistry(REGISTRY).getResolver("quote"), address(resolver));

        bytes32 node = keccak256(abi.encodePacked(bytes32(0), keccak256("eth")));
        node = keccak256(abi.encodePacked(node, keccak256("feefifofum")));
        node = keccak256(abi.encodePacked(node, keccak256("quote")));
        bytes memory data = abi.encodeCall(ITextResolver.text, (node, "quote:USDC:WETH:1000000"));
        (bool ok, bytes memory ret) = UR.staticcall(abi.encodeCall(IUniversalResolverV2.resolve, (DNS, data)));
        assertFalse(ok);
        assertEq(bytes4(ret), OFFCHAIN_LOOKUP, "UR did not surface OffchainLookup");

        uint256 priceQ96 = (uint256(1 ether) << 96) / 3_000e6;
        PriceExtruction.Quote memory q =
            PriceExtruction.Quote(hHarp, USDC, WETH, priceQ96, 5e6, uint64(block.timestamp + 30));
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(fiKey, priceEx.quoteDigest(q));
        bytes memory takerData = _takerData(AGY, true, abi.encode(q, abi.encodePacked(r, s, v)));
        vm.prank(AGY);
        g = gasleft();
        ISwapVM(ROUTER).swap(harp, USDC, WETH, 1e6, takerData);
        emit log_named_uint("gas harp fill", g - gasleft());
        vm.warp(block.timestamp + 31);
        vm.expectRevert(abi.encodeWithSelector(PriceExtruction.QuoteExpired.selector, q.validUntil));
        vm.prank(AGY);
        ISwapVM(ROUTER).swap(harp, USDC, WETH, 1e6, takerData);

        bytes memory init = abi.encodePacked(
            type(CastleJITHook).creationCode, abi.encode(IPoolManager(POOL_MANAGER), ISwapVM(ROUTER), vault, HEN)
        );
        (bytes32 salt, address predicted) = _mine(keccak256(init));
        (bool deployed,) = CREATE2_DEPLOYER.call(abi.encodePacked(salt, init));
        require(deployed && predicted.code.length != 0, "hook deploy");
        PoolKey memory key = PoolKey({
            currency0: Currency.wrap(USDC),
            currency1: Currency.wrap(WETH),
            fee: 0,
            tickSpacing: 60,
            hooks: IHooks(predicted)
        });
        uint160 sqrtPriceX96 = uint160(Math.sqrt(Math.mulDiv(1e18, 1 << 192, 3_000e6)));
        IPoolManager(POOL_MANAGER).initialize(key, sqrtPriceX96);
        vm.prank(AGY);
        IERC20(USDC).approve(POOL_SWAP_TEST, type(uint256).max);

        (, uint256 quotedOut,) = ISwapVM(ROUTER).quote(hen, USDC, WETH, 1e6, _takerData(address(0), true));
        vm.recordLogs();
        vm.prank(AGY);
        g = gasleft();
        IPoolSwapTest(POOL_SWAP_TEST)
            .swap(
                key,
                IPoolManager.SwapParams({
                    zeroForOne: true,
                    amountSpecified: -1e6,
                    sqrtPriceLimitX96: TickMath.MIN_SQRT_PRICE + 1
                }),
                IPoolSwapTest.TestSettings(false, false),
                abi.encode(quotedOut)
            );
        emit log_named_uint("gas v4 jit swap", g - gasleft());
        Vm.Log[] memory logs = vm.getRecordedLogs();
        bool sawSwap;
        bool sawPulled;
        bool sawPushed;
        for (uint256 i; i < logs.length; ++i) {
            bytes32 t0 = logs[i].topics.length == 0 ? bytes32(0) : logs[i].topics[0];
            if (logs[i].emitter == POOL_MANAGER && t0 == SWAP_TOPIC) sawSwap = true;
            if (logs[i].emitter == AQUA && t0 == IAqua.Pulled.selector) sawPulled = true;
            if (logs[i].emitter == AQUA && t0 == IAqua.Pushed.selector) sawPushed = true;
        }
        assertTrue(sawSwap && sawPulled && sawPushed, "v4 Swap and Aqua Pulled/Pushed in one tx");
        assertEq(vault.strategyIn(HARP), hHarp, "fum did not dock harp");
        assertEq(vault.strategyIn(HEN), hHen, "fum did not dock hen");
        emit log_named_uint("fork block", block.number);
    }

    function _mine(bytes32 initHash) internal pure returns (bytes32 salt, address a) {
        for (uint256 i;; ++i) {
            salt = bytes32(i);
            a = address(uint160(uint256(keccak256(abi.encodePacked(bytes1(0xff), CREATE2_DEPLOYER, salt, initHash)))));
            if (uint160(a) & Hooks.ALL_HOOK_MASK == FLAGS) return (salt, a);
        }
    }
}
