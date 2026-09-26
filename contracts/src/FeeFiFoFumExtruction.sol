// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import { ECDSA } from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import { MessageHashUtils } from "@openzeppelin/contracts/utils/cryptography/MessageHashUtils.sol";
import { SwapQuery, SwapRegisters } from "@1inch/swap-vm/src/libs/VM.sol";

import { ICastleLease, CastleLeaseTypes } from "./interfaces/ICastleLease.sol";

/// @title FeeFiFoFumExtruction, the giant smells a stale shift
/// @notice The ENS-lease fence at the head of every program Castle ships. At fill time it reads the maker's lease
///         (the maker is Castle), checks the heartbeat the taker brings, and decides the fill's fate. No transaction
///         from the shift that shipped the order is needed:
///         - epoch changed → revert FeeFiFoFum(): a zombie shift's orders are dead;
///         - same epoch, heartbeat valid → continue with the live curve. Valid means signed by the live holder AND
///           fo, and now <= validUntil <= now + MAX_HEARTBEAT_TTL;
///         - same epoch, no valid heartbeat → jump to the wind-down branch, reduce-only: the only allowed tokenIn is
///           `reduceOnlyTokenIn` (USDC), so takers can only buy the hoard's WETH back.
///         An expired ENS lease reports no live holder, so it forces wind-down whatever heartbeat is offered.
/// @dev One `view` function serves both IExtruction (swap) and IStaticExtruction (quote), so quote and swap cannot
///      diverge: the outcome depends only on (query.maker's lease, block.timestamp, query.tokenIn, args, takerData).
///      Stateless and immutable, as the Extruction instruction requires of its targets.
///      Taker data: validUntil (uint64) | holder signature (65) | fo signature (65), packed; HEARTBEAT_LENGTH bytes are
///      consumed when present. Anything shorter is not a heartbeat and nothing is consumed.
///      Omitting the heartbeat lets a taker pick the wind-down branch, so that branch prices the same curve and the
///      same Decay with a fee Castle never lets fall below the live fee: wind-down can never be the better price.
contract FeeFiFoFumExtruction {
    /// @notice A fill against a strategy shipped under an older epoch.
    error FeeFiFoFum();
    /// @notice A fill during wind-down in the direction that would grow the stale book's inventory.
    error WindDownReduceOnly(address tokenIn);
    /// @notice The args are not epoch(32) | windDownPC(2) | reduceOnlyTokenIn(20).
    error BadFenceArgs(uint256 length);

    /// @notice Length of the args after the 20-byte target the Extruction opcode strips.
    uint256 public constant ARGS_LENGTH = 54;
    /// @notice validUntil(8) + holder signature(65) + fo signature(65).
    uint256 public constant HEARTBEAT_LENGTH = 138;
    /// @notice The furthest in the future a heartbeat may reach. A dead holder's book goes to wind-down within this.
    uint64 public constant MAX_HEARTBEAT_TTL = 120;

    bytes32 internal constant DOMAIN_TYPEHASH =
        keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)");
    bytes32 internal constant NAME_HASH = keccak256(bytes(CastleLeaseTypes.NAME));
    bytes32 internal constant VERSION_HASH = keccak256(bytes(CastleLeaseTypes.VERSION));

    /// @param nextPC    the program counter after this instruction
    /// @param query     the swap; `query.maker` is the Castle whose lease fences the order
    /// @param swap      passed through unchanged
    /// @param args      shippedEpoch (uint256) | windDownPC (uint16) | reduceOnlyTokenIn (address), packed
    /// @param takerData the taker's instruction args: a heartbeat first, if the taker brings one
    /// @return updatedNextPC nextPC while live, windDownPC otherwise
    /// @return choppedLength HEARTBEAT_LENGTH if the taker data holds a heartbeat (valid or not), else 0
    /// @return updatedSwap   `swap`, unchanged
    function extruction(
        bool, /* isStaticContext */
        uint256 nextPC,
        SwapQuery calldata query,
        SwapRegisters calldata swap,
        bytes calldata args,
        bytes calldata takerData
    ) external view returns (uint256 updatedNextPC, uint256 choppedLength, SwapRegisters memory updatedSwap) {
        if (args.length != ARGS_LENGTH) revert BadFenceArgs(args.length);
        uint256 shippedEpoch = uint256(bytes32(args[0:32]));
        uint256 windDownPC = uint16(bytes2(args[32:34]));
        address reduceOnlyTokenIn = address(bytes20(args[34:54]));

        (uint256 ep, address liveHolder, address fo) = ICastleLease(query.maker).fenceState();
        if (ep != shippedEpoch) revert FeeFiFoFum();
        updatedSwap = swap;
        if (takerData.length >= HEARTBEAT_LENGTH) {
            choppedLength = HEARTBEAT_LENGTH;
            if (_alive(query.maker, ep, liveHolder, fo, takerData)) return (nextPC, choppedLength, updatedSwap);
        }
        if (query.tokenIn != reduceOnlyTokenIn) revert WindDownReduceOnly(query.tokenIn);
        return (windDownPC, choppedLength, updatedSwap);
    }

    /// @notice The digest the holder and fo sign, computed exactly as Castle.heartbeatDigest does (Castle's domain).
    function heartbeatDigest(address castle, uint256 ep, uint64 validUntil) public view returns (bytes32) {
        bytes32 domain = keccak256(abi.encode(DOMAIN_TYPEHASH, NAME_HASH, VERSION_HASH, block.chainid, castle));
        return MessageHashUtils.toTypedDataHash(
            domain, keccak256(abi.encode(CastleLeaseTypes.HEARTBEAT_TYPEHASH, ep, validUntil))
        );
    }

    /// @notice Pack the fence args (the Extruction opcode's args are this contract's address followed by these).
    function buildArgs(uint256 shippedEpoch, uint16 windDownPC, address reduceOnlyTokenIn)
        external
        pure
        returns (bytes memory)
    {
        return abi.encodePacked(shippedEpoch, windDownPC, reduceOnlyTokenIn);
    }

    /// @dev True iff the ENS lease is live and the heartbeat is current, bounded, and signed by the holder and fo.
    function _alive(address castle, uint256 ep, address liveHolder, address fo, bytes calldata hb)
        internal
        view
        returns (bool)
    {
        uint64 validUntil = uint64(bytes8(hb[0:8]));
        // a zero holder or fo would match _signer's address(0) for a malformed signature
        if (
            liveHolder == address(0) || fo == address(0) || validUntil < block.timestamp
                || validUntil > block.timestamp + MAX_HEARTBEAT_TTL
        ) return false;
        bytes32 digest = heartbeatDigest(castle, ep, validUntil);
        return _signer(digest, hb[8:73]) == liveHolder && _signer(digest, hb[73:138]) == fo;
    }

    /// @dev The signer of a packed (r, s, v) signature, or address(0) if it is malformed or malleable (high s).
    function _signer(bytes32 digest, bytes calldata sig) internal pure returns (address signer) {
        ECDSA.RecoverError err;
        (signer, err,) = ECDSA.tryRecover(digest, uint8(sig[64]), bytes32(sig[0:32]), bytes32(sig[32:64]));
        if (err != ECDSA.RecoverError.NoError) signer = address(0);
    }
}
