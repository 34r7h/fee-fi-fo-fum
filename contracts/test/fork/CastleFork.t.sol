// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { Math } from "@openzeppelin/contracts/utils/math/Math.sol";
import { IAqua } from "@1inch/aqua/src/interfaces/IAqua.sol";
import { AquaSwapVMRouter } from "@1inch/swap-vm/src/routers/AquaSwapVMRouter.sol";
import { ISwapVM } from "@1inch/swap-vm/src/interfaces/ISwapVM.sol";

import { Castle } from "../../src/Castle.sol";
import { FeeFiFoFumExtruction } from "../../src/FeeFiFoFumExtruction.sol";
import { JackHook } from "../../src/JackHook.sol";
import { ICCA } from "../../src/interfaces/ICCA.sol";
import { ICastleLease } from "../../src/interfaces/ICastleLease.sol";
import { IENSv2Registry, IENSv2Resolver, ENSv2Roles } from "../../src/interfaces/IENSv2.sol";
import { CastleHelpers } from "../utils/CastleHelpers.sol";

interface ICCABids {
    function submitBid(uint256 maxPriceQ96, uint128 amount, address owner, bytes calldata hookData)
        external
        payable
        returns (uint256 bidId);
}

interface ICCAExit {
    function exitBid(uint256 bidId) external;
}

interface IPermit2 {
    function approve(address token, address spender, uint160 amount, uint48 expiration) external;
}

interface IEnhancedAccessControl {
    function grantRootRoles(uint256 roleBitmap, address account) external returns (bool);
    function revokeRootRoles(uint256 roleBitmap, address account) external returns (bool);
}

interface IResolverSetData {
    function setData(bytes calldata name, string calldata key, bytes calldata value) external;
}

