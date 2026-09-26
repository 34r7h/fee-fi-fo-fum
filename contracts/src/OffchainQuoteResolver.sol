// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import { Ownable, Ownable2Step } from "@openzeppelin/contracts/access/Ownable2Step.sol";
import { ECDSA } from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import { IERC165 } from "@openzeppelin/contracts/utils/introspection/IERC165.sol";

/// @notice ENSIP-10 wildcard resolution (interface id 0x9061b923).
interface IExtendedResolver {
    function resolve(bytes calldata name, bytes calldata data) external view returns (bytes memory);
}

/// @title OffchainQuoteResolver, the harp's voice
/// @notice The ERC-3668 resolver of quote.feefifofum.eth. Every record lookup reverts OffchainLookup to the castle
///         gateway, which answers with fi's live quote; the callback accepts the answer only if a signer the owner
///         trusts (fi) signed it and it has not expired.
/// @dev The gateway response and its signature follow ensdomains/offchain-resolver's SignatureVerifier, so its
///      gateway tooling and any client that speaks it work unchanged:
///        response = abi.encode(bytes result, uint64 expires, bytes sig)
///        sig      = sign(keccak256(abi.encodePacked(hex"1900", resolver, expires, keccak256(request),
///                   keccak256(result))))  (EIP-191 version 0: a raw digest signature, validator = this resolver)
///        request  = the OffchainLookup callData, abi.encodeCall(IExtendedResolver.resolve, (name, data)): the exact
///                   bytes the gateway received as {data}, passed back to the callback as extraData
///      `result` is the ABI-encoded return of the record call in `data`: for text(node, "quote:USDC:WETH:1000000") it
///      is abi.encode(string), one JSON line holding the SwapVM order and fi's EIP-712 Quote (docs/SPEC.md).
///      UniversalResolverV2 only surfaces OffchainLookup for a resolver that advertises IExtendedResolver.
///      The resolver never reads records itself. What a quote says (strategy, price, size, validUntil, fi's EIP-712
///      signature) is between the gateway and the solver, and PriceExtruction re-checks it at fill time. This
///      signature only proves the gateway's answer came from a trusted signer and is fresh.
contract OffchainQuoteResolver is IExtendedResolver, IERC165, Ownable2Step {
    /// @notice ERC-3668: the client must call a gateway in `urls` and pass its answer to `callbackFunction`.
    error OffchainLookup(address sender, string[] urls, bytes callData, bytes4 callbackFunction, bytes extraData);
    error SignatureExpired();
    error InvalidSigner(address signer);
    error NoUrls();
    error ZeroAddress();

    event UrlsSet(string[] urls);
    event SignerSet(address indexed signer, bool trusted);

    /// @dev Gateway URL templates (ERC-3668: the client fills in {sender} and {data}; with {data} it is a GET).
    string[] internal _urls;
    /// @notice Keys whose gateway answers the callback accepts (fi).
    mapping(address signer => bool) public signers;

    /// @param urls_    gateway URL templates, e.g. https://handoff.lol/t/castle/ccip/{sender}/{data}.json
    /// @param owner_   may change the gateway URLs and the signer set
    /// @param signers_ trusted gateway signers (fi)
    constructor(string[] memory urls_, address owner_, address[] memory signers_) Ownable(owner_) {
        _setUrls(urls_);
        for (uint256 i; i < signers_.length; ++i) {
            _setSigner(signers_[i], true);
        }
    }

    /// @notice ENSIP-10 resolve: always defers to the gateway (ERC-3668 OffchainLookup).
    /// @param name DNS-encoded name being resolved (quote.feefifofum.eth)
    /// @param data the record call, e.g. abi.encodeCall(text, (node, "quote:USDC:WETH:1000000"))
    function resolve(bytes calldata name, bytes calldata data) external view returns (bytes memory) {
        bytes memory callData = abi.encodeCall(IExtendedResolver.resolve, (name, data));
        revert OffchainLookup(address(this), _urls, callData, this.resolveWithProof.selector, callData);
    }

    /// @notice ERC-3668 callback: checks the gateway's signature and expiry and returns the record's result.
    /// @param response  abi.encode(bytes result, uint64 expires, bytes sig) from the gateway
    /// @param extraData the OffchainLookup extraData, which is its callData: the request the gateway signed over
    /// @return result the ABI-encoded return value of the record call
    function resolveWithProof(bytes calldata response, bytes calldata extraData)
        external
        view
        returns (bytes memory result)
    {
        uint64 expires;
        bytes memory sig;
        (result, expires, sig) = abi.decode(response, (bytes, uint64, bytes));
        if (expires < block.timestamp) revert SignatureExpired();
        address signer = ECDSA.recover(makeSignatureHash(address(this), expires, extraData, result), sig);
        if (!signers[signer]) revert InvalidSigner(signer);
    }

    /// @notice The digest the gateway signs: SignatureVerifier.makeSignatureHash of ensdomains/offchain-resolver.
    function makeSignatureHash(address target, uint64 expires, bytes memory request, bytes memory result)
        public
        pure
        returns (bytes32)
    {
        return keccak256(abi.encodePacked(hex"1900", target, expires, keccak256(request), keccak256(result)));
    }

    /// @notice The gateway URL templates.
    function urls() external view returns (string[] memory) {
        return _urls;
    }

    function supportsInterface(bytes4 interfaceId) external pure returns (bool) {
        return interfaceId == type(IExtendedResolver).interfaceId || interfaceId == type(IERC165).interfaceId;
    }

    // ------------------------------------------------------------------------------------------------
    // Owner
    // ------------------------------------------------------------------------------------------------

    function setUrls(string[] calldata urls_) external onlyOwner {
        _setUrls(urls_);
    }

    /// @notice Trust (or stop trusting) each of `accounts` as a gateway signer.
    function setSigners(address[] calldata accounts, bool trusted) external onlyOwner {
        for (uint256 i; i < accounts.length; ++i) {
            _setSigner(accounts[i], trusted);
        }
    }

    function _setUrls(string[] memory urls_) internal {
        if (urls_.length == 0) revert NoUrls();
        _urls = urls_;
        emit UrlsSet(urls_);
    }

    function _setSigner(address account, bool trusted) internal {
        if (account == address(0)) revert ZeroAddress();
        signers[account] = trusted;
        emit SignerSet(account, trusted);
    }
}
