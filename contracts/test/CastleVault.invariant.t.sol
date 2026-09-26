// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import { console } from "forge-std/console.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { Aqua } from "@1inch/aqua/src/Aqua.sol";
import { TokenMock } from "@1inch/solidity-utils/contracts/mocks/TokenMock.sol";
import { AquaSwapVMRouter } from "@1inch/swap-vm/src/routers/AquaSwapVMRouter.sol";
import { ISwapVM } from "@1inch/swap-vm/src/interfaces/ISwapVM.sol";

import { CastleVault } from "../src/CastleVault.sol";
import { CastleHelpers } from "./utils/CastleHelpers.sol";
import { VaultPrograms } from "./utils/VaultPrograms.sol";

/// @dev Drives the vault through ships, docks, fills, leverage changes, withdrawals and donations, keeping ghosts.
contract VaultHandler is CastleHelpers {
    CastleVault internal vault;
    AquaSwapVMRouter internal router;
    Aqua internal aqua;
    address internal weth;
    address internal usdc;
    address internal fi;
    address internal fum;
    address internal owner;
    bytes internal hen;
    address internal jack = makeAddr("jack");

    /// @dev a ship or withdraw that left committed above the leverage limit
    bool public breached;
    /// @dev the vault's balance, as the handler's own accounting says it must be
    mapping(address token => uint256) public expected;
    uint256 public ships;
    uint256 public fills;

    constructor(CastleVault v, AquaSwapVMRouter r, Aqua a, bytes memory henProgram) {
        (vault, router, aqua, hen) = (v, r, a, henProgram);
        (weth, usdc) = (address(v.WETH()), address(v.USDC()));
        (fi, fum, owner) = (v.fi(), v.fum(), v.owner());
        expected[weth] = IERC20(weth).balanceOf(address(v));
        expected[usdc] = IERC20(usdc).balanceOf(address(v));
        for (uint8 i; i < 8; ++i) {
            vm.prank(fum);
            v.setCap(i, 20 ether, 60_000e6);
        }
        vm.startPrank(jack);
        IERC20(weth).approve(address(r), type(uint256).max);
        IERC20(usdc).approve(address(r), type(uint256).max);
        vm.stopPrank();
    }

    /// @dev A successful ship must leave both tokens within the limit (the vault checks both); a successful withdraw
    ///      must leave its own token within it. Fills and leverage changes may push a token past its limit: that is
    ///      the shared-liquidity trade, and it only blocks the next ship or withdraw of that token.
    function _check(address token) internal {
        if (vault.committed(token) > vault.limit(token)) breached = true;
    }

    function setCap(uint8 slot, uint256 w, uint256 u) external {
        slot = uint8(bound(slot, 0, 7));
        vm.prank(fum);
        vault.setCap(slot, bound(w, 0, 50 ether), bound(u, 0, 150_000e6));
    }

    function setLeverage(bool isWeth, uint16 bps) external {
        bps = uint16(bound(bps, 5e3, 4e4));
        vm.prank(fum);
        vault.setLeverage(isWeth ? weth : usdc, bps);
    }

    function ship(uint8 slot, uint256 w, uint256 u) external {
        slot = uint8(bound(slot, 0, 7));
        w = bound(w, 1e12, 8 ether);
        u = bound(u, 1e3, 24_000e6);
        vm.prank(fi);
        vault.ship(slot, hen, w, u); // a revert (slot busy, over cap, over leverage) shows in the metrics
        ++ships;
        _check(weth);
        _check(usdc);
    }

    function dock(uint8 slot) external {
        bytes32 h = vault.strategyIn(uint8(bound(slot, 0, 7)));
        if (h == bytes32(0)) return;
        vm.prank(fum);
        vault.dock(h);
    }

    uint256 public fillAttempts;

    function fill(uint8 pick, bool buyWeth, uint256 amountIn) external {
        bytes32[] memory live = vault.activeStrategies();
        if (live.length == 0) revert("no live strategy"); // counted as a fill revert in the metrics
        bytes32 h = live[bound(pick, 0, live.length - 1)];
        ++fillAttempts;
        ISwapVM.Order memory o = vault.orderOf(h);
        (address tIn, address tOut) = buyWeth ? (usdc, weth) : (weth, usdc);
        amountIn = bound(amountIn, 1, buyWeth ? 5_000e6 : 2 ether);
        deal(tIn, jack, IERC20(tIn).balanceOf(jack) + amountIn);
        vm.prank(jack);
        (uint256 i, uint256 out,) = router.swap(o, tIn, tOut, amountIn, _takerData(jack, true));
        expected[tIn] += i;
        expected[tOut] -= out;
        ++fills;
    }

    function withdraw(bool isWeth, uint256 amount) external {
        address t = isWeth ? weth : usdc;
        amount = bound(amount, 0, IERC20(t).balanceOf(address(vault)));
        vm.prank(owner);
        vault.withdraw(t, owner, amount);
        expected[t] -= amount;
        _check(t);
    }

    function donate(bool isWeth, uint256 amount) external {
        address t = isWeth ? weth : usdc;
        amount = bound(amount, 0, isWeth ? 5 ether : 15_000e6);
        deal(t, address(vault), IERC20(t).balanceOf(address(vault)) + amount);
        expected[t] += amount;
    }
}

