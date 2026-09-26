// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import { SwapQuery, SwapRegisters } from "@1inch/swap-vm/src/libs/VM.sol";

import { ICastleLease } from "./interfaces/ICastleLease.sol";

/// @title FeeFiFoFumExtruction, the giant smells a stale shift
/// @notice The ENS-lease fence at the head of every program Castle ships. At fill time it reads the maker's lease
///         (the maker is Castle) and decides the fill's fate with no transaction from the shift that shipped it:
///         - same epoch, lease live    → continue with the live curve;
///         - same epoch, lease expired → jump to the wind-down branch, reduce-only: the only allowed tokenIn is
///                                       `reduceOnlyTokenIn` (USDC), so takers can only buy the hoard's WETH back;
///         - epoch changed             → revert FeeFiFoFum(): a zombie shift's orders are dead.
/// @dev One `view` function serves both IExtruction (swap) and IStaticExtruction (quote), so quote and swap
///      cannot diverge: the outcome depends only on (query.maker's lease, block.timestamp, query.tokenIn, args).
///      Stateless and immutable, as the Extruction instruction requires of its targets.
///      The direction check lives here rather than in a JumpIfTokenIn opcode because that opcode can only branch,
///      not reject: the fence is the one place that can refuse the wrong direction.
contract FeeFiFoFumExtruction {
    /// @notice A fill against a strategy shipped under an older epoch.
    error FeeFiFoFum();
    /// @notice A fill during wind-down in the direction that would grow the stale book's inventory.
    error WindDownReduceOnly(address tokenIn);
    /// @notice The args are not epoch(32) | windDownPC(2) | reduceOnlyTokenIn(20).
    error BadFenceArgs(uint256 length);

    /// @notice Length of the args after the 20-byte target the Extruction opcode strips.
    uint256 public constant ARGS_LENGTH = 54;

    /// @param nextPC the program counter after this instruction
    /// @param query  the swap; `query.maker` is the Castle whose lease fences the order
    /// @param swap   passed through unchanged
    /// @param args   shippedEpoch (uint256) | windDownPC (uint16) | reduceOnlyTokenIn (address), packed
    /// @return updatedNextPC nextPC while live, windDownPC while expired
    /// @return choppedLength always 0: the fence takes no taker data
    /// @return updatedSwap   `swap`, unchanged
    function extruction(
        bool, /* isStaticContext */
        uint256 nextPC,
        SwapQuery calldata query,
        SwapRegisters calldata swap,
        bytes calldata args,
        bytes calldata /* takerData */
    ) external view returns (uint256 updatedNextPC, uint256 choppedLength, SwapRegisters memory updatedSwap) {
        if (args.length != ARGS_LENGTH) revert BadFenceArgs(args.length);
        uint256 shippedEpoch = uint256(bytes32(args[0:32]));
        uint256 windDownPC = uint16(bytes2(args[32:34]));
        address reduceOnlyTokenIn = address(bytes20(args[34:54]));

        ICastleLease castle = ICastleLease(query.maker);
        if (castle.epoch() != shippedEpoch) revert FeeFiFoFum();
        updatedSwap = swap;
        if (block.timestamp < castle.expiry()) return (nextPC, 0, updatedSwap);
        if (query.tokenIn != reduceOnlyTokenIn) revert WindDownReduceOnly(query.tokenIn);
        return (windDownPC, 0, updatedSwap);
    }

    /// @notice Pack the fence args (the Extruction opcode's args are this contract's address followed by these).
    function buildArgs(uint256 shippedEpoch, uint16 windDownPC, address reduceOnlyTokenIn)
        external
        pure
        returns (bytes memory)
    {
        return abi.encodePacked(shippedEpoch, windDownPC, reduceOnlyTokenIn);
    }
}