/// @title CastleForkTest
/// @notice Castle and FeeFiFoFumExtruction against the LIVE Sepolia contracts at a pinned block: the official Aqua,
///         our AquaSwapVMRouter 1.0.2, handoff's ENSv2 agent registry (feefifofum.eth's subregistry, where
///         fee/fi/fo/fum already hold names and records) and its PermissionedResolver (tag
///         sepolia-deployment-2026-09-15), WETH9 and Circle USDC. Only Castle and the fence are new; the registry
///         admin is impersonated to grant Castle exactly the roles handoff-claude grants live.
/// @dev forge test --match-path test/fork/CastleFork.t.sol
///      v3 runs at the LATEST Sepolia state by default, so it sees today's registry permissions (the registry admin
///      revoked its own UNREGISTER roles at block 11784434: a pinned older block would hide that) and the live v2
///      Castle, which still holds REGISTRAR/RENEW for the same "castle" label. FORK_BLOCK=<n> pins a block instead,
///      which needs an archive RPC: the default, Tenderly's public gateway, serves history; publicnode keeps ~128
///      blocks. SEPOLIA_ARCHIVE_RPC_URL overrides the RPC.
contract CastleForkTest is CastleHelpers {
    /// @dev The live v2 Castle, which shares the "castle" label and the anchor record with v3.
    address internal constant CASTLE_V2 = 0x6bF53228d8c5c3b0192B2028bD52fc4E9d1be8Ec;
    uint64 internal constant LEASE = 1 days; // v3: one renew a day; heartbeats carry liveness

    address internal constant AQUA = 0x1111113CCf1426A8E30e2bfF5E005d929bF6a90a;
    address internal constant ROUTER = 0xeDB6933949dB941D495b23604818F9AbF55e70f9;
    address internal constant WETH = 0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14;
    address internal constant USDC = 0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238;
    address internal constant REGISTRY = 0x2F2164507471a1a46506f902aBfdfB9d22e4bE09;
    address internal constant RESOLVER = 0x9D2251b5162701BC2bD97d61bc8aa3e53446285E;
    /// @dev root admin of the agent registry and resolver (handoff-claude's registrar key)
    address internal constant ADMIN = 0x67Cc96887d3FFC0860Ebb25412c113f3cad80C99;
    address internal constant FEE = 0x56EB9F80f3cBb4E627ED28108af1c1fbe8a46538;
    address internal constant FI = 0xB6eA66c2bE639820DFE546f49DF0349Cf27440b2;
    address internal constant FO_AGENT = 0x8689a407A2488A5b2f2De05d2C6978a798f93D56; // named, not crew
    address internal constant CCA_FACTORY = 0x000000001F26a0044BaA66024e7b6599c61963F8; // Uniswap CCA v2.1.0
    address internal constant PERMIT2 = 0x000000000022D473030F116dDEE9F6B43aC78BA3;
    uint64 internal constant GRACE = 300;

    FeeFiFoFumExtruction internal fence;
    JackHook internal jackHook;
    Castle internal castle;
    uint256 internal foKey = 0xF0;
    address internal jack = makeAddr("jack");
    /// @dev A label no live agent holds, for the bidder the tests name through the admin.
    string internal constant JACK_LABEL = "jack-v3-fork";
    address internal operator = makeAddr("operator");
    /// @dev Keyed crew, so the fork can sign heartbeats (the live agents' keys stay with the agents). Their names
    ///      and records are made in the live registry and resolver by the impersonated admin, as for fee and fi.
    address internal kfee;
    uint256 internal kfeeKey;
    address internal kfi;
    uint256 internal kfiKey;

    function setUp() public {
        string memory rpc = vm.envOr("SEPOLIA_ARCHIVE_RPC_URL", string("https://sepolia.gateway.tenderly.co"));
        uint256 forkBlock = vm.envOr("FORK_BLOCK", uint256(0));
        if (forkBlock == 0) vm.createSelectFork(rpc);
        else vm.createSelectFork(rpc, forkBlock);
        emit log_named_uint("fork block", block.number);
        // v2's 120s lease on the shared label must have lapsed before v3's genesis can register the name to itself
        uint64 v2Name = IENSv2Registry(REGISTRY).getExpiry(uint256(keccak256("castle")));
        if (block.timestamp < v2Name) vm.warp(v2Name);
        assertGt(ROUTER.code.length, 0, "router live");
        assertEq(address(AquaSwapVMRouter(payable(ROUTER)).AQUA()), AQUA);

        fence = new FeeFiFoFumExtruction();
        jackHook = new JackHook(IENSv2Registry(REGISTRY));
        castle = new Castle(
            Castle.Config({
                aqua: AQUA,
                router: ROUTER,
                fence: address(fence),
                registry: REGISTRY,
                resolver: RESOLVER,
                weth: WETH,
                usdc: USDC,
                fo: vm.addr(foKey),
                owner: operator,
                label: "castle",
                dnsName: _dns("castle"),
                leasePeriod: LEASE,
                registryEpoch: true,
                windDownFeeBps: 5e7,
                decayPeriod: 60,
                ccaFactory: CCA_FACTORY,
                jackHook: address(jackHook),
                dissolveGrace: GRACE
            })
        );

        // the same roles as v2: v3 needs no new one (Castle registers the name to itself and keeps the lease)
        vm.startPrank(ADMIN);
        IEnhancedAccessControl(REGISTRY)
            .grantRootRoles(ENSv2Roles.REGISTRY_REGISTRAR | ENSv2Roles.REGISTRY_RENEW, address(castle));
        IEnhancedAccessControl(RESOLVER)
            .grantRootRoles(ENSv2Roles.RESOLVER_LINK | ENSv2Roles.RESOLVER_SET_DATA, address(castle));
        (kfee, kfeeKey) = makeAddrAndKey("kfee");
        (kfi, kfiKey) = makeAddrAndKey("kfi");
        _name("kfee", kfee);
        _name("kfi", kfi);
        vm.stopPrank();

        vm.startPrank(operator);
        castle.setCrew(FEE, "fee");
        castle.setCrew(FI, "fi");
        castle.setCrew(kfee, "kfee");
        castle.setCrew(kfi, "kfi");
        castle.setAnchorPrice(ANCHOR_Q96);
        vm.stopPrank();

        deal(WETH, address(castle), 1 ether);
        deal(USDC, address(castle), 3_000e6);
    }

    /// @dev A name and a resolver record in the live agent registry (caller must be pranked as ADMIN).
    function _name(string memory l, address owner) internal {
        IENSv2Registry(REGISTRY).register(l, owner, address(0), RESOLVER, 0, uint64(block.timestamp + 365 days));
        IResolverSetData(RESOLVER).setData(_dns(l), "agent-endpoint[mcp]", "https://handoff.lol/mcp");
    }

    /// @dev The holder's heartbeat, co-signed by fo, as the castle service publishes it; "" for a keyless holder.
    function _hb() internal view returns (bytes memory) {
        address h = castle.holder();
        uint256 key = h == kfee ? kfeeKey : h == kfi ? kfiKey : 0;
        if (key == 0) return "";
        return _heartbeat(castle, key, foKey, castle.epoch(), uint64(block.timestamp + 60));
    }

    function _params() internal pure returns (Castle.ShipParams memory) {
        return Castle.ShipParams({ maxWeth: 1 ether, maxUsdc: 3_000e6, feeBps: 3e6, rangeBps: 1e8 });
    }

    function _quote(ISwapVM.Order memory order, address tokenIn, uint256 amount) internal returns (uint256 out) {
        address tokenOut = tokenIn == USDC ? WETH : USDC;
        (, out,) =
            AquaSwapVMRouter(payable(ROUTER)).quote(order, tokenIn, tokenOut, amount, _takerData(jack, true, _hb()));
    }

    function _fill(ISwapVM.Order memory order, address tokenIn, uint256 amount) internal returns (uint256 out) {
        address tokenOut = tokenIn == USDC ? WETH : USDC;
        deal(tokenIn, jack, amount);
        vm.startPrank(jack);
        IERC20(tokenIn).approve(ROUTER, amount);
        (, out,) =
            AquaSwapVMRouter(payable(ROUTER)).swap(order, tokenIn, tokenOut, amount, _takerData(jack, true, _hb()));
        vm.stopPrank();
    }

    function _renew() internal {
        uint64 next = uint64(block.timestamp + LEASE);
        uint64 deadline = uint64(block.timestamp + 30);
        bytes memory sig = _sign(castle, foKey, castle.epoch(), next, deadline);
        vm.prank(castle.holder());
        castle.renew(next, deadline, sig);
    }

    /// @notice The whole loop on live contracts: genesis claim → relink → ship → fills → renew → expiry wind-down →
    ///         fi's one-tx handover → the old book reverts FeeFiFoFum() → fi's book fills.
    function test_fork_shiftLifecycle() public {
        IENSv2Registry registry = IENSv2Registry(REGISTRY);
        IENSv2Resolver resolver = IENSv2Resolver(RESOLVER);
        assertLe(registry.getExpiry(castle.LABEL_ID()), block.timestamp, "the shared label is free (v2's lease lapsed)");

        // fee's genesis shift (kfee: the keyed stand-in for fee, so heartbeats can be signed)
        vm.startPrank(kfee);
        uint256 feeEpoch = castle.claim();
        bytes32 feeNode = castle.relink();
        (bytes32 feeBook, ISwapVM.Order memory order) = castle.ship(_params());
        vm.stopPrank();
        assertEq(registry.getOwner(castle.LABEL_ID()), address(castle), "v3: Castle owns its name");
        assertEq(castle.holder(), kfee, "the holder lives in Castle's storage");
        assertEq(registry.getExpiry(castle.LABEL_ID()), block.timestamp + castle.NAME_PERIOD());
        assertEq(resolver.getRecordId(castle.NODE()), resolver.getRecordId(feeNode), "castle shares fee's record");
        assertGt(resolver.getRecordId(feeNode), 0);
        assertEq(castle.anchorPriceQ96(), ANCHOR_Q96, "anchor carried into fee's record");
        (uint248 shippedWeth,) = IAqua(AQUA).rawBalances(address(castle), ROUTER, feeBook, WETH);
        assertGt(shippedWeth, 0);

        // live fills, both directions: quote == swap, real tokens move
        uint256 q = _quote(order, USDC, 30e6);
        assertApproxEqRel(q, 0.01 ether * uint256(1e9 - 3e6) / 1e9, 5e14, "centred on the anchor");
        uint256 wethBefore = IERC20(WETH).balanceOf(address(castle));
        assertEq(_fill(order, USDC, 30e6), q, "quote == swap (live, USDC in)");
        assertEq(IERC20(WETH).balanceOf(address(castle)), wethBefore - q);
        q = _quote(order, WETH, 0.005 ether);
        assertEq(_fill(order, WETH, 0.005 ether), q, "quote == swap (live, WETH in)");

        // fo-attested renewals keep the shift alive
        vm.warp(block.timestamp + 40);
        _renew();
        assertEq(castle.epoch(), feeEpoch);

        // fee dies: no heartbeat and no renewal. Once the ENS lease lapses the book winds down: USDC in only, at the
        // wide fee, with no tx from anyone (a stale heartbeat does not help).
        vm.warp(castle.expiry());
        q = _quote(order, USDC, 30e6);
        assertEq(_fill(order, USDC, 30e6), q, "quote == swap (wind-down)");
        deal(WETH, jack, 0.005 ether);
        vm.expectRevert(abi.encodeWithSelector(FeeFiFoFumExtruction.WindDownReduceOnly.selector, WETH));
        AquaSwapVMRouter(payable(ROUTER)).quote(order, WETH, USDC, 0.005 ether, _takerData(jack, true));

        // fi takes the castle in one tx: claim and relink (fee's book is NOT docked yet)
        bytes[] memory calls = new bytes[](2);
        calls[0] = abi.encodeCall(Castle.claim, ());
        calls[1] = abi.encodeCall(Castle.relink, ());
        vm.prank(kfi);
        bytes[] memory results = castle.multicall(calls);
        uint256 fiEpoch = abi.decode(results[0], (uint256));
        assertTrue(fiEpoch != feeEpoch, "the live registry regenerated the token id");
        assertEq(castle.holder(), kfi);
        bytes32 fiNode = abi.decode(results[1], (bytes32));
        assertEq(resolver.getRecordId(castle.NODE()), resolver.getRecordId(fiNode), "castle now shares fi's record");
        assertEq(castle.anchorPriceQ96(), ANCHOR_Q96, "anchor carried into fi's record");

        // fee's zombie book: dead in quote and swap, with no transaction from fee
        vm.expectRevert(FeeFiFoFumExtruction.FeeFiFoFum.selector);
        AquaSwapVMRouter(payable(ROUTER)).quote(order, USDC, WETH, 30e6, _takerData(jack, true));
        deal(USDC, jack, 30e6);
        vm.startPrank(jack);
        IERC20(USDC).approve(ROUTER, 30e6);
        vm.expectRevert(FeeFiFoFumExtruction.FeeFiFoFum.selector);
        AquaSwapVMRouter(payable(ROUTER)).swap(order, USDC, WETH, 30e6, _takerData(jack, true));
        vm.stopPrank();

        // fee's book still claims the hoard, so fi cannot promise it twice: dock it, then re-ship, in one tx
        Castle.ShipParams memory p = _params();
        vm.prank(kfi);
        vm.expectRevert(Castle.EmptyBook.selector);
        castle.ship(p);
        calls[0] = abi.encodeCall(Castle.dock, (feeBook));
        calls[1] = abi.encodeCall(Castle.ship, (p));
        vm.prank(kfi);
        results = castle.multicall(calls);
        (uint248 docked,) = IAqua(AQUA).rawBalances(address(castle), ROUTER, feeBook, USDC);
        assertEq(docked, 0);

        // fi's book fills
        (, ISwapVM.Order memory fiOrder) = abi.decode(results[1], (bytes32, ISwapVM.Order));
        q = _quote(fiOrder, USDC, 30e6);
        assertEq(_fill(fiOrder, USDC, 30e6), q, "quote == swap (fi's live book)");
    }

    // ------------------------------------------------------------------ SirKit's security requirements, live

    /// @notice (9) a non-crew claim reverts: an outside taker who waits out a lease cannot become holder
    function test_fork_nonCrewClaimReverts() public {
        vm.prank(FEE);
        castle.claim();
        vm.warp(castle.expiry());

        vm.prank(jack); // anonymous taker
        vm.expectRevert(abi.encodeWithSelector(Castle.NotCrew.selector, jack));
        castle.claim();

        // fo owns fo.feefifofum.eth in the live registry, but is not crew
        assertEq(IENSv2Registry(REGISTRY).getOwner(uint256(keccak256("fo"))), FO_AGENT);
        vm.prank(FO_AGENT);
        vm.expectRevert(abi.encodeWithSelector(Castle.NotCrew.selector, FO_AGENT));
        castle.claim();
    }

    /// @notice (10) the holder's multicall cannot carry transfer() (or anything but claim/renew/relink/ship/dock)
    function test_fork_multicallTransferReverts() public {
        vm.prank(FEE);
        castle.claim();
        bytes[] memory calls = new bytes[](2);
        calls[0] = abi.encodeCall(Castle.relink, ());
        calls[1] = abi.encodeCall(IERC20.transfer, (FEE, 1 ether));
        vm.prank(FEE);
        vm.expectRevert(abi.encodeWithSelector(Castle.SelectorNotAllowed.selector, IERC20.transfer.selector));
        castle.multicall(calls);
        calls[1] = abi.encodeCall(IERC20.approve, (FEE, type(uint256).max));
        vm.prank(FEE);
        vm.expectRevert(abi.encodeWithSelector(Castle.SelectorNotAllowed.selector, IERC20.approve.selector));
        castle.multicall(calls);
        assertEq(IERC20(WETH).balanceOf(address(castle)), 1 ether);
        assertEq(IERC20(USDC).balanceOf(address(castle)), 3_000e6);
    }

    /// @notice the holder cannot name its own app: every strategy is keyed to the pinned router in Aqua
    function test_fork_bookIsKeyedToTheRouterOnly() public {
        vm.startPrank(FEE);
        castle.claim();
        (bytes32 h,) = castle.ship(_params());
        vm.stopPrank();
        (uint248 viaRouter,) = IAqua(AQUA).rawBalances(address(castle), ROUTER, h, WETH);
        (uint248 viaJack,) = IAqua(AQUA).rawBalances(address(castle), jack, h, WETH);
        assertGt(viaRouter, 0);
        assertEq(viaJack, 0);
    }

    // ------------------------------------------------------------------ fo's attestation, live registry

    function test_fork_renewWithoutFoSignatureReverts() public {
        vm.prank(FEE);
        castle.claim();
        vm.warp(block.timestamp + 40);
        uint64 next = uint64(block.timestamp + LEASE);
        uint64 deadline = uint64(block.timestamp + 30);
        bytes memory selfSigned = _sign(castle, 0xBAD, castle.epoch(), next, deadline);
        vm.prank(FEE);
        vm.expectRevert(abi.encodeWithSelector(ICastleLease.BadAttestation.selector, vm.addr(0xBAD)));
        castle.renew(next, deadline, selfSigned);
    }

    function test_fork_replayedAttestationReverts() public {
        vm.prank(FEE);
        castle.claim();
        vm.warp(block.timestamp + 40);
        uint64 next = uint64(block.timestamp + LEASE);
        uint64 deadline = uint64(block.timestamp + 30);
        bytes memory sig = _sign(castle, foKey, castle.epoch(), next, deadline);
        vm.prank(FEE);
        castle.renew(next, deadline, sig);
        vm.prank(FEE);
        vm.expectRevert(
            abi.encodeWithSelector(ICastleLease.BadExpiry.selector, next, next, uint64(block.timestamp + LEASE))
        );
        castle.renew(next, deadline, sig);
    }

    function test_fork_crossEpochAttestationReverts() public {
        vm.prank(FEE);
        uint256 feeEpoch = castle.claim();
        vm.warp(castle.expiry());
        vm.prank(FI);
        castle.claim();
        vm.warp(block.timestamp + 40);
        uint64 next = uint64(block.timestamp + LEASE);
        uint64 deadline = uint64(block.timestamp + 30);
        bytes memory stale = _sign(castle, foKey, feeEpoch, next, deadline);
        vm.prank(FI);
        vm.expectPartialRevert(ICastleLease.BadAttestation.selector);
        castle.renew(next, deadline, stale);
    }

    function test_fork_holderCannotRenewTheNameDirectly() public {
        vm.prank(FEE);
        castle.claim();
        uint256 labelId = castle.LABEL_ID();
        uint64 exp = castle.expiry();
        vm.prank(FEE);
        vm.expectRevert(); // EACUnauthorizedAccountRoles: the holder was registered with no roles
        IENSv2Registry(REGISTRY).renew(labelId, exp + 3600);
    }

    // ------------------------------------------------------------------ the exit, on the live CCA factory (p4)

    function _bid(address a, address bidder, bytes memory label, uint256 maxPrice, uint128 amount)
        internal
        returns (uint256 bidId)
    {
        deal(USDC, bidder, amount);
        vm.startPrank(bidder);
        IERC20(USDC).approve(PERMIT2, type(uint256).max);
        IPermit2(PERMIT2).approve(USDC, a, uint160(amount), uint48(block.timestamp + 1 days));
        bidId = ICCABids(a).submitBid(maxPrice, amount, bidder, label);
        vm.stopPrank();
    }

    function test_fork_shiftChangeAuctionWritesTheClearingPrice() public {
        // an outside agent with a name in handoff's agent registry (its registrar registers Jacks)
        vm.prank(ADMIN);
        IENSv2Registry(REGISTRY).register(JACK_LABEL, jack, address(0), RESOLVER, 0, uint64(block.timestamp + 30 days));

        vm.prank(kfee);
        castle.claim();
        vm.prank(kfee);
        address a = castle.openAuction(0.5 ether);
        assertEq(IERC20(WETH).balanceOf(a), 0.5 ether);
        uint256 tick = ANCHOR_Q96 * 80 / 100 / 100;
        uint256 floor = tick * 100;

        // an unnamed bidder is turned away by JackHook, inside the live CCA
        address anon = makeAddr("anon");
        deal(USDC, anon, 100e6);
        vm.startPrank(anon);
        IERC20(USDC).approve(PERMIT2, type(uint256).max);
        IPermit2(PERMIT2).approve(USDC, a, 100e6, uint48(block.timestamp + 1 days));
        vm.expectPartialRevert(bytes4(keccak256("ValidationHookCallFailed(bytes)")));
        ICCABids(a).submitBid(floor + 30 * tick, 100e6, anon, "anon");
        vm.stopPrank();

        // jack bids 2,000 USDC up to ~104% of the anchor for 0.5 WETH
        _bid(a, jack, bytes(JACK_LABEL), floor + 30 * tick, 2_000e6);

        uint256 usdcBefore = IERC20(USDC).balanceOf(address(castle));
        vm.roll(ICCA(a).endBlock());
        vm.prank(anon); // anyone settles
        uint256 clearing = castle.settleAuction();
        uint256 raised = ICCA(a).currencyRaised();
        assertTrue(ICCA(a).isGraduated());
        assertGt(raised, 0);
        assertGe(clearing, floor);
        assertLe(clearing, floor + 30 * tick);
        assertEq(castle.anchorPriceQ96(), clearing, "ENS now anchors the next shift on the discovered price");
        assertGt(IERC20(USDC).balanceOf(address(castle)), usdcBefore, "proceeds swept home");
        assertLe(IERC20(USDC).balanceOf(address(castle)) - usdcBefore, raised);

        // the next ship centres on it
        vm.prank(kfee);
        (, ISwapVM.Order memory order) = castle.ship(_params());
        uint256 out = _quote(order, WETH, 0.001 ether);
        assertApproxEqRel(out, Math.mulDiv(0.001 ether, clearing, Q96) * uint256(1e9 - 3e6) / 1e9, 1e15);
    }

    function test_fork_dustBidCannotMoveTheAnchor() public {
        vm.prank(ADMIN);
        IENSv2Registry(REGISTRY).register(JACK_LABEL, jack, address(0), RESOLVER, 0, uint64(block.timestamp + 30 days));
        vm.prank(FEE);
        castle.claim();
        vm.prank(FEE);
        address a = castle.openAuction(0.5 ether);
        uint256 tick = ANCHOR_Q96 * 80 / 100 / 100;
        // 1 USDC one tick above the floor: it clears at the floor, far below half the lot's value
        uint256 bidId = _bid(a, jack, bytes(JACK_LABEL), tick * 101, 1e6);
        vm.roll(ICCA(a).endBlock());
        castle.settleAuction();
        assertFalse(ICCA(a).isGraduated());
        assertEq(castle.anchorPriceQ96(), ANCHOR_Q96, "the anchor did not move");
        assertEq(IERC20(WETH).balanceOf(address(castle)), 1 ether, "all the WETH came home");
        vm.prank(jack);
        ICCAExit(a).exitBid(bidId);
        assertEq(IERC20(USDC).balanceOf(jack), 1e6, "the dust bid was refunded");
    }

    function test_fork_dissolveOnTheLiveCCA() public {
        vm.startPrank(FEE);
        castle.claim();
        (bytes32 h,) = castle.ship(_params());
        vm.stopPrank();
        vm.warp(uint256(castle.expiry()) + GRACE);
        vm.prank(jack); // anyone: fum is only the default caller
        address a = castle.dissolve();
        (uint248 bal,) = IAqua(AQUA).rawBalances(address(castle), ROUTER, h, WETH);
        assertEq(bal, 0, "the dead shift's book is docked");
        assertEq(IERC20(WETH).balanceOf(a), 1 ether, "the whole WETH hoard is on auction");
        assertEq(castle.auction(), a);
    }

    // ------------------------------------------------------------------ v3 liveness on the live registry

    function _quoteWith(ISwapVM.Order memory order, address tokenIn, uint256 amount, bytes memory hb)
        internal
        returns (uint256 out)
    {
        address tokenOut = tokenIn == USDC ? WETH : USDC;
        (, out,) = AquaSwapVMRouter(payable(ROUTER)).quote(order, tokenIn, tokenOut, amount, _takerData(jack, true, hb));
    }

    /// @notice No transaction for 23 hours and the book is still live on heartbeats alone; without one it winds down.
    function test_fork_heartbeatLivenessCostsNoIdleGas() public {
        vm.startPrank(kfee);
        castle.claim();
        (, ISwapVM.Order memory order) = castle.ship(_params());
        vm.stopPrank();
        uint256 live = _quote(order, USDC, 30e6);
        uint256 bare = _quoteWith(order, USDC, 30e6, "");
        assertApproxEqRel(bare, live * uint256(1e9 - 5e7) / uint256(1e9 - 3e6), 1e15, "no heartbeat: wind-down fee");
        vm.expectRevert(abi.encodeWithSelector(FeeFiFoFumExtruction.WindDownReduceOnly.selector, WETH));
        _quoteWith(order, WETH, 0.005 ether, "");

        vm.warp(block.timestamp + 23 hours); // nobody sends anything
        uint256 q = _quote(order, WETH, 0.005 ether);
        assertEq(_fill(order, WETH, 0.005 ether), q, "live WETH-in fill 23h after the last Castle tx");
    }

    /// @notice The early takeover end to end at today's permissions: challenge, no response, claim. No registry change
    ///         is needed (Castle keeps its name), the epoch bumps, relink still carries the anchor, the old book dies
    ///         and the new one fills.
    function test_fork_unansweredChallengeHandsTheCastleOver() public {
        IENSv2Registry registry = IENSv2Registry(REGISTRY);
        vm.startPrank(kfee);
        uint256 feeEpoch = castle.claim();
        castle.relink();
        (bytes32 feeBook, ISwapVM.Order memory order) = castle.ship(_params());
        vm.stopPrank();
        uint64 feeExpiry = castle.expiry();

        vm.prank(kfi);
        uint64 deadline = castle.challenge();
        vm.warp(deadline); // kfee is dead: no respond()
        bytes memory staleHb = _hb(); // still kfee's epoch, still inside its TTL

        bytes[] memory calls = new bytes[](2);
        calls[0] = abi.encodeCall(Castle.claim, ());
        calls[1] = abi.encodeCall(Castle.relink, ());
        vm.prank(kfi);
        bytes[] memory results = castle.multicall(calls);
        uint256 fiEpoch = abi.decode(results[0], (uint256));
        assertEq(fiEpoch, feeEpoch + 1, "the claim bumped the epoch");
        assertEq(castle.holder(), kfi);
        assertLt(block.timestamp, feeExpiry, "the takeover happened while kfee's lease was still live");
        assertEq(registry.getOwner(castle.LABEL_ID()), address(castle), "the name never left Castle");
        assertEq(castle.expiry(), block.timestamp + LEASE);
        assertEq(castle.anchorPriceQ96(), ANCHOR_Q96, "relink carried the anchor");

        vm.expectRevert(FeeFiFoFumExtruction.FeeFiFoFum.selector);
        _quoteWith(order, USDC, 30e6, staleHb);

        calls[0] = abi.encodeCall(Castle.dock, (feeBook));
        calls[1] = abi.encodeCall(Castle.ship, (_params()));
        vm.prank(kfi);
        results = castle.multicall(calls);
        (, ISwapVM.Order memory fiOrder) = abi.decode(results[1], (bytes32, ISwapVM.Order));
        uint256 q = _quote(fiOrder, WETH, 0.005 ether);
        assertEq(_fill(fiOrder, WETH, 0.005 ether), q, "kfi's live book fills (WETH in)");
    }

    function test_fork_respondKeepsTheCastle() public {
        vm.prank(kfee);
        uint256 ep = castle.claim();
        vm.prank(kfi);
        uint64 deadline = castle.challenge();
        vm.warp(deadline - 1);
        vm.prank(kfee);
        castle.respond();
        vm.warp(deadline + 1);
        uint64 exp = castle.expiry();
        vm.prank(kfi);
        vm.expectRevert(abi.encodeWithSelector(ICastleLease.LeaseStillLive.selector, exp));
        castle.claim();
        assertEq(castle.epoch(), ep);
    }

    function test_fork_dissolveOncePerEpochOnTheLiveCCA() public {
        vm.startPrank(kfee);
        castle.claim();
        castle.ship(_params());
        vm.stopPrank();
        vm.warp(uint256(castle.expiry()) + GRACE);
        address a = castle.dissolve();
        vm.roll(ICCA(a).endBlock());
        castle.settleAuction(); // no bids: all the WETH comes home
        assertEq(IERC20(WETH).balanceOf(address(castle)), 1 ether);
        uint256 ep = castle.epoch();
        vm.expectRevert(abi.encodeWithSelector(Castle.AlreadyDissolved.selector, ep));
        castle.dissolve();
    }

    /// @notice Gas per live fill, both directions, with the heartbeat (logged for the v2 comparison in docs/castle-v3.md).
    function test_fork_gasPerFill() public {
        vm.startPrank(kfee);
        castle.claim();
        (, ISwapVM.Order memory order) = castle.ship(_params());
        vm.stopPrank();
        _fill(order, USDC, 30e6); // warm the strategy's balances once, as a busy book is
        bytes memory hb = _hb();
        bytes memory td = _takerData(jack, true, hb);
        deal(USDC, jack, 30e6);
        deal(WETH, jack, 0.005 ether);
        vm.startPrank(jack);
        IERC20(USDC).approve(ROUTER, 30e6);
        IERC20(WETH).approve(ROUTER, 0.005 ether);
        uint256 g = gasleft();
        AquaSwapVMRouter(payable(ROUTER)).swap(order, USDC, WETH, 30e6, td);
        emit log_named_uint("v3 live fill USDC->WETH, execution gas", g - gasleft());
        g = gasleft();
        AquaSwapVMRouter(payable(ROUTER)).swap(order, WETH, USDC, 0.005 ether, td);
        emit log_named_uint("v3 live fill WETH->USDC, execution gas", g - gasleft());
        vm.stopPrank();
        uint256 cd;
        for (uint256 i; i < hb.length; ++i) {
            cd += hb[i] == 0 ? 4 : 16;
        }
        emit log_named_uint("heartbeat bytes", hb.length);
        emit log_named_uint("heartbeat calldata gas", cd);
    }

    /// @notice Migration safety: once v3 holds the shared label, the live v2 Castle (still REGISTRAR) cannot claim it.
    function test_fork_v2CannotTakeTheNameFromV3() public {
        vm.prank(kfee);
        castle.claim();
        uint64 v2Expiry = Castle(CASTLE_V2).expiry(); // v2 reads the same label: now v3's year-long registration
        assertEq(v2Expiry, block.timestamp + castle.NAME_PERIOD());
        vm.prank(FEE); // v2 crew
        vm.expectRevert(abi.encodeWithSelector(ICastleLease.LeaseStillLive.selector, v2Expiry));
        Castle(CASTLE_V2).claim();
    }

    /// @notice Migration (SirKit's option c): after v3 is live, the resolver admin revokes v2 Castle's LINK|SET_DATA,
    ///         so nothing on v2 can overwrite the anchor record v3 shares. v2 keeps REGISTRAR/RENEW, which cannot
    ///         touch a label v3 holds. Logs the revoke's execution gas for the approval request.
    function test_fork_revokingV2ResolverRolesProtectsTheSharedAnchor() public {
        address v2Owner = 0x89a7d90F6bCAF2FFd5c1519Fa7F3D9DB84e9AA73;
        uint256 roles = ENSv2Roles.RESOLVER_LINK | ENSv2Roles.RESOLVER_SET_DATA;
        vm.startPrank(kfee);
        castle.claim();
        castle.relink();
        vm.stopPrank();
        assertEq(castle.anchorPriceQ96(), ANCHOR_Q96);

        // before the revoke, v2 can still write the shared anchor (here: its owner's setAnchorPrice)
        uint256 snap = vm.snapshotState();
        vm.prank(v2Owner);
        Castle(CASTLE_V2).setAnchorPrice(1);
        assertEq(castle.anchorPriceQ96(), 1, "v2 could overwrite v3's anchor");
        vm.revertToState(snap);

        assertTrue(IENSv2Resolver(RESOLVER).hasRootRoles(roles, CASTLE_V2));
        vm.prank(ADMIN);
        uint256 g = gasleft();
        IEnhancedAccessControl(RESOLVER).revokeRootRoles(roles, CASTLE_V2);
        emit log_named_uint("revoke v2 LINK|SET_DATA, execution gas", g - gasleft());
        assertFalse(IENSv2Resolver(RESOLVER).hasRootRoles(ENSv2Roles.RESOLVER_SET_DATA, CASTLE_V2));
        assertFalse(IENSv2Resolver(RESOLVER).hasRootRoles(ENSv2Roles.RESOLVER_LINK, CASTLE_V2));

        vm.prank(v2Owner);
        vm.expectRevert(); // Unauthorized in the resolver
        Castle(CASTLE_V2).setAnchorPrice(1);
        assertEq(castle.anchorPriceQ96(), ANCHOR_Q96, "the shared anchor is v3's alone");
        // v2 cannot dissolve either: its expiry() now reads v3's year-long registration of the shared label
        assertEq(Castle(CASTLE_V2).expiry(), block.timestamp + castle.NAME_PERIOD());
        // v3 is unaffected
        vm.prank(operator);
        castle.setAnchorPrice(ANCHOR_Q96 + 1);
        assertEq(castle.anchorPriceQ96(), ANCHOR_Q96 + 1);
    }
}
