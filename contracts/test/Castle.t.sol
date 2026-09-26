// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";
import { Aqua } from "@1inch/aqua/src/Aqua.sol";
import { TokenMock } from "@1inch/solidity-utils/contracts/mocks/TokenMock.sol";
import { AquaSwapVMRouter } from "@1inch/swap-vm/src/routers/AquaSwapVMRouter.sol";
import { ISwapVM } from "@1inch/swap-vm/src/interfaces/ISwapVM.sol";

import { Castle } from "../src/Castle.sol";
import { FeeFiFoFumExtruction } from "../src/FeeFiFoFumExtruction.sol";
import { JackHook } from "../src/JackHook.sol";
import { AuctionParameters } from "../src/interfaces/ICCA.sol";
import { ICastleLease, CastleLeaseTypes } from "../src/interfaces/ICastleLease.sol";
import { ENSv2Roles, IENSv2Registry } from "../src/interfaces/IENSv2.sol";
import { MockENSv2Registry, MockENSv2Resolver } from "./mocks/MockENSv2.sol";
import { MockCCA, MockCCAFactory } from "./mocks/MockCCA.sol";
import { CastleHelpers, ProgramMirror } from "./utils/CastleHelpers.sol";

/// @dev Unit tests: real Aqua, real AquaSwapVMRouter 1.0.2, real fence; ENSv2 as a tag-accurate mock (including the
///      record sharing linkToNode causes). Runs once per token address ordering (see the two concrete contracts).
abstract contract CastleUnitBase is CastleHelpers {
    uint64 internal constant LEASE = 120;
    uint32 internal constant FEE = 3e6; // 0.3%
    uint32 internal constant RANGE = 1e8; // band [P/1.1, P*1.1]
    uint32 internal constant WIND_DOWN_FEE = 5e7; // 5%
    uint16 internal constant DECAY = 60;
    uint64 internal constant GRACE = 300;
    address internal constant LOW = 0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238;
    address internal constant HIGH = 0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14;

    Aqua internal aqua;
    AquaSwapVMRouter internal router;
    FeeFiFoFumExtruction internal fence;
    ProgramMirror internal mirror;
    MockCCAFactory internal cca;
    JackHook internal jackHook;
    TokenMock internal weth;
    TokenMock internal usdc;
    MockENSv2Registry internal registry;
    MockENSv2Resolver internal resolver;
    Castle internal castle;

    uint256 internal foKey = 0xF0;
    address internal fo;
    address internal fee = makeAddr("fee");
    address internal fi = makeAddr("fi");
    address internal jack = makeAddr("jack");
    address internal operator = makeAddr("operator");

    function _usdcIsLt() internal pure virtual returns (bool);

    function setUp() public {
        vm.warp(1_790_400_000);
        fo = vm.addr(foKey);
        (address w, address u) = _usdcIsLt() ? (HIGH, LOW) : (LOW, HIGH);
        deployCodeTo("TokenMock.sol:TokenMock", abi.encode("Wrapped Ether", "WETH"), w);
        deployCodeTo("TokenMock.sol:TokenMock", abi.encode("USD Coin", "USDC"), u);
        (weth, usdc) = (TokenMock(w), TokenMock(u));
        aqua = new Aqua();
        router = new AquaSwapVMRouter(address(aqua), w, operator, "AquaSwapVMRouter", "1.0.2");
        fence = new FeeFiFoFumExtruction();
        mirror = new ProgramMirror();
        cca = new MockCCAFactory();
        registry = new MockENSv2Registry();
        resolver = new MockENSv2Resolver();
        jackHook = new JackHook(IENSv2Registry(address(registry)));

        // the agent registry already holds the crew's names and records (handoff-claude's script does this live)
        registry.grantRootRoles(ENSv2Roles.REGISTRY_REGISTRAR, address(this));
        resolver.grantRootRoles(ENSv2Roles.RESOLVER_SET_DATA, address(this));
        _name("fee", fee);
        _name("fi", fi);
        _name("jack", jack); // named, but never made crew

        castle = new Castle(_config(true));
        registry.grantRootRoles(ENSv2Roles.REGISTRY_REGISTRAR | ENSv2Roles.REGISTRY_RENEW, address(castle));
        resolver.grantRootRoles(ENSv2Roles.RESOLVER_LINK | ENSv2Roles.RESOLVER_SET_DATA, address(castle));
        _crew(castle);
        vm.prank(operator);
        castle.setAnchorPrice(ANCHOR_Q96);
    }

    function _name(string memory l, address owner) internal {
        registry.register(l, owner, address(0), address(resolver), 0, uint64(block.timestamp + 365 days));
        resolver.setData(_dns(l), "agent-endpoint[mcp]", "https://handoff.lol/mcp");
    }

    function _crew(Castle c) internal {
        vm.startPrank(operator);
        c.setCrew(fee, "fee");
        c.setCrew(fi, "fi");
        vm.stopPrank();
    }

    function _config(bool registryEpoch) internal view returns (Castle.Config memory) {
        return Castle.Config({
            aqua: address(aqua),
            router: address(router),
            fence: address(fence),
            registry: address(registry),
            resolver: address(resolver),
            weth: address(weth),
            usdc: address(usdc),
            fo: fo,
            owner: operator,
            label: "castle",
            dnsName: _dns("castle"),
            leasePeriod: LEASE,
            registryEpoch: registryEpoch,
            windDownFeeBps: WIND_DOWN_FEE,
            decayPeriod: DECAY,
            ccaFactory: address(cca),
            jackHook: address(jackHook),
            dissolveGrace: GRACE
        });
    }

    function _renew(address who, uint64 newExpiry) internal {
        uint64 deadline = uint64(block.timestamp + 30);
        bytes memory sig = _sign(castle, foKey, castle.epoch(), newExpiry, deadline);
        vm.prank(who);
        castle.renew(newExpiry, deadline, sig);
    }

    function _params() internal pure returns (Castle.ShipParams memory) {
        return Castle.ShipParams({ maxWeth: 10 ether, maxUsdc: 30_000e6, feeBps: FEE, rangeBps: RANGE });
    }

    function _fund() internal {
        weth.mint(address(castle), 10 ether);
        usdc.mint(address(castle), 30_000e6);
    }

    function _claimAndShip(address who) internal returns (bytes32 h, ISwapVM.Order memory order) {
        vm.prank(who);
        castle.claim();
        vm.prank(who);
        (h, order) = castle.ship(_params());
    }

    function _swap(ISwapVM.Order memory order, IERC20 tokenIn, uint256 amount)
        internal
        returns (uint256 amountIn, uint256 amountOut)
    {
        TokenMock(address(tokenIn)).mint(jack, amount);
        IERC20 tokenOut = address(tokenIn) == address(usdc) ? IERC20(address(weth)) : IERC20(address(usdc));
        vm.startPrank(jack);
        tokenIn.approve(address(router), amount);
        (amountIn, amountOut,) = router.swap(order, address(tokenIn), address(tokenOut), amount, _takerData(jack, true));
        vm.stopPrank();
    }

    function _quote(ISwapVM.Order memory order, IERC20 tokenIn, uint256 amount) internal returns (uint256 amountOut) {
        IERC20 tokenOut = address(tokenIn) == address(usdc) ? IERC20(address(weth)) : IERC20(address(usdc));
        (, amountOut,) = router.quote(order, address(tokenIn), address(tokenOut), amount, _takerData(jack, true));
    }

    // ------------------------------------------------------------------ lease

    function test_genesisClaim() public {
        vm.prank(fee);
        uint256 ep = castle.claim();
        assertEq(castle.holder(), fee);
        assertEq(castle.epoch(), ep);
        assertEq(castle.expiry(), block.timestamp + LEASE);
        assertTrue(castle.isLive());
    }

    function test_renewWithFoAttestation() public {
        vm.prank(fee);
        castle.claim();
        vm.warp(block.timestamp + 40);
        uint64 next = uint64(block.timestamp + LEASE);
        _renew(fee, next);
        assertEq(castle.expiry(), next);
    }

    function test_attestationDigestIsStandardEip712() public view {
        bytes32 domain = keccak256(
            abi.encode(
                keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"),
                keccak256(bytes(CastleLeaseTypes.NAME)),
                keccak256(bytes(CastleLeaseTypes.VERSION)),
                block.chainid,
                address(castle)
            )
        );
        bytes32 structHash =
            keccak256(abi.encode(CastleLeaseTypes.ATTESTATION_TYPEHASH, uint256(7), uint64(9), uint64(11)));
        assertEq(
            castle.attestationDigest(ICastleLease.Attestation(7, 9, 11)),
            keccak256(abi.encodePacked("\x19\x01", domain, structHash))
        );
    }

    function test_revert_replayedAttestation() public {
        vm.prank(fee);
        castle.claim();
        vm.warp(block.timestamp + 40);
        uint64 next = uint64(block.timestamp + LEASE);
        uint64 deadline = uint64(block.timestamp + 30);
        bytes memory sig = _sign(castle, foKey, castle.epoch(), next, deadline);
        vm.prank(fee);
        castle.renew(next, deadline, sig);
        vm.prank(fee);
        vm.expectRevert(
            abi.encodeWithSelector(ICastleLease.BadExpiry.selector, next, next, uint64(block.timestamp + LEASE))
        );
        castle.renew(next, deadline, sig);
    }

    function test_revert_renewWithoutFoSignature() public {
        vm.prank(fee);
        castle.claim();
        vm.warp(block.timestamp + 40);
        uint64 next = uint64(block.timestamp + LEASE);
        uint64 deadline = uint64(block.timestamp + 30);
        bytes memory sig = _sign(castle, 0xBAD, castle.epoch(), next, deadline); // fee signs for itself
        vm.prank(fee);
        vm.expectRevert(abi.encodeWithSelector(ICastleLease.BadAttestation.selector, vm.addr(0xBAD)));
        castle.renew(next, deadline, sig);
    }

    function test_revert_renewWithGarbageSignature() public {
        vm.prank(fee);
        castle.claim();
        vm.warp(block.timestamp + 40);
        vm.prank(fee);
        vm.expectRevert(abi.encodeWithSelector(ICastleLease.BadAttestation.selector, address(0)));
        castle.renew(uint64(block.timestamp + LEASE), uint64(block.timestamp + 30), hex"1234");
    }

    function test_revert_renewByNonHolder() public {
        vm.prank(fee);
        castle.claim();
        uint64 next = uint64(block.timestamp + LEASE);
        uint64 deadline = uint64(block.timestamp + 30);
        bytes memory sig = _sign(castle, foKey, castle.epoch(), next, deadline);
        vm.prank(jack);
        vm.expectRevert(abi.encodeWithSelector(ICastleLease.NotHolder.selector, jack, fee));
        castle.renew(next, deadline, sig);
    }

    function test_revert_renewAfterExpiry() public {
        vm.prank(fee);
        castle.claim();
        uint64 exp = castle.expiry();
        vm.warp(exp);
        uint64 next = uint64(block.timestamp + LEASE);
        uint64 deadline = uint64(block.timestamp + 30);
        bytes memory sig = _sign(castle, foKey, castle.epoch(), next, deadline);
        vm.prank(fee);
        vm.expectRevert(abi.encodeWithSelector(ICastleLease.LeaseExpired.selector, exp));
        castle.renew(next, deadline, sig);
    }

    function test_revert_attestationPastDeadline() public {
        vm.prank(fee);
        castle.claim();
        uint64 next = uint64(block.timestamp + 60);
        uint64 deadline = uint64(block.timestamp + 5);
        bytes memory sig = _sign(castle, foKey, castle.epoch(), next, deadline);
        vm.warp(block.timestamp + 6);
        vm.prank(fee);
        vm.expectRevert(abi.encodeWithSelector(ICastleLease.AttestationExpired.selector, deadline));
        castle.renew(next, deadline, sig);
    }

    function test_revert_renewBeyondLeasePeriod() public {
        vm.prank(fee);
        castle.claim();
        uint64 tooFar = uint64(block.timestamp + LEASE + 1);
        uint64 deadline = uint64(block.timestamp + 30);
        bytes memory sig = _sign(castle, foKey, castle.epoch(), tooFar, deadline);
        uint64 current = castle.expiry();
        vm.prank(fee);
        vm.expectRevert(
            abi.encodeWithSelector(ICastleLease.BadExpiry.selector, tooFar, current, uint64(block.timestamp + LEASE))
        );
        castle.renew(tooFar, deadline, sig);
    }

    function test_revert_claimWhileLive() public {
        vm.prank(fee);
        castle.claim();
        uint64 current = castle.expiry();
        vm.prank(fi);
        vm.expectRevert(abi.encodeWithSelector(ICastleLease.LeaseStillLive.selector, current));
        castle.claim();
    }

    // ------------------------------------------------------------------ crew-only claim (SirKit requirement 1)

    function test_revert_claimByNamedNonCrew() public {
        assertEq(registry.getOwner(uint256(keccak256("jack"))), jack); // jack has a live name ...
        vm.prank(jack); // ... but the operator never made jack crew
        vm.expectRevert(abi.encodeWithSelector(Castle.NotCrew.selector, jack));
        castle.claim();
    }

    function test_revert_claimByAnonymousTaker() public {
        address taker = makeAddr("taker");
        vm.prank(taker);
        vm.expectRevert(abi.encodeWithSelector(Castle.NotCrew.selector, taker));
        castle.claim();
    }

    function test_revert_claimByCrewWhoseNameExpired() public {
        address mallory = makeAddr("mallory");
        registry.register("mallory", mallory, address(0), address(resolver), 0, uint64(block.timestamp + 10));
        vm.prank(operator);
        castle.setCrew(mallory, "mallory");
        assertTrue(castle.isCrew(mallory));
        vm.warp(block.timestamp + 10);
        assertFalse(castle.isCrew(mallory));
        vm.prank(mallory);
        vm.expectRevert(abi.encodeWithSelector(Castle.NotCrew.selector, mallory));
        castle.claim();
    }

    function test_revert_claimByCrewUsingSomeoneElsesLabel() public {
        vm.prank(operator);
        castle.setCrew(jack, "fee"); // jack does not own fee.feefifofum.eth
        vm.prank(jack);
        vm.expectRevert(abi.encodeWithSelector(Castle.NotCrew.selector, jack));
        castle.claim();
    }

    function test_revert_claimByRemovedCrew() public {
        vm.prank(operator);
        castle.setCrew(fee, "");
        vm.prank(fee);
        vm.expectRevert(abi.encodeWithSelector(Castle.NotCrew.selector, fee));
        castle.claim();
    }

    function test_revert_crewCannotBeTheCastleLabel() public {
        vm.prank(operator);
        vm.expectRevert(Castle.BadConfig.selector);
        castle.setCrew(jack, "castle");
    }

    function test_revert_setCrewOnlyOwner() public {
        vm.prank(jack);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, jack));
        castle.setCrew(jack, "jack");
    }

    function test_claimAfterExpiryFencesTheOldShift() public {
        vm.prank(fee);
        uint256 feeEpoch = castle.claim();
        uint64 feeNext = uint64(block.timestamp + LEASE);
        uint64 deadline = uint64(block.timestamp + LEASE + 60);
        bytes memory feeSig = _sign(castle, foKey, feeEpoch, feeNext, deadline);

        vm.warp(castle.expiry()); // fee died: nobody renewed
        vm.prank(fi);
        uint256 fiEpoch = castle.claim();
        assertTrue(fiEpoch != feeEpoch, "claim must regenerate the epoch");
        assertEq(castle.holder(), fi);

        vm.prank(fee);
        vm.expectRevert(abi.encodeWithSelector(ICastleLease.NotHolder.selector, fee, fi));
        castle.renew(feeNext + 1, deadline, feeSig);
        vm.prank(fee);
        vm.expectRevert(abi.encodeWithSelector(ICastleLease.NotHolder.selector, fee, fi));
        castle.relink();
    }

    function test_oldEpochAttestationDoesNotRecover() public {
        vm.prank(fee);
        uint256 feeEpoch = castle.claim();
        vm.warp(castle.expiry());
        vm.prank(fi);
        castle.claim();
        vm.warp(block.timestamp + 40);
        uint64 next = uint64(block.timestamp + LEASE);
        uint64 deadline = uint64(block.timestamp + 30);
        bytes memory staleSig = _sign(castle, foKey, feeEpoch, next, deadline);
        vm.prank(fi);
        vm.expectPartialRevert(ICastleLease.BadAttestation.selector);
        castle.renew(next, deadline, staleSig);
    }

    function test_fallbackEpochCounter() public {
        registry.setRegenerate(false);
        Castle c = new Castle(_config(false));
        registry.grantRootRoles(ENSv2Roles.REGISTRY_REGISTRAR | ENSv2Roles.REGISTRY_RENEW, address(c));
        _crew(c);
        vm.prank(fee);
        assertEq(c.claim(), 1);
        vm.warp(c.expiry());
        vm.prank(fi);
        assertEq(c.claim(), 2);
    }

    function test_revert_registryDidNotRegenerate() public {
        registry.setRegenerate(false);
        vm.prank(fee);
        uint256 ep = castle.claim();
        vm.warp(castle.expiry());
        vm.prank(fi);
        vm.expectRevert(abi.encodeWithSelector(Castle.EpochNotRegenerated.selector, ep));
        castle.claim();
    }

    function test_namehashes() public view {
        assertEq(castle.NODE(), vm.ensNamehash("castle.feefifofum.eth"));
        assertEq(castle.PARENT_NODE(), vm.ensNamehash("feefifofum.eth"));
    }

    function test_revert_configRouterBoundToAnotherAqua() public {
        Castle.Config memory c = _config(true);
        c.aqua = address(new Aqua());
        vm.expectRevert(Castle.BadConfig.selector);
        new Castle(c);
    }

    // ------------------------------------------------------------------ ENS records

    function test_relinkLinksToHolderAndCarriesTheAnchor() public {
        vm.prank(fee);
        castle.claim();
        vm.prank(fee);
        bytes32 feeNode = castle.relink();
        assertEq(feeNode, vm.ensNamehash("fee.feefifofum.eth"));
        assertEq(resolver.getRecordId(castle.NODE()), resolver.getRecordId(feeNode), "castle shares fee's record");
        assertEq(castle.anchorPriceQ96(), ANCHOR_Q96, "anchor carried into fee's record");

        vm.warp(castle.expiry());
        vm.startPrank(fi);
        castle.claim();
        bytes32 fiNode = castle.relink();
        vm.stopPrank();
        assertEq(resolver.getRecordId(castle.NODE()), resolver.getRecordId(fiNode), "castle now shares fi's record");
        assertEq(castle.anchorPriceQ96(), ANCHOR_Q96, "anchor carried into fi's record");
    }

    function test_withoutCarryTheAnchorWouldBeLost() public {
        // what relink() guards against: a bare linkToNode switches castle to a record with no price
        resolver.grantRootRoles(ENSv2Roles.RESOLVER_LINK, address(this));
        resolver.linkToNode(_dns("castle"), vm.ensNamehash("fi.feefifofum.eth"));
        assertEq(castle.anchorPriceQ96(), 0);
    }

    function test_revert_relinkToNameWithoutRecord() public {
        address bob = makeAddr("bob");
        registry.register("bob", bob, address(0), address(resolver), 0, uint64(block.timestamp + 1 days));
        vm.prank(operator);
        castle.setCrew(bob, "bob");
        vm.startPrank(bob);
        castle.claim();
        vm.expectRevert(MockENSv2Resolver.InvalidRecord.selector);
        castle.relink();
        vm.stopPrank();
    }

    function test_setAnchorPriceOnlyOwner() public {
        vm.prank(fee);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, fee));
        castle.setAnchorPrice(1);
        vm.prank(operator);
        castle.setAnchorPrice(0);
        assertEq(castle.anchorPriceQ96(), 0);
    }

    // ------------------------------------------------------------------ the book

    function test_programIsTheFencedProgram() public {
        _fund();
        (, ISwapVM.Order memory order) = _claimAndShip(fee);
        (, uint256 sqrtMin, uint256 sqrtMax) = _band(ANCHOR_Q96, RANGE, _usdcIsLt());
        bytes memory expected = mirror.fenced(
            ProgramMirror.Spec({
                fence: address(fence),
                epoch: castle.epoch(),
                usdc: address(usdc),
                decayPeriod: DECAY,
                sqrtMin: sqrtMin,
                sqrtMax: sqrtMax,
                feeBps: FEE,
                windDownFeeBps: WIND_DOWN_FEE,
                nonce: 1
            })
        );
        assertEq(order.maker, address(castle));
        assertEq(order.data, expected, "Castle's program == ProgramBuilder over AquaOpcodes");
        assertEq(expected.length, 242);
    }

    function test_shipRegistersUnderTheRouterOnly() public {
        _fund();
        (bytes32 h, ISwapVM.Order memory order) = _claimAndShip(fee);
        assertEq(h, router.hash(order));
        assertEq(castle.shippedEpoch(h), castle.epoch());
        (uint248 w, uint8 n) = aqua.rawBalances(address(castle), address(router), h, address(weth));
        (uint248 u,) = aqua.rawBalances(address(castle), address(router), h, address(usdc));
        assertGt(w, 0);
        assertGt(u, 0);
        assertEq(n, 2);
        assertLe(w, 10 ether);
        assertLe(u, 30_000e6);
    }

    function test_shipCentresOnTheAnchor() public {
        _fund();
        (, ISwapVM.Order memory order) = _claimAndShip(fee);
        // 30 USDC in: expect 0.01 WETH less the 0.3% fee, within 0.05% of price impact and rounding
        uint256 out = _quote(order, IERC20(address(usdc)), 30e6);
        uint256 ideal = 0.01 ether * uint256(1e9 - FEE) / 1e9;
        assertApproxEqRel(out, ideal, 5e14);
        assertLt(out, ideal);
        // 0.01 WETH in: expect 30 USDC less the fee
        uint256 outUsdc = _quote(order, IERC20(address(weth)), 0.01 ether);
        assertApproxEqRel(outUsdc, 30e6 * uint256(1e9 - FEE) / 1e9, 5e14);
    }

    function test_liveFillsMoveRealTokens() public {
        _fund();
        (bytes32 h, ISwapVM.Order memory order) = _claimAndShip(fee);
        uint256 quoted = _quote(order, IERC20(address(usdc)), 1_000e6);
        (uint256 amountIn, uint256 amountOut) = _swap(order, IERC20(address(usdc)), 1_000e6);
        assertEq(amountOut, quoted, "quote == swap (live)");
        assertEq(amountIn, 1_000e6);
        assertEq(weth.balanceOf(jack), amountOut);
        assertEq(weth.balanceOf(address(castle)), 10 ether - amountOut);
        assertEq(usdc.balanceOf(address(castle)), 31_000e6);

        (, uint256 out2) = _swap(order, IERC20(address(weth)), 0.1 ether);
        assertGt(out2, 0);

        vm.prank(fee);
        castle.dock(h);
        (uint248 bal,) = aqua.rawBalances(address(castle), address(router), h, address(weth));
        assertEq(bal, 0);
    }

    function test_decayPricesAnImmediateBackRunWorse() public {
        _fund();
        (, ISwapVM.Order memory order) = _claimAndShip(fee);
        _swap(order, IERC20(address(usdc)), 3_000e6);
        uint256 backRunNow = _quote(order, IERC20(address(weth)), 0.5 ether);
        vm.warp(block.timestamp + DECAY);
        uint256 backRunLater = _quote(order, IERC20(address(weth)), 0.5 ether);
        assertLt(backRunNow, backRunLater);
    }

    function test_windDownIsReduceOnlyWithTheWideFee() public {
        _fund();
        (, ISwapVM.Order memory order) = _claimAndShip(fee);
        uint256 liveOut = _quote(order, IERC20(address(usdc)), 300e6);
        vm.warp(castle.expiry()); // fee died, nobody has claimed yet

        uint256 windOut = _quote(order, IERC20(address(usdc)), 300e6);
        assertApproxEqRel(windOut, liveOut * uint256(1e9 - WIND_DOWN_FEE) / uint256(1e9 - FEE), 1e15);
        (, uint256 swapped) = _swap(order, IERC20(address(usdc)), 300e6);
        assertEq(swapped, windOut, "quote == swap (wind-down)");

        TokenMock(address(weth)).mint(jack, 0.1 ether);
        vm.startPrank(jack);
        weth.approve(address(router), 0.1 ether);
        vm.expectRevert(abi.encodeWithSelector(FeeFiFoFumExtruction.WindDownReduceOnly.selector, address(weth)));
        router.quote(order, address(weth), address(usdc), 0.1 ether, _takerData(jack, true));
        vm.expectRevert(abi.encodeWithSelector(FeeFiFoFumExtruction.WindDownReduceOnly.selector, address(weth)));
        router.swap(order, address(weth), address(usdc), 0.1 ether, _takerData(jack, true));
        vm.stopPrank();
    }

    function test_newEpochKillsTheOldBook() public {
        _fund();
        (, ISwapVM.Order memory order) = _claimAndShip(fee);
        vm.warp(castle.expiry());
        vm.prank(fi);
        castle.claim();

        usdc.mint(jack, 300e6);
        vm.startPrank(jack);
        usdc.approve(address(router), 300e6);
        vm.expectRevert(FeeFiFoFumExtruction.FeeFiFoFum.selector);
        router.quote(order, address(usdc), address(weth), 300e6, _takerData(jack, true));
        vm.expectRevert(FeeFiFoFumExtruction.FeeFiFoFum.selector);
        router.swap(order, address(usdc), address(weth), 300e6, _takerData(jack, true));
        vm.stopPrank();
    }

    function test_revert_staleHolderCannotShip() public {
        vm.prank(fee);
        castle.claim();
        uint64 exp = castle.expiry();
        vm.warp(exp);
        Castle.ShipParams memory p = _params();
        vm.prank(fee);
        vm.expectRevert(abi.encodeWithSelector(ICastleLease.LeaseExpired.selector, exp));
        castle.ship(p);
    }

    function test_revert_shipBounds() public {
        _fund();
        vm.prank(fee);
        castle.claim();
        Castle.ShipParams memory p = _params();
        p.feeBps = castle.MAX_FEE_BPS() + 1;
        vm.prank(fee);
        vm.expectRevert(Castle.BadShipParams.selector);
        castle.ship(p);
        p = _params();
        p.feeBps = castle.MIN_FEE_BPS() - 1;
        vm.prank(fee);
        vm.expectRevert(Castle.BadShipParams.selector);
        castle.ship(p);
        p = _params();
        p.rangeBps = castle.MIN_RANGE_BPS() - 1;
        vm.prank(fee);
        vm.expectRevert(Castle.BadShipParams.selector);
        castle.ship(p);
        p = _params();
        p.rangeBps = castle.MAX_RANGE_BPS() + 1;
        vm.prank(fee);
        vm.expectRevert(Castle.BadShipParams.selector);
        castle.ship(p);
    }

    function test_revert_shipWithoutAnchor() public {
        _fund();
        vm.prank(operator);
        castle.setAnchorPrice(0);
        vm.prank(fee);
        castle.claim();
        Castle.ShipParams memory p = _params();
        vm.prank(fee);
        vm.expectRevert(Castle.NoAnchor.selector);
        castle.ship(p);
    }

    function test_revert_shipAnEmptyBook() public {
        vm.prank(fee);
        castle.claim();
        Castle.ShipParams memory p = _params();
        vm.prank(fee);
        vm.expectRevert(Castle.EmptyBook.selector);
        castle.ship(p);
    }

    function test_shipClampsToTheHoard() public {
        weth.mint(address(castle), 1 ether);
        usdc.mint(address(castle), 3_000e6);
        (bytes32 h,) = _claimAndShip(fee); // asks for 10 WETH / 30,000 USDC
        (uint248 w,) = aqua.rawBalances(address(castle), address(router), h, address(weth));
        (uint248 u,) = aqua.rawBalances(address(castle), address(router), h, address(usdc));
        assertLe(w, 1 ether);
        assertLe(u, 3_000e6);
    }

    // ------------------------------------------------------------------ multicall allowlist (SirKit requirement 2)

    function test_handoverInOneMulticall() public {
        _fund();
        (bytes32 h,) = _claimAndShip(fee);
        vm.warp(castle.expiry());

        bytes[] memory calls = new bytes[](4);
        calls[0] = abi.encodeCall(Castle.claim, ());
        calls[1] = abi.encodeCall(Castle.dock, (h));
        calls[2] = abi.encodeCall(Castle.relink, ());
        calls[3] = abi.encodeCall(Castle.ship, (_params()));
        vm.prank(fi);
        bytes[] memory results = castle.multicall(calls);
        assertEq(castle.holder(), fi);
        (uint248 bal,) = aqua.rawBalances(address(castle), address(router), h, address(usdc));
        assertEq(bal, 0);
        (bytes32 h2,) = abi.decode(results[3], (bytes32, ISwapVM.Order));
        assertEq(castle.shippedEpoch(h2), castle.epoch());
        assertEq(resolver.getRecordId(castle.NODE()), resolver.getRecordId(vm.ensNamehash("fi.feefifofum.eth")));
    }

    function test_revert_multicallCarryingTransfer() public {
        _fund();
        vm.prank(fee);
        castle.claim();
        bytes[] memory calls = new bytes[](1);
        calls[0] = abi.encodeCall(IERC20.transfer, (fee, 10 ether));
        vm.prank(fee);
        vm.expectRevert(abi.encodeWithSelector(Castle.SelectorNotAllowed.selector, IERC20.transfer.selector));
        castle.multicall(calls);
        assertEq(weth.balanceOf(address(castle)), 10 ether);
    }

    function test_revert_multicallCarryingTransferAfterAnAllowedCall() public {
        _fund();
        vm.prank(fee);
        castle.claim();
        bytes[] memory calls = new bytes[](2);
        calls[0] = abi.encodeCall(Castle.relink, ());
        calls[1] = abi.encodeCall(IERC20.transferFrom, (address(castle), fee, 10 ether));
        vm.prank(fee);
        vm.expectRevert(abi.encodeWithSelector(Castle.SelectorNotAllowed.selector, IERC20.transferFrom.selector));
        castle.multicall(calls);
    }

    function test_revert_multicallCarryingOwnerCalls() public {
        bytes[] memory calls = new bytes[](1);
        calls[0] = abi.encodeCall(Castle.setCrew, (jack, "jack"));
        vm.prank(operator);
        vm.expectRevert(abi.encodeWithSelector(Castle.SelectorNotAllowed.selector, Castle.setCrew.selector));
        castle.multicall(calls);
        calls[0] = abi.encodeCall(Ownable.transferOwnership, (jack));
        vm.prank(operator);
        vm.expectRevert(abi.encodeWithSelector(Castle.SelectorNotAllowed.selector, Ownable.transferOwnership.selector));
        castle.multicall(calls);
        calls[0] = abi.encodeCall(IERC20.approve, (jack, type(uint256).max));
        vm.expectRevert(abi.encodeWithSelector(Castle.SelectorNotAllowed.selector, IERC20.approve.selector));
        castle.multicall(calls);
        calls[0] = hex"aabbcc";
        vm.expectRevert(abi.encodeWithSelector(Castle.SelectorNotAllowed.selector, bytes4(0)));
        castle.multicall(calls);
    }

    // ------------------------------------------------------------------ the exit: CCA auctions (p4)

    function _auction() internal view returns (MockCCA) {
        return MockCCA(castle.auction());
    }

    function test_openAuctionParamsAreCastles() public {
        _fund();
        vm.prank(fee);
        castle.claim();
        vm.prank(fee);
        address a = castle.openAuction(2 ether);
        assertEq(a, castle.auction());
        assertEq(weth.balanceOf(a), 2 ether);
        assertEq(weth.balanceOf(address(castle)), 8 ether);
        assertTrue(MockCCA(a).tokensReceived());
        AuctionParameters memory p = MockCCA(a).params();
        assertEq(p.currency, address(usdc));
        assertEq(p.tokensRecipient, address(castle));
        assertEq(p.fundsRecipient, address(castle));
        assertEq(p.validationHook, address(jackHook));
        assertEq(p.floorPrice % p.tickSpacing, 0, "floor is a tick");
        assertEq(p.floorPrice, ANCHOR_Q96 * 80 / 100 / 100 * 100);
        assertEq(p.endBlock - p.startBlock, 25);
        assertEq(p.claimBlock, p.endBlock);
        assertEq(p.requiredCurrencyRaised, 0);
        assertEq(p.auctionStepsData, abi.encodePacked(uint24(400_000), uint40(25)));
    }

    function test_revert_auctionOnlyFreeWeth() public {
        _fund();
        _claimAndShip(fee);
        uint256 free = castle.freeBalance(IERC20(address(weth)));
        assertEq(free, 10 ether - castle.committed(IERC20(address(weth))));
        assertLt(free, 10 ether);
        vm.prank(fee);
        vm.expectRevert(Castle.BadAuctionAmount.selector);
        castle.openAuction(uint128(free + 1));
        vm.prank(fee);
        castle.openAuction(uint128(free));
        // the live book still fills: nothing it claims went to the auction
        assertGe(weth.balanceOf(address(castle)), castle.committed(IERC20(address(weth))));
    }

    function test_shipNeverOverCommits() public {
        _fund();
        Castle.ShipParams memory half = _params();
        (half.maxWeth, half.maxUsdc) = (5 ether, 15_000e6);
        vm.startPrank(fee);
        castle.claim();
        castle.ship(half);
        castle.ship(_params()); // asks for everything: gets only what the first book left free
        assertLe(castle.committed(IERC20(address(weth))), weth.balanceOf(address(castle)));
        assertLe(castle.committed(IERC20(address(usdc))), usdc.balanceOf(address(castle)));
        assertEq(castle.activeStrategies().length, 2);
        vm.stopPrank();
    }

    function test_revert_tooManyStrategies() public {
        _fund();
        Castle.ShipParams memory p = _params();
        p.maxWeth = 1 ether;
        p.maxUsdc = 3_000e6;
        vm.startPrank(fee);
        castle.claim();
        for (uint256 i; i < castle.MAX_ACTIVE_STRATEGIES(); ++i) {
            castle.ship(p);
        }
        vm.expectRevert(Castle.TooManyStrategies.selector);
        castle.ship(p);
        bytes32 h = castle.activeStrategies()[0];
        castle.dock(h);
        castle.ship(p);
        vm.stopPrank();
    }

    function test_auctioneerOpensAndStrangersCannot() public {
        _fund();
        address fum = makeAddr("fum");
        vm.prank(operator);
        castle.setAuctioneer(fum);
        vm.prank(fum); // no lease needed: fum is the auctioneer
        castle.openAuction(1 ether);
        vm.roll(block.number + 25);
        castle.settleAuction();
        vm.prank(jack);
        vm.expectRevert(abi.encodeWithSelector(ICastleLease.NotHolder.selector, jack, address(0)));
        castle.openAuction(1 ether);
    }

    function test_revert_oneAuctionAtATime() public {
        _fund();
        vm.startPrank(fee);
        castle.claim();
        address a = castle.openAuction(1 ether);
        vm.expectRevert(abi.encodeWithSelector(Castle.AuctionRunning.selector, a));
        castle.openAuction(1 ether);
        vm.stopPrank();
    }

    function test_settleSweepsHomeAndWritesTheClearingPrice() public {
        _fund();
        vm.prank(fee);
        castle.claim();
        vm.prank(fee);
        castle.openAuction(2 ether);
        MockCCA a = _auction();
        vm.expectRevert(abi.encodeWithSelector(Castle.AuctionNotOver.selector, a.endBlock()));
        castle.settleAuction();

        uint256 clearing = ANCHOR_Q96 * 11 / 10; // Jacks paid 10% over the anchor
        usdc.mint(address(a), 3_300e6);
        vm.prank(jack);
        a.fill(3_300e6, 1 ether, clearing);
        vm.roll(a.endBlock());
        vm.prank(jack); // anyone settles
        assertEq(castle.settleAuction(), clearing);
        assertEq(usdc.balanceOf(address(castle)), 33_300e6);
        assertEq(weth.balanceOf(address(castle)), 9 ether);
        assertEq(castle.anchorPriceQ96(), clearing, "the next ship centres on the clearing price");
        assertEq(castle.auction(), address(0));
        vm.expectRevert(Castle.NoAuction.selector);
        castle.settleAuction();
    }

    function test_settleWithNoSalesKeepsTheAnchor() public {
        _fund();
        vm.prank(fee);
        castle.claim();
        vm.prank(fee);
        castle.openAuction(2 ether);
        vm.roll(_auction().endBlock());
        castle.settleAuction();
        assertEq(castle.anchorPriceQ96(), ANCHOR_Q96);
        assertEq(weth.balanceOf(address(castle)), 10 ether);
    }

    function test_dissolveIsPermissionlessAfterGrace() public {
        _fund();
        (bytes32 h,) = _claimAndShip(fee);
        uint64 exp = castle.expiry();
        vm.warp(exp + GRACE - 1);
        vm.prank(jack);
        vm.expectRevert(abi.encodeWithSelector(Castle.NotDissolvable.selector, uint256(exp) + GRACE));
        castle.dissolve();

        vm.warp(exp + GRACE);
        vm.prank(jack); // not crew, not holder, not fum
        address a = castle.dissolve();
        (uint248 bal,) = aqua.rawBalances(address(castle), address(router), h, address(weth));
        assertEq(bal, 0, "the stale book is docked");
        assertEq(castle.activeStrategies().length, 0);
        assertEq(weth.balanceOf(a), 10 ether, "all the WETH goes to auction");
        assertEq(weth.balanceOf(address(castle)), 0);
    }

    function test_revert_dissolveBeforeAnyLease() public {
        vm.expectRevert(abi.encodeWithSelector(Castle.NotDissolvable.selector, uint256(GRACE)));
        castle.dissolve();
    }

    function test_dockThenAuctionInOneMulticall() public {
        _fund();
        (bytes32 h,) = _claimAndShip(fee);
        bytes[] memory calls = new bytes[](2);
        calls[0] = abi.encodeCall(Castle.dock, (h));
        calls[1] = abi.encodeCall(Castle.openAuction, (uint128(10 ether)));
        vm.prank(fee);
        castle.multicall(calls);
        assertEq(weth.balanceOf(castle.auction()), 10 ether);
    }

    function test_revert_auctionWithoutAnchor() public {
        _fund();
        vm.prank(operator);
        castle.setAnchorPrice(0);
        vm.prank(fee);
        castle.claim();
        vm.prank(fee);
        vm.expectRevert(Castle.NoAnchor.selector);
        castle.openAuction(1 ether);
    }

    // ------------------------------------------------------------------ JackHook (korg's vectors)

    function test_jackHookNamedBidderPasses() public view {
        jackHook.validate(0, 1, jack, address(0xdead), "jack");
    }

    function test_revert_jackHookUnnamed() public {
        address nobody = makeAddr("nobody");
        vm.expectRevert(abi.encodeWithSelector(JackHook.Unnamed.selector, nobody, bytes("nobody")));
        jackHook.validate(0, 1, nobody, nobody, "nobody");
    }

    function test_revert_jackHookExpired() public {
        address old = makeAddr("old");
        uint64 exp = uint64(block.timestamp + 5);
        registry.register("old", old, address(0), address(resolver), 0, exp);
        jackHook.validate(0, 1, old, old, "old");
        vm.warp(exp);
        vm.expectRevert(abi.encodeWithSelector(JackHook.NameExpired.selector, old, bytes("old"), exp));
        jackHook.validate(0, 1, old, old, "old");
    }

    function test_revert_jackHookSomeoneElsesName() public {
        vm.expectRevert(abi.encodeWithSelector(JackHook.NotNameOwner.selector, jack, bytes("fee"), fee));
        jackHook.validate(0, 1, jack, jack, "fee");
    }

    function test_theOldArbitraryShipIsGone() public {
        // v1's ship(address app, bytes strategy, address[] tokens, uint256[] amounts) let the holder name the app
        bytes memory legacy = abi.encodeWithSignature(
            "ship(address,bytes,address[],uint256[])", jack, bytes(""), new address[](0), new uint256[](0)
        );
        vm.prank(fee);
        (bool ok,) = address(castle).call(legacy);
        assertFalse(ok);
    }
}

/// @dev Sepolia ordering: USDC 0x1c7D… < WETH 0xfFf9…, so XYCConcentrate's P is WETH per USDC.
contract CastleTest is CastleUnitBase {
    function _usdcIsLt() internal pure override returns (bool) {
        return true;
    }
}

/// @dev The other ordering: WETH < USDC, so P is USDC per WETH.
contract CastleFlippedTest is CastleUnitBase {
    function _usdcIsLt() internal pure override returns (bool) {
        return false;
    }
}
