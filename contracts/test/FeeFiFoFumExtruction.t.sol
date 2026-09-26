// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import { Test } from "forge-std/Test.sol";
import { SwapQuery, SwapRegisters } from "@1inch/swap-vm/src/libs/VM.sol";

import { FeeFiFoFumExtruction } from "../src/FeeFiFoFumExtruction.sol";
import { ICastleLease, CastleLeaseTypes } from "../src/interfaces/ICastleLease.sol";
import { MockCastleLease } from "./mocks/MockCastleLease.sol";

/// @dev The fence in isolation: every (epoch, lease, heartbeat, direction) cell of its decision table, fuzzed.
///      End-to-end quote == swap through AquaSwapVMRouter is in Castle.t.sol and the fork suite.
contract FeeFiFoFumExtructionTest is Test {
    FeeFiFoFumExtruction internal fence;
    MockCastleLease internal lease;
    address internal constant USDC = address(0xC0);
    address internal constant WETH = address(0xE0);
    uint256 internal constant EPOCH = 0xabc;
    uint16 internal constant WIND_DOWN_PC = 158;
    uint256 internal constant HOLDER_KEY = 0xFEE;
    uint256 internal constant FO_KEY = 0xF0;
    uint256 internal constant OTHER_KEY = 0xF1;
    uint256 internal constant SECP256K1_N = 0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEBAAEDCE6AF48A03BBFD25E8CD0364141;
    address internal holder;

    /// @dev The ways a heartbeat can be good or bad, for the fuzzed table.
    enum Hb {
        None,
        Valid,
        Expired,
        OverTtl,
        WrongHolder,
        NoFo,
        FoOnly,
        AttestationReplay,
        OtherCastle,
        OtherChain,
        HighS,
        Short
    }

    function setUp() public {
        vm.warp(1_790_400_000);
        fence = new FeeFiFoFumExtruction();
        lease = new MockCastleLease();
        holder = vm.addr(HOLDER_KEY);
        lease.setFo(vm.addr(FO_KEY));
    }

    function _call(address tokenIn, bytes memory args, bytes memory takerData)
        internal
        view
        returns (uint256 nextPC, uint256 chopped, SwapRegisters memory swap)
    {
        SwapQuery memory q = SwapQuery({
            orderHash: bytes32(uint256(1)),
            maker: address(lease),
            taker: address(this),
            tokenIn: tokenIn,
            tokenOut: tokenIn == USDC ? WETH : USDC,
            isExactIn: true
        });
        SwapRegisters memory regs = SwapRegisters(11, 22, 33, 44, 55);
        return fence.extruction(false, 76, q, regs, args, takerData);
    }

    /// @dev Packed locally (not through fence.buildArgs) so vm.expectRevert targets the extruction call.
    function _args(uint256 ep) internal pure returns (bytes memory) {
        return abi.encodePacked(ep, WIND_DOWN_PC, USDC);
    }

    function _sig(uint256 key, bytes32 digest) internal pure returns (bytes memory) {
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(key, digest);
        return abi.encodePacked(r, s, v);
    }

    function _hb(uint256 ep, uint64 validUntil) internal view returns (bytes memory) {
        bytes32 d = lease.heartbeatDigest(ep, validUntil);
        return abi.encodePacked(validUntil, _sig(HOLDER_KEY, d), _sig(FO_KEY, d));
    }

    /// @dev A heartbeat of kind `k` for epoch `ep`, and whether the fence must accept it (given a live lease).
    function _hbOf(Hb k, uint256 ep) internal returns (bytes memory hb, bool ok) {
        uint64 t = uint64(block.timestamp);
        bytes32 d = lease.heartbeatDigest(ep, t + 60);
        if (k == Hb.None) return ("", false);
        if (k == Hb.Valid) return (_hb(ep, t + 60), true);
        if (k == Hb.Expired) return (_hb(ep, t - 1), false);
        if (k == Hb.OverTtl) return (_hb(ep, t + fence.MAX_HEARTBEAT_TTL() + 1), false);
        if (k == Hb.WrongHolder) return (abi.encodePacked(t + 60, _sig(OTHER_KEY, d), _sig(FO_KEY, d)), false);
        if (k == Hb.NoFo) return (abi.encodePacked(t + 60, _sig(HOLDER_KEY, d), new bytes(65)), false);
        if (k == Hb.FoOnly) return (abi.encodePacked(t + 60, _sig(FO_KEY, d), _sig(FO_KEY, d)), false);
        if (k == Hb.AttestationReplay) {
            // fo's renew attestation over the same numbers is a different EIP-712 type, so it cannot stand in
            bytes32 att = lease.attestationDigest(ICastleLease.Attestation(ep, t + 60, t + 60));
            return (abi.encodePacked(t + 60, _sig(HOLDER_KEY, d), _sig(FO_KEY, att)), false);
        }
        if (k == Hb.OtherCastle) {
            bytes32 o = fence.heartbeatDigest(address(0xBEEF), ep, t + 60);
            return (abi.encodePacked(t + 60, _sig(HOLDER_KEY, o), _sig(FO_KEY, o)), false);
        }
        if (k == Hb.OtherChain) {
            bytes32 o = _digestOn(block.chainid + 1, address(lease), ep, t + 60);
            return (abi.encodePacked(t + 60, _sig(HOLDER_KEY, o), _sig(FO_KEY, o)), false);
        }
        if (k == Hb.HighS) {
            // the malleable twin of a valid holder signature: s' = n - s, v flipped
            (uint8 v, bytes32 r, bytes32 s) = vm.sign(HOLDER_KEY, d);
            bytes memory twin = abi.encodePacked(r, bytes32(SECP256K1_N - uint256(s)), v == 27 ? uint8(28) : uint8(27));
            return (abi.encodePacked(t + 60, twin, _sig(FO_KEY, d)), false);
        }
        return (hex"00112233", false); // Short: not a heartbeat at all
    }

    /// @dev Castle's heartbeat digest on an arbitrary chain, built by hand.
    function _digestOn(uint256 chainId, address castle, uint256 ep, uint64 validUntil) internal pure returns (bytes32) {
        return keccak256(
            abi.encodePacked(
                "\x19\x01",
                keccak256(
                    abi.encode(
                        keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"),
                        keccak256("fee-fi-fo-fum Castle"),
                        keccak256("1"),
                        chainId,
                        castle
                    )
                ),
                keccak256(abi.encode(keccak256("Heartbeat(uint256 epoch,uint64 validUntil)"), ep, validUntil))
            )
        );
    }

    function test_liveWithHeartbeatContinues() public {
        lease.set(holder, EPOCH, uint64(block.timestamp + 1 days));
        bytes memory hb = _hb(EPOCH, uint64(block.timestamp + 30));
        (uint256 nextPC, uint256 chopped, SwapRegisters memory s) = _call(WETH, _args(EPOCH), hb);
        assertEq(nextPC, 76);
        assertEq(chopped, 138, "the heartbeat is consumed");
        assertEq(abi.encode(s), abi.encode(SwapRegisters(11, 22, 33, 44, 55)), "registers pass through");
        (nextPC,,) = _call(USDC, _args(EPOCH), hb);
        assertEq(nextPC, 76);
    }

    function test_heartbeatValidityBoundsAreInclusive() public {
        lease.set(holder, EPOCH, uint64(block.timestamp + 1 days));
        (uint256 nextPC,,) = _call(WETH, _args(EPOCH), _hb(EPOCH, uint64(block.timestamp)));
        assertEq(nextPC, 76, "validUntil == now is live");
        (nextPC,,) = _call(WETH, _args(EPOCH), _hb(EPOCH, uint64(block.timestamp) + fence.MAX_HEARTBEAT_TTL()));
        assertEq(nextPC, 76, "validUntil == now + TTL is live");
    }

    function test_noHeartbeatWindsDownEvenOnALiveLease() public {
        lease.set(holder, EPOCH, uint64(block.timestamp + 1 days));
        (uint256 nextPC, uint256 chopped,) = _call(USDC, _args(EPOCH), "");
        assertEq(nextPC, WIND_DOWN_PC);
        assertEq(chopped, 0, "nothing to consume");
        vm.expectRevert(abi.encodeWithSelector(FeeFiFoFumExtruction.WindDownReduceOnly.selector, WETH));
        _call(WETH, _args(EPOCH), "");
    }

    function test_expiredLeaseWindsDownDespiteAValidHeartbeat() public {
        lease.set(holder, EPOCH, uint64(block.timestamp));
        bytes memory hb = _hb(EPOCH, uint64(block.timestamp + 30));
        (uint256 nextPC, uint256 chopped,) = _call(USDC, _args(EPOCH), hb);
        assertEq(nextPC, WIND_DOWN_PC);
        assertEq(chopped, 138, "a heartbeat that fails is still consumed");
        vm.expectRevert(abi.encodeWithSelector(FeeFiFoFumExtruction.WindDownReduceOnly.selector, WETH));
        _call(WETH, _args(EPOCH), hb);
    }

    function test_revert_newEpochWhileLive() public {
        lease.set(holder, EPOCH + 1, uint64(block.timestamp + 100));
        bytes memory hb = _hb(EPOCH + 1, uint64(block.timestamp + 30));
        vm.expectRevert(FeeFiFoFumExtruction.FeeFiFoFum.selector);
        _call(USDC, _args(EPOCH), hb);
    }

    function test_revert_newEpochWhileExpired() public {
        lease.set(holder, EPOCH + 1, uint64(block.timestamp));
        vm.expectRevert(FeeFiFoFumExtruction.FeeFiFoFum.selector);
        _call(USDC, _args(EPOCH), "");
    }

    function test_revert_badArgs() public {
        lease.set(holder, EPOCH, uint64(block.timestamp + 1));
        bytes memory short = abi.encodePacked(EPOCH, WIND_DOWN_PC);
        vm.expectRevert(abi.encodeWithSelector(FeeFiFoFumExtruction.BadFenceArgs.selector, uint256(34)));
        _call(USDC, short, "");
    }

    function test_buildArgsLayout() public view {
        bytes memory a = fence.buildArgs(EPOCH, WIND_DOWN_PC, USDC);
        assertEq(a.length, fence.ARGS_LENGTH());
        assertEq(a, _args(EPOCH));
    }

    function test_digestIsCastlesEip712() public view {
        bytes32 expected = _digestOn(block.chainid, address(lease), EPOCH, 77);
        assertEq(fence.heartbeatDigest(address(lease), EPOCH, 77), expected);
        assertEq(lease.heartbeatDigest(EPOCH, 77), expected);
        assertEq(CastleLeaseTypes.HEARTBEAT_TYPEHASH, keccak256("Heartbeat(uint256 epoch,uint64 validUntil)"));
    }

    /// @dev Each bad heartbeat, on a live lease, alone: wind-down for USDC, reject WETH.
    function test_everyBadHeartbeatWindsDown() public {
        lease.set(holder, EPOCH, uint64(block.timestamp + 1 days));
        for (uint256 i = uint256(Hb.Expired); i <= uint256(Hb.Short); ++i) {
            (bytes memory hb, bool ok) = _hbOf(Hb(i), EPOCH);
            assertFalse(ok);
            (uint256 nextPC, uint256 chopped,) = _call(USDC, _args(EPOCH), hb);
            assertEq(nextPC, WIND_DOWN_PC, vm.toString(i));
            assertEq(chopped, Hb(i) == Hb.Short ? 0 : 138, vm.toString(i));
            vm.expectRevert(abi.encodeWithSelector(FeeFiFoFumExtruction.WindDownReduceOnly.selector, WETH));
            _call(WETH, _args(EPOCH), hb);
        }
    }

    /// @dev The whole decision table: revert FeeFiFoFum iff the epoch moved; else continue iff the lease is live AND
    ///      the heartbeat is valid; else jump iff USDC in, and revert otherwise.
    function testFuzz_decisionTable(
        uint256 shipped,
        uint256 current,
        bool sameEpoch,
        uint64 expiry,
        uint64 now_,
        uint8 kind,
        bool usdcIn
    ) public {
        now_ = uint64(bound(now_, 1_000, type(uint40).max));
        vm.warp(now_);
        if (sameEpoch) shipped = current; // otherwise two random epochs almost never meet
        lease.set(holder, current, expiry);
        (bytes memory hb, bool ok) = _hbOf(Hb(bound(kind, 0, uint8(Hb.Short))), current);
        address tokenIn = usdcIn ? USDC : WETH;
        if (current != shipped) {
            vm.expectRevert(FeeFiFoFumExtruction.FeeFiFoFum.selector);
            _call(tokenIn, _args(shipped), hb);
        } else if (now_ < expiry && ok) {
            (uint256 nextPC,,) = _call(tokenIn, _args(shipped), hb);
            assertEq(nextPC, 76);
        } else if (usdcIn) {
            (uint256 nextPC,,) = _call(tokenIn, _args(shipped), hb);
            assertEq(nextPC, WIND_DOWN_PC);
        } else {
            vm.expectRevert(abi.encodeWithSelector(FeeFiFoFumExtruction.WindDownReduceOnly.selector, WETH));
            _call(tokenIn, _args(shipped), hb);
        }
    }

    /// @dev Quote and swap call the same selector; the static path is a STATICCALL, which must not revert for state.
    function test_staticcallMatchesCall() public {
        lease.set(holder, EPOCH, uint64(block.timestamp + 1 days));
        bytes memory hb = _hb(EPOCH, uint64(block.timestamp + 30));
        SwapQuery memory q = SwapQuery(bytes32(0), address(lease), address(this), USDC, WETH, true);
        SwapRegisters memory regs = SwapRegisters(1, 2, 3, 4, 5);
        bytes memory data = abi.encodeCall(FeeFiFoFumExtruction.extruction, (true, 76, q, regs, _args(EPOCH), hb));
        (bool okStatic, bytes memory rStatic) = address(fence).staticcall(data);
        data = abi.encodeCall(FeeFiFoFumExtruction.extruction, (false, 76, q, regs, _args(EPOCH), hb));
        (bool okCall, bytes memory rCall) = address(fence).call(data);
        assertTrue(okStatic && okCall);
        assertEq(rStatic, rCall);
    }
}
