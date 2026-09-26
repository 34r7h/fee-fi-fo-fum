---
name: fee-fi-fo-fum
description: Visual system of the feefifofum miniapps, the dapp (fee-fi-fo-fum 2.0.2) and the live-run replay (fee-fi-fo-fum-tale). Flat colours on a white ground, ink outlines, lettered headings and plain rounded figures.
colors:
  ground: "#FFFFFF"
  linen: "#F6EFDF"
  thread: "#E6DAC0"
  band-rule: "#D9C9A6"
  ink: "#1F2433"
  ink2: "#474C5A"
  ink3: "#6A6E79"
  gold: "#C8961E"
  goldhi: "#E9BC45"
  goldink: "#83600F"
  madder: "#B0412A"
  woad: "#2F4A7A"
  sage: "#4C7743"
  skin: "#EDC49B"
  beard: "#7A4B2A"
typography:
  wordmark:
    fontFamily: "Almendra Bold (inline SVG outlines via letters(), no @font-face)"
    fontSize: "44px"
    fontWeight: 700
    lineHeight: 1
  headline:
    fontFamily: "Almendra Bold (inline SVG outlines via letters(), no @font-face)"
    fontSize: "26px"
    fontWeight: 700
    lineHeight: 1
  figure:
    fontFamily: 'ui-rounded, "SF Pro Rounded", system-ui, -apple-system, "Segoe UI", Roboto, sans-serif'
    fontSize: "20px"
    fontWeight: 800
    lineHeight: 1.45
    fontFeature: '"tnum", "lnum"'
  deal:
    fontFamily: 'ui-rounded, "SF Pro Rounded", system-ui, -apple-system, "Segoe UI", Roboto, sans-serif'
    fontSize: "21px"
    fontWeight: 800
    lineHeight: 1.45
    fontFeature: '"tnum", "lnum"'
  body:
    fontFamily: 'ui-rounded, "SF Pro Rounded", system-ui, -apple-system, "Segoe UI", Roboto, sans-serif'
    fontSize: "15px"
    fontWeight: 400
    lineHeight: 1.45
  lede:
    fontFamily: 'ui-rounded, "SF Pro Rounded", system-ui, -apple-system, "Segoe UI", Roboto, sans-serif'
    fontSize: "16px"
    fontWeight: 400
    lineHeight: 1.45
  control:
    fontFamily: 'ui-rounded, "SF Pro Rounded", system-ui, -apple-system, "Segoe UI", Roboto, sans-serif'
    fontSize: "14.5px"
    fontWeight: 800
    lineHeight: 1.45
  control-small:
    fontFamily: 'ui-rounded, "SF Pro Rounded", system-ui, -apple-system, "Segoe UI", Roboto, sans-serif'
    fontSize: "13px"
    fontWeight: 800
    lineHeight: 1.45
  note:
    fontFamily: 'ui-rounded, "SF Pro Rounded", system-ui, -apple-system, "Segoe UI", Roboto, sans-serif'
    fontSize: "13.5px"
    fontWeight: 400
    lineHeight: 1.45
  small:
    fontFamily: 'ui-rounded, "SF Pro Rounded", system-ui, -apple-system, "Segoe UI", Roboto, sans-serif'
    fontSize: "12.5px"
    fontWeight: 400
    lineHeight: 1.4
  label:
    fontFamily: 'ui-rounded, "SF Pro Rounded", system-ui, -apple-system, "Segoe UI", Roboto, sans-serif'
    fontSize: "12.5px"
    fontWeight: 800
    letterSpacing: "0.07em"
rounded:
  pill: "999px"
  card: "18px"
  panel: "16px"
  input: "12px"
  meter: "9px"
  focus: "8px"
  coin: "50%"
spacing:
  page-top: "18px"
  page-x: "22px"
  page-bottom: "28px"
  band: "22px"
  column-gap: "34px"
  card-gap: "26px"
  stack: "9px"
  row: "7px"
  cell: "8px"
