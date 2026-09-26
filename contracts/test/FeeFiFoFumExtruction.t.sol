// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import { Test } from "forge-std/Test.sol";
import { SwapQuery, SwapRegisters } from "@1inch/swap-vm/src/libs/VM.sol";

import { FeeFiFoFumExtruction } from "../src/FeeFiFoFumExtruction.sol";
import { MockCastleLease } from "./mocks/MockCastleLease.sol";

/// @dev The fence in isolation: every (epoch, liveness, direction) cell of its decision table, fuzzed.
///      End-to-end quote == swap through AquaSwapVMRouter is in Castle.t.sol and the fork suite.
contract FeeFiFoFumExtructionTest is Test {
    FeeFiFoFumExtruction internal fence;
    MockCastleLease internal lease;
    address internal constant USDC = address(0xC0);
    address internal constant WETH = address(0xE0);
    uint256 internal constant EPOCH = 0xabc;
    uint16 internal constant WIND_DOWN_PC = 158;

    function setUp() public {
        vm.warp(1_790_400_000);
        fence = new FeeFiFoFumExtruction();
        lease = new MockCastleLease();
    }

    function _call(address tokenIn, bytes memory args)
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
        return fence.extruction(false, 76, q, regs, args, "");
    }

    /// @dev Packed locally (not through fence.buildArgs) so vm.expectRevert targets the extruction call.
    function _args(uint256 ep) internal pure returns (bytes memory) {
        return abi.encodePacked(ep, WIND_DOWN_PC, USDC);
    }

    function test_liveSameEpochContinues() public {
        lease.set(address(1), EPOCH, uint64(block.timestamp + 1));
        (uint256 nextPC, uint256 chopped, SwapRegisters memory s) = _call(WETH, _args(EPOCH));
        assertEq(nextPC, 76);
        assertEq(chopped, 0);
        assertEq(abi.encode(s), abi.encode(SwapRegisters(11, 22, 33, 44, 55)), "registers pass through");
        (nextPC,,) = _call(USDC, _args(EPOCH));
        assertEq(nextPC, 76);
    }

    function test_expiredJumpsToWindDownForUsdcIn() public {
        lease.set(address(1), EPOCH, uint64(block.timestamp));
        (uint256 nextPC,,) = _call(USDC, _args(EPOCH));
        assertEq(nextPC, WIND_DOWN_PC);
    }

    function test_revert_expiredRejectsWethIn() public {
        lease.set(address(1), EPOCH, uint64(block.timestamp));
        vm.expectRevert(abi.encodeWithSelector(FeeFiFoFumExtruction.WindDownReduceOnly.selector, WETH));
        _call(WETH, _args(EPOCH));
    }

    function test_revert_newEpochWhileLive() public {
        lease.set(address(1), EPOCH + 1, uint64(block.timestamp + 100));
        vm.expectRevert(FeeFiFoFumExtruction.FeeFiFoFum.selector);
        _call(USDC, _args(EPOCH));
    }

    function test_revert_newEpochWhileExpired() public {
        lease.set(address(1), EPOCH + 1, uint64(block.timestamp));
        vm.expectRevert(FeeFiFoFumExtruction.FeeFiFoFum.selector);
        _call(USDC, _args(EPOCH));
    }

    function test_revert_badArgs() public {
        lease.set(address(1), EPOCH, uint64(block.timestamp + 1));
        bytes memory short = abi.encodePacked(EPOCH, WIND_DOWN_PC);
        vm.expectRevert(abi.encodeWithSelector(FeeFiFoFumExtruction.BadFenceArgs.selector, uint256(34)));
        _call(USDC, short);
    }

    function test_buildArgsLayout() public view {
        bytes memory a = fence.buildArgs(EPOCH, WIND_DOWN_PC, USDC);
        assertEq(a.length, fence.ARGS_LENGTH());
        assertEq(a, _args(EPOCH));
    }

    /// @dev The whole decision table: revert FeeFiFoFum iff the epoch moved; else continue iff live; else jump iff USDC in.
    function testFuzz_decisionTable(uint256 shipped, uint256 current, uint64 expiry, uint64 now_, bool usdcIn) public {
        now_ = uint64(bound(now_, 1, type(uint40).max));
        vm.warp(now_);
        lease.set(address(1), current, expiry);
        address tokenIn = usdcIn ? USDC : WETH;
        if (current != shipped) {
            vm.expectRevert(FeeFiFoFumExtruction.FeeFiFoFum.selector);
            _call(tokenIn, _args(shipped));
        } else if (now_ < expiry) {
            (uint256 nextPC,,) = _call(tokenIn, _args(shipped));
            assertEq(nextPC, 76);
        } else if (usdcIn) {
            (uint256 nextPC,,) = _call(tokenIn, _args(shipped));
            assertEq(nextPC, WIND_DOWN_PC);
        } else {
            vm.expectRevert(abi.encodeWithSelector(FeeFiFoFumExtruction.WindDownReduceOnly.selector, WETH));
            _call(tokenIn, _args(shipped));
        }
    }

    /// @dev Quote and swap call the same selector; the static path is a STATICCALL, which must not revert for state.
    function test_staticcallMatchesCall() public {
        lease.set(address(1), EPOCH, uint64(block.timestamp + 1));
        SwapQuery memory q = SwapQuery(bytes32(0), address(lease), address(this), USDC, WETH, true);
        SwapRegisters memory regs = SwapRegisters(1, 2, 3, 4, 5);
        bytes memory data = abi.encodeCall(FeeFiFoFumExtruction.extruction, (true, 76, q, regs, _args(EPOCH), ""));
        (bool okStatic, bytes memory rStatic) = address(fence).staticcall(data);
        data = abi.encodeCall(FeeFiFoFumExtruction.extruction, (false, 76, q, regs, _args(EPOCH), ""));
        (bool okCall, bytes memory rCall) = address(fence).call(data);
        assertTrue(okStatic && okCall);
        assertEq(rStatic, rCall);
    }
}
