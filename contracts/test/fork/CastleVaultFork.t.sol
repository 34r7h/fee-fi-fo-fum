// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { IAqua } from "@1inch/aqua/src/interfaces/IAqua.sol";
import { ISwapVM } from "@1inch/swap-vm/src/interfaces/ISwapVM.sol";

import { CastleVault } from "../../src/CastleVault.sol";
import { PriceExtruction } from "../../src/PriceExtruction.sol";
import { CastleHelpers } from "../utils/CastleHelpers.sol";
import { VaultPrograms } from "../utils/VaultPrograms.sol";

/// @title CastleForkBase
/// @notice CastleVault and PriceExtruction against the LIVE Sepolia Aqua, AquaSwapVMRouter 1.0.2, WETH9 and Circle
///         USDC at a pinned block, with SPEC.md's owner and fum keys impersonated. Beat 1 of the demo, end to end:
///         fum sets 2x leverage, fi ships harp and hen each promising the whole hoard, greedy reverts OverAllocated,
///         then a harp quote and a hen swap both fill from the one balance.
/// @dev forge test --match-path test/fork/CastleVaultFork.t.sol
///      FORK_BLOCK=<n> pins another block; SEPOLIA_ARCHIVE_RPC_URL overrides the RPC (Tenderly's public gateway
///      serves history by default).
abstract contract CastleForkBase is CastleHelpers {
    uint256 internal constant DEFAULT_FORK_BLOCK = 11_785_880;

    address internal constant AQUA = 0x1111113CCf1426A8E30e2bfF5E005d929bF6a90a;
    address internal constant ROUTER = 0xeDB6933949dB941D495b23604818F9AbF55e70f9;
    address internal constant USDC = 0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238;
    address internal constant WETH = 0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14;
    /// @dev SPEC.md's keys: the treasury owns the vault; fum.feefifofum.eth holds leverage, caps and dock.
    address internal constant OWNER = 0xc3Af4CCa3ba691C74F18fa8D3a7ad6816eC65dF2;
    address internal constant FUM = 0xcaD061b80EC52a18D31aE9b00FC1b4Df253f82D2;
    address internal constant AGY = 0xDDf2980eFA32E9E15C9D0ece52F4BF32956EAE4c;

    uint8 internal constant HARP = 0;
    uint8 internal constant HEN = 1;
    uint8 internal constant GREEDY = 2;
    uint32 internal constant HEN_FEE = 3e6; // 0.3%
    uint256 internal constant HOARD_USDC = 10e6;
    uint256 internal constant HOARD_WETH = 0.004 ether;

    /// @dev fi signs quotes, so the fork uses a test key for fi (live: fi.feefifofum.eth 0xB6eA…40b2).
    uint256 internal fiKey = uint256(keccak256("fork-fi"));
    address internal fi;

    PriceExtruction internal priceEx;
    CastleVault internal vault;
    VaultPrograms internal programs;

    function setUp() public virtual {
        string memory rpc = vm.envOr("SEPOLIA_ARCHIVE_RPC_URL", string("https://sepolia.gateway.tenderly.co"));
        vm.createSelectFork(rpc, vm.envOr("FORK_BLOCK", DEFAULT_FORK_BLOCK));
        fi = vm.addr(fiKey);
        programs = new VaultPrograms();
        priceEx = new PriceExtruction();
        vault = new CastleVault(AQUA, ROUTER, WETH, USDC, OWNER, fi, FUM);
        // the hoard (live: the treasury transfers it)
        deal(USDC, address(vault), HOARD_USDC);
        deal(WETH, address(vault), HOARD_WETH);
        deal(USDC, AGY, 100e6);
        deal(WETH, AGY, 0.05 ether);
        vm.startPrank(AGY);
        IERC20(USDC).approve(ROUTER, type(uint256).max);
        IERC20(WETH).approve(ROUTER, type(uint256).max);
        vm.stopPrank();
    }

    /// @dev Demo step 1-2: fum's 2x, harp and hen each promising the whole hoard, greedy refused.
    function _beat1()
        internal
        returns (bytes32 hHarp, ISwapVM.Order memory harp, bytes32 hHen, ISwapVM.Order memory hen)
    {
        vm.startPrank(FUM);
        vault.setLeverage(USDC, 2e4);
        vault.setLeverage(WETH, 2e4);
        vault.setCap(HARP, HOARD_WETH, HOARD_USDC);
        vault.setCap(HEN, HOARD_WETH, HOARD_USDC);
        vault.setCap(GREEDY, HOARD_WETH, HOARD_USDC);
        vm.stopPrank();

        (bytes memory pHarp, bytes memory pHen) = (programs.harp(address(priceEx)), programs.xyc(HEN_FEE));
        vm.startPrank(fi);
        (hHarp, harp) = vault.ship(HARP, pHarp, HOARD_WETH, HOARD_USDC);
        (hHen, hen) = vault.ship(HEN, pHen, HOARD_WETH, HOARD_USDC);
        vm.expectRevert(
            abi.encodeWithSelector(CastleVault.OverAllocated.selector, WETH, 2 * HOARD_WETH + 1, 2 * HOARD_WETH)
        );
        vault.ship(GREEDY, pHen, 1, 0);
        vm.stopPrank();
    }
}

