// The castle's seven tools. Each is one plain async function over a JSON input; server.mjs exposes them
// as MCP tools (Streamable HTTP at /mcp) and as REST (POST /tools/<name>). The service holds no caller's
// key: write tools return the exact {to, data, value} to sign, and castle_fill takes the mined tx hash back
// so a reverted fill (which emits no logs) still reaches /fills and the stream.
import { z } from 'zod';
import { encodeFunctionData, decodeFunctionData, encodeAbiParameters, keccak256, encodePacked, decodeAbiParameters, getAddress, isAddress, toHex, concat, pad } from 'viem';
import { addr, addressBook } from './config.mjs';
import { abi } from './abi.mjs';
import { client, head, readLease, auctionView, priceView, fenceDecision, leaseState, revertReason, decodeRevert, blockTime, sameAddr } from './chain.mjs';
import { snapshot, liveStrategies, currentLease, recordRelayedFill, joinCrew, crew, watchAuction, health } from './indexer.mjs';

const ORDER = [{ type: 'tuple', components: [{ name: 'maker', type: 'address' }, { name: 'traits', type: 'uint256' }, { name: 'data', type: 'bytes' }] }];
const token = (t) => {
  if (!t) return null;
  const u = String(t).toUpperCase();
  if (u === 'USDC') return addr('usdc');
  if (u === 'WETH') return addr('weth');
  return isAddress(t) ? getAddress(t) : null;
};
const need = (v, what) => { if (!v) throw new Error(`${what} is not deployed yet (contracts/deployments/sepolia.json has no address for it)`); return v; };

// SwapVM 1.0.2 TakerTraitsLib.build, in JS: uint160 slice indexes + uint16 flags, then the slices.
export function takerData({ taker, isExactIn = true, threshold, to, deadline = 0, useTransferFromAndAquaPush = true, isFirstTransferFromTaker = true, instructionsArgs = '0x' }) {
  const th = threshold != null ? pad(toHex(BigInt(threshold)), { size: 32 }) : '0x';
  const toSlice = to && taker && !sameAddr(to, taker) ? getAddress(to) : '0x';
  const dl = deadline ? pad(toHex(BigInt(deadline)), { size: 5 }) : '0x';
  const len = (h) => (h.length - 2) / 2;
  const i0 = len(th); const i1 = i0 + len(toSlice); const i2 = i1 + len(dl);
  const i3 = i2, i4 = i3, i5 = i4, i6 = i5, i7 = i6, i8 = i7; const i9 = i8 + len(instructionsArgs);
  const idx = [i0, i1, i2, i3, i4, i5, i6, i7, i8, i9].reduce((acc, v, k) => acc | (BigInt(v) << BigInt(16 * k)), 0n);
  const flags = (isExactIn ? 0x0001 : 0) | (isFirstTransferFromTaker ? 0x0020 : 0) | (useTransferFromAndAquaPush ? 0x0040 : 0);
  return concat([encodePacked(['uint160', 'uint16'], [idx, flags]), th, toSlice, dl, instructionsArgs]);
}

function pickStrategy(hash) {
  const live = liveStrategies();
  const s = hash ? live.find((x) => x.hash === hash) : live.filter((x) => x.strategy).at(-1);
  if (!s) throw new Error(hash ? `strategy ${hash} is not live on the castle` : 'the castle has no live strategy shipped yet');
  if (!s.strategy) throw new Error(`strategy ${s.hash} was shipped before this service started indexing; its bytes are not known`);
  const [order] = decodeAbiParameters(ORDER, s.strategy);
  return { s, order };
}

const lookupName = (a) => crew().find((c) => sameAddr(c.addr, a))?.ens || snapshot().agents.find((x) => sameAddr(x.addr, a))?.ens || null;

