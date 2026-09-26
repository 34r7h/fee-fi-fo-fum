// ABIs. The contracts lane exports compiled ABIs to contracts/out-abi/<Name>.json (a bare array, or {abi}).
// Those win. Until they land, the fragments below cover what the service calls: the new contracts as docs/SPEC.md
// pins them, 1inch Aqua v1.0.0, SwapVM v1.0.2, the Uniswap v4 PoolManager, V4Quoter and PoolSwapTest, and Chainlink.
import fs from 'node:fs';
import path from 'node:path';
import { parseAbi } from 'viem';
import { env } from './config.mjs';

const FALLBACK = {
  // contracts/src/CastleVault.sol (docs/SPEC.md): the hoard, an Aqua maker with fi's slots and fum's caps.
  CastleVault: parseAbi([
    'struct Order { address maker; uint256 traits; bytes data; }',
    'function setLeverage(address token, uint16 bps)',
    'function setCap(uint8 slot, uint256 wethCap, uint256 usdcCap)',
    'function ship(uint8 slot, bytes program, uint256 weth, uint256 usdc) returns (bytes32 strategyHash, Order order)',
    'function dock(bytes32 strategyHash)',
    'function withdraw(address token, address to, uint256 amount)',
    'function fi() view returns (address)',
    'function fum() view returns (address)',
    'function owner() view returns (address)',
    'function committed(address token) view returns (uint256)',
    'function headroom(address token) view returns (uint256)',
    'function limit(address token) view returns (uint256)',
    'function activeStrategies() view returns (bytes32[])',
    'function strategyIn(uint8 slot) view returns (bytes32)',
    'function orderOf(bytes32 strategyHash) view returns (Order)',
    'function slotOf(bytes32 strategyHash) view returns (uint8)',
    'function capOf(uint8 slot) view returns (uint256 wethCap, uint256 usdcCap)',
    'function leverageOf(address token) view returns (uint16)',
    'event Shipped(uint8 indexed slot, bytes32 indexed strategyHash, uint256 weth, uint256 usdc)',
    'event Docked(bytes32 indexed strategyHash, address indexed by)',
    'event CapSet(uint8 indexed slot, uint256 wethCap, uint256 usdcCap)',
    'event LeverageSet(address indexed token, uint16 bps)',
    'event FiSet(address indexed fi)',
    'event FumSet(address indexed fum)',
    'event Withdrawn(address indexed token, address indexed to, uint256 amount)',
    'error ZeroAddress()', 'error BadConfig()', 'error NotFi(address caller)', 'error NotFum(address caller)', 'error NotCrew(address caller)',
    'error BadSlot(uint8 slot)', 'error SlotBusy(uint8 slot)', 'error EmptyProgram()',
    'error OverCap(uint8 slot, address token, uint256 amount, uint256 cap)',
    'error OverAllocated(address token, uint256 committedAfter, uint256 limit)',
    'error BadLeverage(uint16 bps)', 'error NotHoardToken(address token)', 'error NotLive(bytes32 strategyHash)', 'error UnexpectedStrategyHash()',
  ]),
  // contracts/src/PriceExtruction.sol: harp's price is fi's EIP-712 Quote, carried in takerData.
  PriceExtruction: parseAbi([
    'struct Quote { bytes32 strategyHash; address tokenIn; address tokenOut; uint256 priceQ96; uint256 maxAmountIn; uint64 validUntil; }',
    'function NAME() view returns (string)',
    'function VERSION() view returns (string)',
    'function MAX_QUOTE_TTL() view returns (uint64)',
    'function domainSeparator() view returns (bytes32)',
    'function quoteDigest(Quote q) view returns (bytes32)',
    'error QuoteExpired(uint64 validUntil)', 'error BadQuoteSigner(address recovered)', 'error QuoteMismatch()',
    'error QuoteTooLarge(uint256 amountIn, uint256 maxAmountIn)', 'error QuoteTooLong(uint64 validUntil)',
    'error MissingQuote(uint256 length)', 'error ExactOutNotSupported()',
  ]),
  // contracts/src/OffchainQuoteResolver.sol: ERC-3668 + ENSIP-10 for quote.feefifofum.eth.
  OffchainQuoteResolver: parseAbi([
    'function resolve(bytes name, bytes data) view returns (bytes)',
    'function resolveWithProof(bytes response, bytes extraData) view returns (bytes)',
    'function supportsInterface(bytes4) view returns (bool)',
    'error OffchainLookup(address sender, string[] urls, bytes callData, bytes4 callbackFunction, bytes extraData)',
    'error SignatureExpired()', 'error InvalidSigner(address signer)',
  ]),
  CastleJITHook: parseAbi([
    'error ExactOutNotSupported()', 'error TooLittleOut(uint256 amountOut, uint256 minAmountOut)',
  ]),
  PoolManager: parseAbi([
    'event Swap(bytes32 indexed id, address indexed sender, int128 amount0, int128 amount1, uint160 sqrtPriceX96, uint128 liquidity, int24 tick, uint24 fee)',
  ]),
  V4Quoter: parseAbi([
    'struct PoolKey { address currency0; address currency1; uint24 fee; int24 tickSpacing; address hooks; }',
    'struct QuoteExactSingleParams { PoolKey poolKey; bool zeroForOne; uint128 exactAmount; bytes hookData; }',
    'function quoteExactInputSingle(QuoteExactSingleParams params) returns (uint256 amountOut, uint256 gasEstimate)',
  ]),
  PoolSwapTest: parseAbi([
    'struct PoolKey { address currency0; address currency1; uint24 fee; int24 tickSpacing; address hooks; }',
    'struct SwapParams { bool zeroForOne; int256 amountSpecified; uint160 sqrtPriceLimitX96; }',
    'struct TestSettings { bool takeClaims; bool settleUsingBurn; }',
    'function swap(PoolKey key, SwapParams params, TestSettings testSettings, bytes hookData) payable returns (int256 delta)',
  ]),
  Chainlink: parseAbi([
    'function latestRoundData() view returns (uint80 roundId, int256 answer, uint256 startedAt, uint256 updatedAt, uint80 answeredInRound)',
    'function decimals() view returns (uint8)',
  ]),
  Aqua: parseAbi([
    'event Shipped(address maker, address app, bytes32 strategyHash, bytes strategy)',
    'event Docked(address maker, address app, bytes32 strategyHash)',
    'event Pulled(address maker, address app, bytes32 strategyHash, address token, uint256 amount)',
    'event Pushed(address maker, address app, bytes32 strategyHash, address token, uint256 amount)',
    'function rawBalances(address maker, address app, bytes32 strategyHash, address token) view returns (uint248 balance, uint8 tokensCount)',
  ]),
  SwapVM: parseAbi([
    'struct Order { address maker; uint256 traits; bytes data; }',
    'function hash(Order order) view returns (bytes32)',
    'function quote(Order order, address tokenIn, address tokenOut, uint256 amount, bytes takerTraitsAndData) view returns (uint256 amountIn, uint256 amountOut, bytes32 orderHash)',
    'function swap(Order order, address tokenIn, address tokenOut, uint256 amount, bytes takerTraitsAndData) returns (uint256 amountIn, uint256 amountOut, bytes32 orderHash)',
    'event Swapped(bytes32 orderHash, address maker, address taker, address tokenIn, address tokenOut, uint256 amountIn, uint256 amountOut)',
  ]),
  // swap-vm 1.0.2 src/libs/TakerTraits.sol: a quote or swap whose taker bounds fail reverts with one of these.
  TakerTraits: parseAbi([
    'error TakerTraitsMissingTraits()',
    'error TakerTraitsThresholdLengthInvalid(bytes threshold)',
    'error TakerTraitsNonExactThresholdAmountIn(uint256 amountIn, uint256 amountThreshold)',
    'error TakerTraitsNonExactThresholdAmountOut(uint256 amountOut, uint256 amountThreshold)',
    'error TakerTraitsInsufficientMinOutputAmount(uint256 amountOut, uint256 amountOutMin)',
    'error TakerTraitsAmountOutMustBeGreaterThanZero(uint256 amountOut)',
    'error TakerTraitsExceedingMaxInputAmount(uint256 amountIn, uint256 amountInMax)',
    'error TakerTraitsDeadlineExpired()',
  ]),
  ERC20: parseAbi([
    'function balanceOf(address) view returns (uint256)',
    'function allowance(address owner, address spender) view returns (uint256)',
    'function approve(address spender, uint256 amount) returns (bool)',
    'function decimals() view returns (uint8)',
    'function symbol() view returns (string)',
  ]),
};

const cache = new Map();
// Re-read out-abi when its file changes, so a fresh export from the contracts lane is picked up live.
export function abi(name) {
  const file = path.join(env.abiDir, `${name}.json`);
  let mtime = 0;
  try { mtime = fs.statSync(file).mtimeMs; } catch { /* not exported yet */ }
  const hit = cache.get(name);
  if (hit && hit.mtime === mtime) return hit.abi;
  let out = FALLBACK[name] || null;
  if (mtime) {
    try {
      const j = JSON.parse(fs.readFileSync(file, 'utf8'));
      out = Array.isArray(j) ? j : j.abi || out;
    } catch { /* malformed export: keep the fallback */ }
  }
  cache.set(name, { mtime, abi: out });
  return out;
}
export const abiSource = (name) => {
  try { fs.statSync(path.join(env.abiDir, `${name}.json`)); return 'out-abi'; } catch { return FALLBACK[name] ? 'fallback' : 'missing'; }
};
