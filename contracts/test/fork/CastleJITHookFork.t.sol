// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import { Vm } from "forge-std/Vm.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { TokenMock } from "@1inch/solidity-utils/contracts/mocks/TokenMock.sol";
import { Math } from "@openzeppelin/contracts/utils/math/Math.sol";
import { IAqua } from "@1inch/aqua/src/interfaces/IAqua.sol";
import { ISwapVM } from "@1inch/swap-vm/src/interfaces/ISwapVM.sol";
import { IHooks } from "@uniswap/v4-core/src/interfaces/IHooks.sol";
import { IPoolManager } from "@uniswap/v4-core/src/interfaces/IPoolManager.sol";
import { IUnlockCallback } from "@uniswap/v4-core/src/interfaces/callback/IUnlockCallback.sol";
import { Hooks } from "@uniswap/v4-core/src/libraries/Hooks.sol";
import { CustomRevert } from "@uniswap/v4-core/src/libraries/CustomRevert.sol";
import { TickMath } from "@uniswap/v4-core/src/libraries/TickMath.sol";
import { PoolKey } from "@uniswap/v4-core/src/types/PoolKey.sol";
import { Currency } from "@uniswap/v4-core/src/types/Currency.sol";
import { BalanceDelta } from "@uniswap/v4-core/src/types/BalanceDelta.sol";

import { CastleVault } from "../../src/CastleVault.sol";
import { CastleJITHook } from "../../src/CastleJITHook.sol";
import { CastleForkBase } from "./CastleVaultFork.t.sol";

/// @dev The live Sepolia PoolSwapTest (v4-core test router), as SPEC.md's swapper.
interface IPoolSwapTest {
    struct TestSettings {
        bool takeClaims;
        bool settleUsingBurn;
    }

    function swap(
        PoolKey memory key,
        IPoolManager.SwapParams memory params,
        TestSettings memory testSettings,
        bytes memory hookData
    ) external payable returns (BalanceDelta delta);
}

