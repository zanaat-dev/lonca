---
name: Lonca
description: The open marketplace integration engine, drawn as a dark hairline column with one blue accent.
colors:
  ground: '#0a0b0c'
  ink: '#e9edf1'
  ink-2: '#acadb0'
  ink-3: '#7c8085'
  ink-4: '#8a8e93'
  line: '#1c1f22'
  line-2: '#2a2d31'
  field: '#1f2123'
  chip: '#151719'
  accent: '#3e77d2'
  accent-hover: '#4a83de'
  accent-soft: '#5b8fe6'
  accent-ink: '#ffffff'
  paper: '#eaeef8'
  state-ok: '#7fc29b'
  state-error: '#e58b7a'
  status-live: '#4fae7c'
typography:
  display:
    fontFamily: 'Familjen Grotesk, Helvetica Neue, Arial, sans-serif'
    fontSize: '4.3cqw'
    fontWeight: 700
    lineHeight: 0.98
    letterSpacing: '-0.018em'
  headline:
    fontFamily: 'Familjen Grotesk, Helvetica Neue, Arial, sans-serif'
    fontSize: 'clamp(28px, 3.2cqw, 52px)'
    fontWeight: 600
    lineHeight: 1.06
    letterSpacing: '-0.025em'
  numeral:
    fontFamily: 'Familjen Grotesk, Helvetica Neue, Arial, sans-serif'
    fontSize: 'clamp(34px, 3.6cqw, 58px)'
    fontWeight: 600
    lineHeight: 1
    letterSpacing: '-0.03em'
    fontFeature: 'tnum'
  title:
    fontFamily: 'Familjen Grotesk, Helvetica Neue, Arial, sans-serif'
    fontSize: 'clamp(17px, 1.5cqw, 22px)'
    fontWeight: 600
    letterSpacing: '-0.01em'
  body:
    fontFamily: 'Familjen Grotesk, Helvetica Neue, Arial, sans-serif'
    fontSize: 'clamp(15px, 1.35cqw, 20px)'
    fontWeight: 400
    lineHeight: 1.5
  body-sm:
    fontFamily: 'Familjen Grotesk, Helvetica Neue, Arial, sans-serif'
    fontSize: '15px'
    fontWeight: 400
    lineHeight: 1.6
  label:
    fontFamily: 'JetBrains Mono, ui-monospace, Cascadia Mono, Consolas, monospace'
    fontSize: '12px'
    fontWeight: 500
    letterSpacing: '0.06em'
  code:
    fontFamily: 'JetBrains Mono, ui-monospace, Cascadia Mono, Consolas, monospace'
    fontSize: 'clamp(12.5px, 1.05cqw, 15px)'
    fontWeight: 400
    lineHeight: 1.65
rounded:
  focus: '4px'
  tab: '6px'
  button: '7px'
  card: '10px'
  pill: '99px'
spacing:
  gutter-narrow: '16px'
  column-inset: '8.98cqw'
  band-y: 'clamp(48px, 6cqw, 96px)'
  band-x: 'clamp(20px, 2.6cqw, 44px)'
  cell-x: 'clamp(16px, 1.8cqw, 32px)'
  head-gap: 'clamp(32px, 3.6cqw, 56px)'
  chip-gap: '8px'
