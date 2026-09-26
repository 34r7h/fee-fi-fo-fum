#!/usr/bin/env node
// Checks a running castle service against the chain it reads (an anvil fork, or Sepolia read-only): the ERC-3668
// gateway answers with a response and a quote that both verify, every MCP tool answers, and /stream, /state and
// /health speak STREAM.md v2. It sends no transaction. One JSON line per check, {check, ok, ...}; exits 1 if any fails.
//   node test/gateway-fork.mjs --service http://127.0.0.1:18842 --rpc http://127.0.0.1:18841 --deployments <file>
import fs from 'node:fs';
import { createPublicClient, http, parseAbi, encodeFunctionData, decodeErrorResult, decodeAbiParameters, getAddress } from 'viem';
import { sepolia } from 'viem/chains';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import * as C from '../lib/ccip-sign.mjs';

const argv = process.argv.slice(2);
const opt = (n, d) => { const i = argv.indexOf(`--${n}`); return i >= 0 ? argv[i + 1] : d; };
const SVC = opt('service', 'http://127.0.0.1:18842').replace(/\/$/, '');
const RPC = opt('rpc', 'http://127.0.0.1:18841');
const D = JSON.parse(fs.readFileSync(opt('deployments'), 'utf8'));
const NAME = 'quote.feefifofum.eth';
const at = (v) => (typeof v === 'string' ? v : v?.address);
const A = {
  vault: at(D.contracts.castleVault), resolver: at(D.contracts.offchainQuoteResolver), priceEx: at(D.contracts.priceExtruction),
  router: D.external.aquaSwapVMRouter ?? at(D.contracts.aquaSwapVMRouter), ur: D.external.universalResolverV2,
};
const chain = { ...sepolia, rpcUrls: { default: { http: [RPC] } } };
const pub = createPublicClient({ chain, transport: http(RPC) });
// viem follows OffchainLookup by itself (ccipRead); this one surfaces the revert, to send the request by hand.
const raw = createPublicClient({ chain, transport: http(RPC), ccipRead: false });
const RESOLVER = parseAbi(['function resolve(bytes name, bytes data) view returns (bytes)', 'error OffchainLookup(address sender, string[] urls, bytes callData, bytes4 callbackFunction, bytes extraData)']);
const SWAPVM = parseAbi(['struct Order { address maker; uint256 traits; bytes data; }', 'function quote(Order order, address tokenIn, address tokenOut, uint256 amount, bytes takerTraitsAndData) view returns (uint256 amountIn, uint256 amountOut, bytes32 orderHash)']);

let failed = 0;
const line = (o) => console.log(JSON.stringify(o, (_k, v) => (typeof v === 'bigint' ? v.toString() : v)));
async function check(name, fn) {
  try { const r = await fn(); line({ check: name, ok: r.ok !== false, ...r }); if (r.ok === false) failed++; }
  catch (e) { failed++; line({ check: name, ok: false, error: e.shortMessage || e.message }); }
}
const getJson = async (path, init) => { const r = await fetch(`${SVC}${path}`, init); return { status: r.status, cors: r.headers.get('access-control-allow-origin'), body: await r.json().catch(() => null) }; };

const health = await getJson('/health');
const FI = health.body?.fi;

// The resolver's own OffchainLookup for text(quote.feefifofum.eth, key): the exact request a client sends.
async function lookup(key) {
  const data = encodeFunctionData({ abi: RESOLVER, functionName: 'resolve', args: [C.dnsEncodeName(NAME), C.encodeTextCall(NAME, key)] });
  try { await raw.call({ to: A.resolver, data }); } catch (e) {
    const raw = e?.walk?.((x) => typeof x?.data === 'string')?.data;
    const d = decodeErrorResult({ abi: RESOLVER, data: raw });
    if (d.errorName === 'OffchainLookup') return { sender: d.args[0], urls: d.args[1], callData: d.args[2] };
  }
  throw new Error('the resolver did not revert OffchainLookup');
}

await check('health', async () => ({ ok: health.status === 200 && !!FI && health.cors === '*', fi: FI, vault: health.body?.vault, cors: health.cors }));

