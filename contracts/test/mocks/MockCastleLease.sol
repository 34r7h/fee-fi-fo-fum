// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { EIP712 } from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";

import { ICastleLease, CastleLeaseTypes } from "../../src/interfaces/ICastleLease.sol";

/// @notice Settable ICastleLease views, so the fence and fo can be built and tested before Castle.sol lands.
///         The views and the heartbeat digest (Castle's EIP-712 domain at this address) are real; the transitions are
///         not implemented here.
contract MockCastleLease is ICastleLease, EIP712 {
    address public holder;
    uint256 public epoch;
    uint64 public expiry;
    address public fo;
    uint64 public leasePeriod = 120;

    constructor() EIP712(CastleLeaseTypes.NAME, CastleLeaseTypes.VERSION) { }

    function set(address holder_, uint256 epoch_, uint64 expiry_) external {
        (holder, epoch, expiry) = (holder_, epoch_, expiry_);
    }

    function setFo(address fo_) external {
        fo = fo_;
    }

    function isLive() external view returns (bool) {
        return block.timestamp < expiry;
    }

    function fenceState() external view returns (uint256, address, address) {
        return (epoch, block.timestamp < expiry ? holder : address(0), fo);
    }

    function heartbeatDigest(uint256 ep, uint64 validUntil) external view returns (bytes32) {
        return _hashTypedDataV4(keccak256(abi.encode(CastleLeaseTypes.HEARTBEAT_TYPEHASH, ep, validUntil)));
    }

    function attestationDigest(Attestation calldata att) external view returns (bytes32) {
        return _hashTypedDataV4(
            keccak256(abi.encode(CastleLeaseTypes.ATTESTATION_TYPEHASH, att.epoch, att.expiry, att.deadline))
        );
    }

    function renew(uint64, uint64, bytes calldata) external pure {
        revert("MockCastleLease: no renew");
    }

    function claim() external pure returns (uint256) {
        revert("MockCastleLease: no claim");
    }

    function challenge() external pure returns (uint64) {
        revert("MockCastleLease: no challenge");
    }

    function respond() external pure {
        revert("MockCastleLease: no respond");
    }
}
