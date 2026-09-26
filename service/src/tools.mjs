// The castle's MCP tools for solvers (docs/SPEC.md "The castle service"). Each is one plain async function over a
// JSON input; server.mjs exposes them as MCP tools (Streamable HTTP at /mcp) and as REST (POST /tools/<name>).
// The service holds no solver's key: castle_fill returns the unsigned calls to sign, and never sends anything.
import { z } from 'zod';
import { encodeFunctionData, getAddress, isAddress } from 'viem';
import { addr, addressBook, env } from './config.mjs';
import { abi } from './abi.mjs';
import { client, head, sameAddr } from './chain.mjs';
import { view, emit } from './stream.mjs';
import { snapshot, liveStrategies, health, hoardAt, allocAt, refusedFill, config, SLOT_NAMES } from './indexer.mjs';
import { harpQuote, quoteById, feePrice } from './quote.mjs';

const MAX = 2n ** 256n - 1n;
const symbols = [['USDC', () => addr('usdc')], ['WETH', () => addr('weth')]];

async function vaultRead(fn, args = []) {
  return client.readContract({ address: addr('castle'), abi: abi('CastleVault'), functionName: fn, args });
}

export const tools = {
  castle_status: {
    description: 'The Castle now: the hoard (the vault\'s USDC and WETH), fee\'s price (mid, spread), the live SwapVM strategies (harp, the RFQ priced by fi\'s signed quotes; hen, the XYC curve the v4 hook fills from), whether each agent is alive, and the contract addresses. Read live from Ethereum Sepolia.',
    input: {},
    run: async () => {
      const h = await head();
      const s = snapshot();
      return {
        block: Number(h.number), blockTime: h.timestamp,
        hoard: addr('castle') ? await hoardAt(h.number) : null,
        price: s.price, priceFresh: feePrice().ok,
        strategies: s.strategies.filter((x) => !x.docked).map(({ hash, slot, label, kind, alloc, cap, fills }) => ({ hash, slot, label, kind, alloc, cap, fills })),
        agents: s.agents.map(({ id, role, alive, lastBeat }) => ({ id, role, alive, lastBeat })),
        contracts: config(), indexer: health(),
      };
    },
  },

  castle_quote: {
    description: 'A firm harp quote, the same JSON the ENS text record quote.feefifofum.eth serves for key "quote:<tokenIn>:<tokenOut>:<amountIn>", for agents that skip ENS. tokenIn/tokenOut are "USDC" or "WETH"; amountIn is base units as a decimal string ("1000000" is 1 USDC). The quote is priced by fee, signed by fi (EIP-712, checked on-chain by PriceExtruction), valid for 30 s, and carries takerTraitsAndData ready for router.swap. Errors name why there is no quote (fee silent, harp not shipped, allocation too small).',
    input: { tokenIn: z.string(), tokenOut: z.string(), amountIn: z.string() },
    run: async ({ tokenIn, tokenOut, amountIn }) => {
      if (!/^\d+$/.test(amountIn)) throw new Error('amountIn must be base units as a decimal string');
      const q = await harpQuote({ tokenIn, tokenOut, amountIn });
      if (!q.ok) throw new Error(q.error);
      emit('quote.served', {
        id: q.quote.id, via: 'mcp', name: null, key: `quote:${q.symIn}:${q.symOut}:${q.quote.amountIn}`, sender: null, requester: null, requesterName: null,
        strategy: q.quote.strategyHash, tokenIn: q.symIn, tokenOut: q.symOut, amountIn: q.quote.amountIn, amountOut: q.quote.amountOut,
        priceQ96: q.quote.priceQ96, price: q.price, validUntil: q.quote.validUntil, signer: 'fi', signerAddr: q.quote.signer, digest: null,
      }, { src: 'service' });
      return q.quote;
    },
  },

  castle_fill: {
    description: 'The unsigned calls that fill a harp quote: {approve, tx} where tx is router.swap(order, tokenIn, tokenOut, amountIn, takerTraitsAndData). Sign and send them from your own wallet before the quote\'s validUntil; this tool never sends anything. With tx_hash instead: records that fill attempt, so a reverted fill (which emits no logs) still reaches the castle stream.',
    input: { quoteId: z.string().optional(), taker: z.string().optional(), tx_hash: z.string().optional() },
    run: async ({ quoteId, taker, tx_hash }) => {
      if (tx_hash) {
        const ev = await refusedFill(tx_hash, { quoteId: quoteId ?? null });
        return ev ? { recorded: true, status: 'reverted', revert: ev.revert, tx: tx_hash } : { recorded: false, note: 'the tx succeeded (its fill comes from the chain) or is already recorded', tx: tx_hash };
      }
      if (!quoteId) throw new Error('quoteId is required (from castle_quote or the ENS record)');
      const q = quoteById(quoteId);
      if (!q) throw new Error(`no quote ${quoteId} on this service (quotes live 30 s; ask castle_quote again)`);
      const left = q.validUntil - Math.floor(Date.now() / 1000);
      if (left <= 0) throw new Error(`quote ${quoteId} expired ${-left}s ago (PriceExtruction would revert QuoteExpired)`);
      const order = { maker: q.order.maker, traits: BigInt(q.order.traits), data: q.order.data };
      const data = encodeFunctionData({ abi: abi('SwapVM'), functionName: 'swap', args: [order, q.tokenIn, q.tokenOut, BigInt(q.amountIn), q.takerTraitsAndData] });
      const approve = encodeFunctionData({ abi: abi('ERC20'), functionName: 'approve', args: [q.router, BigInt(q.amountIn)] });
      let allowance = null;
      if (taker && isAddress(taker)) allowance = (await client.readContract({ address: q.tokenIn, abi: abi('ERC20'), functionName: 'allowance', args: [getAddress(taker), q.router] }).catch(() => null))?.toString() ?? null;
      return {
        quoteId, secondsLeft: left, amountIn: q.amountIn, amountOut: q.amountOut,
        approve: { to: q.tokenIn, data: approve, value: '0', note: allowance != null && BigInt(allowance) >= BigInt(q.amountIn) ? 'already approved' : 'approve the router for tokenIn once' },
        tx: { to: q.router, data, value: '0', chainId: env.chainId },
      };
    },
  },

  castle_allocations: {
    description: 'The Castle\'s promises. Per strategy: its Aqua allocation (virtual balance) per token, fum\'s cap for its slot, and its fills. Per token: the vault balance, committed (the sum of live allocations), fum\'s leverage and the headroom left before a ship reverts OverAllocated. Promises may add up to more than the balance: that is shared liquidity, bounded by leverage.',
    input: {},
    run: async () => {
      if (!addr('castle')) throw new Error('no CastleVault in the deployments file yet');
      const h = await head();
      const tokens = {};
      for (const [sym, a] of symbols) {
        const t = a();
        const [bal, committed, headroom, lev] = await Promise.all([
          client.readContract({ address: t, abi: abi('ERC20'), functionName: 'balanceOf', args: [addr('castle')] }),
          vaultRead('committed', [t]), vaultRead('headroom', [t]), vaultRead('leverageOf', [t]),
        ]);
        tokens[sym] = { balance: bal.toString(), committed: committed.toString(), headroom: headroom.toString(), leverageBps: Number(lev) };
      }
      const hashes = await vaultRead('activeStrategies');
      const strategies = [];
      for (const hash of hashes) {
        const slot = Number(await vaultRead('slotOf', [hash]));
        const [w, u] = await vaultRead('capOf', [slot]);
        const row = view().strategies.get(hash);
        strategies.push({ hash, slot, label: SLOT_NAMES[slot] ?? `slot ${slot}`, alloc: await allocAt(hash, h.number), cap: { WETH: w.toString(), USDC: u.toString() }, fills: row?.fills ?? 0 });
      }
      return { block: Number(h.number), tokens, strategies };
    },
  },

  castle_route: {
    description: 'fo routes a UniswapX-format order: it compares harp\'s signed quote with the v4 pool (filled just in time from the Castle\'s hen) and returns the better route with ready calldata. order: {swapper, input: {token, amount}, outputs: [{token, amount (the minimum), recipient}], deadline, nonce} in the UniswapX shape (startAmount/endAmount also accepted). Tokens are "USDC"/"WETH" or addresses. There is no UniswapX reactor on Sepolia, so the swapper signs and sends the returned calls itself.',
    input: { order: z.record(z.any()) },
    run: async ({ order }) => {
      const fo = process.env.FO_URL;
      if (!fo) throw new Error('fo is not reachable from this service (FO_URL unset)');
      const r = await fetch(`${fo.replace(/\/$/, '')}/route`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ order }), signal: AbortSignal.timeout(20_000) }).catch((e) => ({ ok: false, status: 502, json: async () => ({ error: `fo is down: ${e.message}` }) }));
      const j = await r.json().catch(() => ({ error: 'fo answered with no JSON' }));
      if (!r.ok) throw new Error(j.error || `fo answered ${r.status}`);
      return j;
    },
  },
};
