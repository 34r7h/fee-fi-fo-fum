// fo, the fencer and witness (p3-fo).
//
// - Seals renewals. POST /attest on 127.0.0.1:FO_PORT is the default channel; it is local and costs nothing.
//   An `attestation.request` handoff message is the fallback when the holder runs on another machine. For each
//   request fo re-reads the lease, the holder's handoff heartbeat and the Castle's last Aqua ship itself, then
//   either signs Attestation(epoch, expiry, deadline) under the Castle's EIP-712 domain or withholds with a
//   reason (lib/fo-policy.mjs). Castle.renew reverts without fo's signature, so a withheld seal ends the shift
//   at expiry.
// - Smells a hang. Every tick it checks the holder: heartbeat present but nothing shipped for staleQuotesS
//   means the trader is hung. fo posts an incident to the handoff channel and withholds from then on. A staged
//   hang is a real one: the trader stops shipping (roles/fee.mjs honours FEE_STAGE_HANG), and fo is never told.
// - Replays fills. Every Aqua fill against the Castle is re-judged against the lease timeline (lib/replay.mjs).
//   A fill from a stale epoch is a fence breach, and fo reports it.
import http from 'node:http';
import { readLease, crewIdOf } from '../lib/lease.mjs';
import { decide, DEFAULT_LIMITS } from '../lib/fo-policy.mjs';
import { signAttestation, attestationDigest } from '../lib/attest.mjs';
import { ensureChannel, postIncident } from '../lib/incidents.mjs';
import { lastShipAge, replayFills, CASTLE_EVENTS } from '../lib/replay.mjs';
import { contractAddress, abi, txLink } from '../lib/chain.mjs';
import { deviationBps } from '../lib/book.mjs';
import { env } from '../lib/env.mjs';

const PORT = Number(env('FO_PORT', 8711));
const LOOKBACK_BLOCKS = BigInt(env('FO_LOOKBACK_BLOCKS', 900));   // about 3h of Sepolia blocks
// Before the first strategy exists (p1-deploy), FO_REQUIRE_SHIPS=0 lets renewals run on liveness alone.
const REQUIRE_SHIPS = env('FO_REQUIRE_SHIPS', '1') !== '0';
const LIMITS = {
  ...DEFAULT_LIMITS,
  ...(env('FO_STALE_QUOTES_S') ? { staleQuotesS: Number(env('FO_STALE_QUOTES_S')) } : {}),
  ...(env('FO_DEADLINE_S') ? { deadlineS: Number(env('FO_DEADLINE_S')) } : {}),
};
const big = (_, v) => (typeof v === 'bigint' ? v.toString() : v);

const S = { epochStart: new Map(), replayFrom: null };

// The block where the live epoch began (its Claimed event), or the lookback floor if the epoch predates it.
async function epochStartBlock(ctx, lease) {
  const k = String(lease.epoch);
  if (S.epochStart.has(k)) return S.epochStart.get(k);
  const floor = lease.block > LOOKBACK_BLOCKS ? lease.block - LOOKBACK_BLOCKS : 0n;
  const claims = await ctx.pc.getLogs({ address: lease.castle, event: CASTLE_EVENTS.Claimed, args: { epoch: lease.epoch }, fromBlock: floor, toBlock: lease.block }).catch(() => []);
  const b = claims.length ? claims.at(-1).blockNumber : floor;
  S.epochStart.set(k, b);
  return b;
}