await check('gateway GET: signed response verifies (SignatureVerifier, signer fi)', async () => {
  const L = await lookup('quote:USDC:WETH:500000');
  const url = `${SVC}/ccip/${L.sender}/${L.callData}.json`;
  const r = await fetch(url);
  const j = await r.json();
  if (!j.data) return { ok: false, status: r.status, message: j.message };
  const v = await C.verifyCcipResponse({ target: L.sender, request: L.callData, response: j.data, signers: [FI] });
  const rec = JSON.parse(decodeText(v.result));
  return { ok: v.valid && r.status === 200, status: r.status, signer: v.signer, expires: v.expires, quoteId: rec.id, gatewayTemplate: L.urls[0] };
});

await check('gateway POST: the castle key answers the vault address', async () => {
  const L = await lookup('castle');
  const r = await fetch(`${SVC}/ccip`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ sender: L.sender, data: L.callData }) });
  const j = await r.json();
  const v = await C.verifyCcipResponse({ target: L.sender, request: L.callData, response: j.data, signers: [FI] });
  const value = decodeText(v.result);
  return { ok: v.valid && getAddress(value) === getAddress(A.vault), value };
});

await check('gateway: an unknown key is a 404 with a message', async () => {
  const L = await lookup('avatar');
  const r = await fetch(`${SVC}/ccip/${L.sender}/${L.callData}.json`);
  const j = await r.json();
  return { ok: r.status === 404 && typeof j.message === 'string', status: r.status, message: j.message };
});

let viaEns = null;
await check('viem getEnsText through UniversalResolverV2 (CCIP-Read): a quote that verifies and that router.quote honours', async () => {
  const text = await pub.getEnsText({ name: NAME, key: 'quote:WETH:USDC:100000000000000', universalResolverAddress: A.ur, strict: true });
  const rec = C.parseQuoteRecord(text);
  viaEns = rec;
  const quote = { strategyHash: rec.strategyHash, tokenIn: rec.tokenIn, tokenOut: rec.tokenOut, priceQ96: BigInt(rec.priceQ96), maxAmountIn: BigInt(rec.maxAmountIn), validUntil: BigInt(rec.validUntil) };
  const vq = await C.verifyQuote(C.priceExtructionDomain(A.priceEx, 11155111), quote, rec.quoteSig, { expectedSigner: FI });
  const order = { maker: rec.order.maker, traits: BigInt(rec.order.traits), data: rec.order.data };
  const [, out] = await pub.readContract({ address: A.router, abi: SWAPVM, functionName: 'quote', args: [order, rec.tokenIn, rec.tokenOut, BigInt(rec.amountIn), rec.takerTraitsAndData] });
  return { ok: vq.valid && out === BigInt(rec.amountOut) && getAddress(rec.order.maker) === getAddress(A.vault), quoteId: rec.id, signer: vq.signer, amountIn: rec.amountIn, amountOut: rec.amountOut, routerQuote: out, validUntil: rec.validUntil };
});

