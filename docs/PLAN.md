# ETHGlobal Tokyo 2026: a plan to win the 1inch, Uniswap and ENS Continuity prizes

The entry is four handoff agents, **fee, fi, fo and fum**, plus one miniapp for humans. Agents use it through the handoff MCP and REST (both are generated from `src/capabilities/defs.ts`). All on-chain work runs on **Ethereum Sepolia**. This file is a planning artifact; ETHGlobal's AI rules ask for these to be in the submission repo.

---

## 0. Fixed facts (checked 2026-09-26 03:30 UTC)

| Item | Value | Source |
|---|---|---|
| Submission closes | **Sun 27 Sep 09:00 JST (00:00 UTC)**. Hacking began Fri 25 Sep 21:00 JST (12:00 UTC). | ethglobal.com/events/tokyo2026/info/details |
| Partner prizes | Up to 3. A partner's tracks count as one pick, so the picks are exactly **1inch, Uniswap Foundation and ENS**. | same |
| 1inch Continuity | "Build an Aqua App": $1.5k / $500 | /prizes |
| Uniswap Continuity | "Best Uniswap Stack Contribution": $2k / $1k / $1k | /prizes |
| ENS Continuity | "Best Integration of ENSv2 into an Existing Project": $2k / $1k / $1k | /prizes |
| Main tracks | Classic "start fresh" entries only; pre-existing code loses partner-prize eligibility there. Whether ENS's $6k "Best Use" also accepts Continuity entries is unconfirmed; ask at the booth. | details page |
| Baseline commit | **`079f8f0`** (ringout, 2026-09-25 17:09 JST). This is before hacking began, so ringout is pre-existing scaffolding, not new work. | `git log` |

**Bytecode confirmed on Ethereum Sepolia today:**

| Contract | Address | Bytes |
|---|---|---|
| Aqua (official) | `0x1111113ccf1426a8e30e2bff5e005d929bf6a90a` | 5,619 |
| SwapVM router | none on Sepolia; the vanity router is empty. **Deploy `release/1.0.2` yourself** (redeploys are allowed). | 0 |
| Uniswap CCA factory | `0x000000001F26a0044BaA66024e7b6599c61963F8` | 24,214 |
| Uniswap v4 PoolManager | `0xE03A1074c86CFeDd5C142C4F04F1a1536e203543` | 24,009 |
| ENSv2 RootRegistry / ETHRegistry | `0x9703…a9ce` / `0x657e…09e` | 16,000 each |
| ENSv2 UniversalResolverV2 | `0x5d25c1d6acbb71b7a28aa7899618a3412a8303e3` | 18,792 |
| ENSv2 VerifiableFactory / UserRegistryImpl / PermissionedResolverImpl | `0x9e72…841c` / `0xa803…0263` / `0x14f0…f243` | present |
| USDC (Circle, EIP-3009, already in `src/settlement-config.ts`) | `0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238` | – |

**Rules every option must follow:**

1. **One chain.** ENSv2 exists only on Sepolia. handoff defaults to Base Sepolia, so this entry settles on the existing `ethereum-sepolia` rail.
   - The shared tokens are Circle USDC (EIP-3009, so x402 works too) and Sepolia WETH.
   - ENS's MockUSDC is only for registering the parent `.eth` name.
2. **1inch.**
   - Use the official Aqua contract with your own `release/1.0.2` SwapVM router. Code built on `main` won't run on 1.0.2.
   - Put the custom logic in an **Extruction** contract. It is in the 1.0.2 subset, has a view `quote` path and a stateful `swap` path, and `quote` and `swap` must match.
   - The demo must show a real `pull`/`push` token transfer.
   - Scoring favours SwapVM, and past winners all brought **a new pricing invariant or instruction plus a real financial product**.
3. **Uniswap.**
   - **Don't pair Aqua with a v4 hook.** At least 5 were built in 2026 (RWA Outlet and others).
   - Use **CCA**. Only 4 of the 6,412 showcase projects touched it, all launchpads or privacy forks. `IValidationHook.validate(maxPrice, amount, owner, sender, hookData)` is untouched.
   - Required: FEEDBACK.md and the form at developers.uniswap.org/hackathon-feedback.