components:
  button:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.ground}"
    typography: "{typography.control}"
    rounded: "{rounded.pill}"
    padding: "8px 18px"
  button-primary:
    backgroundColor: "{colors.gold}"
    textColor: "{colors.ink}"
    typography: "{typography.control}"
    rounded: "{rounded.pill}"
    padding: "8px 18px"
  button-primary-hover:
    backgroundColor: "{colors.goldhi}"
    textColor: "{colors.ink}"
    typography: "{typography.control}"
    rounded: "{rounded.pill}"
    padding: "8px 18px"
  button-secondary:
    backgroundColor: "{colors.ground}"
    textColor: "{colors.ink}"
    typography: "{typography.control-small}"
    rounded: "{rounded.pill}"
    padding: "4px 12px"
  button-secondary-hover:
    backgroundColor: "{colors.linen}"
    textColor: "{colors.ink}"
    typography: "{typography.control-small}"
    rounded: "{rounded.pill}"
    padding: "4px 12px"
  amount-input:
    backgroundColor: "{colors.ground}"
    textColor: "{colors.ink}"
    typography: "{typography.deal}"
    rounded: "{rounded.input}"
    padding: "6px 10px"
  tradebar:
    backgroundColor: "{colors.linen}"
    textColor: "{colors.ink}"
    typography: "{typography.body}"
    rounded: "{rounded.card}"
    padding: "14px 16px"
  strategy-card:
    backgroundColor: "{colors.linen}"
    textColor: "{colors.ink}"
    typography: "{typography.body}"
    rounded: "{rounded.card}"
    padding: "14px 16px"
  balance-row:
    textColor: "{colors.ink}"
    typography: "{typography.figure}"
    padding: "7px 0"
  meter-track:
    backgroundColor: "{colors.linen}"
    rounded: "{rounded.meter}"
    height: "16px"
  meter-rfq:
    backgroundColor: "{colors.gold}"
    height: "16px"
  meter-hook:
    backgroundColor: "{colors.woad}"
    height: "16px"
  test-tokens-box:
    backgroundColor: "{colors.ground}"
    textColor: "{colors.ink2}"
    typography: "{typography.note}"
    rounded: "{rounded.panel}"
    padding: "12px 14px"
---

# Design System: fee-fi-fo-fum

## Overview

The visual style is called Castle Tapestry. Both miniapps draw on a white ground with linen panels, and every shape has an indigo-black ink outline with a flat fill. There are no gradients, no drop shadows and no dark mode. Headings are set in Almendra Bold, which ships as inline SVG glyph outlines, and every figure is set in a rounded system sans with tabular lining numerals.

The dapp (`fee-fi-fo-fum`, version 2.0.2) is a trading page. Its header holds the wordmark fee·fi·fo·fum, a one-line description of the product, the network and wallet state, and a link to the replay. A paragraph under the header explains what the page does. The page then has four sections in order: YOUR WALLET (the connected wallet's balances and the test-token faucets), THE VAULT (the vault balance, the reference price, the committed allocations against fum's leverage limit, and the live strategies), SWAP (the amount input, the router agent fo's comparison of the two quotes, and one card for each strategy), and YOUR TRADES (a table of the wallet's trades with the vault). The replay (`fee-fi-fo-fum-tale`) uses the same tokens, lettering and drawings to show the vault's event stream and to replay the live run of 2026-09-26.

The pages avoid the trading-terminal look. They use no KPI tiles, no dark terminal and no neon line charts. State is shown with a coloured word, a filled dot or a bar, and each page sizes itself by its host's box and touches nothing outside it.

Key characteristics:
- The ground is white, panels are linen, outlines are ink, and fills are flat.
- Headings are Almendra Bold, shipped as inline SVG glyph outlines.
- Every figure uses the rounded sans with tabular lining numerals, and every amount carries its unit.
- Depth comes from an ink outline around a linen fill. The only box-shadow marks the best quote.
- Each miniapp is one file, embedded in a shadow root and sized by its own width.

