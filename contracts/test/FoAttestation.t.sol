// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { Test } from "forge-std/Test.sol";
import { ECDSA } from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import { ICastleLease, CastleLeaseTypes } from "../src/interfaces/ICastleLease.sol";

contract FoAttestationTest is Test {
    using ECDSA for bytes32;

    uint256 internal foPrivateKey = 0xA11CE;
    address internal fo;

    function setUp() public {
        fo = vm.addr(foPrivateKey);
    }

    function test_viemSignatureMatchesSolidity() public view {
        address castle = address(0x0000000000000000000000000000000000CA571E);
        uint256 epoch = 1;
        uint64 expiry = 120;
        uint64 deadline = 60;

        bytes32 domainSeparator = keccak256(
            abi.encode(
                keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"),
                keccak256(bytes(CastleLeaseTypes.NAME)),
                keccak256(bytes(CastleLeaseTypes.VERSION)),
                31337,
                castle
            )
        );

        bytes32 structHash = keccak256(
            abi.encode(
                CastleLeaseTypes.ATTESTATION_TYPEHASH,
                epoch,
                expiry,
                deadline
            )
        );

        bytes32 digest = keccak256(abi.encodePacked("\x19\x01", domainSeparator, structHash));

        bytes memory viemSig = hex"1594cdddf81d78e9b8e22de6e744716a2eefa5c8a2626d90c2cfa6006f80defc438be493e39b025d68b5b58498a94d4bd5c0ef8783f1ad25b7b39a2de4be62631c";
        address recovered = digest.recover(viemSig);
        assertEq(recovered, fo);
    }
}