contract CastleVaultForkTest is CastleForkBase {
    function test_fork_beat1_oneBalanceTwoStrategies_greedyRefused() public {
        (bytes32 hHarp,, bytes32 hHen,) = _beat1();
        assertEq(vault.committed(WETH), 2 * HOARD_WETH, "promises total 2x the WETH");
        assertEq(vault.committed(USDC), 2 * HOARD_USDC, "promises total 2x the USDC");
        assertEq(IERC20(WETH).balanceOf(address(vault)), HOARD_WETH, "no token left the vault");
        assertEq(IERC20(USDC).balanceOf(address(vault)), HOARD_USDC, "no token left the vault");
        assertEq(vault.headroom(WETH), 0);
        (uint248 a,) = IAqua(AQUA).rawBalances(address(vault), ROUTER, hHarp, WETH);
        (uint248 b,) = IAqua(AQUA).rawBalances(address(vault), ROUTER, hHen, WETH);
        assertEq(uint256(a) + b, 2 * HOARD_WETH);
        assertEq(vault.strategyIn(GREEDY), bytes32(0));
    }

    /// @dev Demo steps 3-4 on the router: a harp quote and a hen swap both fill from the one balance.
    function test_fork_harpQuoteAndHenSwap_fillFromOneBalance() public {
        (bytes32 hHarp, ISwapVM.Order memory harp, bytes32 hHen, ISwapVM.Order memory hen) = _beat1();
        uint256 w0 = IERC20(WETH).balanceOf(address(vault));
        uint256 u0 = IERC20(USDC).balanceOf(address(vault));

        // harp: agy buys WETH for 1 USDC at fi's quote (3,000 USDC per WETH → raw WETH per raw USDC)
        uint256 priceQ96 = (uint256(1 ether) << 96) / 3_000e6;
        PriceExtruction.Quote memory q =
            PriceExtruction.Quote(hHarp, USDC, WETH, priceQ96, 5e6, uint64(block.timestamp + 30));
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(fiKey, priceEx.quoteDigest(q));
        bytes memory quoteArgs = abi.encode(q, abi.encodePacked(r, s, v));
        bytes memory takerData = _takerData(AGY, true, quoteArgs);
        (, uint256 quotedOut,) = ISwapVM(ROUTER).quote(harp, USDC, WETH, 1e6, takerData);
        vm.prank(AGY);
        uint256 g = gasleft();
        (uint256 inHarp, uint256 outHarp,) = ISwapVM(ROUTER).swap(harp, USDC, WETH, 1e6, takerData);
        emit log_named_uint("gas: harp fill (router.swap, excl. 21k base + calldata)", g - gasleft());
        assertEq(outHarp, quotedOut, "fill == quote");
        assertEq(outHarp, 1e6 * priceQ96 >> 96);

        // the same quote 31 s later is stale
        vm.warp(block.timestamp + 31);
        vm.expectRevert(abi.encodeWithSelector(PriceExtruction.QuoteExpired.selector, q.validUntil));
        vm.prank(AGY);
        ISwapVM(ROUTER).swap(harp, USDC, WETH, 1e6, takerData);

        // hen: agy buys WETH for 1 USDC on the curve
        bytes memory henTaker = _takerData(AGY, true);
        (, uint256 henQuoted,) = ISwapVM(ROUTER).quote(hen, USDC, WETH, 1e6, henTaker);
        vm.prank(AGY);
        g = gasleft();
        (uint256 inHen, uint256 outHen,) = ISwapVM(ROUTER).swap(hen, USDC, WETH, 1e6, henTaker);
        emit log_named_uint("gas: hen fill (router.swap, excl. 21k base + calldata)", g - gasleft());
        assertEq(outHen, henQuoted);

        // both fills came out of the one hoard
        assertEq(IERC20(WETH).balanceOf(address(vault)), w0 - outHarp - outHen);
        assertEq(IERC20(USDC).balanceOf(address(vault)), u0 + inHarp + inHen);
        (uint248 harpWeth,) = IAqua(AQUA).rawBalances(address(vault), ROUTER, hHarp, WETH);
        (uint248 henWeth,) = IAqua(AQUA).rawBalances(address(vault), ROUTER, hHen, WETH);
        assertEq(harpWeth, HOARD_WETH - outHarp);
        assertEq(henWeth, HOARD_WETH - outHen);
    }

    /// @dev fum docks on risk at no cost, and the owner withdraws only what leverage leaves free.
    function test_fork_dockAndWithdraw() public {
        (bytes32 hHarp,, bytes32 hHen,) = _beat1();
        vm.prank(OWNER);
        vm.expectRevert(abi.encodeWithSelector(CastleVault.OverAllocated.selector, WETH, 2 * HOARD_WETH, 0));
        vault.withdraw(WETH, OWNER, HOARD_WETH);
        vm.startPrank(FUM);
        vault.dock(hHen);
        vault.dock(hHarp);
        vm.stopPrank();
        assertEq(vault.committed(WETH), 0);
        assertEq(IERC20(WETH).balanceOf(address(vault)), HOARD_WETH, "dock costs no tokens");
        vm.prank(OWNER);
        vault.withdraw(WETH, OWNER, HOARD_WETH);
        assertEq(IERC20(WETH).balanceOf(OWNER) >= HOARD_WETH, true);
    }
}