## Writing

All text follows the operator's writing rule of 2026-09-26 14:24Z, which PRODUCT.md states in full. Text on the pages is plain technical prose in complete sentences. It names the vault, the RFQ strategy, the v4 pool and its hook, the signer fi and the router agent fo, and it gives numbers, addresses and transaction hashes in the order things happen. The identifiers harp and hen appear next to their plain names, for example "RFQ strategy (harp)" and "v4 pool (hen)". Headings are short nouns (YOUR WALLET, THE VAULT, SWAP, HARP, HEN, YOUR TRADES), and buttons are verbs that say what the transaction does ("Connect a wallet", "Fill this quote", "Swap through the v4 pool", "Get a new quote", "Wrap"). Error text says what failed and what to do next, for example "The quote expired. RFQ quotes are valid for 30 s; get a new quote."

## Colors

The palette is one ink colour, three signal colours, a gold group for the RFQ strategy and the wallet's token balances, neutrals for the ground and panels, and two tones used only inside the drawings.

### Primary
- Gold (`--gold`, #C8961E) marks the vault's and the wallet's token balances and the RFQ strategy. It fills the primary buttons, the RFQ strategy's share of each allocation bar, the coin dots beside token rows, the 3.5px underline under balance figures, and the quote's validity bar. At 2.68:1 on white it is never used for text.
- Gold highlight (`--goldhi`, #E9BC45) is the hover fill of primary buttons and the pulsing dot of a transaction step that is waiting for a signature or being mined.
- Gold ink (`--goldink`, #83600F) is gold's text form at 5.76:1 on white. It sets the BEST QUOTE chip.

### Secondary
- Woad (`--woad`, #2F4A7A) marks the hook strategy, links and focus. It fills the hook strategy's share of each allocation bar and its dot in the strategy list, and it colours links, the ENS name, fo's dashed comparison box and the 2.5px focus outline.
- Sage (`--sage`, #4C7743) marks success. It colours "Sepolia" when the wallet is on the right network, a completed transaction step, and the "Filled." and "Swapped." lines.
- Madder (`--madder`, #B0412A) marks errors. It colours error text, a wrong-network label and a failed transaction step.

### Drawing tones
- Skin (#EDC49B) and beard (#7A4B2A) appear only inside the line drawings.

### Neutral
- Ground (`--ground`, #FFFFFF) is the page background of `html`, `body` and the root.
- Linen (`--linen`, #F6EFDF) fills the trade bar, the strategy cards, meter tracks and the hover state of secondary buttons.
- Thread (`--thread`, #E6DAC0) draws quiet structure: 1.4px row rules, the test-token box border, and the quote validity track.
- Band rule (#D9C9A6) is the horizontal line of the section divider and the ground line under each drawing. It is a literal in the build, not a custom property.
- Ink (`--ink`, #1F2433) is text, every outline and every 1.6px structural border, at 15.46:1 on white.
- Ink 2 (`--ink2`, #474C5A) is secondary text: notes, row keys and units.
- Ink 3 (`--ink3`, #6A6E79) is muted text: table heads, sub-lines, the footer and empty states.

### Colour rules
Gold is used only for token balances, the RFQ strategy and the primary action, and woad only for the hook strategy, links and focus, so the two strategies are always told apart by colour as well as by name. Gold is never text; gold-family text uses goldink. The drawings write token hex values as literals in script (the `VC` table), so a change to a token on `:root,:host` must change those literals too.

## Typography

The display font is Almendra Bold by Ana Sanfelippo (SIL OFL 1.1), shipped as glyph outlines drawn by `letters()`. The body font is `ui-rounded, "SF Pro Rounded", system-ui, -apple-system, "Segoe UI", Roboto, sans-serif`, and every figure adds `font-variant-numeric: tabular-nums lining-nums`.

### Hierarchy
- The wordmark fee·fi·fo·fum is lettered at 44px (34px in the compact layout).
- Section headings and card headings are lettered at 26px (21px compact).
- Balance figures are 20px/800 and quote figures are 21px/800, with the unit in 13px/700 ink2.
- The body is 15px/1.45 and the lede paragraph under the header is 16px in ink2.
- Buttons are 14.5px/800, and secondary buttons are 13px/800.
- Notes, row keys and transaction steps are 13.5px, and sub-lines and the footer are 12.5px.
- Labels (the network state, the ENS name's detail line, table heads) are uppercase sans at 12 to 12.5px with 0.05 to 0.07em tracking.

### Lettering rules
Lettering is used only for the wordmark and headings. The glyph set is closed: capitals A to Y without Q and X, the lowercase letters e, f, i, m, o and u, the marks `·`, `-`, `!` and `’`, and the space. Any other character draws as a blank, so lettered strings are capitals (the wordmark is the one lowercase string), never contain Q, X, Z or digits, and are checked by `miniapp/build.mjs` before minifying. Numbers are never lettered. `letters(str, true)` crops each heading to the cap height plus 12 units above and below, and nothing loads a web font.

## Layout

The root sizes itself by its own box, never the viewport. A ResizeObserver sets one of two layouts on the root's `data-size` attribute.

- The full layout applies at 720px and wider. Content is centred at up to 1320px with 18px 22px 28px padding. The wallet and vault sections sit side by side in a 1 : 1.45 grid with a 34px column gap, and the two strategy cards sit side by side with a 26px gap.
- The compact layout applies under 720px. Every grid becomes one column, headings drop to 21px, the strategy list moves the allocation under the name, and the trades table becomes stacked two-column rows without a header.

A 14px divider separates sections, with 22px above and below. It is a 5px band-rule line with a 1.6px ink tick every 36px. Text wraps (`overflow-wrap: anywhere` on the root), while money figures stay on one line and their row wraps around them.

### Host rules
The page runs inside the host's shadow root. Tokens live on `:root,:host`, the root holds `contain: layout paint`, and nothing is `position: fixed`. There is no `@font-face`, no JSON script tag, no `innerHTML` and no browser storage. Config is inlined as a JS literal at the `/*@CONFIG*/` slot, and the dapp's browser module is inlined at `/*@DAPPLIB*/`.

## Depth and shape

Surfaces are flat. A surface that needs to stand out gets a linen fill and a 1.6px ink border. The one box-shadow in the dapp is a 3px gold ring on the strategy card that fo picks as the best quote, and the coin dots use a 2px inset ink ring as an outline.

- Pills (999px) are used for buttons, the direction toggle, the replay link and the BEST QUOTE chip.
- Cards and the trade bar use an 18px radius, the test-token box and fo's comparison box use 16px, the amount input uses 12px, and meter tracks use 9px.
- Structural borders are 1.6px ink, and row rules are 1.4px thread. fo's comparison box has a 1.6px dashed woad border.
- Strokes in the drawings have round caps and joins. The small drawings sit in a 120×64 box at 1.8 ink stroke with flat fills, and they show a castle, a small figure, stacks of coins, a harp, a hen and a bell.

## Components

### Buttons
- Primary buttons are gold pills with ink text, 8px 18px padding and a 1.6px ink border, and they turn goldhi on hover. They carry the one action a section asks for: "Connect a wallet", "Fill this quote", "Swap through the v4 pool".
- Secondary buttons are white pills with a 1.6px ink border at 4px 12px, filled linen on hover: "Get a new quote", "Wrap".
- A disabled button drops to 42% opacity and shows a not-allowed cursor. A strategy card's action is disabled while another transaction flow is running or when the wallet balance is below the amount.
- Every focusable element gets a 2.5px woad outline with a 3px offset and an 8px radius.
- Transitions run over .2s on `cubic-bezier(.16,1,.3,1)`, and a hover lifts a button by 1px.

### Balance rows
Rows split key and value on a shared baseline, with 7px vertical padding and a 1.4px thread rule between rows. The key is 14px ink2 with a 12.5px ink3 sub-line naming the source. The value is 20px/800 tabular on one line, followed by its unit in 13px/700 ink2. Token rows lead with a 13px gold coin dot and carry a 3.5px gold underline; the ETH row uses a linen dot and no underline.

### Allocation meters
Each token has one meter. The heading line gives the committed amount in bold and the limit, for example "7.60 committed of a 13.00 limit (2× the balance, set by fum)". The 16px bar has a linen track and a 1.6px ink border. The RFQ strategy's allocation fills from the left in gold, the hook strategy's follows in woad, and a 2.2px ink tick marks the vault balance. The line under the bar gives the vault balance on the left and the uncommitted amount on the right.

### Trade bar and fo's comparison
The trade bar is a linen panel holding "You pay", the amount input, the input token, a direction toggle (⇄) and the output token. A hint line under it shows the wallet's balance of the input token with a "Use all" link, or says what is wrong with the amount. Under the bar, fo's comparison sits in a dashed woad box with a bell drawing and one sentence, for example "The router agent fo would send this order to the RFQ strategy (harp), which pays 0.000093 WETH, 9.0% more than the v4 pool (hen) at 0.000085 WETH."

### Strategy cards
There is one card for the RFQ strategy (HARP) and one for the v4 pool (HEN). Each card has a lettered heading, a woad name line (`quote.feefifofum.eth`, or "USDC/WETH Uniswap v4 pool") with an uppercase detail line, and either a drawing or the BEST QUOTE chip. The quote reads "Pay 0.25 USDC, get 0.000093 WETH" with the figures at 21px/800, followed by the effective price in USDC per WETH. The RFQ card adds a 7px validity bar that empties over the quote's 30 s and a line with the ENS text-record key, fi's signer address and the quote id. The v4 card adds the minimum output below which the swap reverts. While a transaction flow runs, the card lists its steps (approve, then fill or swap), each with a dot, a label and its state ("waiting", "sign in your wallet", "being mined", "done" with the tx link, or "failed").

### Trades table
The table has the columns Time, Where, Paid, Got, USDC / WETH and Tx. Heads are 12px/700 uppercase ink3 over a 1.6px ink rule, rows have 8px cells and 1.4px thread rules, and figures are right-aligned. It lists the trades this page sent in the session and the vault service's record of fills where the connected wallet was the taker.

### Test-token box
A 16px-radius box with a 1.6px thread border lists where to get Sepolia ETH (Google's and Alchemy's faucets) and test USDC (Circle's faucet), and it has an input and a Wrap button that sends `WETH.deposit()` from the wallet.

## Do and don't

Do:
- Keep every token on `:root,:host` so it reaches the page inside the host's shadow root.
- Build every node with `createElement`, `createElementNS` and `textContent`, and replace content with `replaceChildren`.
- Write every amount and price with its unit, for example 0.25 USDC, 0.000093 WETH and 2,686.27 USDC per WETH. USDC shows 2 decimals and WETH and ETH show 4, and any amount under 0.01 gets more decimals so that it never rounds to zero.
- Link every transaction and address to Sepolia Etherscan.
- Show state as a coloured word or dot together with its text.
- Use `cubic-bezier(.16,1,.3,1)` for every transition, and drop all animation and transitions under `prefers-reduced-motion: reduce`.

Don't:
- Don't use gold for text, or for anything other than token balances, the RFQ strategy and the primary action.
- Don't print an amount or a price without its unit.
- Don't ellipsize or clamp text. The only shortened strings are hex hashes and addresses (first 6 and last 4 characters) where no ENS name is known.
- Don't use `position: fixed`, `@font-face`, JSON script tags, `innerHTML`, browser storage, cookies, `eval` or ES modules.
- Don't use gradients, dark grounds, KPI tiles or neon line charts.
- Don't letter digits, Q, X or Z, or any mark outside `·`, `-`, `!` and `’`.