async function observe(ctx) {
  const lease = await readLease(ctx.pc);
  if (!lease.deployed) return { lease };
  const traderId = crewIdOf(ctx.crew, lease.holder);
  let heartbeatAgeS = null;
  if (traderId) {
    const a = await ctx.h.getAgent(traderId).then((j) => j.agent || j).catch(() => null);
    if (a?.last_seen) heartbeatAgeS = Math.round((Date.now() - Date.parse(a.last_seen)) / 1000);
  }
  const since = await epochStartBlock(ctx, lease);
  const ship = await lastShipAge(ctx.pc, { castle: lease.castle, epoch: lease.epoch, sinceBlock: since, now: lease.now });
  let quotesAgeS = ship?.ageS ?? null;
  if (quotesAgeS === null && REQUIRE_SHIPS) {
    // Nothing shipped yet in this epoch, so the clock runs from the epoch's first block: a shift that never ships is also hung.
    const b = await ctx.pc.getBlock({ blockNumber: since });
    quotesAgeS = lease.now - Number(b.timestamp);
  }
  // Off-market: the live book was centred on an anchor the ENS value has since moved away from (a CCA wrote a new
  // price and the holder never re-centred).
  let market = {};
  if (ship?.anchorQ96) {
    const now = await ctx.pc.readContract({ address: lease.castle, abi: abi('Castle'), functionName: 'anchorPriceQ96' }).catch(() => null);
    if (now) market = { centre: String(ship.anchorQ96), reference: String(now), deviationBps: deviationBps(ship.anchorQ96, now) };
  }
  return { lease, trader: { id: traderId, heartbeatAgeS }, quotes: { ageS: quotesAgeS, lastShipTx: ship?.tx ?? null }, market };
}

async function attest(ctx, request) {
  const obs = await observe(ctx);
  const now = obs.lease.now ?? Math.floor(Date.now() / 1000);
  const decision = decide({ now, lease: obs.lease, request, trader: obs.trader, quotes: obs.quotes, market: obs.market, limits: LIMITS });
  if (!decision.sign) {
    ctx.log('withheld', { reason: decision.reason, requester: request.requester || null, ...decision.detail });
    if (decision.incident) await postIncident(ctx.h, { kind: decision.reason, epoch: String(obs.lease.epoch), castle: obs.lease.castle, ...decision.detail }, ctx.log).catch((e) => ctx.log('incident-error', { error: e.message }));
    return { status: 409, body: { withheld: decision.reason, detail: decision.detail } };
  }
  if (obs.lease.fo.toLowerCase() !== ctx.account.address.toLowerCase()) {
    ctx.log('withheld', { reason: 'not-castle-fo', castleFo: obs.lease.fo, me: ctx.account.address });
    return { status: 409, body: { withheld: 'not-castle-fo', detail: { castleFo: obs.lease.fo } } };
  }
  const chainId = await ctx.pc.getChainId();
  const att = { chainId, castle: obs.lease.castle, ...decision.att };
  const digest = attestationDigest(att);
  // Check against the Castle's own digest before signing: a domain mismatch would make every renew revert.
  const onchain = await ctx.pc.readContract({ address: obs.lease.castle, abi: abi('ICastleLease'), functionName: 'attestationDigest', args: [{ epoch: att.epoch, expiry: BigInt(att.expiry), deadline: BigInt(att.deadline) }] }).catch(() => null);
  if (onchain && onchain !== digest) {
    ctx.log('withheld', { reason: 'digest-mismatch', local: digest, castle: onchain });
    return { status: 500, body: { withheld: 'digest-mismatch' } };
  }
  const signature = await signAttestation(ctx.account, att);
  ctx.log('attested', { epoch: att.epoch, expiry: att.expiry, deadline: att.deadline, requester: request.requester || null, digestChecked: Boolean(onchain), ...decision.checks });
  return { status: 200, body: { epoch: String(att.epoch), expiry: att.expiry, deadline: att.deadline, signature, digest, signer: ctx.account.address } };
}

