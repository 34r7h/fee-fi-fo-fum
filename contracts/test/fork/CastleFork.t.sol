// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import { Test } from "forge-std/Test.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { IAqua } from "@1inch/aqua/src/interfaces/IAqua.sol";
import { AquaSwapVMRouter } from "@1inch/swap-vm/src/routers/AquaSwapVMRouter.sol";
import { AquaOpcodes } from "@1inch/swap-vm/src/opcodes/AquaOpcodes.sol";
import { ISwapVM } from "@1inch/swap-vm/src/interfaces/ISwapVM.sol";
import { MakerTraitsLib } from "@1inch/swap-vm/src/libs/MakerTraits.sol";
import { TakerTraitsLib } from "@1inch/swap-vm/src/libs/TakerTraits.sol";
import { XYCSwap } from "@1inch/swap-vm/src/instructions/XYCSwap.sol";
import { Controls } from "@1inch/swap-vm/src/instructions/Controls.sol";
import { Program, ProgramBuilder } from "@1inch/swap-vm/test/utils/ProgramBuilder.sol";

import { Castle } from "../../src/Castle.sol";
import { ICastleLease, CastleLeaseTypes } from "../../src/interfaces/ICastleLease.sol";
import { ENSv2Roles } from "../../src/interfaces/IENSv2.sol";
import { MockENSv2Registry, MockENSv2Resolver } from "../mocks/MockENSv2.sol";

contract AquaForkProgram is AquaOpcodes {
    using ProgramBuilder for Program;

    constructor() AquaOpcodes(address(0)) {}

    function xycWithSalt(uint256 salt) external pure returns (bytes memory) {
        Program memory p = ProgramBuilder.init(_opcodes());
        return bytes.concat(p.build(XYCSwap._xycSwapXD), p.build(Controls._salt, abi.encodePacked(salt)));
    }
}

