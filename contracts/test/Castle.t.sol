// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import { Test } from "forge-std/Test.sol";
import { Aqua } from "@1inch/aqua/src/Aqua.sol";
import { TokenMock } from "@1inch/solidity-utils/contracts/mocks/TokenMock.sol";
import { AquaSwapVMRouter } from "@1inch/swap-vm/src/routers/AquaSwapVMRouter.sol";
import { AquaOpcodes } from "@1inch/swap-vm/src/opcodes/AquaOpcodes.sol";
import { ISwapVM } from "@1inch/swap-vm/src/interfaces/ISwapVM.sol";
import { MakerTraitsLib } from "@1inch/swap-vm/src/libs/MakerTraits.sol";
import { TakerTraitsLib } from "@1inch/swap-vm/src/libs/TakerTraits.sol";
import { XYCSwap } from "@1inch/swap-vm/src/instructions/XYCSwap.sol";
import { Controls } from "@1inch/swap-vm/src/instructions/Controls.sol";
import { Program, ProgramBuilder } from "@1inch/swap-vm/test/utils/ProgramBuilder.sol";

import { Castle } from "../src/Castle.sol";
import { ICastleLease, CastleLeaseTypes } from "../src/interfaces/ICastleLease.sol";
import { ENSv2Roles } from "../src/interfaces/IENSv2.sol";
import { MockENSv2Registry, MockENSv2Resolver } from "./mocks/MockENSv2.sol";

/// @dev Builds SwapVM programs against the SAME opcode table the deployed AquaSwapVMRouter uses.
contract AquaProgram is AquaOpcodes {
    using ProgramBuilder for Program;

    constructor() AquaOpcodes(address(0)) { }

    function xycWithSalt(uint256 salt) external pure returns (bytes memory) {
        Program memory p = ProgramBuilder.init(_opcodes());
        return bytes.concat(p.build(XYCSwap._xycSwapXD), p.build(Controls._salt, abi.encodePacked(salt)));
    }
}

/// @dev Exposes the internal price write so the resolver-role path is testable before the CCA lands (p4).
contract CastleHarness is Castle {
    constructor(Config memory c) Castle(c) { }

    function writePriceForTest(uint256 priceQ96) external {
        _writePrice(priceQ96);
    }
}