4. **ENS.**
   - handoff already mints ENSv1 subnames under `handoff.socnet.eth` with ERC-8004 (`src/impute.ts`). So "agents get subnames with scoped permissions" is both pre-existing and the most-won cliché (Batas, Capsule, SoulVault, Herit).
   - No winner page checked used **namespace aliasing, `linkToNode` record linking, emancipated forever names or rule-bound subregistries**.
   - Limits to design around:
     - At most 15 holders per role per resource.
     - Admin roles can only be granted at registration.
     - Resolver roles have no per-name scope.
   - A live demo link is required, and nothing may be hard-coded.
5. **Continuity.**
   - Tag `079f8f0` as `ethglobal-tokyo-2026-baseline`.
   - The README needs a "before / after" section.
   - Commit small and often. No single large commits, and no single-commit entry on the final day (1inch says this explicitly).
   - `AI_USAGE.md` must list the files and parts AI wrote, and include this plan and any prompts or specs.
   - The working tree currently has uncommitted non-hackathon edits (realtime/tunnel/workbench/cli). Commit them separately, labelled as such, before the first hackathon commit.

**Blocker:** confirm on the Hacker Dashboard that the team is registered in the **Continuity track**. Every prize above is Continuity-only.

**Evidence wording.** "Not seen" below means *not found* among 6,412 ETHGlobal showcase projects (Bangkok 2024 to ETHOnline 2026, keyword-matched), or not on the winner pages checked. Present it that way; don't claim "never done".

---

## 1. What each sponsor has already seen (avoid all of this)

- **1inch.** They have rewarded:
  - Fusion+ extended to other chains.
  - Limit-order TWAP, DCA and grid strategies.
  - "AI agent + 1inch API".

  Aqua-era clichés: agent-under-limits/mandate (Batas, Mandate), natural language to bytecode (Aquapilot), solvency and over-commitment (Solvent won), prediction markets (Aqua Outcome Market won), Aave health factor, ladders, World-ID pricing, stateful-opcode demos, and agent-run FX (Aqua0).

  Winners: ArcBook (executable order book), RiverSwap (auction-managed AMM), TenorFi (fixed-funding opcode), Solvent.
- **Uniswap.** Seen: 109 AI-agent trading projects, 52 LP managers, 40 MEV/LVR, 39 privacy, and 18 intents/RFQ.
  - Already saturated: ENS-based agent routing (Waiola, claw2claw), agent-to-agent trading on v4 (Uniforum), World-ID fee hooks, and Aqua+v4 hooks.
  - Recent winner: TARE, a *measurement* tool.
- **ENS.** Seen:
  - agents as subnames with caps and revoke (won 4 times);
  - ERC-8004 identity copied into ENS;
  - skill manifests;
  - name-as-wallet with recovery;
  - payment usernames;
  - reputation text records;
  - org and community subnames;
  - contenthash hosting;
  - **inheritance** (Herit won).

**The gap all three options aim at:** CCA used for something other than a launch, an Extruction that reads *ENS state* at fill time, and ENSv2's unused features (aliasing, `linkToNode`, custom-rule subregistries, emancipation, wildcard `resolve`).

---

## 2. Three options

Each option names one loop where **on-chain data flows between the three sponsors**. Every edge in the loop is a contract call, and if you remove any one agent the loop breaks.

### Option A: BATON, fenced liquidity handoffs for a follow-the-sun agent desk *(recommended)*

**Pitch:** Agents crash, and a dead agent can't send the transaction that cancels its quotes. BATON makes an agent desk's liquidity **live only while its operator holds an ENS lease**, and hands the book from agent to agent (Tokyo → London → New York) with no gap and no zombie fills. If nobody picks the book up, a **Uniswap CCA** auctions it off fairly instead of dumping it. The pitch line: "handoff, literally", and it fits the Continuity theme.

**The book is a contract, not an agent's wallet.** Aqua keys balances to `msg.sender` and leaves tokens in the maker's wallet. If fee shipped from its own EOA, fee's wallet would *be* the book, and fi re-shipping from fi's wallet would hand off nothing. So **Baton.sol is both the desk treasury and the Aqua maker**:
- It holds the WETH and USDC and approves Aqua once.
- It exposes `ship`, `dock` and `multicall` only to the current lease holder.

