// ABIs. The contracts lane exports compiled ABIs to contracts/out-abi/<Name>.json (a bare array, or {abi}).
// Those win. Until they land, the fragments below cover the upstream interfaces we call: 1inch Aqua v1.0.0,
// SwapVM v1.0.2 (ISwapVM), Uniswap CCA (IContinuousClearingAuction), and our ICastleLease.
import fs from 'node:fs';
import path from 'node:path';
import { parseAbi } from 'viem';
import { env } from './config.mjs';

const FALLBACK = {
  Castle: parseAbi([
    // ICastleLease (contracts/src/interfaces/ICastleLease.sol)
    'function holder() view returns (address)',
    'function epoch() view returns (uint256)',
    'function expiry() view returns (uint64)',
    'function isLive() view returns (bool)',
    'function fo() view returns (address)',
    'function leasePeriod() view returns (uint64)',
    'function claim() returns (uint256)',
    'function renew(uint64 newExpiry, uint64 deadline, bytes foSig)',
    'function crew(address) view returns (bool)',
    'function shippedEpoch(bytes32) view returns (uint256)',
    'function anchorPriceQ96() view returns (uint256)',
    'event Renewed(uint256 indexed epoch, address indexed holder, uint64 expiry, bytes32 attestationDigest)',
    'event Claimed(uint256 indexed epoch, address indexed holder, uint64 expiry, uint256 prevEpoch)',
    'event Relinked(bytes32 indexed node, bytes32 holderNode, bytes holderName)',
    'event Shipped(bytes32 indexed strategyHash, uint256 indexed epoch, uint256 anchorQ96, uint256 weth, uint256 usdc)',
    'event Docked(bytes32 indexed strategyHash, uint256 indexed epoch, address indexed dockedBy)',
    'event PriceWritten(uint256 priceQ96)',
    'error NotCrew(address caller)',
    'error EpochNotRegenerated(uint256 epoch)',
    'error NotHolder(address caller, address holder)',
    'error LeaseExpired(uint64 expiry)',
    'error LeaseStillLive(uint64 expiry)',
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
  ]),
  CCA: parseAbi([
    'event BidSubmitted(uint256 indexed id, address indexed owner, uint256 priceQ96, uint128 amount)',
    'event CheckpointUpdated(uint256 blockNumber, uint256 clearingPriceQ96, uint24 cumulativeMps)',
    'event ClearingPriceUpdated(uint256 blockNumber, uint256 clearingPriceQ96)',
    'function submitBid(uint256 maxPriceQ96, uint128 amount, address owner, bytes hookData) payable returns (uint256)',
    'function checkpoint()',
    'function clearingPrice() view returns (uint256)',
    'function isGraduated() view returns (bool)',
    'function currency() view returns (address)',
    'function token() view returns (address)',
    'function totalSupply() view returns (uint128)',
    'function startBlock() view returns (uint64)',
    'function endBlock() view returns (uint64)',
    'function claimBlock() view returns (uint64)',
    'function validationHook() view returns (address)',
    'function sweepCurrency()',
  ]),
  FeeFiFoFumExtruction: parseAbi(['error FeeFiFoFum()']),
  CCAFactory: parseAbi([
    'event AuctionCreated(address indexed auction, address indexed token, uint256 amount, bytes configData)',
  ]),
  ERC20: parseAbi([
    'function balanceOf(address) view returns (uint256)',
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