/// @title CastleForkTest
/// @notice Independent fork tests for Castle against live Sepolia Aqua and tokens (part of p1-forktests)
contract CastleForkTest is Test {
    uint64 internal constant LEASE = 120;

    address internal constant LIVE_AQUA = 0x1111113CCf1426A8E30e2bfF5E005d929bF6a90a;
    address internal constant LIVE_WETH = 0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14;
    address internal constant LIVE_USDC = 0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238;

    AquaSwapVMRouter internal router;
    AquaForkProgram internal programs;
    MockENSv2Registry internal registry;
    MockENSv2Resolver internal resolver;
    Castle internal castle;

    uint256 internal foKey = 0xF0;
    address internal fo;
    address internal fee = makeAddr("fee");
    address internal fi = makeAddr("fi");
    address internal jack = makeAddr("jack");
    address internal operator = makeAddr("operator");

    function setUp() public {
        fo = vm.addr(foKey);
        router = new AquaSwapVMRouter(LIVE_AQUA, LIVE_WETH, operator, "AquaSwapVMRouter", "1.0.2");
        programs = new AquaForkProgram();
        registry = new MockENSv2Registry();
        resolver = new MockENSv2Resolver();

        castle = new Castle(
            Castle.Config({
                aqua: LIVE_AQUA,
                registry: address(registry),
                resolver: address(resolver),
                weth: LIVE_WETH,
                usdc: LIVE_USDC,
                fo: fo,
                owner: operator,
                label: "castle",
                dnsName: abi.encodePacked(uint8(6), "castle", uint8(10), "feefifofum", uint8(3), "eth", uint8(0)),
                leasePeriod: LEASE,
                registryEpoch: false
            })
        );

        registry.grantRootRoles(ENSv2Roles.REGISTRY_REGISTRAR | ENSv2Roles.REGISTRY_RENEW, address(castle));
        resolver.grantRootRoles(ENSv2Roles.RESOLVER_SET_ALIAS | ENSv2Roles.RESOLVER_SET_DATA, address(castle));

        vm.startPrank(operator);
        castle.setCrew(fee, true);
        castle.setCrew(fi, true);
        vm.stopPrank();
    }

    function _sign(uint256 epoch, uint64 expiry, uint64 deadline) internal view returns (bytes memory) {
        bytes32 digest = castle.attestationDigest(
            ICastleLease.Attestation({ epoch: epoch, expiry: expiry, deadline: deadline })
        );
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(foKey, digest);
        return abi.encodePacked(r, s, v);
    }

    /// @notice (4) renew without fo's signature reverts
    function test_fork_renewWithoutFoSignatureReverts() public {
        vm.prank(fee);
        castle.claim();

        // 40s into the lease: holder tries to renew
        vm.warp(block.timestamp + 40);
        uint64 next = uint64(block.timestamp + LEASE);
        uint64 deadline = uint64(block.timestamp + LEASE + 60);

        // Sign with a rogue non-fo key
        uint256 rogueKey = 0xBAD;
        bytes32 digest = castle.attestationDigest(
            ICastleLease.Attestation({ epoch: castle.epoch(), expiry: next, deadline: deadline })
        );
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(rogueKey, digest);
        bytes memory badSig = abi.encodePacked(r, s, v);

        vm.prank(fee);
        vm.expectRevert(abi.encodeWithSelector(ICastleLease.BadAttestation.selector, vm.addr(rogueKey)));
        castle.renew(next, deadline, badSig);
    }

    /// @notice (5) a replayed fo attestation reverts
    function test_fork_replayedFoAttestationReverts() public {
        vm.prank(fee);
        castle.claim();

        // 40s into the lease: holder gets fo's attestation
        vm.warp(block.timestamp + 40);
        uint64 next = uint64(block.timestamp + LEASE);
        uint64 deadline = uint64(block.timestamp + LEASE + 60);
        bytes memory sig = _sign(castle.epoch(), next, deadline);

        // First renew succeeds
        vm.prank(fee);
        castle.renew(next, deadline, sig);
        assertEq(castle.expiry(), next);

        // Second renew with the same attestation must revert BadExpiry
        vm.prank(fee);
        vm.expectRevert(
            abi.encodeWithSelector(
                ICastleLease.BadExpiry.selector,
                next,
                next,
                uint64(block.timestamp) + LEASE
            )
        );
        castle.renew(next, deadline, sig);
    }

    /// @notice (1) a live fill passes, with a real Aqua pull/push on live Sepolia Aqua
    function test_fork_liveAquaPullPush() public {
        // Fund Castle with WETH and USDC on the fork
        deal(LIVE_WETH, address(castle), 10 ether);
        deal(LIVE_USDC, address(castle), 25_000e6);

        // Fee claims castle
        vm.prank(fee);
        castle.claim();

        // Build SwapVM order
        ISwapVM.Order memory order = MakerTraitsLib.build(
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
                program: programs.xycWithSalt(1)
            })
        );

        address[] memory tokens = new address[](2);
        (tokens[0], tokens[1]) = (LIVE_WETH, LIVE_USDC);
        uint256[] memory amounts = new uint256[](2);
        (amounts[0], amounts[1]) = (10 ether, 25_000e6);

        // Ship strategy to live Sepolia Aqua
        vm.prank(fee);
        bytes32 h = castle.ship(address(router), abi.encode(order), tokens, amounts);
        assertEq(h, router.hash(order));
        assertEq(castle.shippedEpoch(h), castle.epoch());

        // Taker (jack) fills 1,000 USDC for WETH
        deal(LIVE_USDC, jack, 1_000e6);
        vm.startPrank(jack);
        IERC20(LIVE_USDC).approve(address(router), type(uint256).max);

        bytes memory takerData = TakerTraitsLib.build(
            TakerTraitsLib.Args({
                taker: jack,
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

        (uint256 amountIn, uint256 amountOut,) =
            router.swap(order, LIVE_USDC, LIVE_WETH, 1_000e6, takerData);
        vm.stopPrank();

        assertEq(amountIn, 1_000e6);
        assertGt(amountOut, 0);
        assertEq(IERC20(LIVE_WETH).balanceOf(jack), amountOut);
        assertEq(IERC20(LIVE_WETH).balanceOf(address(castle)), 10 ether - amountOut);
        assertEq(IERC20(LIVE_USDC).balanceOf(address(castle)), 26_000e6);

        // Fee docks the strategy
        vm.prank(fee);
        castle.dock(address(router), h, tokens);
        (uint248 bal,) = IAqua(LIVE_AQUA).rawBalances(address(castle), address(router), h, LIVE_WETH);
        assertEq(bal, 0);
    }

    /// @notice (3) old-epoch fills fence when claim starts a new epoch
    function test_fork_claimFencesOldEpoch() public {
        vm.prank(fee);
        uint256 ep1 = castle.claim();

        // Expire the lease
        vm.warp(castle.expiry());

        // Fi claims castle
        vm.prank(fi);
        uint256 ep2 = castle.claim();

        assertGt(ep2, ep1);
        assertEq(castle.holder(), fi);

        // Stale fee cannot renew or ship under new epoch
        vm.prank(fee);
        vm.expectRevert(abi.encodeWithSelector(ICastleLease.NotHolder.selector, fee, fi));
        castle.renew(uint64(block.timestamp + 40), uint64(block.timestamp + 60), "");
    }
}
