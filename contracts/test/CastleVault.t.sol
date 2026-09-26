// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";
import { Aqua } from "@1inch/aqua/src/Aqua.sol";
import { TokenMock } from "@1inch/solidity-utils/contracts/mocks/TokenMock.sol";
import { AquaSwapVMRouter } from "@1inch/swap-vm/src/routers/AquaSwapVMRouter.sol";
import { ISwapVM } from "@1inch/swap-vm/src/interfaces/ISwapVM.sol";

import { CastleVault } from "../src/CastleVault.sol";
import { PriceExtruction } from "../src/PriceExtruction.sol";
import { CastleHelpers } from "./utils/CastleHelpers.sol";
import { VaultPrograms } from "./utils/VaultPrograms.sol";

/// @dev Real Aqua, real AquaSwapVMRouter 1.0.2, mock tokens at the Sepolia WETH/USDC addresses (so the pair orders as
///      it does live). 'hen' is XYC + flat fee; 'harp' is the fi-quoted RFQ through PriceExtruction.
abstract contract CastleVaultBase is CastleHelpers {
    address internal constant USDC_ADDR = 0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238;
    address internal constant WETH_ADDR = 0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14;
    uint32 internal constant HEN_FEE = 3e6; // 0.3%
    uint32 internal constant HEN2_FEE = 1e7; // 1%

    Aqua internal aqua;
    AquaSwapVMRouter internal router;
    TokenMock internal weth;
    TokenMock internal usdc;
    VaultPrograms internal programs;
    PriceExtruction internal priceEx;
    CastleVault internal vault;

    address internal operator = makeAddr("operator");
    uint256 internal fiKey = uint256(keccak256("fi-quote-key"));
    address internal fi;
    address internal fum = makeAddr("fum");
    address internal jack = makeAddr("jack");

    function setUp() public virtual {
        vm.warp(1_790_400_000);
        fi = vm.addr(fiKey);
        deployCodeTo("TokenMock.sol:TokenMock", abi.encode("Wrapped Ether", "WETH"), WETH_ADDR);
        deployCodeTo("TokenMock.sol:TokenMock", abi.encode("USD Coin", "USDC"), USDC_ADDR);
        (weth, usdc) = (TokenMock(WETH_ADDR), TokenMock(USDC_ADDR));
        aqua = new Aqua();
        router = new AquaSwapVMRouter(address(aqua), WETH_ADDR, operator, "AquaSwapVMRouter", "1.0.2");
        programs = new VaultPrograms();
        priceEx = new PriceExtruction();
        vault = new CastleVault(address(aqua), address(router), WETH_ADDR, USDC_ADDR, operator, fi, fum);
        weth.mint(address(vault), 10 ether);
        usdc.mint(address(vault), 30_000e6);
        weth.mint(jack, 1_000 ether);
        usdc.mint(jack, 3_000_000e6);
        vm.startPrank(jack);
        weth.approve(address(router), type(uint256).max);
        usdc.approve(address(router), type(uint256).max);
        vm.stopPrank();
    }

    function _cap(uint8 slot, uint128 w, uint128 u) internal {
        vm.prank(fum);
        vault.setCap(slot, w, u);
    }

    function _ship(uint8 slot, bytes memory program, uint256 w, uint256 u)
        internal
        returns (bytes32 h, ISwapVM.Order memory o)
    {
        vm.prank(fi);
        return vault.ship(slot, program, w, u);
    }

    function _fill(ISwapVM.Order memory o, address tokenIn, address tokenOut, uint256 amountIn, bytes memory args)
        internal
        returns (uint256 inAmt, uint256 outAmt)
    {
        vm.prank(jack);
        (inAmt, outAmt,) = router.swap(o, tokenIn, tokenOut, amountIn, _takerData(jack, true, args));
    }

    function _quote(bytes32 h, address tokenIn, address tokenOut, uint256 priceQ96, uint256 maxIn, uint64 until)
        internal
        pure
        returns (PriceExtruction.Quote memory)
    {
        return PriceExtruction.Quote(h, tokenIn, tokenOut, priceQ96, maxIn, until);
    }

    function _quoteArgs(PriceExtruction.Quote memory q) internal view returns (bytes memory) {
        return _quoteArgsBy(fiKey, q);
    }

    function _quoteArgsBy(uint256 key, PriceExtruction.Quote memory q) internal view returns (bytes memory) {
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(key, priceEx.quoteDigest(q));
        return abi.encode(q, abi.encodePacked(r, s, v));
    }

    function _raw(bytes32 h, address t) internal view returns (uint256 bal) {
        (bal,) = aqua.rawBalances(address(vault), address(router), h, t);
    }
}

