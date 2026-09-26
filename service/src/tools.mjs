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
import { routeViaPoll } from './fo.mjs';

const MAX = 2n ** 256n - 1n;
const symbols = [['USDC', () => addr('usdc')], ['WETH', () => addr('weth')]];

async function vaultRead(fn, args = []) {
  return client.readContract({ address: addr('castle'), abi: abi('CastleVault'), functionName: fn, args });
}

export const tools = {
  castle_status: {
    description: 'Returns the current state of CastleVault on Ethereum Sepolia, read at call time. The result has the vault\'s USDC and WETH balances (the hoard field), the latest price that fee (the pricing agent) reported, with its mid, spread and whether it is fresh, and the active SwapVM strategies. harp is the RFQ strategy, priced from quotes that fi signs, and hen is the XYC curve that the v4 hook fills from. The result also says whether each agent has reported recently and lists the contract addresses. Use it before quoting or routing to see what the vault can fill.',
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
    description: 'Returns a firm quote from the RFQ strategy (harp) as the same JSON that the ENS text record of quote.feefifofum.eth returns for the key "quote:<tokenIn>:<tokenOut>:<amountIn>". Use it when you do not resolve ENS. tokenIn and tokenOut are "USDC" or "WETH", and amountIn is in base units as a decimal string ("1000000" is 1 USDC). The price comes from fee\'s latest report, fi signs the quote as an EIP-712 Quote that PriceExtruction checks on-chain, and the quote is valid for 30 seconds. It carries takerTraitsAndData for router.swap. When no quote can be given, the error says why, for example that fee has not reported a price for over 60 seconds, that harp is not shipped, or that its allocation is too small for the amount.',
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
    description: 'Returns the two unsigned calls that fill a quote from castle_quote or the ENS record. approve approves the router for amountIn of tokenIn, and tx calls router.swap(order, tokenIn, tokenOut, amountIn, takerTraitsAndData). Sign and send both from your own wallet before the quote\'s validUntil. This tool never sends a transaction. If you pass tx_hash instead, the service records that fill attempt, so that a reverted fill, which emits no logs, still appears on the castle stream.',
    input: { quoteId: z.string().optional(), taker: z.string().optional(), tx_hash: z.string().optional() },
    run: async ({ quoteId, taker, tx_hash }) => {
      if (tx_hash) {
        const ev = await refusedFill(tx_hash, { quoteId: quoteId ?? null });
        return ev ? { recorded: true, status: 'reverted', revert: ev.revert, tx: tx_hash } : { recorded: false, note: 'the transaction did not revert, so its fill is read from the chain, or it is already recorded', tx: tx_hash };
      }
      if (!quoteId) throw new Error('quoteId is required (from castle_quote or the ENS record)');
      const q = quoteById(quoteId);
      if (!q) throw new Error(`this service has no quote ${quoteId}; quotes are kept for 30 s, so call castle_quote again`);
      const left = q.validUntil - Math.floor(Date.now() / 1000);
      if (left <= 0) throw new Error(`quote ${quoteId} expired ${-left}s ago (PriceExtruction would revert QuoteExpired)`);
      const order = { maker: q.order.maker, traits: BigInt(q.order.traits), data: q.order.data };
      const data = encodeFunctionData({ abi: abi('SwapVM'), functionName: 'swap', args: [order, q.tokenIn, q.tokenOut, BigInt(q.amountIn), q.takerTraitsAndData] });
      const approve = encodeFunctionData({ abi: abi('ERC20'), functionName: 'approve', args: [q.router, BigInt(q.amountIn)] });
      let allowance = null;
      if (taker && isAddress(taker)) allowance = (await client.readContract({ address: q.tokenIn, abi: abi('ERC20'), functionName: 'allowance', args: [getAddress(taker), q.router] }).catch(() => null))?.toString() ?? null;
      return {
        quoteId, secondsLeft: left, amountIn: q.amountIn, amountOut: q.amountOut,
        approve: { to: q.tokenIn, data: approve, value: '0', note: allowance != null && BigInt(allowance) >= BigInt(q.amountIn) ? 'the allowance already covers amountIn' : 'send this approve first, for exactly amountIn' },
        tx: { to: q.router, data, value: '0', chainId: env.chainId },
      };
    },
  },

  castle_allocations: {
    description: 'Returns how the vault\'s balances are allocated to its strategies. For each active strategy it gives the Aqua allocation (a virtual balance) of each token, the cap that fum (the risk agent) set for the strategy\'s slot, and the number of fills. For each token it gives the vault\'s balance, the committed amount (the sum of the active strategies\' allocations), fum\'s leverage limit in basis points, and the headroom left before a ship reverts with OverAllocated. The allocations can add up to more than the balance, because the strategies share the same liquidity up to the leverage limit.',
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
    description: 'Asks fo, the routing agent, to route a UniswapX-format order. fo compares a signed quote from the RFQ strategy (harp) with the Uniswap v4 pool, which the v4 hook fills just in time from the hen strategy, and returns the route that pays more, with calldata ready to sign. order is {swapper, input: {token, amount}, outputs: [{token, amount (the minimum), recipient}], deadline, nonce} in the UniswapX shape, and startAmount and endAmount are also accepted. Tokens are "USDC", "WETH" or addresses. Sepolia has no UniswapX reactor, so the swapper signs and sends the returned calls itself.',
    input: { order: z.record(z.any()) },
    run: async ({ order }) => {
      const fo = process.env.FO_URL;
      if (!fo) return routeViaPoll(order);   // fo polls this service from wherever the crew runs
      const r = await fetch(`${fo.replace(/\/$/, '')}/route`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ order }), signal: AbortSignal.timeout(20_000) }).catch((e) => ({ ok: false, status: 502, json: async () => ({ error: `fo is down: ${e.message}` }) }));
      const j = await r.json().catch(() => ({ error: 'fo answered with no JSON' }));
      if (!r.ok) throw new Error(j.error || `fo answered ${r.status}`);
      return j;
    },
  },
};
