// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import { Test } from "forge-std/Test.sol";
import { Math } from "@openzeppelin/contracts/utils/math/Math.sol";
import { AquaOpcodes } from "@1inch/swap-vm/src/opcodes/AquaOpcodes.sol";
import { TakerTraitsLib } from "@1inch/swap-vm/src/libs/TakerTraits.sol";
import { XYCSwap } from "@1inch/swap-vm/src/instructions/XYCSwap.sol";
import { XYCConcentrate, XYCConcentrateArgsBuilder } from "@1inch/swap-vm/src/instructions/XYCConcentrate.sol";
import { Decay, DecayArgsBuilder } from "@1inch/swap-vm/src/instructions/Decay.sol";
import { Fee, FeeArgsBuilder } from "@1inch/swap-vm/src/instructions/Fee.sol";
import { Controls, ControlsArgsBuilder } from "@1inch/swap-vm/src/instructions/Controls.sol";
import { Extruction } from "@1inch/swap-vm/src/instructions/Extruction.sol";
import { Program, ProgramBuilder } from "@1inch/swap-vm/test/utils/ProgramBuilder.sol";

import { ICastleLease } from "../../src/interfaces/ICastleLease.sol";

/// @dev Rebuilds Castle's program with 1inch's own ProgramBuilder and the SAME opcode table the AquaSwapVMRouter
///      executes, so a drifted opcode index or offset in Castle shows up as a byte mismatch.
contract ProgramMirror is AquaOpcodes {
    using ProgramBuilder for Program;

    struct Spec {
        address fence;
        uint256 epoch;
        address usdc;
        uint16 decayPeriod;
        uint256 sqrtMin;
        uint256 sqrtMax;
        uint32 feeBps;
        uint32 windDownFeeBps;
        uint64 nonce;
    }

    constructor() AquaOpcodes(address(0)) { }

    function fenced(Spec calldata s) external pure returns (bytes memory) {
        Program memory p = ProgramBuilder.init(_opcodes());
        bytes memory conc = p.build(
            XYCConcentrate._xycConcentrateGrowLiquidity2D, XYCConcentrateArgsBuilder.build2D(s.sqrtMin, s.sqrtMax)
        );
        bytes memory swap = p.build(XYCSwap._xycSwapXD);
        bytes memory decay = p.build(Decay._decayXD, DecayArgsBuilder.build(s.decayPeriod));
        bytes memory live =
            bytes.concat(decay, conc, p.build(Fee._flatFeeAmountInXD, FeeArgsBuilder.buildFlatFee(s.feeBps)), swap);
        bytes memory windDown = bytes.concat(
            decay, conc, p.build(Fee._flatFeeAmountInXD, FeeArgsBuilder.buildFlatFee(s.windDownFeeBps)), swap
        );
        bytes memory salt = p.build(Controls._salt, ControlsArgsBuilder.buildSalt(s.nonce));
        uint256 fenceLen = p.build(Extruction._extruction, abi.encodePacked(s.fence, s.epoch, uint16(0), s.usdc)).length;
        uint256 jumpLen = p.build(Controls._jump, ControlsArgsBuilder.buildJump(0)).length;
        uint16 w = uint16(fenceLen + live.length + jumpLen);
        uint16 end = uint16(w + windDown.length + salt.length);
        return bytes.concat(
            p.build(Extruction._extruction, abi.encodePacked(s.fence, s.epoch, w, s.usdc)),
            live,
            p.build(Controls._jump, ControlsArgsBuilder.buildJump(end)),
            windDown,
            salt
        );
    }
}

abstract contract CastleHelpers is Test {
    uint256 internal constant Q96 = 1 << 96;
    /// @dev 3,000 USDC per WETH in raw units, Q96.
    uint256 internal constant ANCHOR_Q96 = 3000e6 * Q96 / 1e18;

    function _dns(string memory l) internal pure returns (bytes memory) {
        return abi.encodePacked(uint8(bytes(l).length), l, uint8(10), "feefifofum", uint8(3), "eth", uint8(0));
    }

    function _takerData(address taker, bool exactIn) internal pure returns (bytes memory) {
        return _takerData(taker, exactIn, "");
    }

    /// @param instructionsArgs what the program's instructions may consume: the fence takes a heartbeat first
    function _takerData(address taker, bool exactIn, bytes memory instructionsArgs)
        internal
        pure
        returns (bytes memory)
    {
        return TakerTraitsLib.build(
            TakerTraitsLib.Args({
                taker: taker,
                isExactIn: exactIn,
                shouldUnwrapWeth: false,
                isStrictThresholdAmount: false,
                isFirstTransferFromTaker: false,
                useTransferFromAndAquaPush: true,
                threshold: "",
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
                instructionsArgs: instructionsArgs,
                signature: ""
            })
        );
    }

    function _sign(ICastleLease castle, uint256 key, uint256 ep, uint64 exp, uint64 deadline)
        internal
        view
        returns (bytes memory)
    {
        bytes32 digest = castle.attestationDigest(ICastleLease.Attestation(ep, exp, deadline));
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(key, digest);
        return abi.encodePacked(r, s, v);
    }

    /// @dev A v3 heartbeat as the castle service publishes it: validUntil | holder signature | fo signature.
    function _heartbeat(ICastleLease castle, uint256 holderKey, uint256 foKey_, uint256 ep, uint64 validUntil)
        internal
        view
        returns (bytes memory)
    {
        bytes32 digest = castle.heartbeatDigest(ep, validUntil);
        return abi.encodePacked(validUntil, _sig(holderKey, digest), _sig(foKey_, digest));
    }

    function _sig(uint256 key, bytes32 digest) internal pure returns (bytes memory) {
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(key, digest);
        return abi.encodePacked(r, s, v);
    }

    /// @dev The band Castle should compute, derived here independently of Castle's code path.
    function _band(uint256 anchorQ96, uint32 rangeBps, bool usdcIsLt)
        internal
        pure
        returns (uint256 sqrtP, uint256 sqrtMin, uint256 sqrtMax)
    {
        sqrtP = usdcIsLt ? Math.sqrt(Math.mulDiv(Q96, 1e36, anchorQ96)) : Math.sqrt(Math.mulDiv(anchorQ96, 1e36, Q96));
        uint256 f = Math.sqrt((1e9 + uint256(rangeBps)) * 1e27);
        (sqrtMin, sqrtMax) = (Math.mulDiv(sqrtP, 1e18, f), Math.mulDiv(sqrtP, f, 1e18));
    }
}
