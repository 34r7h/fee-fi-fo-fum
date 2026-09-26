// fi's SwapVM compiler: the programs CastleVault ships (docs/SPEC.md "The two strategies").
//
// A program is a list of instructions, each `opcode (1 byte) | args length (1 byte) | args`, as 1inch's
// ProgramBuilder encodes them. Opcodes are indexes into the AquaSwapVMRouter 1.0.2 opcode table
// (swap-vm src/opcodes/AquaOpcodes.sol): XYCSwap 17, Salt 20, flatFeeAmountIn 21, Extruction 32. The vault appends
// its own Salt(nonce), so fi never adds one.
//   harp   Extruction(PriceExtruction): the price is fi's signed quote, carried in the taker's data
//   hen    flatFeeAmountIn(feeBps) then XYCSwap: a constant-product curve over the strategy's own Aqua balances
import { concat, getAddress, toHex, pad, sliceHex, hexToNumber } from 'viem';

export const OP = { XYC_SWAP: 17, SALT: 20, FLAT_FEE_IN: 21, EXTRUCTION: 32 };
const FEE_ONE = 1_000_000_000;   // swap-vm Fee.sol BPS: 1e9 = 100%

export function instruction(opcode, args = '0x') {
  const len = (args.length - 2) / 2;
  if (len > 255) throw new Error(`instruction ${opcode}: args are ${len} bytes (255 max)`);
  return concat([toHex(opcode, { size: 1 }), toHex(len, { size: 1 }), args]);
}

// harp: Extruction(PriceExtruction). args = the extruction's address, 20 bytes.
export const harp = (priceExtruction) => instruction(OP.EXTRUCTION, getAddress(priceExtruction));

// hen: flat fee on amountIn, then XYC. feeBps is in basis points (30 = 0.30%), converted to swap-vm's 1e9 scale.
export function hen(feeBps) {
  if (!Number.isInteger(feeBps) || feeBps < 0 || feeBps > 10_000) throw new Error(`feeBps must be an integer in 0..10000, got ${feeBps}`);
  return concat([instruction(OP.FLAT_FEE_IN, pad(toHex(feeBps * (FEE_ONE / 10_000)), { size: 4 })), instruction(OP.XYC_SWAP)]);
}

// Reads a program back into its instructions: [{opcode, args}], for logs and for fee's view of hen.
export function decode(program) {
  const out = [];
  const n = (program.length - 2) / 2;
  for (let i = 0; i < n;) {
    const opcode = hexToNumber(sliceHex(program, i, i + 1));
    const len = hexToNumber(sliceHex(program, i + 1, i + 2));
    out.push({ opcode, args: len ? sliceHex(program, i + 2, i + 2 + len) : '0x' });
    i += 2 + len;
  }
  return out;
}

// The shape of a shipped program, from its first instruction.
export function kindOf(program) {
  const first = decode(program)[0]?.opcode;
  return first === OP.EXTRUCTION ? 'harp' : first === OP.FLAT_FEE_IN || first === OP.XYC_SWAP ? 'hen' : 'program';
}
