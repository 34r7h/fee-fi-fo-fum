# Naming and voice

The product is **fee-fi-fo-fum**. It is never "baton". That was the working title in the research, and the operator retired it.

All forward-facing copy carries **Jack the Giant Killer** overtones: the README, the miniapp, the deck, the video, social posts and the sponsor write-ups. impecc owns that copy.

## The story

In *Jack the Giant Killer*, a small, quick-witted hero brings down giants who look unbeatable. In DeFi, the giants are big books, and Jacks are always circling them. A dead market-making agent is a **sleeping giant**. Its stale quotes are gold left out for any Jack (arbitrageur) who climbs the beanstalk first.

fee-fi-fo-fum is the giant that wakes up. The instant its operator stops holding the ENS lease, it **smells the intruder**, and a stale shift's fills die with `FeeFiFoFum()`. That needs no transaction from the agent that died. When the giant does fall, it isn't looted. Its hoard goes to a fair Uniswap CCA, and **any Jack with a name can climb up and outbid the giants**, because size buys no privilege.

The four agents are the four syllables of the chant:

| Agent | Syllable | Role |
|---|---|---|
| fee | Fee | Shift trader. Holds the castle, renews the lease, ships and re-ships the book. |
| fi | Fi | Hot standby. Wakes when fee falls, claims the castle, relinks it and re-ships at a new epoch. |
| fo | Fo | Fencer and witness. Signs or withholds the attestation every renewal needs, and replays fills. |
| fum | Fum | Auctioneer. Runs the shift-change and dissolution CCAs, and writes the clearing price back to ENS. |

Tagline options for impecc to refine:
- "The giant never sleeps."
- "Dead agents can't cancel quotes. fee-fi-fo-fum smells Jack coming."
- "Any Jack can climb. No giant gets a free lunch."

## Identifier map (research working title → shipped name)

| Research (docs/PLAN.md, before rename) | Shipped |
|---|---|
| BATON (product) | **fee-fi-fo-fum** |
| `Baton.sol` (treasury, Aqua maker, lease) | **`Castle.sol`**, the giant's castle, holding the hoard |
| `IBatonLease` | **`ICastleLease`** (`holder()`, `epoch()`, `expiry()`) |
| `FenceExtruction.sol` | **`FeeFiFoFumExtruction.sol`** |
| revert `FENCED` | custom error **`FeeFiFoFum()`**: the giant smells a stale shift |
| `CrewHook.sol` | **`JackHook.sol`**: any Jack with an ENSv2 name may bid |
| `desk.feefifofum.eth` | **`castle.feefifofum.eth`** |
| `baton.html` | **`miniapp/fee-fi-fo-fum.html`** |
| baton system agent / desk service | **castle** agent / **castle service** (`service/`) |
| `desk_status`, `desk_quote`, `desk_fill`, `desk_join_crew`, `baton_claim` | **`castle_status`, `castle_quote`, `castle_fill`, `castle_join`, `castle_claim`** (`auction_status` and `auction_bid` are unchanged) |

Some names stay technical because they aren't copy: fence states (`LIVE`, `WIND-DOWN` and fenced), fencing epoch, the lease, and the `handoff-price` record key.