function serve(ctx) {
  const server = http.createServer(async (req, res) => {
    const reply = (status, body) => { res.writeHead(status, { 'content-type': 'application/json' }); res.end(JSON.stringify(body, big)); };
    try {
      if (req.method === 'GET' && req.url === '/health') return reply(200, await observe(ctx));
      if (req.method === 'POST' && req.url === '/attest') {
        let raw = '';
        for await (const chunk of req) { raw += chunk; if (raw.length > 4096) return reply(413, { error: 'body too large' }); }
        const body = raw ? JSON.parse(raw) : {};
        const r = await attest(ctx, { expiry: body.expiry, epoch: body.epoch, requester: body.requester });
        return reply(r.status, r.body);
      }
      reply(404, { error: 'POST /attest {expiry?, epoch?, requester?} or GET /health' });
    } catch (e) { reply(500, { error: e.shortMessage || e.message }); }
  });
  server.on('error', (e) => ctx.log('attester-error', { error: e.message }));
  server.listen(PORT, '127.0.0.1', () => ctx.log('attester-listening', { url: `http://127.0.0.1:${PORT}` }));
  return server;
}

export default {
  intervalMs: 10_000,
  async init(ctx) {
    await ensureChannel(ctx.h).then(() => ctx.log('incident-channel', { ok: true }), (e) => ctx.log('incident-channel', { ok: false, error: e.message }));
    serve(ctx);
  },
  async tick(ctx) {
    const obs = await observe(ctx);
    if (!obs.lease.deployed) return ctx.logChange('lease', 'lease', { deployed: false });
    const { lease } = obs;
    ctx.logChange('lease', 'lease', { state: lease.state, holder: lease.holder, epoch: lease.epoch, castleFoIsMe: lease.fo.toLowerCase() === ctx.account.address.toLowerCase() });
    // Watch for a hang proactively, not only when asked.
    if (lease.state === 'LIVE') {
      const d = decide({ now: lease.now, lease, request: {}, trader: obs.trader, quotes: obs.quotes, market: obs.market, limits: LIMITS });
      ctx.logChange('verdict', 'verdict', { wouldSign: d.sign, reason: d.reason || null });
      if (!d.sign && d.incident) await postIncident(ctx.h, { kind: d.reason, epoch: String(lease.epoch), castle: lease.castle, ...d.detail }, ctx.log).catch((e) => ctx.log('incident-error', { error: e.message }));
    }
    // Replay the fills since the last tick.
    const from = S.replayFrom ?? (lease.block > LOOKBACK_BLOCKS ? lease.block - LOOKBACK_BLOCKS : 0n);
    if (lease.block >= from) {
      const initial = await readLease(ctx.pc, { blockNumber: from }).catch(() => lease);
      const shippedEpochOf = (h) => ctx.pc.readContract({ address: lease.castle, abi: abi('Castle'), functionName: 'shippedEpoch', args: [h] }).catch(() => undefined);
      const r = await replayFills(ctx.pc, { aqua: contractAddress('aqua'), castle: lease.castle, fromBlock: from, toBlock: lease.block, initial, shippedEpochOf });
      for (const f of r.fills) {
        ctx.log('fill', { verdict: f.verdict, tx: f.tx, link: txLink(f.tx), shippedEpoch: f.shippedEpoch, epochAtFill: f.epochAtFill });
        if (f.verdict === 'FENCE-BREACH') await postIncident(ctx.h, { kind: 'fence-breach', epoch: String(f.epochAtFill), tx: f.tx, link: txLink(f.tx), shippedEpoch: String(f.shippedEpoch) }, ctx.log).catch(() => {});
      }
      S.replayFrom = lease.block + 1n;
    }
  },
  // Fallback transport: {kind:'attestation.request', expiry?, epoch?} as JSON text. The answer goes back by message
  // too (charged), so the holder should use POST /attest whenever it can reach fo locally.
  async onMessage(ctx, msg) {
    let body = null;
    try { body = JSON.parse(msg.text); } catch { /* not JSON */ }
    if (body?.kind !== 'attestation.request' || !ctx.crew.agents[msg.from]) return ctx.log('noted', { from: msg.from, kind: msg.kind });
    const r = await attest(ctx, { expiry: body.expiry, epoch: body.epoch, requester: msg.from });
    await ctx.h.send(msg.from, JSON.stringify({ kind: r.status === 200 ? 'attestation.granted' : 'attestation.withheld', ...r.body }, big)).catch((e) => ctx.log('reply-error', { error: e.message }));
  },
};
