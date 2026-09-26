// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import { Test } from "forge-std/Test.sol";

import { OffchainQuoteResolver, IExtendedResolver } from "../../src/OffchainQuoteResolver.sol";

interface IQuoteRegistry {
    function register(
        string calldata label,
        address owner,
        address registry,
        address resolver,
        uint256 roleBitmap,
        uint64 expiry
    ) external returns (uint256 tokenId);

    function getOwner(uint256 anyId) external view returns (address);
    function getResolver(string calldata label) external view returns (address);
    function hasRootRoles(uint256 roleBitmap, address account) external view returns (bool);
}

interface IUniversalResolverV2 {
    function findResolver(bytes calldata name) external view returns (address, bytes32, uint256);
    function resolve(bytes calldata name, bytes calldata data) external view returns (bytes memory, address);
}

interface ITextResolver {
    function text(bytes32 node, string calldata key) external view returns (string memory);
}

/// @title OffchainQuoteResolverForkTest
/// @notice quote.feefifofum.eth against LIVE Sepolia ENSv2 at a pinned block: the registrar 0x67Cc registers "quote"
///         on the feefifofum subregistry with the OffchainQuoteResolver in ONE register() call (docs/SPEC.md,
///         research gate), UniversalResolverV2 finds that resolver and surfaces its OffchainLookup, and fi's gateway
///         answer verifies in the callback. The full client round trip (viem getEnsText through the UR, against a
///         local gateway) is contracts/scripts/ccip/quote-fork.mjs.
/// @dev forge test --match-path test/fork/OffchainQuoteResolverFork.t.sol
///      SEPOLIA_ARCHIVE_RPC_URL overrides the RPC; FORK_BLOCK overrides the pinned block.
contract OffchainQuoteResolverForkTest is Test {
    address internal constant REGISTRY = 0x2F2164507471a1a46506f902aBfdfB9d22e4bE09;
    address internal constant REGISTRAR = 0x67Cc96887d3FFC0860Ebb25412c113f3cad80C99;
    address internal constant UR = 0x5d25C1D6aCBb71B7a28AA7899618a3412a8303e3;
    address internal constant FI = 0xB6eA66c2bE639820DFE546f49DF0349Cf27440b2;
    address internal constant OWNER = 0xc3Af4CCa3ba691C74F18fa8D3a7ad6816eC65dF2;
    uint256 internal constant ROLE_REGISTRAR = 1;
    uint256 internal constant PINNED_BLOCK = 11_785_871;
    bytes4 internal constant OFFCHAIN_LOOKUP = 0x556f1830;
    string internal constant URL = "https://handoff.lol/t/castle/ccip/{sender}/{data}.json";
    bytes internal constant DNS = hex"0571756f74650a6665656669666f66756d0365746800"; // quote.feefifofum.eth
    string internal constant KEY = "quote:USDC:WETH:1000000";

    OffchainQuoteResolver internal resolver;
    uint256 internal gatewayKey = uint256(keccak256("fork-gateway-signer")); // stands in for fi's key
    address internal gateway;

    function setUp() public {
        string memory rpc = vm.envOr("SEPOLIA_ARCHIVE_RPC_URL", string("https://sepolia.gateway.tenderly.co"));
        vm.createSelectFork(rpc, vm.envOr("FORK_BLOCK", PINNED_BLOCK));
        gateway = vm.addr(gatewayKey);
        string[] memory urls = new string[](1);
        urls[0] = URL;
        address[] memory signers = new address[](2);
        (signers[0], signers[1]) = (FI, gateway);
        resolver = new OffchainQuoteResolver(urls, OWNER, signers);
    }

    function _node() internal pure returns (bytes32) {
        bytes32 n = keccak256(abi.encodePacked(bytes32(0), keccak256("eth")));
        n = keccak256(abi.encodePacked(n, keccak256("feefifofum")));
        return keccak256(abi.encodePacked(n, keccak256("quote")));
    }

    function _register() internal returns (uint256 tokenId, uint256 gasUsed) {
        assertTrue(IQuoteRegistry(REGISTRY).hasRootRoles(ROLE_REGISTRAR, REGISTRAR), "0x67Cc lost ROLE_REGISTRAR");
        vm.prank(REGISTRAR);
        uint256 g = gasleft();
        tokenId = IQuoteRegistry(REGISTRY)
            .register("quote", REGISTRAR, address(0), address(resolver), 0, uint64(block.timestamp + 365 days));
        gasUsed = g - gasleft();
    }

    function test_fork_registerQuoteInOneCall() public {
        uint256 labelId = uint256(keccak256("quote"));
        assertEq(IQuoteRegistry(REGISTRY).getOwner(labelId), address(0), "quote already taken at this block");
        (uint256 tokenId, uint256 gasUsed) = _register();
        emit log_named_uint("fork block", block.number);
        emit log_named_uint("register(quote) gas", gasUsed);
        emit log_named_uint("tokenId", tokenId);
        assertEq(IQuoteRegistry(REGISTRY).getOwner(labelId), REGISTRAR);
        assertEq(IQuoteRegistry(REGISTRY).getResolver("quote"), address(resolver));
        (address found,,) = IUniversalResolverV2(UR).findResolver(DNS);
        assertEq(found, address(resolver), "UR does not find the quote resolver");
    }

    /// @dev The UR surfaces an OffchainLookup for text(quote.feefifofum.eth, KEY) once the resolver is registered.
    function test_fork_universalResolverRevertsOffchainLookup() public {
        _register();
        bytes memory data = abi.encodeCall(ITextResolver.text, (_node(), KEY));
        (bool ok, bytes memory ret) = UR.staticcall(abi.encodeCall(IUniversalResolverV2.resolve, (DNS, data)));
        assertFalse(ok);
        assertEq(bytes4(ret), OFFCHAIN_LOOKUP, "UR did not revert OffchainLookup");
        address sender;
        assembly ("memory-safe") {
            sender := mload(add(ret, 36))
        }
        emit log_named_address("UR OffchainLookup sender", sender);
        emit log_named_uint("UR OffchainLookup bytes", ret.length);
        assertEq(sender, UR, "the UR wraps the lookup as its own sender");
    }

    /// @dev What the gateway sees and signs, and what the callback accepts, with the deployed resolver as target.
    function test_fork_callbackAcceptsGatewayAnswer() public {
        _register();
        bytes memory data = abi.encodeCall(ITextResolver.text, (_node(), KEY));
        bytes memory callData = abi.encodeCall(IExtendedResolver.resolve, (DNS, data));
        try resolver.resolve(DNS, data) {
            fail();
        } catch (bytes memory err) {
            assertEq(bytes4(err), OffchainQuoteResolver.OffchainLookup.selector);
            (address sender, string[] memory urls, bytes memory cd, bytes4 cb, bytes memory extra) =
                abi.decode(_tail(err), (address, string[], bytes, bytes4, bytes));
            assertEq(sender, address(resolver));
            assertEq(urls[0], URL);
            assertEq(cd, callData);
            assertEq(cb, OffchainQuoteResolver.resolveWithProof.selector);
            assertEq(extra, callData);
        }
        bytes memory result = abi.encode(string('{"v":1,"id":"q-fork"}'));
        uint64 expires = uint64(block.timestamp + 30);
        (uint8 v, bytes32 r, bytes32 s) =
            vm.sign(gatewayKey, resolver.makeSignatureHash(address(resolver), expires, callData, result));
        bytes memory response = abi.encode(result, expires, abi.encodePacked(r, s, v));
        assertEq(resolver.resolveWithProof(response, callData), result);
        vm.warp(block.timestamp + 31);
        vm.expectRevert(OffchainQuoteResolver.SignatureExpired.selector);
        resolver.resolveWithProof(response, callData);
    }

    function _tail(bytes memory err) internal pure returns (bytes memory t) {
        t = new bytes(err.length - 4);
        for (uint256 i; i < t.length; ++i) {
            t[i] = err[i + 4];
        }
    }
}
