// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { ENSv2Roles, IDataResolver } from "../../src/interfaces/IENSv2.sol";

/// @notice The slice of ENSv2 PermissionedRegistry semantics Castle relies on, mirrored from contracts-v2 tag sepolia-deployment-2026-09-15:
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

    /// @dev As the tag's unregister: live names only, ROLE_UNREGISTER, burn and bump the version, expiry = now.
    function unregister(uint256 anyId) external {
        Entry storage e = _entries[_base(anyId)];
        if (block.timestamp >= e.expiry) revert LabelExpired(_tokenId(anyId, e));
        if (!hasRootRoles(ENSv2Roles.REGISTRY_UNREGISTER, msg.sender)) {
            revert Unauthorized(ENSv2Roles.REGISTRY_UNREGISTER, msg.sender);
        }
        if (e.owner != address(0)) {
            e.owner = address(0);
            ++e.tokenVersion;
        }
        e.expiry = uint64(block.timestamp);
    }

    function getExpiry(uint256 anyId) external view returns (uint64) {
        return _entries[_base(anyId)].expiry;
    }

    function getTokenId(uint256 anyId) external view returns (uint256) {
        return _tokenId(anyId, _entries[_base(anyId)]);
    }

    function getOwner(uint256 anyId) external view returns (address) {
        Entry storage e = _entries[_base(anyId)];
        return block.timestamp < e.expiry ? e.owner : address(0);
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

/// @notice The slice of PermissionedResolver (tag sepolia-deployment-2026-09-15) Castle uses, including the record
///         sharing linkToNode causes: a linked name resolves to, and writes through to, the target's record.
contract MockENSv2Resolver {
    struct Record {
        mapping(string key => bytes) datas;
    }

    mapping(address account => uint256) public rootRoles;
    mapping(uint256 resource => mapping(address account => uint256)) public roles;
    mapping(bytes32 node => uint256) internal _recordIds;
    mapping(uint256 recordId => Record) internal _records;
    uint256 internal _recordCount;

    error Unauthorized(uint256 resource, uint256 roles, address account);
    error InvalidRecord();
    error UnsupportedResolverProfile(bytes4 selector);

    function grantRootRoles(uint256 r, address account) external {
        rootRoles[account] |= r;
    }

    function grantRoles(uint256 resource, uint256 r, address account) external {
        roles[resource][account] |= r;
    }

    function hasRootRoles(uint256 r, address account) public view returns (bool) {
        return rootRoles[account] & r == r;
    }

    function setData(bytes calldata name, string calldata key, bytes calldata value) external {
        uint256 resource = uint256(keccak256(bytes(key)));
        if (
            !hasRootRoles(ENSv2Roles.RESOLVER_SET_DATA, msg.sender)
                && roles[resource][msg.sender] & ENSv2Roles.RESOLVER_SET_DATA == 0
        ) {
            revert Unauthorized(resource, ENSv2Roles.RESOLVER_SET_DATA, msg.sender);
        }
        _records[_ensureRecord(name)].datas[key] = value;
    }

    function linkToNode(bytes calldata sourceName, bytes32 targetNode) external {
        if (!hasRootRoles(ENSv2Roles.RESOLVER_LINK, msg.sender)) {
            revert Unauthorized(0, ENSv2Roles.RESOLVER_LINK, msg.sender);
        }
        uint256 recordId = _recordIds[targetNode];
        if (recordId == 0) revert InvalidRecord();
        _recordIds[namehash(sourceName, 0)] = recordId;
    }

    function resolve(bytes calldata name, bytes calldata data) external view returns (bytes memory) {
        bytes4 selector = bytes4(data);
        if (selector != IDataResolver.data.selector) revert UnsupportedResolverProfile(selector);
        (, string memory key) = abi.decode(data[4:], (bytes32, string));
        uint256 recordId = _recordIds[namehash(name, 0)];
        if (recordId == 0) recordId = _recordIds[bytes32(0)];
        return abi.encode(_records[recordId].datas[key]);
    }

    function getRecordId(bytes32 node) external view returns (uint256) {
        return _recordIds[node];
    }

    function _ensureRecord(bytes calldata name) internal returns (uint256 recordId) {
        bytes32 node = namehash(name, 0);
        recordId = _recordIds[node];
        if (recordId == 0) {
            recordId = ++_recordCount;
            _recordIds[node] = recordId;
        }
    }

    function namehash(bytes memory name, uint256 offset) public pure returns (bytes32) {
        uint256 len = uint8(name[offset]);
        if (len == 0) return bytes32(0);
        bytes32 labelHash;
        assembly ("memory-safe") {
            labelHash := keccak256(add(add(name, 33), offset), len)
        }
        return keccak256(abi.encodePacked(namehash(name, offset + 1 + len), labelHash));
    }
}
