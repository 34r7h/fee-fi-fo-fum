// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @notice The slice of ENSv2's PermissionedRegistry that Castle and the fence use.
/// @dev Pinned to ensdomains/contracts-v2 tag `sepolia-deployment-2026-09-15`, the deployment in PLAN.md and
///      docs/ens-probes.md (it is not contracts-v2 main). `anyId` may be the labelhash, the token id or the
///      resource; the registry strips the version bits. A name is AVAILABLE once block.timestamp >= expiry.
///      Re-registering a name whose token still has an owner burns it and mints a new token id, and that
///      regenerated id is the fencing epoch.
interface IENSv2Registry {
    function register(
        string calldata label,
        address owner,
        address registry,
        address resolver,
        uint256 roleBitmap,
        uint64 expiry
    ) external returns (uint256 tokenId);

    function renew(uint256 anyId, uint64 newExpiry) external;

    function getExpiry(uint256 anyId) external view returns (uint64);

    function getTokenId(uint256 anyId) external view returns (uint256);

    /// @notice The owner, or address(0) once block.timestamp >= expiry or if the name was never registered.
    function getOwner(uint256 anyId) external view returns (address);

    /// @notice The owner of `tokenId` whether or not it has expired.
    function latestOwnerOf(uint256 tokenId) external view returns (address);

    function hasRootRoles(uint256 roleBitmap, address account) external view returns (bool);
}

/// @notice The slice of ENSv2's PermissionedResolver (tag `sepolia-deployment-2026-09-15`) that Castle uses.
/// @dev Names are DNS-encoded bytes. Records are shared by id: after linkToNode(source, target), `source`
///      resolves to target's record, and writes through `source` land in that record too.
interface IENSv2Resolver {
    /// @notice selector 0xeb4b73bb; needs ROLE_SET_DATA on root or on resource(key) = uint256(keccak256(key)).
    function setData(bytes calldata name, string calldata key, bytes calldata value) external;

    /// @notice selector 0x5d27b8e5; needs ROLE_LINK on root; reverts InvalidRecord if `targetNode` has no record.
    function linkToNode(bytes calldata sourceName, bytes32 targetNode) external;

    /// @notice ENSIP-10 resolve; the node argument inside `data` is ignored in favour of `name`.
    function resolve(bytes calldata name, bytes calldata data) external view returns (bytes memory);

    function getRecordId(bytes32 node) external view returns (uint256);

    function hasRootRoles(uint256 roleBitmap, address account) external view returns (bool);
}

/// @notice ENSIP data record profile, dispatched through IENSv2Resolver.resolve.
interface IDataResolver {
    function data(bytes32 node, string calldata key) external view returns (bytes memory);
}

/// @notice Role bits at tag `sepolia-deployment-2026-09-15` (RegistryRolesLib, PermissionedResolverLib).
library ENSv2Roles {
    uint256 internal constant REGISTRY_REGISTRAR = 1 << 0;
    uint256 internal constant REGISTRY_RENEW = 1 << 16;
    uint256 internal constant RESOLVER_SET_DATA = 1 << 24;
    uint256 internal constant RESOLVER_LINK = 1 << 28;
}
