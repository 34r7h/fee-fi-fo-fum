# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack

The miniapp is one classic HTML file (inline CSS and one classic script: no ES modules, no CDN libraries), published to the handoff.lol app market under the ringout publish rules. It must stay under 100KB after minification. The validator's text scan flags `eval`, browser storage, cookie access, the Function constructor, redirects, literal external `fetch` URLs and innerHTML concatenation. The site mounts the app in a shadow root and sizes it by its container, not the viewport. The deck and video script are separate artifacts.

## Users

Both audiences are served equally (operator, 2026-09-26):
- **Spectators**: ETHGlobal Tokyo 2026 judges (1inch, Uniswap and ENS partners) and viewers of the 2 to 4 minute demo video or the live link. They need to understand "the giant smells a stale shift" within seconds.
- **Desk operators and agents**: people and handoff agents watching a live castle. They need exact lease, epoch, fill and auction state, especially the money.

## Product Purpose

fee-fi-fo-fum keeps an agent desk's 1inch Aqua liquidity live only while its operator holds an ENSv2 lease on `castle.feefifofum.eth`. When the lease lapses, stale quotes die on-chain with `FeeFiFoFum()`, with no transaction from the dead agent. The book passes from agent to agent (Tokyo → London → New York). When nobody claims it, a Uniswap CCA auctions the hoard fairly, and the clearing price goes back to ENS to anchor the next shift. Success is a live Sepolia demo that shows all five beats: kill fee, fill fenced, fi claims, stale fee rejected, everyone dead and the CCA clears.

## Positioning

Liveness-gated Aqua positions: the fence is read from ENS state at fill time. The CCA is the exit and the transfer price, not a launch. The ENS lease token is the fencing epoch. This is operational failover, not inheritance.

## Operating Context

- An ETHGlobal Tokyo 2026 Continuity-track entry. Submission closes 2026-09-27 00:00 UTC.
- The work is built by a handoff agent swarm: fee (shift trader), fi (hot standby), fo (fencer and witness) and fum (auctioneer), plus a castle service that serves an SSE stream (`miniapp/STREAM.md`).
- Everything on-chain runs on Ethereum Sepolia, and every fill and state change is an Etherscan-verifiable transaction.

## Capabilities and Constraints

- Fence states: `LIVE`, `WIND-DOWN` (lease expired, reduce-only) and fenced (`FeeFiFoFum()` revert after an epoch change).
- The lease is 120s, renewed at least every 40s with fo's EIP-712 attestation.
- Tokens: Circle USDC and Sepolia WETH.
- No hard-coded addresses: they come from `contracts/deployments/sepolia.json`.
- The miniapp has no "kill fee" button; the video shows the terminal kill.
- Chain-only replay must work when the service and agents are offline.

## Brand Commitments

- The name is **fee-fi-fo-fum**. Never "baton". See `docs/NAMING.md`.
- Voice: *Jack the Giant Killer*. Sleeping giants are dead agents with stale quotes; Jacks are arbitrageurs; the giant wakes and smells the intruder; any Jack with a name may climb and bid.
- Operator direction (2026-09-26): a **full storybook world**. A medieval vibe, a bit cartoony, gold and treasure, smooth lines, nothing choppy or janky. Keep it fun, but make the money very clear.
- Platform hard rules (impecc): no gradients (flat solid colours only); no abstract network or node visuals standing in for content; a light `#fff`-family ground for standalone pages; the miniapp render root holds `contain: layout paint`.

## Evidence on Hand

- There are no deployed addresses or tx hashes yet; the contracts are being written. The mock stream uses synthetic data, labelled as mock, with no fake Etherscan links.
- Real material: the PLAN, NAMING, the README pitch, and prize names and amounts from the ETHGlobal pages.

## Product Principles

1. The money is never ambiguous: amounts, prices and who holds the hoard are exact, with units and tx links.
2. Prove on-chain, don't claim. Every state shown points at a block or a tx, or is labelled mock.
3. Continuity is the story: the book changes hands with no gap and no zombie fills.
4. Anyone with a name may climb. Size buys no privilege.
