// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import { AquaOpcodes } from "@1inch/swap-vm/src/opcodes/AquaOpcodes.sol";
import { XYCSwap } from "@1inch/swap-vm/src/instructions/XYCSwap.sol";
import { Fee, FeeArgsBuilder } from "@1inch/swap-vm/src/instructions/Fee.sol";
import { Controls, ControlsArgsBuilder } from "@1inch/swap-vm/src/instructions/Controls.sol";
import { Extruction } from "@1inch/swap-vm/src/instructions/Extruction.sol";
import { Program, ProgramBuilder } from "@1inch/swap-vm/test/utils/ProgramBuilder.sol";

/// @dev Builds SwapVM programs with 1inch's own ProgramBuilder over the SAME opcode table the AquaSwapVMRouter
///      executes, standing in for fi's compiler. The salt builder checks the vault's hard-coded Salt opcode.
contract VaultPrograms is AquaOpcodes {
    using ProgramBuilder for Program;

    constructor() AquaOpcodes(address(0)) { }

    /// @notice Constant product over the strategy's own Aqua balances, with a flat fee on amountIn (1e9 = 100%).
    function xyc(uint32 feeBps) external pure returns (bytes memory) {
        Program memory p = ProgramBuilder.init(_opcodes());
        return bytes.concat(
            p.build(Fee._flatFeeAmountInXD, FeeArgsBuilder.buildFlatFee(feeBps)), p.build(XYCSwap._xycSwapXD)
        );
    }

    /// @notice 'harp', the RFQ: the price comes from fi's signed quote through PriceExtruction.
    function harp(address priceExtruction) external pure returns (bytes memory) {
        Program memory p = ProgramBuilder.init(_opcodes());
        return p.build(Extruction._extruction, abi.encodePacked(priceExtruction));
    }

    function salt(uint64 nonce) external pure returns (bytes memory) {
        Program memory p = ProgramBuilder.init(_opcodes());
        return p.build(Controls._salt, ControlsArgsBuilder.buildSalt(nonce));
    }
}
