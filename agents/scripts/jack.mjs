#!/usr/bin/env node
// Jack, a taker from outside the castle: fills against a strategy Castle shipped, through the live SwapVM router,
// from a crew EOA's own key. It is how the failover demo proves the fence with mined txs (p3-failover-e2e):
//   the gap      after expiry, before a claim: the live strategy only takes USDC in (wind-down, reduce-only);
//   the fence    after a claim: the OLD epoch's strategy reverts FeeFiFoFum();
//   the new book the new epoch's strategy fills.
// Every fill is simulated first. --force sends it anyway, so a revert is mined and has a tx link.
//
//   node agents/scripts/jack.mjs --as fum --strategy latest|previous|0x<hash> --in USDC|WETH --amount <atomic> [--min-out N] [--force]
import { concat, decodeAbiParameters, encodePacked, erc20Abi, getAddress, maxUint256, pad, parseAbi, toHex } from 'viem';
import { loadEnv } from '../lib/env.mjs';
import { publicClient, walletClient, loadAccount, contractAddress, txLink } from '../lib/chain.mjs';
import { AQUA_SHIPPED } from '../lib/book.mjs';
import { readLease } from '../lib/lease.mjs';

loadEnv();
const argv = process.argv.slice(2);
const opt = (n, d) => { const i = argv.indexOf(`--${n}`); return i >= 0 ? argv[i + 1] : d; };
const FORCE = argv.includes('--force');
const who = opt('as', 'fum');
const ROUTER_ABI = parseAbi([
  'struct Order { address maker; uint256 traits; bytes data; }',
  'function swap(Order order, address tokenIn, address tokenOut, uint256 amount, bytes takerTraitsAndData) returns (uint256 amountIn, uint256 amountOut, bytes32 orderHash)',
  'function quote(Order order, address tokenIn, address tokenOut, uint256 amount, bytes takerTraitsAndData) view returns (uint256 amountIn, uint256 amountOut, bytes32 orderHash)',
  'error FeeFiFoFum()',
  'error WindDownReduceOnly(address tokenIn)',
  'error TakerTraitsInsufficientMinOutputAmount(uint256 amountOut, uint256 amountOutMin)',
  'error SafeTransferFromFailed()',
]);
const ORDER = [{ type: 'tuple', components: [{ name: 'maker', type: 'address' }, { name: 'traits', type: 'uint256' }, { name: 'data', type: 'bytes' }] }];

// SwapVM 1.0.2 TakerTraitsLib.build: ten uint16 slice ends packed in a uint160, uint16 flags, then the slices.
function takerData({ isExactIn = true, threshold, useTransferFromAndAquaPush = true }) {
  const th = threshold != null ? pad(toHex(BigInt(threshold)), { size: 32 }) : '0x';
  const i0 = (th.length - 2) / 2;
  const idx = [i0, i0, i0, i0, i0, i0, i0, i0, i0, i0].reduce((acc, v, k) => acc | (BigInt(v) << BigInt(16 * k)), 0n);
  const flags = (isExactIn ? 0x0001 : 0) | (useTransferFromAndAquaPush ? 0x0040 : 0);
  return concat([encodePacked(['uint160', 'uint16'], [idx, flags]), th]);
}

const pc = publicClient();
const account = loadAccount(who);
const wallet = walletClient(account);
const castle = contractAddress('castle'), router = contractAddress('router'), aqua = contractAddress('aqua');
const tokens = { USDC: contractAddress('usdc'), WETH: contractAddress('weth') };
const tokenIn = tokens[opt('in', 'USDC').toUpperCase()], tokenOut = tokenIn === tokens.USDC ? tokens.WETH : tokens.USDC;
const amount = BigInt(opt('amount', '1000000'));

// The strategies Castle shipped, oldest first, with their order bytes from Aqua's Shipped event.
const head = await pc.getBlockNumber();
const logs = (await pc.getLogs({ address: aqua, event: AQUA_SHIPPED, fromBlock: head > 5000n ? head - 5000n : 0n, toBlock: head }))
  .filter((l) => getAddress(l.args.maker) === getAddress(castle));
if (!logs.length) throw new Error('Castle has shipped nothing in the last 5000 blocks');
const pick = opt('strategy', 'latest');
const log = pick === 'latest' ? logs.at(-1) : pick === 'previous' ? logs.at(-2) : logs.find((l) => l.args.strategyHash === pick);
if (!log) throw new Error(`no strategy ${pick}`);
const [order] = decodeAbiParameters(ORDER, log.args.strategy);

const lease = await readLease(pc);
const data = takerData({ threshold: opt('min-out', '1') });
const req = { address: router, abi: ROUTER_ABI, functionName: 'swap', args: [order, tokenIn, tokenOut, amount, data], account };
// The router pulls tokenIn from the taker (transferFrom + Aqua push): approve it once, before simulating the fill.
const allowance = await pc.readContract({ address: tokenIn, abi: erc20Abi, functionName: 'allowance', args: [account.address, router] });
if (allowance < amount) {
  const h = await wallet.writeContract({ address: tokenIn, abi: erc20Abi, functionName: 'approve', args: [router, maxUint256] });
  await pc.waitForTransactionReceipt({ hash: h });
}
let expected = null;
try { await pc.simulateContract(req); } catch (e) { expected = e?.walk?.((x) => x?.data?.errorName)?.data?.errorName || e?.shortMessage || String(e); }
if (expected && !FORCE) {
  console.log(JSON.stringify({ jack: who, strategy: log.args.strategyHash, leaseState: lease.state, sent: false, expected }));
  process.exit(1);
}
const hash = await wallet.writeContract({ ...req, ...(expected ? { gas: 400_000n } : {}) });
const rc = await pc.waitForTransactionReceipt({ hash, timeout: 180_000 });
console.log(JSON.stringify({
  jack: who, strategy: log.args.strategyHash, leaseEpoch: String(lease.epoch), leaseState: lease.state,
  tokenIn: opt('in', 'USDC').toUpperCase(), amount: String(amount), status: rc.status, reason: rc.status === 'success' ? null : expected,
  tx: txLink(hash), gasUsed: String(rc.gasUsed),
}));
process.exitCode = rc.status === 'success' ? 0 : 3;