After fi claims, it can dock fee's old strategies through Baton. The fence's value is therefore **the window between lease expiry and anyone's claim tx**, and during that window it needs no transaction from anyone. That is the answer to "why not just dock on takeover?": the takeover tx may never come, or may land minutes later, and during that gap stale quotes are free money for arbitrageurs.

**The loop:**
```
  (1) ENSv2 lease  desk.feefifofum.eth
      Baton.sol holds the registry roles.
      renew(expiry, foSig): extends the lease to now+120s. Needs the holder's call PLUS fo's
      EIP-712 attestation that the holder's live quotes are sane, so a hung-but-heartbeating
      trader still loses the lease.
      claim(): after expiry, = register(label, newOwner, ...). The token id is regenerated, and
      that is the FENCING EPOCH.
      PermissionedResolver.linkToNode(desk, <holder's node>): anyone resolving desk.* reaches
      the current shift, including ENSIP-26 agent-endpoint[mcp] → handoff MCP.
        │  read at fill time (registry read directly, never via UniversalResolver)
        ▼
  (2) 1inch Aqua + SwapVM 1.0.2. Maker = Baton.sol (the desk treasury).
      Baton.ship(router, program, [WETH,USDC], amounts) → aqua.ship(...); only the lease holder
      can call it.
      Program = [Extruction(FenceExtruction, labelhash, epoch)] → XYCConcentrateGrowLiquidity2D →
      FlatFeeIn.
      FenceExtruction reads the registry's expiry and token id:
        - live and same epoch → continue;
        - expired → JumpIfTokenIn to a wind-down branch (Decay, reduce-only, wide spread);
        - epoch changed → revert FENCED (a zombie shift's orders are dead with no tx from it).
      Taker: router.swap(order, tokenIn, tokenOut, amt, takerData) → aqua.pull / push
      (real transfer out of Baton).
        │  every shift change: inventory the next shift doesn't want
        │  (and, if nobody claims within grace, the whole book)
        ▼
  (3) Uniswap CCA as the exit, not the entrance
      Baton.sol → CCA factory: auction {currency: USDC, token: WETH inventory,
      tokensRecipient/fundsRecipient: Baton, validationHook: CrewHook}.
      CrewHook.validate(...) gives the incoming shift no privilege; it's just another bidder, so
      transfer prices between agents are discovered, not dictated.
      Bidder rule: owns an unexpired name in handoff's ENSv2 agent registry, read from the
      registry directly (a hook can't follow CCIP-read's OffchainLookup).
      After the auction: fum writes clearingPrice() to ENS as bytes via
      PermissionedResolver.setData(desk, "handoff-price", ...). The next shift's first ship()
      centres its curve on it, and FenceExtruction can read it on-chain without string parsing.
        │
        └────────► back to (1)
```

**Agents:**

| Agent | Role | Without it |
|---|---|---|
| **fee** | Shift trader. Holds the baton, renews the lease, and ships and re-ships strategies via `Baton.multicall(dock+ship)`. | No live liquidity |
| **fi** | Hot standby and next shift. Watches fee's heartbeats over handoff messages; on expiry calls `Baton.claim()`, docks stale strategies, relinks `desk`, re-ships at the new epoch. | No failover; the book goes dark |
| **fo** | Fencer and witness. Signs the quote-sanity attestation each `renew` needs, and withholds it when a trader hangs or quotes off-market. Also replays every fill against the lease timeline and publishes incident reports to a handoff channel. This is the measurement angle, like TARE. | No lease can be renewed, and nothing proves the fence works |
| **fum** | Auctioneer. Opens the shift-change CCA every rotation, and the dissolution CCA if nobody claims. Calls `checkpoint()` and `sweepCurrency()`, and writes `clearingPrice` to ENS with `setData`. | No exit path, and no price anchor for the next shift |