contract CastleTest is Test {
    uint64 internal constant LEASE = 120;

    Aqua internal aqua;
    AquaSwapVMRouter internal router;
    AquaProgram internal programs;
    TokenMock internal weth;
    TokenMock internal usdc;
    MockENSv2Registry internal registry;
    MockENSv2Resolver internal resolver;
    CastleHarness internal castle;

    uint256 internal foKey = 0xF0;
    address internal fo;
    address internal fee = makeAddr("fee");
    address internal fi = makeAddr("fi");
    address internal jack = makeAddr("jack");
    address internal operator = makeAddr("operator");

    function setUp() public {
        vm.warp(1_790_400_000);
        fo = vm.addr(foKey);
        aqua = new Aqua();
        weth = new TokenMock("Wrapped Ether", "WETH");
        usdc = new TokenMock("USD Coin", "USDC");
        router = new AquaSwapVMRouter(address(aqua), address(weth), operator, "AquaSwapVMRouter", "1.0.2");
        programs = new AquaProgram();
        registry = new MockENSv2Registry();
        resolver = new MockENSv2Resolver();
        castle = new CastleHarness(_config(true));
        registry.grantRootRoles(ENSv2Roles.REGISTRY_REGISTRAR | ENSv2Roles.REGISTRY_RENEW, address(castle));
        resolver.grantRootRoles(ENSv2Roles.RESOLVER_SET_ALIAS | ENSv2Roles.RESOLVER_SET_DATA, address(castle));
        vm.startPrank(operator);
        castle.setCrew(fee, true);
        castle.setCrew(fi, true);
        vm.stopPrank();
    }

    function _config(bool registryEpoch) internal view returns (Castle.Config memory) {
        return Castle.Config({
            aqua: address(aqua),
            registry: address(registry),
            resolver: address(resolver),
            weth: address(weth),
            usdc: address(usdc),
            fo: fo,
            owner: operator,
            label: "castle",
            dnsName: _castleDns(),
            leasePeriod: LEASE,
            registryEpoch: registryEpoch
        });
    }

    function _castleDns() internal pure returns (bytes memory) {
        return abi.encodePacked(uint8(6), "castle", uint8(10), "feefifofum", uint8(3), "eth", uint8(0));
    }

    function _sign(uint256 ep, uint64 exp, uint64 deadline) internal view returns (bytes memory) {
        bytes32 digest = castle.attestationDigest(ICastleLease.Attestation(ep, exp, deadline));
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(foKey, digest);
        return abi.encodePacked(r, s, v);
    }

    function _renew(address who, uint64 newExpiry) internal {
        uint64 deadline = uint64(block.timestamp + 30);
        bytes memory sig = _sign(castle.epoch(), newExpiry, deadline);
        vm.prank(who);
        castle.renew(newExpiry, deadline, sig);
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
        bytes32 structHash = keccak256(abi.encode(CastleLeaseTypes.ATTESTATION_TYPEHASH, uint256(7), uint64(9), uint64(11)));
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
        bytes memory sig = _sign(castle.epoch(), next, deadline);
        vm.prank(fee);
        castle.renew(next, deadline, sig);
        // the very same attestation, submitted again
        vm.prank(fee);
        vm.expectRevert(abi.encodeWithSelector(ICastleLease.BadExpiry.selector, next, next, uint64(block.timestamp + LEASE)));
        castle.renew(next, deadline, sig);
    }

    function test_revert_renewWithoutFoSignature() public {
        vm.prank(fee);
        castle.claim();
        vm.warp(block.timestamp + 40);
        uint64 next = uint64(block.timestamp + LEASE);
        uint64 deadline = uint64(block.timestamp + 30);
        bytes32 digest = castle.attestationDigest(ICastleLease.Attestation(castle.epoch(), next, deadline));
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(0xBAD, digest); // fee signs for itself
        vm.prank(fee);
        vm.expectRevert(abi.encodeWithSelector(ICastleLease.BadAttestation.selector, vm.addr(0xBAD)));
        castle.renew(next, deadline, abi.encodePacked(r, s, v));
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
        bytes memory sig = _sign(castle.epoch(), next, deadline);
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
        bytes memory sig = _sign(castle.epoch(), next, deadline);
        vm.prank(fee);
        vm.expectRevert(abi.encodeWithSelector(ICastleLease.LeaseExpired.selector, exp));
        castle.renew(next, deadline, sig);
    }

    function test_revert_attestationPastDeadline() public {
        vm.prank(fee);
        castle.claim();
        uint64 next = uint64(block.timestamp + 60);
        uint64 deadline = uint64(block.timestamp + 5);
        bytes memory sig = _sign(castle.epoch(), next, deadline);
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
        bytes memory sig = _sign(castle.epoch(), tooFar, deadline);
        uint64 current = castle.expiry();
        vm.prank(fee);
        vm.expectRevert(abi.encodeWithSelector(ICastleLease.BadExpiry.selector, tooFar, current, uint64(block.timestamp + LEASE)));
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

    function test_revert_claimByNonCrew() public {
        vm.prank(jack);
        vm.expectRevert(abi.encodeWithSelector(Castle.NotCrew.selector, jack));
        castle.claim();
    }

    function test_claimAfterExpiryFencesTheOldShift() public {
        vm.prank(fee);
        uint256 feeEpoch = castle.claim();
        // fee's attestation for its own epoch, signed while it was still live
        uint64 feeNext = uint64(block.timestamp + LEASE);
        uint64 deadline = uint64(block.timestamp + LEASE + 60);
        bytes memory feeSig = _sign(feeEpoch, feeNext, deadline);

        vm.warp(castle.expiry()); // fee died: nobody renewed
        vm.prank(fi);
        uint256 fiEpoch = castle.claim();
        assertTrue(fiEpoch != feeEpoch, "claim must regenerate the epoch");
        assertEq(castle.holder(), fi);

        // fee restarts from stale state: renew is rejected, even with a genuine attestation for its old epoch
        vm.prank(fee);
        vm.expectRevert(abi.encodeWithSelector(ICastleLease.NotHolder.selector, fee, fi));
        castle.renew(feeNext + 1, deadline, feeSig);
        // and so is every holder-only call
        vm.prank(fee);
        vm.expectRevert(abi.encodeWithSelector(ICastleLease.NotHolder.selector, fee, fi));
        castle.relink(hex"00");
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
        bytes memory staleSig = _sign(feeEpoch, next, deadline); // fo signed for the old epoch
        vm.prank(fi);
        vm.expectPartialRevert(ICastleLease.BadAttestation.selector);
        castle.renew(next, deadline, staleSig);
    }

    function test_fallbackEpochCounter() public {
        registry.setRegenerate(false);
        CastleHarness c = new CastleHarness(_config(false));
        registry.grantRootRoles(ENSv2Roles.REGISTRY_REGISTRAR | ENSv2Roles.REGISTRY_RENEW, address(c));
        vm.startPrank(operator);
        c.setCrew(fee, true);
        c.setCrew(fi, true);
        vm.stopPrank();
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

    // ------------------------------------------------------------------ records

    function test_relinkAndPrice() public {
        vm.prank(fee);
        castle.claim();
        bytes memory feeName = abi.encodePacked(uint8(3), "fee", uint8(6), "agents", uint8(10), "feefifofum", uint8(3), "eth", uint8(0));
        vm.prank(fee);
        castle.relink(feeName);
        assertEq(resolver.getAlias(_castleDns()), feeName);
        castle.writePriceForTest(2412 << 96);
        assertEq(castle.anchorPriceQ96(), 2412 << 96);
        assertEq(castle.NODE(), vm.ensNamehash("castle.feefifofum.eth"));
    }

    // ------------------------------------------------------------------ the book

    function _order(uint256 salt) internal view returns (ISwapVM.Order memory) {
        return MakerTraitsLib.build(
            MakerTraitsLib.Args({
                maker: address(castle),
                receiver: address(0),
                shouldUnwrapWeth: false,
                useAquaInsteadOfSignature: true,
                allowZeroAmountIn: false,
                hasPreTransferInHook: false,
                hasPostTransferInHook: false,
                hasPreTransferOutHook: false,
                hasPostTransferOutHook: false,
                preTransferInTarget: address(0),
                preTransferInData: "",
                postTransferInTarget: address(0),
                postTransferInData: "",
                preTransferOutTarget: address(0),
                preTransferOutData: "",
                postTransferOutTarget: address(0),
                postTransferOutData: "",
                program: programs.xycWithSalt(salt)
            })
        );
    }

    function _takerData(address taker) internal pure returns (bytes memory) {
        return TakerTraitsLib.build(
            TakerTraitsLib.Args({
                taker: taker,
                isExactIn: true,
                shouldUnwrapWeth: false,
                isStrictThresholdAmount: false,
                isFirstTransferFromTaker: false,
                useTransferFromAndAquaPush: true,
                threshold: "",
                to: address(0),
                deadline: 0,
                hasPreTransferInCallback: false,
                hasPreTransferOutCallback: false,
                preTransferInHookData: "",
                postTransferInHookData: "",
                preTransferOutHookData: "",
                postTransferOutHookData: "",
                preTransferInCallbackData: "",
                preTransferOutCallbackData: "",
                instructionsArgs: "",
                signature: ""
            })
        );
    }

    function _tokens() internal view returns (address[] memory t) {
        t = new address[](2);
        (t[0], t[1]) = (address(weth), address(usdc));
    }

    function _amounts(uint256 a, uint256 b) internal pure returns (uint256[] memory x) {
        x = new uint256[](2);
        (x[0], x[1]) = (a, b);
    }

    function test_shipFillDock() public {
        weth.mint(address(castle), 10 ether);
        usdc.mint(address(castle), 25_000e6);
        vm.prank(fee);
        castle.claim();

        ISwapVM.Order memory order = _order(1);
        vm.prank(fee);
        bytes32 h = castle.ship(address(router), abi.encode(order), _tokens(), _amounts(10 ether, 25_000e6));
        assertEq(h, router.hash(order));
        assertEq(castle.shippedEpoch(h), castle.epoch());

        // a taker sells 1,000 USDC for WETH: real transfers out of and into Castle
        usdc.mint(jack, 1_000e6);
        vm.startPrank(jack);
        usdc.approve(address(router), type(uint256).max);
        (uint256 amountIn, uint256 amountOut,) =
            router.swap(order, address(usdc), address(weth), 1_000e6, _takerData(jack));
        vm.stopPrank();
        assertEq(amountIn, 1_000e6);
        assertEq(weth.balanceOf(jack), amountOut);
        assertEq(weth.balanceOf(address(castle)), 10 ether - amountOut);
        assertEq(usdc.balanceOf(address(castle)), 26_000e6);

        vm.prank(fee);
        castle.dock(address(router), h, _tokens());
        (uint248 bal,) = aqua.rawBalances(address(castle), address(router), h, address(weth));
        assertEq(bal, 0);
    }

    function test_revert_staleHolderCannotShip() public {
        vm.prank(fee);
        castle.claim();
        uint64 exp = castle.expiry();
        vm.warp(exp);
        bytes memory strategy = abi.encode(_order(2));
        vm.prank(fee);
        vm.expectRevert(abi.encodeWithSelector(ICastleLease.LeaseExpired.selector, exp));
        castle.ship(address(router), strategy, _tokens(), _amounts(1, 1));
    }

    function test_newShiftDocksStaleStrategyInOneMulticall() public {
        weth.mint(address(castle), 1 ether);
        usdc.mint(address(castle), 2_500e6);
        vm.prank(fee);
        castle.claim();
        bytes memory strategy = abi.encode(_order(3));
        vm.prank(fee);
        bytes32 h = castle.ship(address(router), strategy, _tokens(), _amounts(1 ether, 2_500e6));
        vm.warp(castle.expiry());

        bytes[] memory calls = new bytes[](2);
        calls[0] = abi.encodeCall(Castle.claim, ());
        calls[1] = abi.encodeCall(Castle.dock, (address(router), h, _tokens()));
        vm.prank(fi);
        castle.multicall(calls);
        assertEq(castle.holder(), fi);
        (uint248 bal,) = aqua.rawBalances(address(castle), address(router), h, address(usdc));
        assertEq(bal, 0);
    }
}