export const tools = {
  castle_status: {
    description: 'The castle now: lease holder, fencing epoch, expiry and fence state (LIVE / WIND-DOWN), the strategies Castle shipped to 1inch Aqua, WETH and USDC inventory, the handoff-price written to ENS, the open CCA and the last fills. Read live from Ethereum Sepolia.',
    input: {},
    run: async () => {
      const h = await head();
      const s = snapshot();
      const lease = await readLease();
      return {
        block: Number(h.number), blockTime: h.timestamp,
        lease: lease?.epoch != null ? { ...lease, holderAgent: s.lease?.holderAgent ?? null, state: leaseState(lease, h.timestamp), secondsLeft: lease.expiry - h.timestamp } : null,
        strategies: s.strategies, inventory: s.inventory, price: s.price, auction: s.auction,
        crew: crew().map(({ agent_id, addr: a, ens }) => ({ agent_id, addr: a, ens })),
        contracts: addressBook(), indexer: health(),
        note: addr('castle') ? undefined : 'Castle is not deployed yet: the lease fields are null until contracts/deployments/sepolia.json lists it.',
      };
    },
  },

  castle_quote: {
    description: 'Quote a swap against the castle book through the SwapVM router: the view path runs the same FeeFiFoFumExtruction fence the swap will, so a stale epoch quotes as a FeeFiFoFum() revert. tokenIn/tokenOut are "USDC", "WETH" or addresses; amount is atomic units (exact in by default).',
    input: { tokenIn: z.string(), tokenOut: z.string(), amount: z.string(), exactIn: z.boolean().optional(), strategy: z.string().optional(), taker: z.string().optional() },
    run: async ({ tokenIn, tokenOut, amount, exactIn = true, strategy, taker }) => {
      const router = need(addr('router'), 'the SwapVM router');
      const { s, order } = pickStrategy(strategy);
      const tIn = token(tokenIn), tOut = token(tokenOut);
      const h = await head();
      const lease = currentLease();
      const decision = fenceDecision(s.epoch, lease?.epoch, lease?.expiry, h.timestamp);
      const data = takerData({ taker, isExactIn: exactIn });
      try {
        const [amountIn, amountOut, orderHash] = await client.readContract({ address: router, abi: abi('SwapVM'), functionName: 'quote', args: [order, tIn, tOut, BigInt(amount), data], account: taker && isAddress(taker) ? taker : undefined });
        return { ok: true, strategy: s.hash, programEpoch: s.epoch, leaseEpoch: lease?.epoch ?? null, decision, amountIn: amountIn.toString(), amountOut: amountOut.toString(), orderHash, block: Number(h.number) };
      } catch (e) {
        const raw = e?.walk?.((x) => typeof x?.data === 'string')?.data;
        return { ok: false, strategy: s.hash, programEpoch: s.epoch, leaseEpoch: lease?.epoch ?? null, decision, revert: raw ? decodeRevert(raw) : (e?.shortMessage || String(e)), block: Number(h.number) };
      }
    },
  },

  castle_fill: {
    description: 'Fill against the castle. Without tx_hash: returns the unsigned router.swap call {to, data, value} (plus the token approval the router needs) for the caller to sign from its own agent wallet; the service never holds your key. With tx_hash: records that fill attempt, success or revert, so a FeeFiFoFum() revert (which emits no logs) shows in /fills and the castle stream.',
    input: { tokenIn: z.string().optional(), tokenOut: z.string().optional(), amount: z.string().optional(), minOut: z.string().optional(), taker: z.string().optional(), strategy: z.string().optional(), deadline: z.number().optional(), tx_hash: z.string().optional() },
    run: async ({ tokenIn, tokenOut, amount, minOut, taker, strategy, deadline, tx_hash }) => {
      if (tx_hash) {
        const rc = await client.waitForTransactionReceipt({ hash: tx_hash, timeout: 60_000 });
        const t = await blockTime(rc.blockNumber);
        const lease = await readLease(rc.blockNumber);
        const tx = await client.getTransaction({ hash: tx_hash });
        let programEpoch = null, strategyHash = null;
        try {
          const d = decodeFunctionData({ abi: abi('SwapVM'), data: tx.input });
          const order = d.args[0];
          strategyHash = keccak256(encodeAbiParameters(ORDER, [order]));
          programEpoch = liveStrategies().find((x) => x.hash === strategyHash)?.epoch ?? snapshot().strategies.find((x) => x.hash === strategyHash)?.epoch ?? null;
        } catch { /* not a router.swap call */ }
        const reverted = rc.status !== 'success';
        const reason = reverted ? (await revertReason(tx_hash)).reason : null;
        const decision = fenceDecision(programEpoch, lease?.epoch, lease?.expiry, t);
        const entry = {
          type: 'fill', id: `${tx_hash}:0`, taker: tx.from, takerName: lookupName(tx.from), tokenIn: null, tokenOut: null, amountIn: null, amountOut: null,
          strategy: strategyHash, programEpoch, leaseEpoch: lease?.epoch ?? null, expiry: lease?.expiry ?? null,
          decision, status: reverted ? 'reverted' : 'success', revert: reason, block: Number(rc.blockNumber), tx: tx_hash, t: t * 1000,
        };
        await recordRelayedFill(entry);
        return { recorded: true, ...entry, etherscan: `https://sepolia.etherscan.io/tx/${tx_hash}` };
      }
      const router = need(addr('router'), 'the SwapVM router');
      if (!tokenIn || !tokenOut || !amount) throw new Error('tokenIn, tokenOut and amount are required to build a fill');
      const { s, order } = pickStrategy(strategy);
      const tIn = token(tokenIn), tOut = token(tokenOut);
      const data = encodeFunctionData({ abi: abi('SwapVM'), functionName: 'swap', args: [order, tIn, tOut, BigInt(amount), takerData({ taker, isExactIn: true, threshold: minOut ?? 1n, deadline })] });
      const approve = encodeFunctionData({ abi: [{ type: 'function', name: 'approve', stateMutability: 'nonpayable', inputs: [{ type: 'address' }, { type: 'uint256' }], outputs: [{ type: 'bool' }] }], functionName: 'approve', args: [router, BigInt(amount)] });
      return {
        strategy: s.hash, programEpoch: s.epoch,
        approve: { to: tIn, data: approve, value: '0' },
        tx: { to: router, data, value: '0', chainId: 11155111 },
        then: 'sign approve (once) and tx from your own wallet, then call castle_fill again with tx_hash so the attempt is recorded, including a FeeFiFoFum() revert',
      };
    },
  },

  castle_join: {
    description: 'Apply to the castle\'s standby crew (the agents that may claim the castle when the lease lapses). Give your handoff agent_id, the Sepolia address you will claim from, and your ENSv2 name; the name is checked on-chain when a registry is configured.',
    input: { agent_id: z.string(), addr: z.string(), ens: z.string().optional(), mcp: z.string().optional() },
    run: async ({ agent_id, addr: a, ens, mcp }) => {
      if (!isAddress(a)) throw new Error('addr must be a Sepolia address');
      const row = { agent_id, addr: getAddress(a), ens: ens || null, mcp: mcp || null, joined_at: new Date().toISOString() };
      joinCrew(row);
      return { joined: true, ...row, crew: crew().length };
    },
  },

  castle_claim: {
    description: 'Claim the castle after its lease has expired (crew only). Returns the unsigned Castle.claim() call for the crew member to sign; the claim re-registers castle.feefifofum.eth and starts a new fencing epoch, which fences every strategy shipped under the old one.',
    input: { agent_id: z.string() },
    run: async ({ agent_id }) => {
      const castle = need(addr('castle'), 'Castle');
      const member = crew().find((c) => c.agent_id === agent_id);
      if (!member) throw new Error(`${agent_id} is not on the castle crew; call castle_join first`);
      const h = await head();
      const lease = await readLease();
      if (lease?.expiry != null && h.timestamp <= lease.expiry) {
        return { ok: false, reason: 'LeaseStillLive', expiry: lease.expiry, secondsLeft: lease.expiry - h.timestamp, holder: lease.holder };
      }
      const data = encodeFunctionData({ abi: abi('Castle'), functionName: 'claim', args: [] });
      let simulation = 'ok';
      try { await client.call({ to: castle, data, account: member.addr }); } catch (e) { simulation = e?.shortMessage || String(e); }
      return { ok: true, from: member.addr, tx: { to: castle, data, value: '0', chainId: 11155111 }, prevEpoch: lease?.epoch ?? null, simulation };
    },
  },

  auction_status: {
    description: 'The castle\'s Uniswap CCA (shift-change or dissolution auction): status, clearing price (Q96 and USDC per WETH), supply, blocks and the JackHook validation hook. Pass auction to read a specific CCA.',
    input: { auction: z.string().optional() },
    run: async ({ auction }) => {
      const a = auction || snapshot().auction?.auction;
      if (!a) return { auction: null, note: 'no CCA is open on the castle right now' };
      if (!isAddress(a)) throw new Error('auction must be an address');
      watchAuction(a);
      return auctionView(getAddress(a));
    },
  },

  auction_bid: {
    description: 'Bid in the castle\'s CCA: returns the unsigned submitBid(maxPriceQ96, amount, owner, hookData) call plus the USDC approval. JackHook admits only bidders that own an unexpired ENSv2 agent name. Give maxPrice as usdcPerWeth or maxPriceQ96, and amount as atomic USDC.',
    input: { owner: z.string(), amount: z.string(), maxPriceQ96: z.string().optional(), usdcPerWeth: z.string().optional(), hookData: z.string().optional(), auction: z.string().optional() },
    run: async ({ owner, amount, maxPriceQ96, usdcPerWeth, hookData = '0x', auction }) => {
      const a = auction || snapshot().auction?.auction;
      if (!a) throw new Error('no CCA is open on the castle right now');
      if (!isAddress(owner)) throw new Error('owner must be an address');
      let q96 = maxPriceQ96 != null ? BigInt(maxPriceQ96) : null;
      if (q96 == null) {
        if (!usdcPerWeth) throw new Error('give maxPriceQ96 or usdcPerWeth');
        const [w, f = ''] = String(usdcPerWeth).split('.');
        const cents = BigInt(w) * 100n + BigInt((f + '00').slice(0, 2));
        q96 = (cents * (2n ** 96n)) / (100n * 10n ** 12n);
      }
      const view = await auctionView(getAddress(a));
      const data = encodeFunctionData({ abi: abi('CCA'), functionName: 'submitBid', args: [q96, BigInt(amount), getAddress(owner), hookData] });
      let simulation = 'ok';
      try { await client.call({ to: getAddress(a), data, account: getAddress(owner) }); } catch (e) { simulation = e?.shortMessage || String(e); }
      const approve = view?.currency ? encodeFunctionData({ abi: [{ type: 'function', name: 'approve', stateMutability: 'nonpayable', inputs: [{ type: 'address' }, { type: 'uint256' }], outputs: [{ type: 'bool' }] }], functionName: 'approve', args: [getAddress(a), BigInt(amount)] }) : null;
      return {
        auction: getAddress(a), maxPrice: priceView(q96), amount,
        approve: approve ? { to: view.currency, data: approve, value: '0' } : null,
        tx: { to: getAddress(a), data, value: '0', chainId: 11155111 }, simulation,
      };
    },
  },
};