/// @dev Invariants, in words:
///      1. No ship and no withdraw ever leaves the live promises of a token above balance * leverage.
///      2. Only Aqua moves the hoard: the vault's balance is exactly what the fills, withdrawals and donations say.
///      3. committed(token) is exactly the sum of the live slots' Aqua balances, and every live slot's order hashes
///         to its strategy and maps back to its slot.
///      4. The vault never grants an allowance to anything but Aqua.
contract CastleVaultInvariantTest is CastleHelpers {
    address internal constant USDC_ADDR = 0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238;
    address internal constant WETH_ADDR = 0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14;

    Aqua internal aqua;
    AquaSwapVMRouter internal router;
    CastleVault internal vault;
    VaultHandler internal handler;

    function setUp() public {
        deployCodeTo("TokenMock.sol:TokenMock", abi.encode("Wrapped Ether", "WETH"), WETH_ADDR);
        deployCodeTo("TokenMock.sol:TokenMock", abi.encode("USD Coin", "USDC"), USDC_ADDR);
        aqua = new Aqua();
        router = new AquaSwapVMRouter(address(aqua), WETH_ADDR, address(this), "AquaSwapVMRouter", "1.0.2");
        vault = new CastleVault(
            address(aqua), address(router), WETH_ADDR, USDC_ADDR, makeAddr("owner"), makeAddr("fi"), makeAddr("fum")
        );
        TokenMock(WETH_ADDR).mint(address(vault), 10 ether);
        TokenMock(USDC_ADDR).mint(address(vault), 30_000e6);
        handler = new VaultHandler(vault, router, aqua, new VaultPrograms().xyc(3e6));
        targetContract(address(handler));
    }

    function invariant_noShipOrWithdrawPastLeverage() public view {
        assertFalse(handler.breached());
    }

    function invariant_onlyAquaMovesTheHoard() public view {
        assertEq(IERC20(WETH_ADDR).balanceOf(address(vault)), handler.expected(WETH_ADDR));
        assertEq(IERC20(USDC_ADDR).balanceOf(address(vault)), handler.expected(USDC_ADDR));
    }

    function invariant_committedIsTheLiveSlotsAquaBalances() public view {
        uint256 w;
        uint256 u;
        uint256 live;
        for (uint8 s; s < 8; ++s) {
            bytes32 h = vault.strategyIn(s);
            if (h == bytes32(0)) continue;
            ++live;
            assertEq(vault.slotOf(h), s);
            assertEq(keccak256(abi.encode(vault.orderOf(h))), h);
            (uint248 bw,) = aqua.rawBalances(address(vault), address(router), h, WETH_ADDR);
            (uint248 bu,) = aqua.rawBalances(address(vault), address(router), h, USDC_ADDR);
            (w, u) = (w + bw, u + bu);
        }
        assertEq(vault.committed(WETH_ADDR), w);
        assertEq(vault.committed(USDC_ADDR), u);
        assertEq(vault.activeStrategies().length, live);
    }

    function invariant_allowanceOnlyToAqua() public view {
        assertEq(IERC20(WETH_ADDR).allowance(address(vault), address(router)), 0);
        assertEq(IERC20(USDC_ADDR).allowance(address(vault), address(router)), 0);
        assertEq(IERC20(WETH_ADDR).allowance(address(vault), address(aqua)), type(uint256).max);
    }

    /// @dev Not a property: shows the campaign actually shipped and filled.
    function afterInvariant() public view {
        console.log("ships", handler.ships(), "fills", handler.fills());
        console.log("fill attempts", handler.fillAttempts());
    }

    /// @dev The handler really ships and fills (the campaign's metrics count the rest).
    function test_handler_shipsAndFills() public {
        handler.ship(0, 5 ether, 15_000e6);
        handler.fill(0, true, 1_000e6);
        assertEq(handler.ships(), 1);
        assertEq(handler.fills(), 1);
    }
}
