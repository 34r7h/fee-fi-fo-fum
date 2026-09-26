---
name: fee-fi-fo-fum
description: The giant's castle, live. A stitched storybook monitor for one castle's lease, fence, hoard and auction.
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
  display:
    fontFamily: "Almendra Bold (inline SVG outlines via letters(), no @font-face)"
    fontSize: "clamp(40px, 8.5cqw, 96px)"
    fontWeight: 700
    lineHeight: 1
  headline:
    fontFamily: "Almendra Bold (inline SVG outlines via letters(), no @font-face)"
    fontSize: "26px"
    fontWeight: 700
    lineHeight: 1
  title:
    fontFamily: "Almendra Bold (inline SVG outlines via letters(), no @font-face)"
    fontSize: "17px"
    fontWeight: 700
    lineHeight: 1
  figure:
    fontFamily: 'ui-rounded, "SF Pro Rounded", system-ui, -apple-system, "Segoe UI", Roboto, sans-serif'
    fontSize: "20px"
    fontWeight: 800
    lineHeight: 1.45
    fontFeature: '"tnum", "lnum"'
  body:
    fontFamily: 'ui-rounded, "SF Pro Rounded", system-ui, -apple-system, "Segoe UI", Roboto, sans-serif'
    fontSize: "15px"
    fontWeight: 400
    lineHeight: 1.45
  control:
    fontFamily: 'ui-rounded, "SF Pro Rounded", system-ui, -apple-system, "Segoe UI", Roboto, sans-serif'
    fontSize: "14px"
    fontWeight: 700
    lineHeight: 1.45
  control-small:
    fontFamily: 'ui-rounded, "SF Pro Rounded", system-ui, -apple-system, "Segoe UI", Roboto, sans-serif'
    fontSize: "13px"
    fontWeight: 700
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
  caption:
    fontFamily: 'ui-rounded, "SF Pro Rounded", system-ui, -apple-system, "Segoe UI", Roboto, sans-serif'
    fontSize: "11.5px"
    fontWeight: 400
rounded:
  pill: "999px"
  panel: "16px"
  focus: "8px"
  swatch: "5px"
  bar: "3px"
  coin: "50%"
spacing:
  page-top: "18px"
  page-x: "22px"
  page-bottom: "28px"
  band: "22px"
  register-row: "26px"
  register-column: "30px"
  stack: "10px"
  inline: "6px"
  row: "7px"
  cell: "8px"
components:
  tabs:
    backgroundColor: "{colors.ground}"
    rounded: "{rounded.pill}"
    padding: "3px"
  tab:
    textColor: "{colors.ink2}"
    typography: "{typography.control}"
    rounded: "{rounded.pill}"
    padding: "6px 14px"
  tab-hover:
    backgroundColor: "{colors.linen}"
    textColor: "{colors.ink}"
    typography: "{typography.control}"
    rounded: "{rounded.pill}"
    padding: "6px 14px"
  tab-selected:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.ground}"
    typography: "{typography.control}"
    rounded: "{rounded.pill}"
    padding: "6px 14px"
  button-pill:
    backgroundColor: "{colors.ground}"
    textColor: "{colors.ink}"
    typography: "{typography.control-small}"
    rounded: "{rounded.pill}"
    padding: "5px 13px"
  button-pill-hover:
    backgroundColor: "{colors.linen}"
    textColor: "{colors.ink}"
    typography: "{typography.control-small}"
    rounded: "{rounded.pill}"
    padding: "5px 13px"
  button-pill-current:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.ground}"
    typography: "{typography.control-small}"
    rounded: "{rounded.pill}"
    padding: "4px 11px"
  fence-state:
    textColor: "{colors.ink2}"
    typography: "{typography.note}"
    rounded: "{rounded.panel}"
    padding: "9px 12px 10px"
  fence-state-on:
    backgroundColor: "{colors.linen}"
    textColor: "{colors.ink2}"
    typography: "{typography.note}"
    rounded: "{rounded.panel}"
    padding: "9px 12px 10px"
  hoard-value:
    textColor: "{colors.ink}"
    typography: "{typography.figure}"
    padding: "7px 0"
  scene:
    backgroundColor: "{colors.ground}"
    textColor: "{colors.ink2}"
    typography: "{typography.small}"
    padding: "12px 18px 10px"
    height: "234px"
  card-face:
    backgroundColor: "{colors.ground}"
    textColor: "{colors.ink}"
    typography: "{typography.body}"
    padding: "10px 12px"
  lease-bar:
    backgroundColor: "{colors.thread}"
    rounded: "{rounded.bar}"
    height: "6px"
  lease-bar-fill:
    backgroundColor: "{colors.gold}"
    rounded: "{rounded.bar}"
    height: "6px"
  mock-bar:
    backgroundColor: "{colors.ground}"
    textColor: "{colors.ink2}"
    typography: "{typography.note}"
    rounded: "{rounded.panel}"
    padding: "12px 14px"