components:
  button-primary:
    backgroundColor: '{colors.accent}'
    textColor: '{colors.accent-ink}'
    typography: '{typography.body-sm}'
    rounded: '{rounded.button}'
    padding: '12px 18px'
  button-primary-hover:
    backgroundColor: '{colors.accent-hover}'
  nav-cta-pill:
    backgroundColor: '{colors.paper}'
    textColor: '#080809'
    rounded: '{rounded.pill}'
    height: '2.93cqw'
  waitlist-field:
    backgroundColor: '{colors.field}'
    textColor: '{colors.ink}'
    rounded: '{rounded.card}'
    padding: '6px'
  need-chip:
    backgroundColor: '{colors.chip}'
    textColor: '{colors.ink-2}'
    rounded: '{rounded.pill}'
    padding: '0 16px'
    height: '38px'
  need-chip-selected:
    backgroundColor: 'rgba(62, 119, 210, 0.14)'
    textColor: '{colors.ink}'
  npm-chip:
    backgroundColor: '{colors.chip}'
    textColor: '{colors.ink-2}'
    typography: '{typography.code}'
    rounded: '{rounded.tab}'
    padding: '6px 10px'
  code-card:
    backgroundColor: '#0d0f11'
    textColor: '{colors.ink}'
    rounded: '{rounded.card}'
  code-tab-selected:
    backgroundColor: '{colors.line}'
    textColor: '{colors.ink}'
    rounded: '{rounded.tab}'
    padding: '7px 12px'
  hub-pill:
    backgroundColor: '#101214'
    textColor: '#d2d4d8'
    rounded: '{rounded.pill}'
    height: '5.32cqw'
    padding: '0 1.9cqw'
---

# Design System: Lonca

## Overview

**Creative North Star: "The Engine Room Blueprint"**

Lonca is drawn as a single dark column framed by two long hairlines, with everything inside measured and ruled like a technical drawing. The ground is almost black, the text is crisp cool grey in four steps, and structure comes from 1px lines, not from cards or shadows. One blue does the talking: the primary action, live state, and Lonca's side of a comparison. The only place light enters the page is the engine node at the centre of the hub diagram, where marketplace lines converge and order dots travel out.

The world executes the category's standard seller-SaaS frame (headline, form, product view, comparison, steps, pricing, FAQ) in developer-tool craft: Familjen Grotesk with tight display tracking, small JetBrains Mono for anything a developer would type or read as data, pill nodes, and dashed strokes for what is coming but not yet real. Density is medium: wide bands, generous vertical padding, compact rows inside them.

The landing is the source; the Starlight docs follow it by mapping the same ground, inks, hairlines, faces and accent onto Starlight's variables.

**Key Characteristics:**

- Near-black ground, four-step cool grey ink, two hairline greys.
- One accent, Lonca blue, rationed to action, live state and "us".
- A centred column ruled by hairlines at 8.98cqw from each edge.
- Desktop geometry in container-query width, bound to the approved comp.
- Flat surfaces; the engine node's glow is the single source of light.
- Solid means today, dashed means soon.

## Colors

A near-monochrome cool-grey palette on near-black, with a single saturated blue.

### Primary

- **Lonca Blue** (accent): the primary action (waitlist buttons, closing CTA), the hub's ports and travelling order dots, the selected need-chip border, the closing pattern's squares. Hovers lighten to **Lifted Blue** (accent-hover).
- **Signal Blue** (accent-soft): blue as text or outline on the dark ground, where Lonca Blue would be too dim: focus rings, step ordinals, the "Lonca" ledger column head, arrow links.
- **Blue Ink** (accent-ink): text on Lonca Blue.

### Neutral

- **Engine Room Black** (ground): page ground, header ground at 88% with a 10px backdrop blur, scrollbar track.
- **Cool Paper Ink** (ink): headlines, primary text, hovered links, selected states.
- **Quiet Ink** (ink-2): sublines, body paragraphs, need-chip text, footer brand.
- **Muted Ink** (ink-3): the display headline's second line, form notes, mono labels, footer text, struck-through competitor values.
- **Fact Ink** (ink-4): fact-cell paragraphs and fine print. It is slightly lighter than Muted Ink despite the higher number.
- **Hairline** (line): column rules, band separators, table rows, step and plan dividers.
- **Strong Hairline** (line-2): borders of interactive or boxed things: fields, chips, fact cells, code card.
- **Field** (field): input wells.
- **Chip** (chip): resting chip and copy-button fills.
- **Paper** (paper): the nav's white pill CTA, the only light surface besides the engine node.

### State

- **Sent Green** (state-ok) and **Error Coral** (state-error): form status text only.
- **Live Green** (status-live): the "verified in production" status dot, with a 3px halo at 18%.