// MCP (Streamable HTTP): every tool listed and answering.
const mcp = new Client({ name: 'gateway-fork', version: '1.0.0' });
await mcp.connect(new StreamableHTTPClientTransport(new URL(`${SVC}/mcp`)));
const call = async (name, args = {}) => {
  const r = await mcp.callTool({ name, arguments: args });
  const text = r.content?.[0]?.text ?? '';
  if (r.isError) throw new Error(`${name}: ${text}`);
  return JSON.parse(text);
};
const TOOLS = ['castle_status', 'castle_quote', 'castle_fill', 'castle_allocations', 'castle_route'];
await check('mcp tools/list', async () => {
  const { tools } = await mcp.listTools();
  const names = tools.map((t) => t.name);
  return { ok: TOOLS.every((t) => names.includes(t)), tools: names };
});
await check('mcp castle_status', async () => {
  const s = await call('castle_status');
  return { ok: !!s.hoard && s.priceFresh === true && s.strategies.length > 0, hoard: s.hoard, price: s.price?.mid, strategies: s.strategies.map((x) => x.label), agents: s.agents.map((a) => `${a.id}:${a.alive ? 'up' : 'down'}`) };
});
let q = null;
await check('mcp castle_quote', async () => {
  q = await call('castle_quote', { tokenIn: 'USDC', tokenOut: 'WETH', amountIn: '250000' });
  return { ok: !!q.id && !!q.takerTraitsAndData && q.signer === FI, quoteId: q.id, amountOut: q.amountOut };
});
await check('mcp castle_fill', async () => {
  const f = await call('castle_fill', { quoteId: q.id, taker: '0xDDf2980eFA32E9E15C9D0ece52F4BF32956EAE4c' });
  return { ok: getAddress(f.tx.to) === getAddress(A.router) && f.tx.data.startsWith('0x') && !!f.approve?.data, to: f.tx.to, secondsLeft: f.secondsLeft };
});
await check('mcp castle_allocations', async () => {
  const a = await call('castle_allocations');
  return { ok: !!a.tokens.USDC && !!a.tokens.WETH, tokens: a.tokens, strategies: a.strategies.map((s) => ({ slot: s.slot, label: s.label, alloc: s.alloc, fills: s.fills })) };
});
await check('mcp castle_route (fo)', async () => {
  const now = Math.floor(Date.now() / 1000);
  const r = await call('castle_route', { order: { swapper: '0xDDf2980eFA32E9E15C9D0ece52F4BF32956EAE4c', nonce: String(now), deadline: now + 120, input: { token: 'USDC', amount: '200000' }, outputs: [{ token: 'WETH', amount: '1', recipient: '0xDDf2980eFA32E9E15C9D0ece52F4BF32956EAE4c' }] } });
  return { ok: ['harp', 'v4'].includes(r.route) && r.calls?.length === 2, route: r.route, compared: r.compared, intent: r.id };
});
await mcp.close();

// /stream: SSE, replayed from seq 0, every event v2 with its seq as the SSE id.
await check('stream (SSE, ?since=0)', async () => {
  const ctl = new AbortController();
  const r = await fetch(`${SVC}/stream?since=0`, { signal: ctl.signal });
  const cors = r.headers.get('access-control-allow-origin'), type = r.headers.get('content-type');
  const reader = r.body.getReader();
  let buf = '';
  const stop = Date.now() + 4000;
  while (Date.now() < stop) {
    const t = setTimeout(() => ctl.abort(), Math.max(1, stop - Date.now()));
    try { const { value, done } = await reader.read(); clearTimeout(t); if (done) break; buf += Buffer.from(value).toString('utf8'); } catch { clearTimeout(t); break; }
  }
  ctl.abort();
  const events = buf.split('\n\n').map((b) => {
    const id = /^id: (.*)$/m.exec(b)?.[1];
    const data = b.split('\n').filter((l) => l.startsWith('data: ')).map((l) => l.slice(6)).join('\n');
    return data ? { id, ev: JSON.parse(data) } : null;
  }).filter(Boolean);
  const counts = {};
  for (const { ev } of events) counts[ev.type] = (counts[ev.type] || 0) + 1;
  const v2 = events.every(({ ev }) => ev.v === 2);
  const ids = events.filter(({ ev }) => ev.type !== 'snapshot').every(({ id, ev }) => String(ev.seq) === id);
  const want = ['snapshot', 'leverage.set', 'cap.set', 'strategy.shipped', 'allocation.refused', 'quote.served', 'fill', 'hoard', 'price', 'agent'];
  const missing = want.filter((t) => !counts[t]);
  return { ok: cors === '*' && /text\/event-stream/.test(type || '') && v2 && ids && !missing.length, events: events.length, counts, missing, cors };
});

await check('state', async () => {
  const s = await getJson('/state');
  const b = s.body;
  return { ok: s.status === 200 && s.cors === '*' && !!b?.hoard && !!b?.leverage && !!b?.caps, seq: b?.seq, hoard: b?.hoard, leverage: b?.leverage, strategies: b?.strategies?.map((x) => `${x.label}${x.docked ? ' (docked)' : ''}`) };
});

// A text record's result is abi.encode(string).
function decodeText(result) {
  return decodeAbiParameters([{ type: 'string' }], result)[0];
}

line({ done: true, failed, via: viaEns?.id ?? null });
process.exit(failed ? 1 : 0);
