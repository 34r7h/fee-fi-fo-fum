// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { ENSv2Roles } from "../../src/interfaces/IENSv2.sol";

/// @notice The slice of ENSv2 PermissionedRegistry semantics Castle relies on, mirrored from contracts-v2 main:
///         root-role checks, AVAILABLE once block.timestamp >= expiry, no expiry reduction, and re-registration
///         of a name whose token still has an owner burning it and minting a new token id (version bits).
///         `regenerate = false` models a deployment that does NOT regenerate ids (the fallback case).
///         Castle's fork tests cover the real contracts; this mock keeps the unit tests fast and offline.
contract MockENSv2Registry {
    struct Entry {
        uint64 expiry;
        uint32 tokenVersion;
        address owner;
        address resolver;
    }

    mapping(uint256 labelId => Entry) internal _entries;
    mapping(address account => uint256) public rootRoles;
    bool public regenerate = true;

    error Unauthorized(uint256 roles, address account);
    error LabelAlreadyRegistered(string label);
    error LabelExpired(uint256 tokenId);
    error CannotReduceExpiry(uint64 oldExpiry, uint64 newExpiry);
    error CannotSetPastExpiry(uint64 expiry);

    function grantRootRoles(uint256 roles, address account) external {
        rootRoles[account] |= roles;
    }

    function setRegenerate(bool r) external {
        regenerate = r;
    }

    function hasRootRoles(uint256 roles, address account) public view returns (bool) {
        return rootRoles[account] & roles == roles;
    }

    function register(string calldata label, address owner, address, address resolver, uint256, uint64 expiry)
        external
        returns (uint256 tokenId)
    {
        if (!hasRootRoles(ENSv2Roles.REGISTRY_REGISTRAR, msg.sender)) {
            revert Unauthorized(ENSv2Roles.REGISTRY_REGISTRAR, msg.sender);
        }
        uint256 id = uint256(keccak256(bytes(label)));
        Entry storage e = _entries[_base(id)];
        if (block.timestamp < e.expiry) revert LabelAlreadyRegistered(label);
        if (expiry <= block.timestamp) revert CannotSetPastExpiry(expiry);
        if (e.owner != address(0) && regenerate) ++e.tokenVersion;
        e.owner = owner;
        e.expiry = expiry;
        e.resolver = resolver;
        return _tokenId(id, e);
    }

    function renew(uint256 anyId, uint64 newExpiry) external {
        Entry storage e = _entries[_base(anyId)];
        if (block.timestamp >= e.expiry) revert LabelExpired(_tokenId(anyId, e));
        if (!hasRootRoles(ENSv2Roles.REGISTRY_RENEW, msg.sender)) {
            revert Unauthorized(ENSv2Roles.REGISTRY_RENEW, msg.sender);
        }
        if (newExpiry < e.expiry) revert CannotReduceExpiry(e.expiry, newExpiry);
        e.expiry = newExpiry;
    }

    function getExpiry(uint256 anyId) external view returns (uint64) {
        return _entries[_base(anyId)].expiry;
    }

    function getTokenId(uint256 anyId) external view returns (uint256) {
        return _tokenId(anyId, _entries[_base(anyId)]);
    }

    function latestOwnerOf(uint256 tokenId) external view returns (address) {
        Entry storage e = _entries[_base(tokenId)];
        return _tokenId(tokenId, e) == tokenId ? e.owner : address(0);
    }

    function _base(uint256 anyId) internal pure returns (uint256) {
        return anyId & ~uint256(0xffffffff);
    }

    function _tokenId(uint256 anyId, Entry storage e) internal view returns (uint256) {
        return _base(anyId) | e.tokenVersion;
    }
}

/// @notice The slice of PermissionedResolver Castle uses: root-role alias, part-scoped data.
contract MockENSv2Resolver {
    mapping(address account => uint256) public rootRoles;
    mapping(bytes32 node => mapping(string key => bytes)) internal _data;
    mapping(bytes32 fromNode => bytes) internal _aliases;

    error Unauthorized(uint256 roles, address account);

    function grantRootRoles(uint256 roles, address account) external {
        rootRoles[account] |= roles;
    }

    function hasRootRoles(uint256 roles, address account) public view returns (bool) {
        return rootRoles[account] & roles == roles;
    }

    function hasRoles(uint256, uint256 roles, address account) external view returns (bool) {
        return hasRootRoles(roles, account);
    }

    function setData(bytes32 node, string calldata key, bytes calldata value) external {
        if (!hasRootRoles(ENSv2Roles.RESOLVER_SET_DATA, msg.sender)) {
            revert Unauthorized(ENSv2Roles.RESOLVER_SET_DATA, msg.sender);
        }
        _data[node][key] = value;
    }

    function data(bytes32 node, string calldata key) external view returns (bytes memory) {
        return _data[node][key];
    }

    function setAlias(bytes calldata fromName, bytes calldata toName) external {
        if (!hasRootRoles(ENSv2Roles.RESOLVER_SET_ALIAS, msg.sender)) {
            revert Unauthorized(ENSv2Roles.RESOLVER_SET_ALIAS, msg.sender);
        }
        _aliases[keccak256(fromName)] = toName;
    }

    function getAlias(bytes memory fromName) external view returns (bytes memory) {
        return _aliases[keccak256(fromName)];
    }
}
