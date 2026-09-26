// The book Castle ships. Castle v2 builds every program itself (fenced, centred on the ENS anchor), so the crew
// reads it back from Aqua's Shipped event and checks two things before trusting it:
//   - the fence at byte 0 carries the live epoch;
//   - the curve's centre is the ENS anchor: the geometric middle of the XYCConcentrate band [sqrtMin, sqrtMax]
//     equals handoff-price as the resolver holds it (read straight from the resolver, not through Castle).
// Program layout (Castle._program): 0 Extruction(fence, epoch, W, USDC) · 76 DecayXD · 80 XYCConcentrate(band) · …
import { decodeAbiParameters, decodeEventLog, encodeFunctionData, decodeFunctionResult, getAddress, hexToBigInt, parseAbi, parseAbiItem, sliceHex } from 'viem';

export const AQUA_SHIPPED = parseAbiItem('event Shipped(address maker, address app, bytes32 strategyHash, bytes strategy)');
export const CASTLE_SHIPPED = parseAbiItem('event Shipped(bytes32 indexed strategyHash, uint256 indexed epoch, uint256 anchorQ96, uint256 weth, uint256 usdc)');
const ORDER = [{ type: 'tuple', components: [{ name: 'maker', type: 'address' }, { name: 'traits', type: 'uint256' }, { name: 'data', type: 'bytes' }] }];
const RESOLVER = parseAbi(['function resolve(bytes name, bytes data) view returns (bytes)', 'function data(bytes32 node, string key) view returns (bytes)']);
const CASTLE = parseAbi(['function dnsName() view returns (bytes)', 'function NODE() view returns (bytes32)', 'function RESOLVER() view returns (address)', 'function PRICE_KEY() view returns (string)']);
const Q96 = 1n << 96n;
const E36 = 10n ** 36n;
const OP_EXTRUCTION = 32;
const OP_CONCENTRATE = 18;
const same = (a, b) => !!a && !!b && a.toLowerCase() === b.toLowerCase();

// Decode abi.encode(Order) and pick the fence and band out of the program (no hooks, so data is the program).
export function readProgram(strategy) {
  const [order] = decodeAbiParameters(ORDER, strategy);
  const p = order.data;
  const byte = (i) => parseInt(sliceHex(p, i, i + 1), 16);
  if (byte(0) !== OP_EXTRUCTION || byte(80) !== OP_CONCENTRATE) throw new Error('not a Castle v2 program (fence at 0, concentrate at 80)');
  return {
    maker: getAddress(order.maker),
    fence: getAddress(sliceHex(p, 2, 22)),
    epoch: hexToBigInt(sliceHex(p, 22, 54)),
    sqrtMin: hexToBigInt(sliceHex(p, 82, 114)),
    sqrtMax: hexToBigInt(sliceHex(p, 114, 146)),
    bytes: (p.length - 2) / 2,
  };
}

// USDC per WETH in Q96 at the band's centre: sqrtMin * sqrtMax = sqrtP^2 (1e36-scaled), inverted as Castle._book built it.
export function centreQ96({ sqrtMin, sqrtMax }, usdcIsLt) {
  const sq = sqrtMin * sqrtMax;
  return usdcIsLt ? (Q96 * E36) / sq : (sq * Q96) / E36;
}

export const deviationBps = (a, b) => (b === 0n ? null : Number(((a > b ? a - b : b - a) * 10_000n) / b));

// handoff-price straight from the resolver: resolve(castle's DNS name, data(NODE, key)), as UniversalResolverV2 would.
export async function ensAnchorQ96(pc, castle, blockNumber) {
  const [name, node, resolver, key] = await Promise.all(['dnsName', 'NODE', 'RESOLVER', 'PRICE_KEY'].map((f) => pc.readContract({ address: castle, abi: CASTLE, functionName: f, blockNumber })));
  const out = await pc.readContract({ address: resolver, abi: RESOLVER, functionName: 'resolve', args: [name, encodeFunctionData({ abi: RESOLVER, functionName: 'data', args: [node, key] })], blockNumber });
  const raw = decodeFunctionResult({ abi: RESOLVER, functionName: 'data', data: out });
  return raw && raw !== '0x' && (raw.length - 2) / 2 === 32 ? hexToBigInt(raw) : 0n;
}

// Everything a ship tx put on the book, checked: the strategy, its program, Castle's anchor, the ENS value.
export async function shippedBook(pc, receipt, { aqua, castle, weth, usdc }) {
  let strategy, castleShip;
  for (const l of receipt.logs) {
    try {
      if (same(l.address, aqua)) { const d = decodeEventLog({ abi: [AQUA_SHIPPED], data: l.data, topics: l.topics }); if (same(d.args.maker, castle)) strategy = d.args; }
      if (same(l.address, castle)) { const d = decodeEventLog({ abi: [CASTLE_SHIPPED], data: l.data, topics: l.topics }); castleShip = d.args; }
    } catch { /* another event */ }
  }
  if (!strategy || !castleShip) return null;
  const prog = readProgram(strategy.strategy);
  const centre = centreQ96(prog, BigInt(usdc) < BigInt(weth));
  const ens = await ensAnchorQ96(pc, castle, receipt.blockNumber);
  return {
    strategyHash: strategy.strategyHash, epoch: castleShip.epoch, programEpoch: prog.epoch, fence: prog.fence,
    weth: castleShip.weth, usdc: castleShip.usdc, anchorQ96: castleShip.anchorQ96, ensAnchorQ96: ens, centreQ96: centre,
    centreVsEnsBps: deviationBps(centre, ens), fenceEpochOk: prog.epoch === castleShip.epoch,
  };
}
