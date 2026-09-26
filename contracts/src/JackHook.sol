// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import { IValidationHook } from "./interfaces/ICCA.sol";
import { IENSv2Registry } from "./interfaces/IENSv2.sol";

/// @title JackHook, any Jack with a name may climb the beanstalk and bid
/// @notice The CCA validation hook for Castle's auctions: a bid is valid only if its owner holds an unexpired name in
///         handoff's ENSv2 agent registry. The incoming shift gets no privilege; any named agent may outbid it.
/// @dev Reads the registry directly: a hook cannot follow CCIP-read, so never the UniversalResolver.
///      hookData is the bidder's label as raw bytes (e.g. "jack" for jack.feefifofum.eth).
contract JackHook is IValidationHook {
    IENSv2Registry public immutable REGISTRY;

    /// @notice The label was never registered.
    error Unnamed(address owner, bytes label);
    /// @notice The name has expired.
    error NameExpired(address owner, bytes label, uint64 expiry);
    /// @notice The name is live but belongs to someone else.
    error NotNameOwner(address owner, bytes label, address nameOwner);

    constructor(IENSv2Registry registry) {
        REGISTRY = registry;
    }

    /// @inheritdoc IValidationHook
    function validate(uint256, uint128, address owner, address, bytes calldata hookData) external view {
        uint256 id = uint256(keccak256(hookData));
        address nameOwner = REGISTRY.getOwner(id); // address(0) if expired or never registered
        if (nameOwner == owner && owner != address(0)) return;
        uint64 exp = REGISTRY.getExpiry(id);
        if (exp == 0) revert Unnamed(owner, hookData);
        if (block.timestamp >= exp) revert NameExpired(owner, hookData, exp);
        revert NotNameOwner(owner, hookData, nameOwner);
    }
}