---

# Design System: fee-fi-fo-fum

## Overview

**Creative North Star: "The Castle Tapestry"**

The page is one embroidered cloth: a Bayeux-style frieze with couched gold. Everything is drawn. The castle, the giant, the beanstalk and the Jacks are smooth, rounded figures outlined in indigo-black thread. They sit on a white ground and linen panels, filled with flat wool colours. There are no gradients, no drop shadows and no dark mode.

The tale leads, and the money is exact. Four big lettered syllables, FEE FI FO FUM, head the page, one per agent. The lease holder's syllable is lit gold. Three registers follow: the shifts (a 24-hour roundel with the lease thread at its centre), the fence (the giant and three stitched states) and the hoard (a castle spilling coins over a ledger). Then come the beanstalk auction, the tapestry of scenes and the ledger of fills. Words of the tale are lettered. Facts are set in a plain rounded sans with tabular numerals, and they are never lettered or stitched.

The system refuses the trading-dashboard look: no KPI tiles, no status pills, no dark terminal and no neon line chart. State is a stitch and a coloured word. Gold means the holder or the hoard. The page is a guest in someone else's box, so it sizes itself by that box and touches nothing outside it.

**Key Characteristics:**
- White ground, linen panels, indigo-black outlines, flat wool fills.
- Display lettering is Almendra Bold, shipped as inline SVG glyph outlines.
- Figures use a rounded system sans with tabular lining numerals, and every amount carries its unit.
- Three state stitches: satin for LIVE, running stitch for WIND-DOWN, cross-stitch for FENCED.
- Depth is outline and fill. There are no drop shadows.
- One ease for all motion. The fence trip is the one loud moment.
- One file, embedded in a shadow root, laid out by its own width and height.

## Colors

Dyed wool on linen: one indigo-black thread, three state wools, couched gold, and two flesh tones for the figures.