### Named Rules

**The One Blue Rule.** Blue appears only on the action, on live or travelling state, and on Lonca's side of a comparison. A blue that decorates a heading or ornament is wrong.

**The Signal-on-Dark Rule.** When blue is text or an outline on the ground, use Signal Blue; Lonca Blue is a fill.

## Typography

**Display Font:** Familjen Grotesk (with Helvetica Neue, Arial)
**Body Font:** Familjen Grotesk
**Label/Mono Font:** JetBrains Mono (with ui-monospace, Cascadia Mono, Consolas)

Both faces are self-hosted from `public/fonts` as variable woff2 files (Familjen 400 to 700, JetBrains Mono 400 to 600), split into latin and latin-ext subsets so Turkish characters load, with `font-display: swap`.

**Character:** A slightly quirky, tightly tracked grotesk carries every word a seller reads; a mono carries every word a developer would type. They never swap roles.

### Hierarchy

- **Display** (700, 4.3cqw (44px at 1024), 0.98, -0.018em): the hero headline only. Two lines, the first in Cool Paper Ink, the second in Muted Ink. Below 999px: clamp(36px, 11vw, 48px).
- **Headline** (600, clamp(28px, 3.2cqw, 52px), 1.06, -0.025em, balanced wrap): band and closing headings.
- **Numeral** (600, clamp(34px, 3.6cqw, 58px), 1, -0.03em): plan prices. Proof figures use a smaller step (600, clamp(20px, 2cqw, 30px), -0.02em, tabular numerals).
- **Title** (600, clamp(17px, 1.5cqw, 22px), -0.01em): step and plan names. Fact-cell titles sit at 500, 1.86cqw, -0.015em.
- **Body** (400, clamp(15px, 1.35cqw, 20px), 1.5, max 62ch, pretty wrap): band leads, closing line. Dense body is 15px at 1.55 to 1.6.
- **Label** (JetBrains Mono 500, 12px, 0.06em, uppercase): comparison table column heads only. Proof-term labels use the same mono at 12px, 0.04em, sentence case.
- **Code** (JetBrains Mono, clamp(12.5px, 1.05cqw, 15px), 1.65): code blocks; 13px for inline package names.

### Named Rules

**The Typed-Text Rule.** Mono is for package names, code, data labels and ordinals. Never for headlines or prose.

**The Tight Display Rule.** Every heading carries negative tracking (-0.01em to -0.03em); body text never does.

## Layout

**The comp-bound fold.** The page is a container (`container-type: inline-size`). Above the fold, every length is the approved comp's pixel value divided by 10.24 and expressed in `cqw`, and elements are absolutely placed. The first viewport therefore scales as one drawing with the window instead of reflowing: header 5.18cqw tall, fold 42.87cqw, column rules at 8.98cqw and 90.82cqw, header dividers at 31.74cqw and 70.31cqw.

**The 1200px cap.** The page container stops growing at 1200px (`max-width: 1200px`, centred), so the drawing scales up to 1200 and then holds its size on wider screens instead of filling a 2K or 4K window. Only the header background, the band-opening hairlines and the footer rule stay full-bleed (`::before` at `100vw`), so the frame still reaches the window edges.

**The hub-relative convention.** The hub figure is its own container (45.9cqw wide, 2:1). Inside it, lengths are comp pixels divided by 4.70 in the hub's own `cqw`, so the pills, engine and canvas stay locked to each other at every size. The canvas bleeds 60 design units past the hub box on every side so the glow is never clipped.

**Below the fold: fluid bands.** Each section is a band inset 8.98cqw from both edges, bordered left and right by hairlines that continue the hero's column rules, opened by a full-bleed hairline. Padding clamp(48px, 6cqw, 96px) vertical, clamp(20px, 2.6cqw, 44px) horizontal. Type uses `clamp()` with px floors and ceilings so it stays readable from 1024 to 1920. Heads cap at 46rem, prose at 62ch, forms and FAQ at 52rem.

