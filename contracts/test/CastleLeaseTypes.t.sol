// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { Test } from "forge-std/Test.sol";
import { ICastleLease, CastleLeaseTypes } from "../src/interfaces/ICastleLease.sol";
import { MockCastleLease } from "./mocks/MockCastleLease.sol";

contract CastleLeaseTypesTest is Test {
    function test_attestationTypehash() public pure {
        assertEq(
            CastleLeaseTypes.ATTESTATION_TYPEHASH,
            keccak256("Attestation(uint256 epoch,uint64 expiry,uint64 deadline)")
        );
    }

    function test_mockViews() public {
        MockCastleLease lease = new MockCastleLease();
        lease.set(address(0xFEE), 7, uint64(block.timestamp + 120));
        ICastleLease l = ICastleLease(address(lease));
        assertEq(l.holder(), address(0xFEE));
        assertEq(l.epoch(), 7);
        assertTrue(l.isLive());
        vm.warp(block.timestamp + 120);
        assertFalse(l.isLive());
    }
}
