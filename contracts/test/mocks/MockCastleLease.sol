// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { ICastleLease } from "../../src/interfaces/ICastleLease.sol";

/// @notice Settable ICastleLease views, so the fence and fo can be built and tested before Castle.sol lands.
///         Only the views are real; renew and claim are not implemented here.
contract MockCastleLease is ICastleLease {
    address public holder;
    uint256 public epoch;
    uint64 public expiry;
    address public fo;
    uint64 public leasePeriod = 120;

    function set(address holder_, uint256 epoch_, uint64 expiry_) external {
        (holder, epoch, expiry) = (holder_, epoch_, expiry_);
    }

    function setFo(address fo_) external {
        fo = fo_;
    }

    function isLive() external view returns (bool) {
        return block.timestamp < expiry;
    }

    function attestationDigest(Attestation calldata) external pure returns (bytes32) {
        revert("MockCastleLease: no digest");
    }

    function renew(uint64, uint64, bytes calldata) external pure {
        revert("MockCastleLease: no renew");
    }

    function claim() external pure returns (uint256) {
        revert("MockCastleLease: no claim");
    }
}