**MCP tools** (defined in `src/capabilities/defs.ts`; each generates an MCP tool and a REST route):
- `desk_status`: lease holder, epoch, expiry, strategies and inventory.
- `desk_quote`: an Aqua quote through the view Extruction.
- `desk_fill`: returns `{to,data}` for `router.swap`, or executes it from the caller's agent wallet.
- `desk_join_crew`: any handoff agent can apply to be a standby.
- `baton_claim`: crew only.
- `auction_status` and `auction_bid`: CCA `submitBid(maxPriceQ96, amount, owner, hookData)`.

Any agent on handoff can trade against the desk, bid in its auctions, or run its own BATON desk.

**Miniapp (`miniapps/apps/baton.html`, ringout pattern):**
- A system agent `baton` serves `/api/v1/desk/stream`.
- The view: a world-clock ring of shifts, a lease countdown, and FENCED/LIVE/WIND-DOWN state.
- Fills link to Sepolia Etherscan, and a live CCA clearing chart runs when an auction is open.
- A "kill fee" button is for the operator only.
- The replay tab re-derives every fill decision from the chain.

**Demo beat (the "wow"):**
1. `kill -9` fee.
2. A taker's fill reverts `FENCED`.
3. fi claims the lease, `desk.*` relinks, and fills resume.
4. Restart fee from stale state: its orders are rejected on-chain.
5. Kill everyone: fum's CCA clears the book, and the price flows into the next desk.

**Not seen:**
- Liveness-gated Aqua positions: none found. Dead-man projects were non-Aqua escrows.
- CCA used as liquidation or transfer pricing: all 4 CCA projects are launches or privacy.
- ENS lease-as-fencing-token and `linkToNode` baton: not on any ENS winner page. This is *operational failover*, not Herit-style inheritance; say so explicitly.

**How ENSv2 improves handoff** (for the ENS Continuity write-up):
- handoff already has an `agent_heartbeat` tool and an `ens_name` field on every agent.
- `src/impute.ts` already mints ENSv1 subnames under `handoff.socnet.eth`.
- Today a heartbeat is just a row in the broker's database. With BATON, **an ENSv2 lease becomes handoff's on-chain, verifiable liveness for any agent**: contracts and other agents can check it without trusting the broker.
- Agent subname minting moves from ENSv1 to an ENSv2 registry, which is the registry CrewHook reads.

**How the three help each other (say this at the booth):**
- ENS says who is allowed to be live.
- 1inch liquidity obeys that at fill time, with no transaction from an agent that may be dead.
- Uniswap's CCA gives the book a fair price every time it changes hands, and a fair exit when nobody is live.
- That price goes back into ENS and anchors the next operator's curve.

**Pre-existing vs new:**

| Pre-existing (before `079f8f0`) | New this weekend |
|---|---|
| handoff broker, agent messaging and `agent_heartbeat`, `ens_name` and ENSv1 subnames, the Ethereum Sepolia rail, and the ringout scaffolding | Baton.sol (treasury, Aqua maker and lease), FenceExtruction.sol, CrewHook.sol, the router deploy, the ENSv2 agent registry, the four agents, 6 capabilities, the stream route, and baton.html |

**MVP (about 14 build hours):**
- Must:
  - Baton (treasury and lease) + FenceExtruction + router 1.0.2 on Sepolia, with Foundry tests on a Sepolia fork.
  - fee/fi failover with fo-attested renewals.
  - **A shift-change CCA on every rotation**, with the price written back via `setData`. This is the demo path, not the failure path.
  - fum's dissolution CCA with CrewHook.
  - 4 MCP tools and the miniapp live.
- Stretch:
  - fo replay proofs;
  - an emancipated forever-name incident log (`incident-N.desk…`, immutable).

**Top risk:** the lease semantics on the ENSv2 beta. Does `renew` accept sub-minute expiries, and does re-registration really change the token id? **Check both in hour 1.** The fallback is an epoch counter in Baton.sol with the ENS expiry as the lease; the fence then reads Baton, which still reads ENS.

**Solidity:** 3 small contracts (Baton, which is also the treasury; FenceExtruction; CrewHook). This is the **lowest schedule risk** of the three options.

---

### Option B: BEANSTALK, a futures market for agent time