/// @title CastleJITHookForkTest
/// @notice Beat 3 on a fork of live Sepolia: CastleJITHook is deployed through the CREATE2 deployer at a mined address
///         carrying exactly its flags, the USDC/WETH pool (fee 0, tick spacing 60) is initialized on the live
///         PoolManager with no liquidity, and a PoolSwapTest swap is filled just in time from the Castle's hen: one tx
///         holds the v4 Swap and the Aqua Pulled/Pushed, and the Castle's balances move by hen's quote.
/// @dev forge test --match-path test/fork/CastleJITHookFork.t.sol
contract CastleJITHookForkTest is CastleForkBase, IUnlockCallback {
    address internal constant POOL_MANAGER = 0xE03A1074c86CFeDd5C142C4F04F1a1536e203543;
    address internal constant POOL_SWAP_TEST = 0x9B6b46e2c869aa39918Db7f52f5557FE577B6eEe;
    address internal constant CREATE2_DEPLOYER = 0x4e59b44847b379578588920cA78FbF26c0B4956C;
    uint160 internal constant FLAGS =
        Hooks.BEFORE_ADD_LIQUIDITY_FLAG | Hooks.BEFORE_SWAP_FLAG | Hooks.BEFORE_SWAP_RETURNS_DELTA_FLAG;

    CastleJITHook internal hook;
    PoolKey internal key;
    bytes32 internal hHen;
    ISwapVM.Order internal hen;

    function setUp() public override {
        super.setUp();
        (,, hHen, hen) = _beat1();

        bytes memory init = abi.encodePacked(
            type(CastleJITHook).creationCode, abi.encode(IPoolManager(POOL_MANAGER), ISwapVM(ROUTER), vault, HEN)
        );
        (bytes32 salt, address predicted) = _mine(keccak256(init));
        uint256 g = gasleft();
        (bool ok,) = CREATE2_DEPLOYER.call(abi.encodePacked(salt, init));
        emit log_named_uint("gas: hook deploy via CREATE2 deployer (excl. 21k base + calldata)", g - gasleft());
        require(ok && predicted.code.length != 0, "hook deploy");
        hook = CastleJITHook(predicted);

        key = PoolKey({
            currency0: Currency.wrap(USDC),
            currency1: Currency.wrap(WETH),
            fee: 0,
            tickSpacing: 60,
            hooks: IHooks(address(hook))
        });
        // raw WETH per raw USDC at 3,000 USDC per WETH; the price is only the pool's display: hen sets every fill
        uint160 sqrtPriceX96 = uint160(Math.sqrt(Math.mulDiv(1e18, 1 << 192, 3_000e6)));
        g = gasleft();
        IPoolManager(POOL_MANAGER).initialize(key, sqrtPriceX96);
        emit log_named_uint("gas: pool initialize (excl. 21k base + calldata)", g - gasleft());

        vm.prank(AGY);
        IERC20(USDC).approve(POOL_SWAP_TEST, type(uint256).max);
        vm.prank(AGY);
        IERC20(WETH).approve(POOL_SWAP_TEST, type(uint256).max);
    }

    /// @dev The first salt whose CREATE2 address through the deployer carries exactly FLAGS in its low 14 bits.
    function _mine(bytes32 initHash) internal pure returns (bytes32 salt, address a) {
        for (uint256 i;; ++i) {
            salt = bytes32(i);
            a = address(uint160(uint256(keccak256(abi.encodePacked(bytes1(0xff), CREATE2_DEPLOYER, salt, initHash)))));
            if (uint160(a) & Hooks.ALL_HOOK_MASK == FLAGS) return (salt, a);
        }
    }

    function _swap(bool zeroForOne, int256 amountSpecified, bytes memory hookData) internal returns (BalanceDelta d) {
        vm.prank(AGY);
        d = IPoolSwapTest(POOL_SWAP_TEST)
            .swap(
                key,
                IPoolManager.SwapParams({
                    zeroForOne: zeroForOne,
                    amountSpecified: amountSpecified,
                    sqrtPriceLimitX96: zeroForOne ? TickMath.MIN_SQRT_PRICE + 1 : TickMath.MAX_SQRT_PRICE - 1
                }),
                IPoolSwapTest.TestSettings({ takeClaims: false, settleUsingBurn: false }),
                hookData
            );
    }

    function _wrapped(bytes memory reason) internal view returns (bytes memory) {
        return abi.encodeWithSelector(
            CustomRevert.WrappedError.selector,
            address(hook),
            IHooks.beforeSwap.selector,
            reason,
            abi.encodeWithSelector(Hooks.HookCallFailed.selector)
        );
    }

    function test_fork_hook_addressCarriesExactlyItsFlags() public view {
        assertEq(uint160(address(hook)) & Hooks.ALL_HOOK_MASK, FLAGS);
        assertEq(address(hook.VAULT()), address(vault));
        assertEq(hook.HEN_SLOT(), HEN);
        assertEq(IERC20(USDC).allowance(address(hook), ROUTER), type(uint256).max);
    }

    /// @dev Beat 3: agy swaps 1 USDC for WETH on the v4 pool; the hook fills it from hen in the same tx.
    function test_fork_v4Swap_filledJustInTimeFromCastle() public {
        uint256 amountIn = 1e6;
        (, uint256 quotedOut,) = ISwapVM(ROUTER).quote(hen, USDC, WETH, amountIn, _hookTaker());
        uint256 vw = IERC20(WETH).balanceOf(address(vault));
        uint256 vu = IERC20(USDC).balanceOf(address(vault));
        uint256 aw = IERC20(WETH).balanceOf(AGY);
        uint256 au = IERC20(USDC).balanceOf(AGY);
        (uint248 henW0,) = IAqua(AQUA).rawBalances(address(vault), ROUTER, hHen, WETH);

        vm.recordLogs();
        uint256 g = gasleft();
        BalanceDelta d = _swap(true, -int256(amountIn), abi.encode(quotedOut));
        emit log_named_uint(
            "gas: v4 swap through PoolSwapTest, JIT from hen (excl. 21k base + calldata)", g - gasleft()
        );
        Vm.Log[] memory logs = vm.getRecordedLogs();

        assertEq(d.amount0(), -int128(int256(amountIn)), "agy paid exactly amountIn");
        assertEq(d.amount1(), int128(int256(quotedOut)), "agy got hen's quote");
        assertEq(IERC20(USDC).balanceOf(AGY), au - amountIn);
        assertEq(IERC20(WETH).balanceOf(AGY), aw + quotedOut);
        assertEq(IERC20(USDC).balanceOf(address(vault)), vu + amountIn, "the Castle got the input");
        assertEq(IERC20(WETH).balanceOf(address(vault)), vw - quotedOut, "the Castle paid the output");
        (uint248 henW1,) = IAqua(AQUA).rawBalances(address(vault), ROUTER, hHen, WETH);
        assertEq(henW0 - henW1, quotedOut, "hen's allocation paid it");
        assertEq(IERC20(USDC).balanceOf(address(hook)), 0, "the hook keeps nothing");
        assertEq(IERC20(WETH).balanceOf(address(hook)), 0, "the hook keeps nothing");

        // one tx: the v4 Swap, Aqua's Pulled and Pushed on hen, and the hook's JitFill
        (bool sawSwap, bool sawPulled, bool sawPushed, bool sawJit) = (false, false, false, false);
        for (uint256 i; i < logs.length; ++i) {
            bytes32 t0 = logs[i].topics.length == 0 ? bytes32(0) : logs[i].topics[0];
            if (logs[i].emitter == POOL_MANAGER && t0 == SWAP_TOPIC) sawSwap = true;
            if (logs[i].emitter == AQUA && t0 == IAqua.Pulled.selector) sawPulled = true;
            if (logs[i].emitter == AQUA && t0 == IAqua.Pushed.selector) sawPushed = true;
            if (logs[i].emitter == address(hook) && t0 == CastleJITHook.JitFill.selector) sawJit = true;
        }
        assertTrue(sawSwap && sawPulled && sawPushed && sawJit, "Swap + Pulled + Pushed + JitFill in one tx");
    }

    function test_fork_v4Swap_otherDirection() public {
        uint256 amountIn = 0.0001 ether;
        (, uint256 quotedOut,) = ISwapVM(ROUTER).quote(hen, WETH, USDC, amountIn, _hookTaker());
        BalanceDelta d = _swap(false, -int256(amountIn), "");
        assertEq(d.amount1(), -int128(int256(amountIn)));
        assertEq(d.amount0(), int128(int256(quotedOut)));
    }

    function test_fork_v4Swap_reverts_exactOut_minOut_noHen() public {
        vm.expectRevert(_wrapped(abi.encodeWithSelector(CastleJITHook.ExactOutNotSupported.selector)));
        _swap(true, 1e12, "");

        (, uint256 quotedOut,) = ISwapVM(ROUTER).quote(hen, USDC, WETH, 1e6, _hookTaker());
        vm.expectRevert(_wrapped(abi.encodeWithSelector(CastleJITHook.TooLittleOut.selector, quotedOut, quotedOut + 1)));
        _swap(true, -1e6, abi.encode(quotedOut + 1));

        vm.prank(FUM);
        vault.dock(hHen);
        vm.expectRevert(_wrapped(abi.encodeWithSelector(CastleJITHook.NoHen.selector)));
        _swap(true, -1e6, "");
    }

    function test_fork_hook_onlyPoolManager_and_noLiquidity() public {
        vm.expectRevert(abi.encodeWithSelector(CastleJITHook.NotPoolManager.selector, address(this)));
        hook.beforeSwap(
            address(this),
            key,
            IPoolManager.SwapParams({ zeroForOne: true, amountSpecified: -1, sqrtPriceLimitX96: 0 }),
            ""
        );
        vm.expectRevert(
            abi.encodeWithSelector(
                CustomRevert.WrappedError.selector,
                address(hook),
                IHooks.beforeAddLiquidity.selector,
                abi.encodeWithSelector(CastleJITHook.LiquidityNotAllowed.selector),
                abi.encodeWithSelector(Hooks.HookCallFailed.selector)
            )
        );
        IPoolManager(POOL_MANAGER).unlock("");
    }

    function test_fork_hook_otherPairReverts_NotCastlePool() public {
        TokenMock other = new TokenMock("Other", "OTH");
        (Currency c0, Currency c1) = address(other) < USDC
            ? (Currency.wrap(address(other)), Currency.wrap(USDC))
            : (Currency.wrap(USDC), Currency.wrap(address(other)));
        PoolKey memory k =
            PoolKey({ currency0: c0, currency1: c1, fee: 0, tickSpacing: 60, hooks: IHooks(address(hook)) });
        IPoolManager(POOL_MANAGER).initialize(k, TickMath.getSqrtPriceAtTick(0));
        key = k;
        vm.expectRevert(_wrapped(abi.encodeWithSelector(CastleJITHook.NotCastlePool.selector)));
        _swap(true, -1e6, "");
    }

    function test_fork_hook_unflaggedCallbacksRevert() public {
        IPoolManager.ModifyLiquidityParams memory m;
        IPoolManager.SwapParams memory sp;
        BalanceDelta z;
        vm.expectRevert(CastleJITHook.HookNotImplemented.selector);
        hook.beforeInitialize(address(0), key, 0);
        vm.expectRevert(CastleJITHook.HookNotImplemented.selector);
        hook.afterInitialize(address(0), key, 0, 0);
        vm.expectRevert(CastleJITHook.HookNotImplemented.selector);
        hook.afterAddLiquidity(address(0), key, m, z, z, "");
        vm.expectRevert(CastleJITHook.HookNotImplemented.selector);
        hook.beforeRemoveLiquidity(address(0), key, m, "");
        vm.expectRevert(CastleJITHook.HookNotImplemented.selector);
        hook.afterRemoveLiquidity(address(0), key, m, z, z, "");
        vm.expectRevert(CastleJITHook.HookNotImplemented.selector);
        hook.afterSwap(address(0), key, sp, z, "");
        vm.expectRevert(CastleJITHook.HookNotImplemented.selector);
        hook.beforeDonate(address(0), key, 0, 0, "");
        vm.expectRevert(CastleJITHook.HookNotImplemented.selector);
        hook.afterDonate(address(0), key, 0, 0, "");
        vm.expectRevert(abi.encodeWithSelector(CastleJITHook.NotPoolManager.selector, address(this)));
        hook.beforeAddLiquidity(address(0), key, m, "");
    }

    function test_fork_hook_constructor_badConfig() public {
        vm.expectRevert(CastleJITHook.BadConfig.selector);
        new CastleJITHook(IPoolManager(POOL_MANAGER), ISwapVM(address(0xbeef)), vault, HEN);
        vm.expectRevert(CastleJITHook.BadConfig.selector);
        new CastleJITHook(IPoolManager(POOL_MANAGER), ISwapVM(ROUTER), vault, 8);
    }

    /// @dev Tries to add liquidity to the Castle's pool from inside an unlock.
    function unlockCallback(bytes calldata) external returns (bytes memory) {
        IPoolManager(POOL_MANAGER)
            .modifyLiquidity(
                key,
                IPoolManager.ModifyLiquidityParams({ tickLower: -600, tickUpper: 600, liquidityDelta: 1e6, salt: 0 }),
                ""
            );
        return "";
    }

    /// @dev IPoolManager.Swap(PoolId,address,int128,int128,uint160,uint128,int24,uint24)
    bytes32 internal constant SWAP_TOPIC =
        keccak256("Swap(bytes32,address,int128,int128,uint160,uint128,int24,uint24)");

    function _hookTaker() internal pure returns (bytes memory) {
        return _takerData(address(0), true);
    }
}
