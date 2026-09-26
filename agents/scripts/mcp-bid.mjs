// A crew EOA bids in the castle's CCA through the castle service's MCP tool auction_bid (Streamable HTTP), then
// signs and sends the returned steps itself. Fork only (cost rule: no live txs), so SEPOLIA_RPC_URL must be local.
//   SEPOLIA_RPC_URL=<fork> node scripts/mcp-bid.mjs --mcp http://127.0.0.1:18790/mcp --as fo --label fo --amount <atomic USDC|min> --usdc-per-weth <max>
import { parseAbi } from 'viem';
import { Client } from '../../service/node_modules/@modelcontextprotocol/sdk/dist/esm/client/index.js';
import { StreamableHTTPClientTransport } from '../../service/node_modules/@modelcontextprotocol/sdk/dist/esm/client/streamableHttp.js';
import { loadEnv, env } from '../lib/env.mjs';
import { publicClient, walletClient, loadAccount, contractAddress, abi } from '../lib/chain.mjs';

loadEnv();
if (!/^https?:\/\/(127\.0\.0\.1|localhost)(:|\/|$)/.test(env('SEPOLIA_RPC_URL', ''))) {
  console.error('mcp-bid.mjs sends txs, so it runs on a local anvil fork only: set SEPOLIA_RPC_URL=http://127.0.0.1:<port>');
  process.exit(2);
}
const argv = process.argv.slice(2);
const opt = (n, d) => { const i = argv.indexOf(`--${n}`); return i >= 0 ? argv[i + 1] : d; };
const who = opt('as', 'fo');
const out = (o) => console.log(JSON.stringify({ t: new Date().toISOString(), ...o }, (_, v) => (typeof v === 'bigint' ? v.toString() : v)));
const account = loadAccount(who);
const pc = publicClient(), wallet = walletClient(account);

const client = new Client({ name: `${who}-bidder`, version: '1.0.0' });
await client.connect(new StreamableHTTPClientTransport(new URL(opt('mcp', 'http://127.0.0.1:18790/mcp'))));
const call = async (name, args) => {
  const r = await client.callTool({ name, arguments: args });
  const text = r.content?.find((c) => c.type === 'text')?.text ?? '';
  if (r.isError) throw new Error(`${name}: ${text}`);
  try { return JSON.parse(text); } catch { return text; }
};
const status = await call('auction_status', {});
out({ event: 'auction_status', auction: status.auction ?? status.address, status: status.status, endBlock: status.endBlock, clearing: status.clearingUsdcPerWeth ?? status.clearing, required: status.requiredCurrencyRaised ?? status.required });
// --amount min: the graduation threshold (GRADUATION_PCT of the lot at the floor) plus 1%, read from the chain.
let amount = opt('amount', 'min');
if (amount === 'min') {
  const a = status.auction ?? status.address;
  const CCA = parseAbi(['function totalSupply() view returns (uint128)', 'function floorPrice() view returns (uint256)']);
  const [supply, floor, pct] = await Promise.all([
    pc.readContract({ address: a, abi: CCA, functionName: 'totalSupply' }), pc.readContract({ address: a, abi: CCA, functionName: 'floorPrice' }),
    pc.readContract({ address: contractAddress('castle'), abi: abi('Castle'), functionName: 'GRADUATION_PCT' }),
  ]);
  const required = ((supply * floor) / (1n << 96n)) * pct / 100n;
  amount = String(required + required / 100n + 1n);
  out({ event: 'min', required, amount });
}
const args = { owner: account.address, amount, label: opt('label', who), usdcPerWeth: opt('usdc-per-weth') };
let plan = await call('auction_bid', args);
out({ event: 'auction_bid', owner: plan.owner, name: plan.name, maxPrice: plan.maxPrice, amount: plan.amount, steps: plan.steps.map((s) => s.what), simulation: plan.simulation });
const sent = [];
for (const s of plan.steps.slice(0, -1)) {   // the approvals, then re-plan so the bid itself is simulated
  const hash = await wallet.sendTransaction({ to: s.to, data: s.data, value: BigInt(s.value || 0) });
  const rc = await pc.waitForTransactionReceipt({ hash });
  sent.push({ what: s.what, tx: hash, status: rc.status });
}
if (sent.length) { plan = await call('auction_bid', args); out({ event: 'auction_bid (re-run)', steps: plan.steps.map((s) => s.what), simulation: plan.simulation }); }
const bid = plan.steps.at(-1);
const hash = await wallet.sendTransaction({ to: bid.to, data: bid.data, value: 0n });
const rc = await pc.waitForTransactionReceipt({ hash });
sent.push({ what: bid.what, tx: hash, status: rc.status, block: rc.blockNumber });
out({ event: rc.status === 'success' ? 'bid' : 'bid-reverted', sent });
await client.close();
process.exit(rc.status === 'success' ? 0 : 1);