contract CastleVaultTest is CastleVaultBase {
    // ---- constructor ----------------------------------------------------------------------------

    function test_constructor_setsCrewLeverageAndAquaAllowance() public view {
        assertEq(vault.fi(), fi);
        assertEq(vault.fum(), fum);
        assertEq(vault.owner(), operator);
        assertEq(vault.leverageOf(WETH_ADDR), 1e4);
        assertEq(vault.leverageOf(address(0xdead)), 0);
        assertEq(vault.leverageOf(USDC_ADDR), 1e4);
        assertEq(weth.allowance(address(vault), address(aqua)), type(uint256).max);
        assertEq(usdc.allowance(address(vault), address(aqua)), type(uint256).max);
        assertEq(weth.allowance(address(vault), address(router)), 0, "no allowance outside Aqua");
    }

    function test_constructor_revertsOnZeroOrBadConfig() public {
        vm.expectRevert(CastleVault.ZeroAddress.selector);
        new CastleVault(address(0), address(router), WETH_ADDR, USDC_ADDR, operator, fi, fum);
        vm.expectRevert(CastleVault.ZeroAddress.selector);
        new CastleVault(address(aqua), address(router), WETH_ADDR, USDC_ADDR, operator, address(0), fum);
        vm.expectRevert(CastleVault.ZeroAddress.selector);
        new CastleVault(address(aqua), address(router), WETH_ADDR, USDC_ADDR, operator, fi, address(0));
        vm.expectRevert(CastleVault.BadConfig.selector);
        new CastleVault(address(aqua), address(router), WETH_ADDR, WETH_ADDR, operator, fi, fum);
        AquaSwapVMRouter other = new AquaSwapVMRouter(address(0xA0), WETH_ADDR, operator, "x", "1");
        vm.expectRevert(CastleVault.BadConfig.selector);
        new CastleVault(address(aqua), address(other), WETH_ADDR, USDC_ADDR, operator, fi, fum);
    }

    // ---- fum: caps and leverage -----------------------------------------------------------------

    function test_setCap_onlyFum_andBounds() public {
        vm.expectRevert(abi.encodeWithSelector(CastleVault.NotFum.selector, fi));
        vm.prank(fi);
        vault.setCap(0, 1, 1);
        vm.expectRevert(abi.encodeWithSelector(CastleVault.BadSlot.selector, 8));
        vm.prank(fum);
        vault.setCap(8, 1, 1);
        vm.expectEmit(address(vault));
        emit CastleVault.CapSet(3, 2 ether, 5_000e6);
        _cap(3, 2 ether, 5_000e6);
        (uint256 w, uint256 u) = vault.capOf(3);
        assertEq(vault.strategyIn(3), bytes32(0));
        assertEq(w, 2 ether);
        assertEq(u, 5_000e6);
        vm.expectRevert(abi.encodeWithSelector(CastleVault.BadSlot.selector, 9));
        vault.capOf(9);
        vm.expectRevert(abi.encodeWithSelector(CastleVault.BadSlot.selector, 9));
        vault.strategyIn(9);
    }

    function test_setLeverage_onlyFum_andBounds() public {
        vm.expectRevert(abi.encodeWithSelector(CastleVault.NotFum.selector, operator));
        vm.prank(operator);
        vault.setLeverage(WETH_ADDR, 2e4);
        vm.startPrank(fum);
        vm.expectRevert(abi.encodeWithSelector(CastleVault.NotHoardToken.selector, address(0xdead)));
        vault.setLeverage(address(0xdead), 2e4);
        vm.expectRevert(abi.encodeWithSelector(CastleVault.BadLeverage.selector, 0));
        vault.setLeverage(WETH_ADDR, 0);
        vm.expectEmit(address(vault));
        emit CastleVault.LeverageSet(WETH_ADDR, 2e4);
        vault.setLeverage(WETH_ADDR, 2e4);
        vm.stopPrank();
        assertEq(vault.limit(WETH_ADDR), 20 ether);
        assertEq(vault.headroom(WETH_ADDR), 20 ether);
    }

    // ---- ship -----------------------------------------------------------------------------------

    function test_ship_builds_aqua_order_with_salt() public {
        _cap(0, 10 ether, 30_000e6);
        bytes memory prog = programs.xyc(HEN_FEE);
        (bytes32 h, ISwapVM.Order memory o) = _ship(0, prog, 4 ether, 12_000e6);
        assertEq(o.maker, address(vault));
        assertEq(o.data, bytes.concat(prog, programs.salt(1)), "vault's Salt matches 1inch's opcode table");
        assertEq(h, keccak256(abi.encode(o)));
        assertEq(router.hash(o), h, "Aqua strategy hash == SwapVM order hash");
        assertEq(keccak256(abi.encode(vault.orderOf(h))), h);
        assertEq(vault.slotOf(h), 0);
        assertEq(_raw(h, WETH_ADDR), 4 ether);
        assertEq(_raw(h, USDC_ADDR), 12_000e6);
        assertEq(vault.committed(WETH_ADDR), 4 ether);
        assertEq(vault.headroom(WETH_ADDR), 6 ether);
        assertEq(vault.shipNonce(), 1);
    }

    function test_ship_reverts_access_slot_program() public {
        _cap(0, 10 ether, 30_000e6);
        bytes memory prog = programs.xyc(HEN_FEE);
        vm.expectRevert(abi.encodeWithSelector(CastleVault.NotFi.selector, fum));
        vm.prank(fum);
        vault.ship(0, prog, 1, 1);
        vm.expectRevert(abi.encodeWithSelector(CastleVault.BadSlot.selector, 8));
        _ship(8, prog, 1, 1);
        vm.expectRevert(CastleVault.EmptyProgram.selector);
        _ship(0, "", 1, 1);
        (bytes32 h,) = _ship(0, prog, 1 ether, 1_000e6);
        assertEq(vault.strategyIn(0), h);
        vm.expectRevert(abi.encodeWithSelector(CastleVault.SlotBusy.selector, 0));
        _ship(0, prog, 1 ether, 1_000e6);
    }

    function test_ship_revertsOverCap() public {
        _cap(1, 1 ether, 3_000e6);
        bytes memory prog = programs.xyc(HEN_FEE);
        vm.expectRevert(abi.encodeWithSelector(CastleVault.OverCap.selector, 1, WETH_ADDR, 2 ether, 1 ether));
        _ship(1, prog, 2 ether, 1_000e6);
        vm.expectRevert(abi.encodeWithSelector(CastleVault.OverCap.selector, 1, USDC_ADDR, 3_001e6, 3_000e6));
        _ship(1, prog, 1 ether, 3_001e6);
    }

    /// @dev The DoD beat: one balance, two strategies, and the ship that would promise past fum's leverage reverts.
    function test_ship_revertsOverAllocated_atOneX() public {
        _cap(0, 100 ether, 1_000_000e6);
        _cap(1, 100 ether, 1_000_000e6);
        bytes memory hen2 = programs.xyc(HEN2_FEE);
        _ship(0, programs.xyc(HEN_FEE), 6 ether, 18_000e6);
        vm.expectRevert(abi.encodeWithSelector(CastleVault.OverAllocated.selector, WETH_ADDR, 11 ether, 10 ether));
        _ship(1, hen2, 5 ether, 1_000e6);
        vm.expectRevert(abi.encodeWithSelector(CastleVault.OverAllocated.selector, USDC_ADDR, 30_001e6, 30_000e6));
        _ship(1, hen2, 4 ether, 12_001e6);
        _ship(1, hen2, 4 ether, 12_000e6); // exactly at the limit is fine
        assertEq(vault.headroom(WETH_ADDR), 0);
    }

    function test_ship_leverage_letsOneBalancePromiseMore() public {
        _cap(0, 100 ether, 1_000_000e6);
        _cap(1, 100 ether, 1_000_000e6);
        _cap(2, 100 ether, 1_000_000e6);
        vm.startPrank(fum);
        vault.setLeverage(WETH_ADDR, 2e4);
        vault.setLeverage(USDC_ADDR, 2e4);
        vm.stopPrank();
        _ship(0, programs.xyc(HEN_FEE), 10 ether, 30_000e6);
        bytes memory hen2 = programs.xyc(HEN2_FEE);
        _ship(1, hen2, 10 ether, 30_000e6); // 2x: both strategies promise the whole hoard
        assertEq(vault.committed(WETH_ADDR), 20 ether);
        vm.expectRevert(abi.encodeWithSelector(CastleVault.OverAllocated.selector, WETH_ADDR, 20 ether + 1, 20 ether));
        _ship(2, hen2, 1, 0);
    }

    // ---- fills: two strategies from one balance ---------------------------------------------------

    function test_twoStrategies_fillFromOneBalance() public {
        _cap(0, 10 ether, 30_000e6);
        _cap(1, 10 ether, 30_000e6);
        (bytes32 hA, ISwapVM.Order memory a) = _ship(0, programs.xyc(HEN_FEE), 6 ether, 18_000e6);
        (bytes32 hB, ISwapVM.Order memory b) = _ship(1, programs.xyc(HEN2_FEE), 4 ether, 12_000e6);
        assertEq(vault.activeStrategies().length, 2);

        // jack buys WETH with 3,000 USDC from each strategy
        (, uint256 qOutA,) = router.quote(a, USDC_ADDR, WETH_ADDR, 3_000e6, _takerData(jack, true));
        uint256 w0 = weth.balanceOf(address(vault));
        uint256 u0 = usdc.balanceOf(address(vault));
        (uint256 inA, uint256 outA) = _fill(a, USDC_ADDR, WETH_ADDR, 3_000e6, "");
        assertEq(outA, qOutA, "fill == quote");
        (, uint256 qOutB,) = router.quote(b, USDC_ADDR, WETH_ADDR, 3_000e6, _takerData(jack, true));
        (uint256 inB, uint256 outB) = _fill(b, USDC_ADDR, WETH_ADDR, 3_000e6, "");
        assertEq(outB, qOutB, "fill == quote");
        assertGt(outA, outB, "the 1% strategy pays less than the 0.3% one");

        // both fills came out of the one hoard, and each strategy's Aqua balance moved by its own fill
        assertEq(weth.balanceOf(address(vault)), w0 - outA - outB);
        assertEq(usdc.balanceOf(address(vault)), u0 + inA + inB);
        assertEq(_raw(hA, WETH_ADDR), 6 ether - outA);
        assertEq(_raw(hA, USDC_ADDR), 18_000e6 + inA);
        assertEq(_raw(hB, WETH_ADDR), 4 ether - outB);
        assertEq(_raw(hB, USDC_ADDR), 12_000e6 + inB);
        assertLe(vault.committed(WETH_ADDR), weth.balanceOf(address(vault)));
        assertLe(vault.committed(USDC_ADDR), usdc.balanceOf(address(vault)));
    }

    // ---- harp: the fi-quoted RFQ ----------------------------------------------------------------

    function test_harp_fillsAtFiQuote() public {
        _cap(0, 5 ether, 15_000e6);
        (bytes32 h, ISwapVM.Order memory o) = _ship(0, programs.harp(address(priceEx)), 5 ether, 15_000e6);
        uint256 priceQ96 = ANCHOR_Q96; // 3,000 USDC per WETH, raw USDC per raw WETH
        // jack sells 1 WETH for USDC at fi's price
        bytes memory q = _quoteArgs(_quote(h, WETH_ADDR, USDC_ADDR, priceQ96, 2 ether, uint64(block.timestamp + 30)));
        (, uint256 qOut,) = router.quote(o, WETH_ADDR, USDC_ADDR, 1 ether, _takerData(jack, true, q));
        (uint256 inAmt, uint256 outAmt) = _fill(o, WETH_ADDR, USDC_ADDR, 1 ether, q);
        assertEq(inAmt, 1 ether);
        assertEq(outAmt, qOut);
        assertEq(outAmt, 1 ether * priceQ96 >> 96);
        assertApproxEqAbs(outAmt, 3_000e6, 1);
        assertEq(_raw(h, USDC_ADDR), 15_000e6 - outAmt);
        assertEq(_raw(h, WETH_ADDR), 6 ether);
    }

    function test_harp_reverts_mismatch_expired_tooLong_tooLarge_badSigner_missing_exactOut() public {
        _cap(0, 5 ether, 15_000e6);
        (bytes32 h, ISwapVM.Order memory o) = _ship(0, programs.harp(address(priceEx)), 5 ether, 15_000e6);
        uint256 p = ANCHOR_Q96;
        uint64 t = uint64(block.timestamp);
        bytes memory q;

        q = _quoteArgs(_quote(h, USDC_ADDR, WETH_ADDR, p, 2 ether, t + 30));
        vm.expectRevert(PriceExtruction.QuoteMismatch.selector);
        _fill(o, WETH_ADDR, USDC_ADDR, 1 ether, q);
        q = _quoteArgs(_quote(~h, WETH_ADDR, USDC_ADDR, p, 2 ether, t + 30));
        vm.expectRevert(PriceExtruction.QuoteMismatch.selector);
        _fill(o, WETH_ADDR, USDC_ADDR, 1 ether, q);

        q = _quoteArgs(_quote(h, WETH_ADDR, USDC_ADDR, p, 2 ether, t - 1));
        vm.expectRevert(abi.encodeWithSelector(PriceExtruction.QuoteExpired.selector, t - 1));
        _fill(o, WETH_ADDR, USDC_ADDR, 1 ether, q);

        q = _quoteArgs(_quote(h, WETH_ADDR, USDC_ADDR, p, 2 ether, t + 301));
        vm.expectRevert(abi.encodeWithSelector(PriceExtruction.QuoteTooLong.selector, t + 301));
        _fill(o, WETH_ADDR, USDC_ADDR, 1 ether, q);

        q = _quoteArgs(_quote(h, WETH_ADDR, USDC_ADDR, p, 0.5 ether, t + 30));
        vm.expectRevert(abi.encodeWithSelector(PriceExtruction.QuoteTooLarge.selector, 1 ether, 0.5 ether));
        _fill(o, WETH_ADDR, USDC_ADDR, 1 ether, q);

        uint256 otherKey = 0xBAD;
        PriceExtruction.Quote memory good = _quote(h, WETH_ADDR, USDC_ADDR, p, 2 ether, t + 30);
        q = _quoteArgsBy(otherKey, good);
        vm.expectRevert(abi.encodeWithSelector(PriceExtruction.BadQuoteSigner.selector, vm.addr(otherKey)));
        _fill(o, WETH_ADDR, USDC_ADDR, 1 ether, q);

        // fi signed a different price than the one presented
        bytes memory signed = _quoteArgs(good);
        (, bytes memory sig) = abi.decode(signed, (PriceExtruction.Quote, bytes));
        PriceExtruction.Quote memory worse = _quote(h, WETH_ADDR, USDC_ADDR, p * 2, 2 ether, t + 30);
        q = abi.encode(worse, sig);
        vm.expectPartialRevert(PriceExtruction.BadQuoteSigner.selector);
        _fill(o, WETH_ADDR, USDC_ADDR, 1 ether, q);

        // a garbage signature recovers nobody
        q = abi.encode(good, new bytes(65));
        vm.expectRevert(abi.encodeWithSelector(PriceExtruction.BadQuoteSigner.selector, address(0)));
        _fill(o, WETH_ADDR, USDC_ADDR, 1 ether, q);

        vm.expectRevert(abi.encodeWithSelector(PriceExtruction.MissingQuote.selector, 0));
        _fill(o, WETH_ADDR, USDC_ADDR, 1 ether, "");
        q = abi.encode(good, sig);
        q[223] = 0xff; // sig offset not the standard 7 words
        vm.expectRevert(abi.encodeWithSelector(PriceExtruction.MissingQuote.selector, q.length));
        _fill(o, WETH_ADDR, USDC_ADDR, 1 ether, q);

        q = _takerData(jack, false, signed);
        vm.expectRevert(PriceExtruction.ExactOutNotSupported.selector);
        vm.prank(jack);
        router.swap(o, WETH_ADDR, USDC_ADDR, 1_000e6, q);

        // and the good quote still fills
        (, uint256 outAmt) = _fill(o, WETH_ADDR, USDC_ADDR, 1 ether, signed);
        assertEq(outAmt, 1 ether * p >> 96);
    }

    function test_harp_rotatingFi_killsOutstandingQuotes() public {
        _cap(0, 5 ether, 15_000e6);
        (bytes32 h, ISwapVM.Order memory o) = _ship(0, programs.harp(address(priceEx)), 5 ether, 15_000e6);
        bytes memory q = _quoteArgs(_quote(h, WETH_ADDR, USDC_ADDR, ANCHOR_Q96, 2 ether, uint64(block.timestamp + 30)));
        vm.prank(operator);
        vault.setFi(makeAddr("fi2"));
        vm.expectRevert(abi.encodeWithSelector(PriceExtruction.BadQuoteSigner.selector, fi));
        _fill(o, WETH_ADDR, USDC_ADDR, 1 ether, q);
    }

    function test_priceExtruction_domain() public view {
        bytes32 d = keccak256(
            abi.encode(
                keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"),
                keccak256("feefifofum PriceExtruction"),
                keccak256("1"),
                block.chainid,
                address(priceEx)
            )
        );
        assertEq(priceEx.domainSeparator(), d);
    }

    // ---- dock -----------------------------------------------------------------------------------

    function test_dock_revokesAtNoCost_andFreesSlot() public {
        _cap(0, 10 ether, 30_000e6);
        bytes memory prog = programs.xyc(HEN_FEE);
        (bytes32 h, ISwapVM.Order memory o) = _ship(0, prog, 10 ether, 30_000e6);
        assertEq(vault.headroom(WETH_ADDR), 0);
        uint256 w0 = weth.balanceOf(address(vault));
        uint256 u0 = usdc.balanceOf(address(vault));

        vm.expectEmit(address(vault));
        emit CastleVault.Docked(h, fum);
        vm.prank(fum);
        vault.dock(h);
        assertEq(weth.balanceOf(address(vault)), w0, "dock moves no tokens");
        assertEq(usdc.balanceOf(address(vault)), u0, "dock moves no tokens");
        assertEq(vault.headroom(WETH_ADDR), 10 ether);
        assertEq(vault.activeStrategies().length, 0);
        vm.expectRevert(abi.encodeWithSelector(CastleVault.NotLive.selector, h));
        vault.orderOf(h);
        vm.expectRevert(abi.encodeWithSelector(CastleVault.NotLive.selector, h));
        vault.slotOf(h);

        // the docked order cannot fill
        vm.expectRevert();
        _fill(o, USDC_ADDR, WETH_ADDR, 1_000e6, "");

        // the same program ships again under a new salt
        (bytes32 h2,) = _ship(0, prog, 10 ether, 30_000e6);
        assertTrue(h2 != h);
    }

    function test_dock_access() public {
        _cap(0, 10 ether, 30_000e6);
        (bytes32 h,) = _ship(0, programs.xyc(HEN_FEE), 1 ether, 1_000e6);
        vm.expectRevert(abi.encodeWithSelector(CastleVault.NotCrew.selector, jack));
        vm.prank(jack);
        vault.dock(h);
        vm.prank(operator);
        vault.dock(h);
        vm.expectRevert(abi.encodeWithSelector(CastleVault.NotLive.selector, h));
        vm.prank(fi);
        vault.dock(h);
        (bytes32 h2,) = _ship(0, programs.xyc(HEN_FEE), 1 ether, 1_000e6);
        vm.prank(fi);
        vault.dock(h2);
    }

    // ---- owner ----------------------------------------------------------------------------------

    function test_withdraw_onlyWithinLeverage() public {
        _cap(0, 10 ether, 30_000e6);
        _ship(0, programs.xyc(HEN_FEE), 6 ether, 0);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, fi));
        vm.prank(fi);
        vault.withdraw(WETH_ADDR, fi, 1);
        vm.startPrank(operator);
        vm.expectRevert(CastleVault.ZeroAddress.selector);
        vault.withdraw(WETH_ADDR, address(0), 1);
        vm.expectRevert(abi.encodeWithSelector(CastleVault.OverAllocated.selector, WETH_ADDR, 6 ether, 6 ether - 1));
        vault.withdraw(WETH_ADDR, operator, 4 ether + 1);
        vm.expectRevert(abi.encodeWithSelector(CastleVault.OverAllocated.selector, WETH_ADDR, 6 ether, 0));
        vault.withdraw(WETH_ADDR, operator, 11 ether);
        vm.expectEmit(address(vault));
        emit CastleVault.Withdrawn(WETH_ADDR, operator, 4 ether);
        vault.withdraw(WETH_ADDR, operator, 4 ether);
        vault.withdraw(USDC_ADDR, operator, 30_000e6);
        // a stray token goes out in full
        TokenMock stray = new TokenMock("Stray", "S");
        stray.mint(address(vault), 5);
        vault.withdraw(address(stray), operator, 5);
        vm.stopPrank();
        assertEq(weth.balanceOf(operator), 4 ether);
        assertEq(stray.balanceOf(operator), 5);
    }

    function test_setFi_setFum_onlyOwner() public {
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, fum));
        vm.prank(fum);
        vault.setFum(fum);
        vm.startPrank(operator);
        vm.expectRevert(CastleVault.ZeroAddress.selector);
        vault.setFi(address(0));
        vm.expectRevert(CastleVault.ZeroAddress.selector);
        vault.setFum(address(0));
        vm.expectEmit(address(vault));
        emit CastleVault.FiSet(jack);
        vault.setFi(jack);
        vm.expectEmit(address(vault));
        emit CastleVault.FumSet(jack);
        vault.setFum(jack);
        vm.stopPrank();
        assertEq(vault.fi(), jack);
        assertEq(vault.fum(), jack);
    }

    // ---- fuzz -----------------------------------------------------------------------------------

    function testFuzz_ship_neverPromisesPastLeverage(uint16 lev, uint256 a, uint256 b) public {
        lev = uint16(bound(lev, 1, type(uint16).max));
        a = bound(a, 0, 150 ether);
        b = bound(b, 0, 150 ether);
        _cap(0, type(uint128).max, type(uint128).max);
        _cap(1, type(uint128).max, type(uint128).max);
        vm.prank(fum);
        vault.setLeverage(WETH_ADDR, lev);
        uint256 lim = 10 ether * uint256(lev) / 1e4;
        (bytes memory hen, bytes memory hen2) = (programs.xyc(HEN_FEE), programs.xyc(HEN2_FEE));
        bool okA = a <= lim;
        if (!okA) vm.expectRevert(abi.encodeWithSelector(CastleVault.OverAllocated.selector, WETH_ADDR, a, lim));
        _ship(0, hen, a, 0);
        uint256 c = okA ? a : 0;
        if (c + b > lim) {
            vm.expectRevert(abi.encodeWithSelector(CastleVault.OverAllocated.selector, WETH_ADDR, c + b, lim));
        }
        _ship(1, hen2, b, 0);
        assertLe(vault.committed(WETH_ADDR), lim);
    }
}
