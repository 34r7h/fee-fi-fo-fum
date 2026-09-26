// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";

interface IReg {
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

interface IExtendedResolver {
    function resolve(bytes memory name, bytes memory data) external view returns (bytes memory);
}

/// @dev ERC-165 + ENSIP-10. resolve() always reverts OffchainLookup. text() does too.
contract OffchainResolver {
    error OffchainLookup(address sender, string[] urls, bytes callData, bytes4 callbackFunction, bytes extraData);

    function supportsInterface(bytes4 id) external pure returns (bool) {
        return id == 0x01ffc9a7 || id == type(IExtendedResolver).interfaceId || id == bytes4(0x59d1d43c);
    }

    function resolve(bytes calldata name, bytes calldata data) external view returns (bytes memory) {
        _off(name, data);
    }

    function text(bytes32 node, string calldata key) external view returns (string memory) {
        _off(abi.encodePacked(node), abi.encode(key));
    }

    function callback(bytes calldata response, bytes calldata) external pure returns (bytes memory) {
        return response;
    }

    function _off(bytes memory name, bytes memory data) internal view {
        string[] memory urls = new string[](1);
        urls[0] = "https://ccip.invalid/{sender}/{data}.json";
        revert OffchainLookup(address(this), urls, abi.encode(name, data), this.callback.selector, "");
    }
}

contract QuoteProbeTest is Test {
    address constant REG = 0x2F2164507471a1a46506f902aBfdfB9d22e4bE09;
    address constant WHO = 0x67Cc96887d3FFC0860Ebb25412c113f3cad80C99;
    address constant UR = 0x5d25C1D6aCBb71B7a28AA7899618a3412a8303e3;
    bytes4 constant OFFCHAIN = 0x556f1830;

    function test_registerQuoteAndFollowOffchainLookup() public {
        vm.createSelectFork(vm.rpcUrl("sepolia"));
        emit log_named_uint("block", block.number);
        emit log_named_string("REGISTRAR", IReg(REG).hasRootRoles(1, WHO) ? "true" : "false");

        uint256 labelId = uint256(keccak256("quote"));
        OffchainResolver resolver = new OffchainResolver();
        emit log_named_address("deployed resolver", address(resolver));
        emit log_named_bytes32("IExtendedResolver id", bytes32(type(IExtendedResolver).interfaceId));

        vm.prank(WHO);
        uint256 tokenId =
            IReg(REG).register("quote", WHO, address(0), address(resolver), 0, uint64(block.timestamp + 365 days));
        emit log_named_uint("tokenId", tokenId);
        emit log_named_address("owner", IReg(REG).getOwner(labelId));
        address stored = IReg(REG).getResolver("quote");
        emit log_named_address("getResolver", stored);
        emit log_named_string("resolver stored", stored == address(resolver) ? "yes" : "no");

        bytes memory name = abi.encodePacked(
            bytes1(uint8(5)), "quote", bytes1(uint8(10)), "feefifofum", bytes1(uint8(3)), "eth", bytes1(0)
        );
        bytes memory textData = abi.encodeWithSelector(bytes4(0x59d1d43c), bytes32(0), "description");
        (bool ok, bytes memory ret) = UR.staticcall(abi.encodeWithSignature("resolve(bytes,bytes)", name, textData));
        emit log_named_string("ur text ok", ok ? "true" : "false");
        bytes4 sel;
        if (ret.length >= 4) {
            assembly { sel := mload(add(ret, 32)) }
        }
        emit log_named_bytes32("ur selector", bytes32(sel));
        emit log_named_string("ur is OffchainLookup", sel == OFFCHAIN ? "true" : "false");
        if (sel == OFFCHAIN && ret.length >= 36) {
            address sender;
            assembly { sender := mload(add(ret, 36)) }
            emit log_named_address("offchain sender", sender);
        }
        emit log_named_uint("ur ret len", ret.length);
    }
}