**Pitch:** Agent compute is scarce and mispriced. handoff already rate-limits agent sends and has had LLM-token drains. BEANSTALK sells each agent's **next-epoch capacity** as a perishable token:
- The price is discovered in a **Uniswap CCA**.
- Before the epoch expires, the capacity is market-made on **1inch Aqua** by a new *perish* curve.
- It is redeemed by burning it into an **ENSv2 job name**. That name *is* the work order: spec in, result out, and it expires with the epoch.

**The loop:**
```
  (1) Uniswap CCA: fee mints capacity token FUM-E42 (1 unit = 1 job)
      CCA factory: {currency: USDC, token: FUM-E42, validationHook: NamedHirerHook}.
      NamedHirerHook: the bidder must own an unexpired name in handoff's ENSv2 registry, read from
      the registry directly (not via UniversalResolver or CCIP-read).
      submitBid(maxPriceQ96, amount, owner, hookData) → clearingPrice() = the market price of an
      agent-hour.
        │  clearingPrice anchors the curve
        ▼
  (2) 1inch Aqua + SwapVM: fi ships ONE treasury against four agents' capacity books (Aqua shared
      liquidity; USDC is not split per book).
      Program = [Extruction(PerishCurve, cca, jobRegistry, epochEnd)] → FlatFeeIn.
      PerishCurve: price = clearing × f(time-to-expiry, backlog), where backlog =
      jobRegistry.count(epoch), read from ENS. Surge when the queue is full, decay to zero at
      expiry (airline-seat pricing).
      router.swap → aqua.pull / push (real transfer).
        │  holder redeems
        ▼
  (3) ENSv2 rule-bound subregistry (extends PermissionedRegistry and overrides register()):
      "you may register j-<id>.fum.beanstalk.eth only by burning 1 FUM-E42".
      expiry = epoch end; non-transferable (no CAN_TRANSFER_ADMIN); revocable by fo on refund
      (UNREGISTER).
      The resolver implements wildcard resolve(): text("price") on now.fum.beanstalk.eth
      returns the live Aqua quote, and text("result") on j-<id> returns the delivered CID.
        │  job count feeds PerishCurve; delivered results feed the next epoch's supply
        └────────► back to (1) and (2)
```

**Agents:**

| Agent | Role |
|---|---|
| **fee** | Auctioneer. Sizes each epoch's supply from fum's measured throughput and runs the CCA. |
| **fi** | Market maker. Ships and re-anchors the perish curves from the shared treasury. |
| **fo** | Registrar and dispatcher. Watches the job registry, routes jobs through handoff messages to the worker, refunds with `unregister`. |
| **fum** | The giant, i.e. the worker. Does the job and writes `result` with a per-key setter role (`grantSetterRoles` on key `result`). Any handoff agent can list itself as a worker too. |

**MCP tools:** `capacity_epochs`, `capacity_bid`, `capacity_quote`, `capacity_swap`, `job_redeem(spec)`, `job_status(name)`, `worker_list`.

**Miniapp:**
- An auction chart per agent.
- A perish curve with a live countdown.
- A job board that resolves ENS names live.
- A "hire the giant" button.

**Not seen:**
- CCA for a non-token good: none among the 4 CCA projects.
- A perishable-inventory SwapVM invariant: no Aqua winner prices expiry-perishable goods.
- An ENS registry whose rule is "burn to redeem a work order": ENS winners are identity and permissions, not work orders.

**How the three help each other (say this at the booth):**
- Uniswap's CCA says what an hour of this agent is worth, fairly and at once.
- 1inch Aqua keeps that hour tradeable until it expires, from one treasury that backs every agent's book. It prices from the CCA's clearing price and from ENS's live job queue.
- ENS turns a capacity token into a named, expiring, public work order. That gives the other two markets a reason to exist, and its job count feeds straight back into Aqua's price.

**How ENSv2 improves handoff:**
- handoff tasks today (`src/payments.ts`) are rows in the broker.
- With BEANSTALK, a paid task becomes an ENSv2 name. Anyone can resolve it for its spec, deadline and result without trusting handoff.
- Agent subnames move from ENSv1 (`src/impute.ts`) to ENSv2.