### Primary
- **Couched Gold** (`--gold`, #C8961E): the lease holder and the hoard. It fills the holder's syllable in the chant, the holder's letters in the roundel, the lease thread, the card-face lease bar, the coins, the castle's flag, the 3.5px underline under the two hoard amounts, the current clearing-price knot on the beanstalk, and live fill dots on the replay timeline. At 2.68:1 on white it is never text.
- **Gold Highlight** (`--goldhi`, #E9BC45): the heap of coins in the castle gate.
- **Gold Ink** (`--goldink`, #83600F): gold's text form, 5.76:1 on white. It sets the "holds the castle" line and the titles of gold-toned scenes (a claim, a fill, an auction).

### Secondary
- **Madder** (`--madder`, #B0412A): FENCED, refusal and warning. It colours cross-stitches, the FEE-FI-FO-FUM! shout, the giant's roaring mouth, the auction floor line, struck-through rejected bidders, the "asleep" line, and the MOCK source label.
- **Woad** (`--woad`, #2F4A7A): WIND-DOWN. It colours the running stitch, the dashed lease track, bid flags on the beanstalk, links, the focus ring and the chain-replay source label.
- **Sage** (`--sage`, #4C7743): LIVE. It colours the satin stitch, the live source label, held-lease bars on the replay timeline, and the beanstalk's stem and leaves.

### Tertiary
- **Skin** (`--skin`, #EDC49B): faces of the giant and the Jacks. Figures only.
- **Beard** (`--beard`, #7A4B2A): the giant's hair and beard, the castle door, the broom. Figures only.

### Neutral
- **Ground** (`--ground`, #FFFFFF): the page. `html`, `body` and the root are white.
- **Linen** (`--linen`, #F6EFDF): panels and fills. The lit fence card, the roundel face, castle walls, scrolls, and the hover fill on every control.
- **Thread** (`--thread`, #E6DAC0): quiet structure. The 1.4px ledger rules, the roundel's inner ring and idle shift arcs, the lease-thread track, the beanstalk's woven grid, the asleep syllable's fill, the card-face bar track and the mock-bar border.
- **Band Rule** (#D9C9A6): the couched line in the embroidered band and the ground line under every vignette. It is a literal in the build, not a custom property.
- **Ink** (`--ink`, #1F2433): text, every outline, 1.6px structural rules and the selected tab. 15.46:1 on white.
- **Ink 2** (`--ink2`, #474C5A): secondary text. Glosses, roles, ledger keys, state copy.
- **Ink 3** (`--ink3`, #6A6E79): muted text. Table heads, hour ticks, the lapsed holder's letters, the asleep outline, the MOCK tag on a tx.

The direction contract named madder #B5452B, sage #5E7F4F and a weld yellow. The build shipped a darker madder and sage (above) and no weld.

Drift: the build also lights the roundel's active shift arc and text selection in goldhi. Neither is the holder or the hoard, so both break the Couched Gold Rule. They are recorded here as drift, not as roles.

### Named Rules
**The Couched Gold Rule.** Gold marks only the lease holder and the hoard: who holds the castle, and the gold the castle holds or trades. Nothing else is gold.

**The Gold Ink Rule.** Gold is never text. Gold-family text is goldink. Gold lettering always carries an ink outline painted under the fill.

**The State Wool Rule.** Each fence state owns one wool: sage is LIVE, woad is WIND-DOWN, madder is FENCED. A state wool always travels with its stitch or its word.

**The Mirrored Literal Rule.** The SVG art (figures, vignettes, roundel, beanstalk, timeline) writes token hexes as literals in script. A change to a token on `:root,:host` must change those literals too.

## Typography

**Display Font:** Almendra Bold by Ana Sanfelippo (SIL OFL 1.1), shipped as glyph outlines drawn by `letters()`
**Body Font:** ui-rounded, "SF Pro Rounded", system-ui, -apple-system, "Segoe UI", Roboto, sans-serif (`--sans`)
**Label/Mono Font:** the same sans, with `font-variant-numeric: tabular-nums lining-nums` on every figure

**Character:** A calligraphic storybook face for the words of the tale. A soft rounded sans for the facts, so the money reads plainly.

### Hierarchy
- **Display** (Almendra Bold, clamp(40px, 8.5cqw, 96px), line-height 1): the four chant syllables only.
- **Headline** (Almendra Bold, 26px): register heads: THE SHIFTS, THE FENCE, THE HOARD, THE BEANSTALK, THE TAPESTRY, THE FILLS, THE REPLAY. The lowercase wordmark fee·fi·fo·fum is 44px (34px compact, 24px on the card face).
- **Title** (Almendra Bold, 17px): fence state names and tapestry scene titles. The FEE-FI-FO-FUM! shout is 30px.
- **Figure** (sans 800, 20px, tabular): hoard amounts. The clearing price is 19px. Bidder names are 16px/800.
- **Body** (sans 400, 15px/1.45): the base. The tagline is 15px italic in ink2. Tables, ledger keys and tabs are 14px.
- **Note** (sans 400, 13.5px): roles, state copy, notes (max 62ch), the ENS name and the mock bar.
- **Small** (sans 400, 12.5px/1.4): scene glosses, ledger sub-lines, the roundel countdown, the footer.
- **Label** (sans 800, 12.5px, 0.07em, uppercase): the source label only. Table heads are 12px/700, 0.05em, uppercase, ink3. The MOCK tag is 11px/700, 0.04em, uppercase, ink3.
- **Caption** (sans 400, 11.5px): beanstalk and timeline axis text. Roundel hour marks are 10.5px.

### Named Rules
**The Lettered Word Rule.** Lettering is for words of the tale: the chant, register heads, state names, scene titles, the shout and the wordmark. The glyph set is closed: A to Z, lowercase f e i o m u, the marks · - ! ’ and the space. Any other character draws as a blank. So lettered strings are capitals (the wordmark is the one lowercase string) and never hold digits.

**The Plain Figures Rule.** Numbers are never lettered or stitched. Every figure is the sans with tabular lining numerals, so columns align and ticking values stay still.

**The Outline Not Font Rule.** Lettering ships as glyph outlines in script (em 200, cap height 133). `letters(str, true)` crops each word to the cap height, plus 12 units above and below. Nothing loads a font.

## Layout

The root sizes itself by its own box, never the viewport. It is an inline-size container, and a ResizeObserver sets one of four layouts. A box is "short" when it is under 420px tall.

- **watch** (short and under 268px wide): the card face only. Wordmark, holder syllable, state and countdown, lease bar, hoard line. The live source label is hidden here to save room, but the mock label always shows.
- **mini** (short and under 420px wide): the card face, with the source label, the epoch and the last fill.
- **compact** (under 620px wide, and not watch or mini): one column. The chant becomes a 2×2 grid. The beanstalk stacks. Ledger tables turn into two-column row cards, optional columns drop, and units show inline. The wordmark drops to 34px. A phone gets this layout, not the card face.
- **full** (620px and wider): content up to 1320px, centred, padded 18px 22px 28px. The three registers sit in an auto-fit grid (minmax(290px, 1fr), 26px row gap, 30px column gap), three across at 1440px. The beanstalk splits 1.7fr to minmax(240px, 1fr).

The embroidered band separates registers: 14px tall, 22px above and below. The beanstalk chart is redrawn at its display size (640×250 full, 340×230 narrower), so its 11.5px axis type stays 11.5px on a phone.

The tapestry is a one-row frieze between two 1.6px ink rules. Scenes are at least 200px wide and 234px tall, with the newest on the right. The row is clipped to one scene's height. "Unroll the whole tapestry" opens it to full height. The page keeps 40 scenes.

There is no spacing scale. Spacing is set per part. The recurring values are 6px inline gaps, 10px stacks, 18px and 22px page rhythm, 7px ledger rows and 8px table cells.

### Named Rules
**The Short Box Rule.** Width picks the layout. Only a box under 420px tall and under 420px wide gets the card face, so a narrow, tall phone gets the whole app.

**The Guest Rule.** The page runs inside a host's shadow root. Tokens live on `:root,:host`. The root holds `contain: layout paint`. Nothing is `position: fixed`. There is no `@font-face`, no JSON script tag and no `innerHTML`. Config is inlined as a JS literal at the `/*@CONFIG*/` slot.

## Elevation & Depth

Flat. There are no drop shadows, no gradients and no blur. Depth comes from outline and fill, like appliqué on cloth: an ink outline around a linen or wool fill. A lit state card is linen with a 1.6px ink border. The build's only box-shadow is an inset ink ring (2px on the ledger coin, 1.6px on the legend coin) that outlines a coin dot. It is a stroke, not elevation.

### Named Rules
**The Appliqué Rule.** Things come forward by outline and fill, never by shadow. A surface that needs to stand out gets linen and an ink border.

## Shapes

Round and continuous. Every stroke has round caps and round joins. Figures are smooth curves in outline.

- **Pills** (999px): controls only. The tab set, the unroll button, the mock beat buttons.
- **Soft panels** (16px): the fence state cards and the mock bar.
- **Small radii**: 8px on the focus outline, 5px on legend swatches, 3px on the card-face bar. Coins are circles.
- **Structural rules**: 1.6px ink. The tab ring, the lit card border, the frieze edges, the table-head rule, the chart axis.
- **Quiet rules**: 1.4px thread for ledger rows and scene dividers; 1.4px ink on pill buttons.
- **The embroidered band**: a 5px band-rule line with a 1.6px ink tick every 36px.

Stroke weights, by drawing:
- Line icons: 24-unit box, 1.8 stroke, `currentColor`, no fill.
- Fence stitches: 34-unit box. Satin is five 3.2 strokes. Running stitch is a 3.4 stroke dashed 4 5. Cross-stitch is two 3.6 strokes.
- Vignettes: 120×64 box, 1.8 ink stroke, flat fills.
- The giant: 3. The castle: 2.4. Coins: 1.5 to 2.
- Gold lettering outline: 5 units (6 in the roundel), painted under the fill.

### Named Rules
**The One Thread Rule.** Line icons, stitches, vignettes and figures share one stroke system: ink outline, round caps and joins, flat fill. Icons and stitches draw in `currentColor`, so they take their state's wool.

## Components

### Buttons
Tactile, stitched pills.
- **Shape:** full pill (999px).
- **Tabs:** a 1.6px ink ring with 3px padding holds "The castle" and "The replay" (6px 14px, 14px/700, ink2). The selected tab is ink with white text. Hover is linen with ink text. These tabs are the page's only action.
- **Pill buttons:** white, 1.4px ink border, 13px/700. Unroll is 5px 13px. Mock beats are 4px 11px. Hover fills linen. The current mock beat is ink with white text.
- **Focus:** a 2.5px woad outline, 3px offset, 8px radius, on every focusable element.
- **Transitions:** background and colour over .2s on the shared ease.

### The chant
- Four syllables, one per agent, spread across the width. Under each: the role (13.5px ink2) and a status line (13.5px/700 with an 18px line icon).
- **Holder:** gold fill with a 5-unit ink outline. Status in goldink with the key icon: "holds the castle".
- **Asleep:** thread fill with a 2.5-unit ink3 outline. Status in madder with the zzz icon.
- **Lapsed holder:** the glass icon and "lease lapsed".
- Colour and fill change over .4s.

### Fence states (signature)
- Three rows: LIVE, WIND-DOWN and FENCED. Each has a 34px stitch, the lettered name at 17px, one line of 13.5px copy, and the books in that state (18px stitch plus a 13px/700 line).
- **At rest:** no fill, a transparent border, the name in ink3.
- **Lit:** linen fill, 1.6px ink border, 16px radius, the name in its state wool. The change runs over .35s.
- **The giant** beside it has three faces: calm for LIVE, one eye open for WIND-DOWN, and eyes wide with a madder mouth for FENCED. They crossfade over .3s.

### The fence trip (signature motion)
When a stale quote is fenced, the root carries `data-shout` for 3.6s. The four syllables lift (translateY(-6px), scale 1.06, .5s), each .08s after the last. FEE-FI-FO-FUM! appears in madder lettering under the fence, fading in over .35s and growing from .9 scale over .5s. The giant wakes and roars. The FENCED card lights.

### Fate mark
State in a ledger row: an 18px stitch and the uppercase word, 13px/800, 0.03em, in the state wool. A reverted fill adds a 12px muted line with the revert reason. There is no background and no border.

### Hoard ledger
- Rows split key and value on a shared baseline, with 7px vertical padding and a 1.4px thread rule between rows.
- **Key:** 14px ink2. The two hoard rows lead with a 13px gold coin dot. A 12.5px ink3 sub-line names the source.
- **Value:** 20px/800 tabular, on one line. The unit follows in 13px/700 ink2.
- The two hoard rows (WETH and USDC) carry a 3.5px gold underline.

### The roundel
A 320-unit disc with a linen face and a 2px ink rim. It has 24 hour ticks, longer every six hours, labelled 0h UTC, 6h, 12h and 18h. Shift arcs (30 units, thread) carry the city and its local time. (The build lights the current shift's arc in goldhi. That breaks the Couched Gold Rule and is drift, not a role.) Inside runs the lease thread: a 9-unit gold arc that shortens as the lease runs down, on a thread track. In wind-down the track becomes a 4-unit woad dash (7 7). A clock hand with an ink knot marks UTC now. The holder's syllable sits in the centre, gold when live and ink3 when lapsed, with the countdown and epoch under it. The hand and thread move every frame.

### The beanstalk
The CCA clearing price, drawn as a vine. A woven grid of 1.2-unit thread rules. A 1.6-unit ink axis. A dashed madder floor (6 6). The stem is a 5-unit sage curve through every checkpoint, with a sage leaf at each one. The current price is a gold knot. Each Jack's top price is a small woad flag at the right edge, one size for every Jack. Bids list beside the chart, highest price first. A bidder refused for having no ENS name is struck through in madder.

### Tapestry scene
- **Title:** lettered words at 17px that wrap word by word. The tone sets the colour: ink, goldink, madder or woad.
- **Vignette:** a small scene, 168×90 on a 120×64 box, standing on a band-rule ground line. There are 19 kinds: begin, renew, expired, claim, relink, fall, wake, fill, wide, fenced, refused, ship, dock, climb, cleared, quill, ruin, bell and sprout.
- **Gloss:** 12.5px ink2; the first line is 800 ink. A meta line gives time, block and tx.
- **Motion:** a new scene slides in from 18px right while fading up, over .6s. A lease renewal folds into its epoch's scene as a count and never adds a scene.

### Card face
The miniapp in a 280×200 card. The 24px wordmark and the source label (which the build drops at watch size; see Layout). The holder's syllable at 30px, gold with an ink outline. The state and countdown in 15px/800, sage for LIVE and woad for WIND-DOWN. The epoch in ink3. A 6px lease bar, gold on thread. The hoard in 13px with bold figures. The last fill.

### Mock bar
A 16px-radius box with a 1.6px thread border and 13.5px ink2 text. "Mock stream." leads in bold madder, then the six beat buttons and "Start over". In chain replay the same box leads with "Chain replay." and has no buttons.

## Do's and Don'ts

### Do:
- **Do** keep every token on `:root,:host` so it reaches the page inside the host's shadow root.
- **Do** build every node with `createElement`, `createElementNS` and `textContent`, and swap content with `replaceChildren`.
- **Do** write every amount and price with its unit: 2.2500 WETH, 14,905.20 USDC, 2,412.50 USDC / WETH. WETH shows 4 decimals; USDC and prices show 2.
- **Do** let text wrap. The root sets `overflow-wrap: anywhere`. Money values stay on one line and the row wraps around them.
- **Do** show state as a stitch plus a word in the state's wool.
- **Do** label mock data wherever it shows: the source label reads "Mock stream · synthetic" in madder, every mock tx carries a MOCK tag, and a mock tx is never a link.
- **Do** outline gold lettering in ink, and set gold-family text in goldink.
- **Do** use `cubic-bezier(.16,1,.3,1)` for every transition, and drop all animation and transition under `prefers-reduced-motion: reduce`.
- **Do** keep the Castle / Replay tabs as the only action, with unroll and, in mock only, the beat buttons.

### Don't:
- **Don't** use gold for anything but the lease holder and the hoard.
- **Don't** print an amount or a price without its unit.
- **Don't** ellipsize or clamp text: no `text-overflow`, no line clamps, no cut names, amounts or prose. The only shortened strings are hex hashes and addresses (first 6, last 4) where no name is known.
- **Don't** use status pills, badges or filled capsules for state. Pills are for controls.
- **Don't** add a kill button or any control that stops an agent.
- **Don't** use `position: fixed`, `@font-face`, JSON script tags or `innerHTML`.
- **Don't** use browser storage, cookies, `eval` or ES modules.
- **Don't** use gradients, drop shadows, dark grounds, KPI tiles or neon line charts.
- **Don't** letter digits, or any mark outside · - ! ’.