**Grids.** Three-column ruled grids (facts, steps, plans, proof) divide with hairlines rather than gaps; the first cell has no left padding so text aligns to the band edge.

**At 999px and below** the drawing becomes a flow: the fold switches to a grid with 16px gutters and 18px gaps, absolute positions reset, the header drops to 56px with only the brand, the last nav link and the CTA pill, the GitHub chip and all column and header rules disappear, the hero form stacks vertically, the hub stays as a scaled drawing with right-anchored outputs, and every three-column grid collapses to one column with top hairlines in place of left ones. Bands lose their side borders and margins.

### Named Rules

**The Ruled Column Rule.** Every section lives between the two long hairlines at 8.98cqw. Nothing breaks the column except the full-bleed separators.

**The Lines-Not-Gaps Rule.** Grid cells are separated by 1px hairlines, never by gutters and floating cards.

## Elevation & Depth

The system is flat. Depth comes from hairline borders and two near-black fill steps (Chip, Field) on the ground. The sticky header uses translucency (ground at 88%) and a 10px backdrop blur. The single exception is the engine node: a light tile with an inset 1px white edge and a soft drop shadow, sitting in a radial white glow drawn on the hub canvas. A comparison's "us" column gets a faint blue gradient wash from the left.

### Shadow Vocabulary

- **Engine lift** (`box-shadow: 0 0 0 1px rgba(255,255,255,0.6) inset, 0 0.9cqw 3.4cqw rgba(0,0,0,0.45)`): the engine node only.
- **Live halo** (`box-shadow: 0 0 0 3px rgba(79,174,124,0.18)`): the production-verified status dot.

### Named Rules

**The Single Light Rule.** The engine node is the only lit object. No other surface gets a glow or a drop shadow.

## Shapes

Corners are small and consistent: 4px focus rings, 6px tabs and copy chips, 7px buttons, 10px fields and code card. Pills (99px) are reserved for nodes and choices: hub nodes, need chips, the nav CTA. The fact row is a single bordered box with only its top corners rounded, sitting on the first band's hairline. Status dots are circles. Dashed strokes, on hub pills and hub lines alike, mean "not yet".

## Components

### Navigation

Sticky, translucent, ruled. Logomark at left, two vertical hairline dividers, centred text links in muted grey turning to Cool Paper Ink on hover, a GitHub star chip (dark fill, strong border) and the white Paper pill CTA at right. Below 999px: 56px tall, brand, one link and the CTA only.

### Buttons

- **Primary:** Lonca Blue fill, white 600 text, 7px corners, 12px 18px padding; hover lifts to Lifted Blue over 0.2s. Disabled sits at 70% opacity with a progress cursor.
- **Nav pill:** Paper fill, near-black 500 text, full pill; hover goes to pure white.
- **Arrow link:** Signal Blue text with a trailing arrow, hover to Cool Paper Ink.

### Inputs / Fields

- **Waitlist field:** a Field-filled well with a Strong Hairline border; the email input is borderless inside it and the blue button is nested flush at the right (hero) or after a select (co-design form). Focus brightens the well border to #3b4047; inputs drop their own outline. Status text below in Muted Ink, Sent Green or Error Coral, announced politely.
- **Need chips:** checkbox pills on Chip fill. Checked: Lonca Blue border, 14% blue fill, Cool Paper Ink text, lifted 1px with an expo-out ease. Focus shows the Signal Blue ring.

### Chips

- **npm chip:** mono package command in a Chip-filled, small-radius box with a copy cursor; clicking copies and confirms in place. Inline version in the code card's tab bar, hidden below 999px.

### Signature: the hub

Three marketplace pills on the left feed bezier hairlines into the light engine tile carrying the Lonca icon; one solid line leaves for "your own code · today" and one dashed line for "Lonca Panel · soon". Pills are dark fills with a hairline border; "soon" pills are dashed and carry their qualifier in Muted Ink. Blue ports mark where lines meet the node.