**Pre-existing vs new:** handoff's task, payout and x402 rails already exist. This weekend adds price discovery, liquidity, and on-chain, addressable work orders on top.

**MVP:**
- Must: one agent, one epoch, CCA → PerishCurve → burn-to-register → result record, plus the miniapp.
- Stretch: four worker books on one treasury, and Liquidity Launcher seeding a v4 pool for secondary trading.

**Top risk:** the most new Solidity. Subclassing the ENSv2 registry ("interfaces not yet final"), PerishCurve, the capacity token factory and a validation hook make this the **highest schedule risk after C**. It is the strongest originality story.

---

### Option C: THE GIANT'S TABLE, agents bid for seats on shared human capital

**Pitch:** Aqua lets one balance back many strategies at once. The whitepaper says "competition shifts from TVL to formula optimization". THE GIANT'S TABLE turns that into a market:
- Human LPs deposit once.
- Agents **bid in a Uniswap CCA for seats**, which means paying LPs rent for access to capital.
- The seat-holders' SwapVM formulas all quote against the *same* capital, and fills pick the winner.
- `best.table.eth` is **record-linked** to whichever formula leads, so takers need to know one name.
- Each season's champion is minted as an **emancipated forever name** that nobody can ever rewrite.

**The loop:**
```
  Uniswap CCA (token = SEAT-S3, currency = USDC, fundsRecipient = LP pool,
               validationHook = AgentOnlyHook: the bidder must own an unexpired name in
               handoff's ENSv2 agent registry, read from the registry directly)
      → Table.claimSeat burns SEAT → registers seat-k.table.eth
        (expiring = season end, non-transferable)
      → Table (Aqua maker) ships each seat's program:
        [Extruction(SeatGuard, seat-k node, drawdownCap)] → seat formula
      → SeatGuard checks the seat name is unexpired and that the per-seat PnL ledger is above the cap
      → fills: router.swap → aqua.pull / push
      → fo scores price improvement per seat vs Uniswap v4 spot (StateView, read-only) and calls
        PermissionedResolver.linkToNode(best, seat-leader)
      → season end: emancipate(champion-S3.table.eth)
      → rent paid in the next CCA flows back to LPs
```

**Agents:**

| Agent | Role |
|---|---|
| **fee** | Runs the season auctions |
| **fi** | The Table's risk keeper (SeatGuard ledger, evictions) |
| **fo** | Scorer. Benchmarks against v4 and moves the `best` link. |
| **fum** | House formula. Defends a seat, and is a sparring partner for outside agents that join through MCP. |

**MCP tools:** `table_seasons`, `seat_bid`, `seat_submit_program`, `seat_stats`, `best_quote`, `lp_deposit`.

**How the three help each other (say this at the booth):**
- Uniswap's CCA prices *access* to capital, and the rent goes to the humans who supplied it.
- 1inch Aqua lets every seat-holder quote against the same capital at once, so formulas compete on fills, not on who got the biggest allocation.
- ENS makes a seat an expiring name that the fill-time guard checks, and makes "the best formula right now" a single name (`best.table.eth`) that takers resolve.
- Winning is recorded forever by emancipation.

**How ENSv2 improves handoff:** handoff agents already carry `ens_name`. A seat name under the Table becomes an on-chain credential that handoff's own marketplace can check before routing capital work to an agent.

**Not seen:**
- CCA as rent for capital access: none found.
- Record linking and emancipation: not on any ENS winner page.
- A multi-formula tournament over one Aqua balance: not among Aqua winners, though the "Rick" wallet example is close.

**Top risk:**
- **On-chain per-seat PnL accounting inside SeatGuard is hard**, and pooled custody undercuts Aqua's self-custody pitch.
- It reads as "AI trading agents" (the most crowded category, 109 projects) unless the pitch stays on the allocation mechanism.
- It is the **highest Solidity and economic-design risk** of the three.

---

## 3. Comparison and recommendation

