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
export function takerData({ taker, isExactIn = true, threshold, to, deadline = 0, useTransferFromAndAquaPush = true, isFirstTransferFromTaker = false, instructionsArgs = '0x' }) {
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

// The castle trades one pair: the other side of USDC is WETH and vice versa.
const otherToken = (t) => (sameAddr(t, addr('usdc')) ? addr('weth') : sameAddr(t, addr('weth')) ? addr('usdc') : (() => { throw new Error('tokenOut is required for a token that is not USDC or WETH'); })());

function pickStrategy(hash) {
  const live = liveStrategies();
  const s = hash ? live.find((x) => x.hash === hash) : live.filter((x) => x.strategy).at(-1);
  if (!s) throw new Error(hash ? `strategy ${hash} is not live on the castle` : 'the castle has no live strategy shipped yet');
  if (!s.strategy) throw new Error(`strategy ${s.hash} was shipped before this service started indexing; its bytes are not known`);
  const [order] = decodeAbiParameters(ORDER, s.strategy);
  return { s, order };
}

// An applicant's name must be its own and unexpired. A <label>.feefifofum.eth name is read from the agent
// registry (owner and expiry, as JackHook reads it); any other name must resolve to the address through
// UniversalResolverV2.
async function checkName(ens, a) {
  const parent = '.feefifofum.eth';
  const registry = addr('registry');
  if (registry && ens.endsWith(parent) && !ens.slice(0, -parent.length).includes('.')) {
    const label = ens.slice(0, -parent.length);
    const [owner, expiry, h] = await Promise.all([
      client.readContract({ address: registry, abi: abi('AgentRegistry'), functionName: 'findOwner', args: [label] }),
      client.readContract({ address: registry, abi: abi('AgentRegistry'), functionName: 'findExpiry', args: [label] }),
      head(),
    ]);
    return { via: 'agent registry', registry, owner, expiry: Number(expiry), ok: sameAddr(owner, a) && Number(expiry) > Number(h.timestamp) };
  }
  const resolved = await client.getEnsAddress({ name: ens, universalResolverAddress: addr('universalResolver') }).catch(() => null);
  return { via: 'UniversalResolverV2', resolved, ok: sameAddr(resolved, a) };
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
    description: 'Quote a swap against the castle book through the SwapVM router: the view path runs the same FeeFiFoFumExtruction fence the swap will, so a stale epoch quotes as a FeeFiFoFum() revert. tokenIn/tokenOut are "USDC", "WETH" or addresses (tokenOut defaults to the other one); amount is atomic units (exact in by default).',
    input: { tokenIn: z.string(), tokenOut: z.string().optional(), amount: z.string(), exactIn: z.boolean().optional(), strategy: z.string().optional(), taker: z.string().optional() },
    run: async ({ tokenIn, tokenOut, amount, exactIn = true, strategy, taker }) => {
      const router = need(addr('router'), 'the SwapVM router');
      const { s, order } = pickStrategy(strategy);
      const tIn = token(tokenIn), tOut = tokenOut ? token(tokenOut) : otherToken(tIn);
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
      if (!tokenIn || !amount) throw new Error('tokenIn and amount are required to build a fill (tokenOut defaults to the other token)');
      const { s, order } = pickStrategy(strategy);
      const tIn = token(tokenIn), tOut = tokenOut ? token(tokenOut) : otherToken(tIn);
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
    description: 'Apply to the castle\'s standby crew (the agents that may claim the castle when the lease lapses). Give your handoff agent_id, the Sepolia address you will claim from, and your ENSv2 name. The name is checked on-chain: a <label>.feefifofum.eth name must be owned by addr and unexpired in the agent registry, and any other name must resolve to addr. An application with a name that fails the check is refused.',
    input: { agent_id: z.string(), addr: z.string(), ens: z.string().optional(), mcp: z.string().optional() },
    run: async ({ agent_id, addr: a, ens, mcp }) => {
      if (!isAddress(a)) throw new Error('addr must be a Sepolia address');
      const name = ens ? await checkName(ens.toLowerCase(), getAddress(a)) : null;
      if (name && !name.ok) return { joined: false, reason: `${ens} is not an unexpired name owned by ${getAddress(a)}`, name };
      const row = { agent_id, addr: getAddress(a), ens: ens || null, ensChecked: name ? name.via : null, mcp: mcp || null, joined_at: new Date().toISOString() };
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
      if (!member) throw new Error(`${agent_id} has not applied; call castle_join first`);
      // The crew that may claim is Castle's on-chain crew (set by the operator); castle_join is the application.
      // Castle v2: crew = an operator-set crew label AND that name owned, unexpired, in the agent registry.
      const onChain = await client.readContract({ address: castle, abi: abi('Castle'), functionName: 'isCrew', args: [member.addr] }).catch(() => null);
      if (onChain === false) return { ok: false, reason: 'NotCrew', from: member.addr, note: 'applied through castle_join, but Castle.isCrew(addr) is false until the operator calls setCrew(addr, label) for a name addr owns' };
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
    description: 'Bid in the castle\'s CCA (Uniswap CCA v2.1.0). Returns the unsigned txs to send in order: USDC.approve(Permit2) and Permit2.approve(USDC, auction) when the allowances are short, then submitBid(maxPriceQ96, amount, owner, hookData). JackHook admits only the owner of an unexpired <label>.feefifofum.eth, and hookData is that label\'s bytes: pass label (e.g. "agy"), or it is looked up for crew and joined agents. Give maxPrice as usdcPerWeth or maxPriceQ96 (rounded up to the auction\'s tick), and amount as atomic USDC. You pay the uniform clearing price, not maxPrice. A bid only buys the supply from its block on, so bid early.',
    input: { owner: z.string(), amount: z.string(), label: z.string().optional(), maxPriceQ96: z.string().optional(), usdcPerWeth: z.string().optional(), hookData: z.string().optional(), auction: z.string().optional() },
    run: async ({ owner, amount, label, maxPriceQ96, usdcPerWeth, hookData, auction }) => {
      const a = auction || snapshot().auction?.auction;
      if (!a) throw new Error('no CCA is open on the castle right now');
      if (!isAddress(a)) throw new Error('auction must be an address');
      if (!isAddress(owner)) throw new Error('owner must be an address');
      const A = getAddress(a), O = getAddress(owner), amt = BigInt(amount);
      const read = (functionName, args = []) => client.readContract({ address: A, abi: abi('CCA'), functionName, args });
      const [currency, tick, floor, clearing] = await Promise.all([read('currency'), read('tickSpacing'), read('floorPrice'), read('clearingPrice')]);
      let q96 = maxPriceQ96 != null ? BigInt(maxPriceQ96) : null;
      if (q96 == null) {
        if (!usdcPerWeth) throw new Error('give maxPriceQ96 or usdcPerWeth');
        const [w, f = ''] = String(usdcPerWeth).split('.');
        const cents = BigInt(w) * 100n + BigInt((f + '00').slice(0, 2));
        q96 = (cents * (2n ** 96n)) / (100n * 10n ** 12n);
      }
      q96 = ((q96 + tick - 1n) / tick) * tick;   // CCA ticks: TickPriceNotAtBoundary otherwise
      const above = (clearing > floor ? clearing : floor);
      if (q96 <= above) throw new Error(`maxPrice ${priceView(q96).usdcPerWeth} USDC/WETH must be above the clearing price ${priceView(above).usdcPerWeth} (BidMustBeAboveClearingPrice)`);
      // JackHook's check, before the bidder spends gas on it: owner holds <label>.feefifofum.eth, unexpired.
      const name = label ? `${label}.feefifofum.eth` : lookupName(O);
      if (!hookData) {
        if (!name || !name.endsWith('.feefifofum.eth')) throw new Error('give label: your <label>.feefifofum.eth, which JackHook checks against owner');
        hookData = toHex(new TextEncoder().encode(name.slice(0, -'.feefifofum.eth'.length)));
      }
      const nameCheck = name ? await checkName(name, O) : null;
      if (nameCheck && !nameCheck.ok) throw new Error(`${name} is not owned by ${O} and unexpired in the agent registry (JackHook would revert NotNameOwner/NameExpired)`);
      const PERMIT2 = '0x000000000022D473030F116dDEE9F6B43aC78BA3';
      const erc20 = [{ type: 'function', name: 'approve', stateMutability: 'nonpayable', inputs: [{ type: 'address' }, { type: 'uint256' }], outputs: [{ type: 'bool' }] },
        { type: 'function', name: 'allowance', stateMutability: 'view', inputs: [{ type: 'address' }, { type: 'address' }], outputs: [{ type: 'uint256' }] }];
      const p2 = [{ type: 'function', name: 'approve', stateMutability: 'nonpayable', inputs: [{ name: 'token', type: 'address' }, { name: 'spender', type: 'address' }, { name: 'amount', type: 'uint160' }, { name: 'expiration', type: 'uint48' }], outputs: [] },
        { type: 'function', name: 'allowance', stateMutability: 'view', inputs: [{ type: 'address' }, { type: 'address' }, { type: 'address' }], outputs: [{ type: 'uint160' }, { type: 'uint48' }, { type: 'uint48' }] }];
      const [toPermit2, [allowed, expiration], h] = await Promise.all([
        client.readContract({ address: currency, abi: erc20, functionName: 'allowance', args: [O, PERMIT2] }),
        client.readContract({ address: PERMIT2, abi: p2, functionName: 'allowance', args: [O, currency, A] }),
        head(),
      ]);
      const steps = [];
      if (toPermit2 < amt) steps.push({ what: 'USDC.approve(Permit2)', to: currency, data: encodeFunctionData({ abi: erc20, functionName: 'approve', args: [PERMIT2, amt] }), value: '0' });
      if (allowed < amt || BigInt(expiration) < BigInt(h.timestamp) + 600n) {
        steps.push({ what: 'Permit2.approve(USDC, auction)', to: PERMIT2, data: encodeFunctionData({ abi: p2, functionName: 'approve', args: [currency, A, amt, Number(h.timestamp) + 86_400] }), value: '0' });
      }
      const data = encodeFunctionData({ abi: abi('CCA'), functionName: 'submitBid', args: [q96, amt, O, hookData] });
      steps.push({ what: 'submitBid', to: A, data, value: '0' });
      let simulation = steps.length > 1 ? 'skipped: send the approvals first, then re-run to simulate the bid' : 'ok';
      if (steps.length === 1) {
        try { await client.call({ to: A, data, account: O }); } catch (e) { simulation = decodeRevert(e?.walk?.((x) => x?.data)?.data) || e?.shortMessage || String(e); }
      }
      return { auction: A, owner: O, name, hookData, maxPrice: priceView(q96), maxPriceQ96: q96.toString(), amount, chainId: 11155111, steps, tx: steps.at(-1), simulation, nameCheck };
    },
  },
};