### Fact cells and proof grid

Fact cells: three columns in one hairline box, 500-weight title over a short Fact Ink paragraph. Proof grid: a definition list of ruled cells, mono term over a large tabular figure; wide rows hold release versions and production status dots with an arrow link.

### Ledger

The comparison table: mono uppercase column heads, Lonca's column head in Signal Blue, the category's values in Muted Ink with a 1px strike-through, Lonca's values in Cool Paper Ink at 500 over a faint blue wash. Rows are separated by hairlines only.

### Steps and plans

Ruled three-column grids. Steps open with a mono two-digit ordinal in Signal Blue. Plans show a name, a Numeral price, a note, and a status line in Muted Ink.

### Code card

Darker-than-ground card (#0d0f11), Strong Hairline border, 10px corners. Tab bar of text tabs; the selected tab gets a Hairline fill and Cool Paper Ink. Shiki-highlighted code on a transparent background.

### FAQ

Native disclosure rows between hairlines; question at 500 weight, answer in Quiet Ink at 62ch. The indicator rotates 45 degrees when open.

### Closing and footer

The closing band is a hairline box with a centred headline, line and primary button over a canvas of slowly drifting blue squares. The footer is ruled above, with the logomark, contact, links and the always-visible unofficial disclaimer in 13px.

### Motion

- **Hub dots:** canvas-drawn order dots travel the bezier lines in a 2.6s cycle with staggered phases; the panel line's dot is fainter and slower (1.6x). Animation pauses off screen. Reduced motion draws the static diagram with ports and no travelling dots.
- **Ledger strike-through:** competitor values are struck when the table is 35% in view; each line draws left to right in 0.7s on cubic-bezier(0.16, 1, 0.3, 1), staggered 120ms per row after 150ms. Content is never hidden; under reduced motion the strikes are present immediately.
- **Closing pattern:** a 28px grid of squares from the Lonca icon's unit, sparsely seeded, in three sizes, pulsing between 5% and 17% blue and drifting sideways. Runs only while visible and not under reduced motion; otherwise one static frame.
- **Reduced motion** removes all CSS transitions and animations globally.
- State transitions use 0.2s ease for colour and cubic-bezier(0.16, 1, 0.3, 1) at 0.25s for small movement.

### Docs theme (Starlight)

`src/styles/custom.css` loads the same self-hosted faces and maps them to `--sl-font` and `--sl-font-mono`. Dark (default): `--sl-color-black` is the ground, `--sl-color-white` is Cool Paper Ink, gray-2 is Quiet Ink, gray-3 is Fact Ink, gray-5 is Strong Hairline, `--sl-color-hairline` is Hairline, `--sl-color-accent` is Lonca Blue with a deep navy low and a pale blue high. Headings get -0.02em tracking, selection uses the accent at 40%, the current sidebar page uses the quiet accent-low fill. A light theme stays available with a darker blue (#2c63bd) for contrast.

## Do's and Don'ts

### Do:

- **Do** express fold and hub geometry in `cqw` of their container, derived from the comp (page px / 10.24, hub px / 4.70).
- **Do** give every below-fold size a `clamp()` with px floor and ceiling.
- **Do** separate cells and sections with 1px Hairline or Strong Hairline rules.
- **Do** use dashed strokes, and a Muted Ink "soon" qualifier, for anything not yet shipped.
- **Do** put package names, code and data labels in JetBrains Mono.
- **Do** keep content visible without JavaScript; motion only decorates state that is already rendered.
- **Do** pause canvas animation off screen and draw a static frame under reduced motion.

### Don't:

- **Don't** use blue for decoration; it belongs to the action, live state and Lonca's side.
- **Don't** add drop shadows or glows outside the engine node.
- **Don't** float content in rounded cards with gaps; rule it into the column.
- **Don't** add surfaces lighter than Field other than the Paper pill and the engine tile.
- **Don't** redraw, recolour beyond ink, or add effects to the Lonca marks; inline them with `currentColor`.