| | A: BATON | B: BEANSTALK | C: GIANT'S TABLE |
|---|---|---|---|
| New Solidity | 3 small contracts | 4 or more, including an ENS registry subclass | 3 or more, plus an on-chain PnL ledger |
| Feasible in about 14h | **High** | Medium | Low |
| 1inch hook | Liveness-fenced position (Extruction reads ENS) | New perish invariant | Formula tournament on shared liquidity |
| Uniswap hook | CCA as exit and transfer price | CCA for agent labor | CCA as capital rent |
| ENS hook | Lease = fencing token, `linkToNode` baton | Burn-to-register rule registry, wildcard `resolve` | `linkToNode` crown, emancipated trophies |
| Continuity / handoff story | Strongest ("handoff" of a book; agents crash) | Strong (prices handoff's task economy) | Weak |
| Demo drama | `kill -9` live, zombie rejected on-chain | Hire an agent and watch the job name resolve | A leaderboard |
| Cliché risk | Inheritance (Herit), so frame as failover | "Agent tokens" (Virtuals), so frame as perishable capacity, not equity | AI trading agents |

**Recommendation: A (BATON).**
- It has the least new Solidity.
- Its demo is the most dramatic.
- It uses each sponsor's least-seen feature *centrally*.
- The story is native to both handoff and the Continuity track.

**Fallback: B.** Take it only if a Solidity-strong teammate owns the ENS registry subclass from hour 1.

---

## 4. Schedule for Option A (JST; submission 09:00 Sun)

| When (JST) | Work | Done when |
|---|---|---|
| 12:45–13:30 | Confirm Continuity registration. Tag baseline `079f8f0`, commit the pre-existing dirty tree separately, branch `ethglobal-tokyo`. Register `feefifofum.eth` (or similar) on the ENSv2 ETHRegistrar with MockUSDC. Fund 4 agent wallets with Sepolia ETH, USDC and WETH. **Hour-1 probes:** does `renew` accept a sub-minute expiry? Does re-registration change the token id? Can a contract read name ownership and expiry from the registry directly? (Hooks must not call UniversalResolverV2, since `OffchainLookup` reverts.) Does `setData` and `linkToNode` work on the deployed PermissionedResolver? | Parent name resolves via UniversalResolverV2; all four probes answered |
| 13:30–17:30 | Foundry: deploy router `release/1.0.2`; write Baton.sol (treasury and Aqua maker; lease, `renew(expiry, foSig)`, `claim`, epoch; `linkToNode` and `setData` via resolver roles) and FenceExtruction.sol (view and stateful paths identical). Fork tests: live fill passes; expired fill winds down; wrong epoch reverts `FENCED`; renew without fo's signature reverts. | Tests green on a Sepolia fork; contracts verified on Etherscan |
| 17:30–20:30 | Agents on handoff: register fee/fi/fo/fum, one realtime listener each, heartbeat protocol over handoff messages, viem clients on `ethereum-sepolia`. Failover path end to end on Sepolia. | fi takes over within one lease period after `kill -9 fee`, with a tx link |
| 20:30–23:30 | CrewHook.sol plus fum's shift-change and dissolution CCAs (factory deploy, `submitBid`, `checkpoint`, `sweepCurrency`, clearing price written to ENS with `setData`, next ship centred on it). 6 capabilities in `defs.ts`. | An outside agent bids via MCP; a shift-change auction clears on Sepolia and the next shift's curve moves to its price |
| 23:30–03:00 | `/api/v1/desk/stream` and `baton.html` (under 100KB, ringout publish rules); publish to handoff.lol for the live demo link; full rehearsal twice. | Live URL works from a clean browser |
| 03:00–05:00 | Buffer, fixes, sleep. | – |
| 05:00–08:15 | README (pitch, loop diagram, pre-existing vs new, contract addresses, lines that call each sponsor), FEEDBACK.md and the Uniswap form, AI_USAGE.md (plus this file), 1inch/Uniswap/ENS integration write-ups, and a 2–4 min video (720p+, no speed-up, voiceover). | Everything linked from the submission |
| 08:15–08:45 | Submit and select the 3 partner prizes. | Confirmation on the dashboard |

**Why A needs all three sponsors:**
- Without ENS, the fence has nothing to check.
- Without Aqua, there is no liquidity that polices itself.
- Without CCA, the book changes hands at a price one agent dictates to another, and a dead desk's inventory is either stranded or dumped.
