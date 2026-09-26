// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @notice The slice of ENSv2's PermissionedRegistry (ensdomains/contracts-v2) that Castle and the fence use.
/// @dev Selectors match contracts-v2 main (IStandardRegistry / IPermissionedRegistry / IEnhancedAccessControl).
///      `anyId` may be the labelhash, the token id or the resource; the registry strips the version bits.
///      A name is AVAILABLE once block.timestamp >= expiry. Re-registering a name whose token still has an
///      owner burns it and mints a new token id: that regenerated id is the fencing epoch.
interface IENSv2Registry {
    function register(
        string calldata label,
        address owner,
        address registry,
        address resolver,
        uint256 roleBitmap,
        uint64 expiry
    )
        external
        returns (uint256 tokenId);

    function renew(uint256 anyId, uint64 newExpiry) external;

    function getExpiry(uint256 anyId) external view returns (uint64);

    function getTokenId(uint256 anyId) external view returns (uint256);

    function latestOwnerOf(uint256 tokenId) external view returns (address);

    function hasRootRoles(uint256 roleBitmap, address account) external view returns (bool);
}

/// @notice The slice of ENSv2's PermissionedResolver that Castle uses.
interface IENSv2Resolver {
    function setData(bytes32 node, string calldata key, bytes calldata value) external;

    function data(bytes32 node, string calldata key) external view returns (bytes memory);

    function setAlias(bytes calldata fromName, bytes calldata toName) external;

    function getAlias(bytes memory fromName) external view returns (bytes memory);

    function hasRoles(uint256 resource, uint256 roleBitmap, address account) external view returns (bool);

    function hasRootRoles(uint256 roleBitmap, address account) external view returns (bool);
}

/// @notice Role bits from contracts-v2 (RegistryRolesLib, PermissionedResolverLib).
library ENSv2Roles {
    uint256 internal constant REGISTRY_REGISTRAR = 1 << 0;
    uint256 internal constant REGISTRY_RENEW = 1 << 16;
    uint256 internal constant RESOLVER_SET_ALIAS = 1 << 28;
    uint256 internal constant RESOLVER_SET_DATA = 1 << 36;
}
