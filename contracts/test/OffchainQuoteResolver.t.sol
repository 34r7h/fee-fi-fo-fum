// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import { Test } from "forge-std/Test.sol";
import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";
import { ECDSA } from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import { MessageHashUtils } from "@openzeppelin/contracts/utils/cryptography/MessageHashUtils.sol";
import { IERC165 } from "@openzeppelin/contracts/utils/introspection/IERC165.sol";
import { TakerTraitsLib } from "@1inch/swap-vm/src/libs/TakerTraits.sol";

import { OffchainQuoteResolver, IExtendedResolver } from "../src/OffchainQuoteResolver.sol";

interface ITextResolver {
    function text(bytes32 node, string calldata key) external view returns (string memory);
}

/// @dev Unit tests of the ERC-3668 resolver, plus the fixed vectors service/test/ccip-sign.test.mjs asserts too: the
///      gateway signature digest and signature, fi's EIP-712 Quote digest and signature, and takerTraitsAndData, each
///      computed here independently of the JS module.
contract OffchainQuoteResolverTest is Test {
    /// @dev PriceExtruction's Quote (docs/SPEC.md).
    struct Quote {
        bytes32 strategyHash;
        address tokenIn;
        address tokenOut;
        uint256 priceQ96;
        uint256 maxAmountIn;
        uint64 validUntil;
    }

    string internal constant URL = "https://handoff.lol/t/castle/ccip/{sender}/{data}.json";
    bytes internal constant DNS = hex"0571756f74650a6665656669666f66756d0365746800"; // quote.feefifofum.eth
    string internal constant KEY = "quote:USDC:WETH:1000000";
    uint64 internal constant EXPIRES = 1_790_440_030;
    address internal constant USDC = 0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238;
    address internal constant WETH = 0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14;
    /// @dev The address forge gives the first contract this test deploys; the JS vectors sign for it.
    address internal constant VECTOR_TARGET = 0x5615dEB798BB3E4dFa0139dFa1b3D433Cc23b72f;

    // ---- vectors shared with service/test/ccip-sign.test.mjs ----
    address internal constant V_SIGNER = 0xea38A102892bd4d043C3607B446925AE1A8b05E0;
    bytes32 internal constant V_SIGNATURE_HASH = 0xbad4f3282fe48ced2535f5bfea3faf65e6109f7e2fe247a66b7a6b9cc67a0644;
    bytes internal constant V_CCIP_SIG =
        hex"9b88390625e889db57c2ea99ca916e887663ed14cca47e2170cd0638b0b0a63b0a9d65d54594f3517357b51e775426f5e3c2a26c1a13633a34a38b969097795d1c";
    bytes32 internal constant V_QUOTE_DIGEST = 0x8c2c6ed041892effb2f1be92d2f29416f08e7d6f9a888bc06a31addee4949cbe;
    bytes internal constant V_QUOTE_SIG =
        hex"dd4896068ef9c416d93ba82dda744c5fa85fc278463db99c2c2c6731b6b2faeb17196342370ebffb51a2695b62f33146686ecc46f61c07de7c452d33dfbbb27c1c";
    uint256 internal constant V_AMOUNT_OUT = 375_000_000_000_000;
    bytes32 internal constant V_TAKER_TRAITS_HASH = 0x77546419742ba2c9f0a83eb73d3dec59c872f10d12627d7a1407ddf1e6b48667;

    OffchainQuoteResolver internal resolver;
    uint256 internal signerKey = uint256(keccak256("ccip-test-signer"));
    address internal signer;
    address internal owner = makeAddr("owner");

    function setUp() public {
        vm.warp(EXPIRES - 30);
        signer = vm.addr(signerKey);
        string[] memory urls = new string[](1);
        urls[0] = URL;
        address[] memory signers = new address[](1);
        signers[0] = signer;
        resolver = new OffchainQuoteResolver(urls, owner, signers);
    }

    // ------------------------------------------------------------------------------------------------
    // resolve: OffchainLookup
    // ------------------------------------------------------------------------------------------------

    function _textCall(string memory key) internal pure returns (bytes memory) {
        return abi.encodeCall(ITextResolver.text, (_node(), key));
    }

    function _node() internal pure returns (bytes32) {
        bytes32 n = keccak256(abi.encodePacked(bytes32(0), keccak256("eth")));
        n = keccak256(abi.encodePacked(n, keccak256("feefifofum")));
        return keccak256(abi.encodePacked(n, keccak256("quote")));
    }

    function _request(string memory key) internal pure returns (bytes memory) {
        return abi.encodeCall(IExtendedResolver.resolve, (DNS, _textCall(key)));
    }

    function test_resolve_revertsOffchainLookup() public {
        bytes memory callData = _request(KEY);
        string[] memory urls = new string[](1);
        urls[0] = URL;
        vm.expectRevert(
            abi.encodeWithSelector(
                OffchainQuoteResolver.OffchainLookup.selector,
                address(resolver),
                urls,
                callData,
                OffchainQuoteResolver.resolveWithProof.selector,
                callData
            )
        );
        resolver.resolve(DNS, _textCall(KEY));
    }

    function test_supportsInterface() public view {
        assertTrue(resolver.supportsInterface(0x9061b923));
        assertTrue(resolver.supportsInterface(type(IExtendedResolver).interfaceId));
        assertTrue(resolver.supportsInterface(type(IERC165).interfaceId));
        assertFalse(resolver.supportsInterface(0x59d1d43c)); // text(): not called directly; resolve() handles it
        assertFalse(resolver.supportsInterface(0xffffffff));
    }

    // ------------------------------------------------------------------------------------------------
    // resolveWithProof
    // ------------------------------------------------------------------------------------------------

    function _response(uint256 key, bytes memory request, bytes memory result, uint64 expires)
        internal
        view
        returns (bytes memory)
    {
        bytes32 h = resolver.makeSignatureHash(address(resolver), expires, request, result);
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(key, h);
        return abi.encode(result, expires, abi.encodePacked(r, s, v));
    }

    function test_resolveWithProof_returnsResult() public view {
        bytes memory request = _request(KEY);
        bytes memory result = abi.encode(string('{"v":1}'));
        bytes memory out = resolver.resolveWithProof(_response(signerKey, request, result, EXPIRES), request);
        assertEq(out, result);
        assertEq(abi.decode(out, (string)), '{"v":1}');
    }

    function test_resolveWithProof_atExpiry() public {
        bytes memory request = _request(KEY);
        bytes memory result = abi.encode(string("x"));
        bytes memory response = _response(signerKey, request, result, EXPIRES);
        vm.warp(EXPIRES);
        assertEq(resolver.resolveWithProof(response, request), result);
    }

    function test_resolveWithProof_revertsExpired() public {
        bytes memory request = _request(KEY);
        bytes memory response = _response(signerKey, request, abi.encode(string("x")), EXPIRES);
        vm.warp(EXPIRES + 1);
        vm.expectRevert(OffchainQuoteResolver.SignatureExpired.selector);
        resolver.resolveWithProof(response, request);
    }

    function test_resolveWithProof_revertsUntrustedSigner() public {
        uint256 otherKey = uint256(keccak256("not-fi"));
        bytes memory request = _request(KEY);
        bytes memory response = _response(otherKey, request, abi.encode(string("x")), EXPIRES);
        vm.expectRevert(abi.encodeWithSelector(OffchainQuoteResolver.InvalidSigner.selector, vm.addr(otherKey)));
        resolver.resolveWithProof(response, request);
    }

    /// @dev fi's answer to one key cannot be replayed as the answer to another: the request is under the signature.
    function test_resolveWithProof_revertsOtherRequest() public {
        bytes memory response = _response(signerKey, _request(KEY), abi.encode(string("x")), EXPIRES);
        bytes memory other = _request("quote:USDC:WETH:2000000");
        vm.expectPartialRevert(OffchainQuoteResolver.InvalidSigner.selector);
        resolver.resolveWithProof(response, other);
    }

    function test_resolveWithProof_revertsTamperedResult() public {
        bytes memory request = _request(KEY);
        bytes memory response = _response(signerKey, request, abi.encode(string("x")), EXPIRES);
        (, uint64 exp, bytes memory sig) = abi.decode(response, (bytes, uint64, bytes));
        bytes memory tampered = abi.encode(abi.encode(string("y")), exp, sig);
        vm.expectPartialRevert(OffchainQuoteResolver.InvalidSigner.selector);
        resolver.resolveWithProof(tampered, request);
    }

    /// @dev A signature for another resolver (another target) does not verify here.
    function test_resolveWithProof_revertsOtherTarget() public {
        bytes memory request = _request(KEY);
        bytes memory result = abi.encode(string("x"));
        bytes32 h = resolver.makeSignatureHash(makeAddr("elsewhere"), EXPIRES, request, result);
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(signerKey, h);
        vm.expectPartialRevert(OffchainQuoteResolver.InvalidSigner.selector);
        resolver.resolveWithProof(abi.encode(result, EXPIRES, abi.encodePacked(r, s, v)), request);
    }

    function test_resolveWithProof_revertsMalformedSig() public {
        bytes memory request = _request(KEY);
        vm.expectRevert(abi.encodeWithSelector(ECDSA.ECDSAInvalidSignatureLength.selector, 3));
        resolver.resolveWithProof(abi.encode(abi.encode(string("x")), EXPIRES, hex"010203"), request);
    }

    function test_resolveWithProof_revokedSigner() public {
        address[] memory accounts = new address[](1);
        accounts[0] = signer;
        vm.prank(owner);
        resolver.setSigners(accounts, false);
        bytes memory request = _request(KEY);
        bytes memory response = _response(signerKey, request, abi.encode(string("x")), EXPIRES);
        vm.expectRevert(abi.encodeWithSelector(OffchainQuoteResolver.InvalidSigner.selector, signer));
        resolver.resolveWithProof(response, request);
    }

    function testFuzz_resolveWithProof_roundTrip(bytes calldata result, uint64 ttl, string calldata key) public view {
        uint64 expires = uint64(bound(ttl, block.timestamp, type(uint64).max));
        bytes memory request = _request(key);
        assertEq(resolver.resolveWithProof(_response(signerKey, request, result, expires), request), result);
    }

    // ------------------------------------------------------------------------------------------------
    // Owner
    // ------------------------------------------------------------------------------------------------

    function test_constructor_state() public view {
        assertEq(resolver.owner(), owner);
        assertTrue(resolver.signers(signer));
        string[] memory u = resolver.urls();
        assertEq(u.length, 1);
        assertEq(u[0], URL);
    }

    function test_constructor_revertsNoUrls() public {
        vm.expectRevert(OffchainQuoteResolver.NoUrls.selector);
        new OffchainQuoteResolver(new string[](0), owner, new address[](0));
    }

    function test_constructor_revertsZeroSigner() public {
        string[] memory urls = new string[](1);
        urls[0] = URL;
        vm.expectRevert(OffchainQuoteResolver.ZeroAddress.selector);
        new OffchainQuoteResolver(urls, owner, new address[](1));
    }

    function test_setUrls() public {
        string[] memory urls = new string[](2);
        urls[0] = "http://127.0.0.1:8787/ccip/{sender}/{data}.json";
        urls[1] = URL;
        vm.expectEmit(address(resolver));
        emit OffchainQuoteResolver.UrlsSet(urls);
        vm.prank(owner);
        resolver.setUrls(urls);
        assertEq(resolver.urls()[0], urls[0]);
        assertEq(resolver.urls().length, 2);
    }

    function test_setUrls_revertsEmpty() public {
        vm.prank(owner);
        vm.expectRevert(OffchainQuoteResolver.NoUrls.selector);
        resolver.setUrls(new string[](0));
    }

    function test_setUrls_onlyOwner() public {
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, address(this)));
        resolver.setUrls(new string[](1));
    }

    function test_setSigners() public {
        address[] memory accounts = new address[](2);
        accounts[0] = makeAddr("fi2");
        accounts[1] = makeAddr("fi3");
        vm.expectEmit(address(resolver));
        emit OffchainQuoteResolver.SignerSet(accounts[0], true);
        vm.expectEmit(address(resolver));
        emit OffchainQuoteResolver.SignerSet(accounts[1], true);
        vm.prank(owner);
        resolver.setSigners(accounts, true);
        assertTrue(resolver.signers(accounts[0]));
        assertTrue(resolver.signers(accounts[1]));
        vm.prank(owner);
        resolver.setSigners(accounts, false);
        assertFalse(resolver.signers(accounts[0]));
    }

    function test_setSigners_revertsZero() public {
        vm.prank(owner);
        vm.expectRevert(OffchainQuoteResolver.ZeroAddress.selector);
        resolver.setSigners(new address[](1), true);
    }

    function test_setSigners_onlyOwner() public {
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, address(this)));
        resolver.setSigners(new address[](1), true);
    }

    function test_ownership_twoStep() public {
        address next = makeAddr("next");
        vm.prank(owner);
        resolver.transferOwnership(next);
        assertEq(resolver.owner(), owner);
        vm.prank(next);
        resolver.acceptOwnership();
        assertEq(resolver.owner(), next);
    }

    // ------------------------------------------------------------------------------------------------
    // Vectors shared with the JS module
    // ------------------------------------------------------------------------------------------------

    function testVectors_gatewaySignature() public view {
        assertEq(address(resolver), VECTOR_TARGET, "deploy address drifted; the JS vectors sign for VECTOR_TARGET");
        assertEq(signer, V_SIGNER);
        bytes memory request = _request(KEY);
        bytes memory result = abi.encode(string("hello"));
        bytes32 h = resolver.makeSignatureHash(VECTOR_TARGET, EXPIRES, request, result);
        assertEq(h, V_SIGNATURE_HASH);
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(signerKey, h);
        assertEq(abi.encodePacked(r, s, v), V_CCIP_SIG);
        // and the JS signature verifies on-chain
        assertEq(resolver.resolveWithProof(abi.encode(result, EXPIRES, V_CCIP_SIG), request), result);
    }

    function _quote() internal pure returns (Quote memory) {
        return Quote({
            strategyHash: keccak256("harp"),
            tokenIn: USDC,
            tokenOut: WETH,
            priceQ96: 29_710_560_942_849_126_597_578_981_379_000_000_000,
            maxAmountIn: 1_000_000_000_000,
            validUntil: EXPIRES
        });
    }

    function testVectors_quote() public pure {
        Quote memory q = _quote();
        bytes32 typeHash = keccak256(
            "Quote(bytes32 strategyHash,address tokenIn,address tokenOut,uint256 priceQ96,uint256 maxAmountIn,uint64 validUntil)"
        );
        bytes32 domain = keccak256(
            abi.encode(
                keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"),
                keccak256("feefifofum PriceExtruction"),
                keccak256("1"),
                uint256(11_155_111),
                address(0xE7)
            )
        );
        bytes32 digest = MessageHashUtils.toTypedDataHash(
            domain,
            keccak256(
                abi.encode(typeHash, q.strategyHash, q.tokenIn, q.tokenOut, q.priceQ96, q.maxAmountIn, q.validUntil)
            )
        );
        assertEq(digest, V_QUOTE_DIGEST);
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(uint256(keccak256("ccip-test-signer")), digest);
        assertEq(abi.encodePacked(r, s, v), V_QUOTE_SIG);
        assertEq(ECDSA.recover(digest, V_QUOTE_SIG), V_SIGNER);
        assertEq(1_000_000 * q.priceQ96 >> 96, V_AMOUNT_OUT);
    }

    function testVectors_takerTraitsAndData() public pure {
        bytes memory built = TakerTraitsLib.build(
            TakerTraitsLib.Args({
                taker: address(0),
                isExactIn: true,
                shouldUnwrapWeth: false,
                isStrictThresholdAmount: false,
                isFirstTransferFromTaker: false,
                useTransferFromAndAquaPush: true,
                threshold: abi.encodePacked(V_AMOUNT_OUT),
                to: address(0),
                deadline: 0,
                hasPreTransferInCallback: false,
                hasPreTransferOutCallback: false,
                preTransferInHookData: "",
                postTransferInHookData: "",
                preTransferOutHookData: "",
                postTransferOutHookData: "",
                preTransferInCallbackData: "",
                preTransferOutCallbackData: "",
                instructionsArgs: abi.encode(_quote(), V_QUOTE_SIG),
                signature: ""
            })
        );
        assertEq(keccak256(built), V_TAKER_TRAITS_HASH);
    }
}
