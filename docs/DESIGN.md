# Design

The visual system behind the Preferences window, the popup and the loader. Tokens
live in `src/styles.css` (`:root` for light, `:root[data-theme="dark"]` for dark;
`public/theme.js` always resolves the attribute, whether the user picked System,
Light or Dark). `loader.html` repeats the few tokens it needs inline. See
[PRODUCT.md](PRODUCT.md) for who this serves and why. The approved mockups are in
`docs/design/mockups/2026-09-28-soft-ui/`.

## Direction: soft UI, Imprompt colors

A light gray canvas with near-white cards floating on long, soft shadows, sunken
wells for tracks and inputs, a graphite rail, huge tight headlines and quiet
labels. The accent is the ink itself (black by day, near-white by night); mint,
amber and red stay signals. Corners are rounded but rectangular, echoing the
square `[I]` mark: nothing is a pill or a circle except status dots.

## Surfaces and depth

| Token | Light | Dark | Use |
|---|---|---|---|
| `--canvas` (+ `--glow`) | `oklch(.952 .004 286)` | `oklch(.17 .005 286)` | Window background, with a faint radial glow at the top |
| `--card` | `.995` | `.235` | Raised surfaces: cards, keys, list popovers, floating bars |
| `--sunken` / `--sunken-2` | `.926` / `.902` | `.145` / `.128` | Tracks, tiles, inputs, quiet wells |
| `--panel` | `.935` | `.155` | The "Last imprompt" panel |
| `--rail-1` → `--rail-2` | `.44` → `.285` | `.275` → `.215` | Graphite rail (vertical gradient) |
| `--dark-1` → `--dark-2` | `.43` → `.27` | `.36` → `.265` | Graphite cards (imprompts, support) |
| `--ink` / `--on-ink` | `.21` / `.99` | `.955` / `.185` | Text, primary actions, active state |
| `--body` `--dim` `--stone` `--faint` | .37 .43 .47 .50 | .87 .79 .72 .68 | Text ramp; each step ≥ 4.5:1 on canvas, card and sunken |
| `--mint*` `--amber*` `--danger*` | | | Connected/safe · text leaves the machine · errors |

Elevation: `--sh-card` (default), `--sh-lift` (hover), `--sh-float` (rail,
popovers, floating bars), `--sh-ink` (ink buttons), plus `--hl` (a one-pixel
highlight on the top edge of raised pieces) and `--inset` (the inner shadow of
sunken pieces). Presets keep their hue (`--pc-h`, `presetColor.ts`) as an 8px
square dot or a tinted tag (`--tag-*`).

## Shape

`--r-card` 12 · `--r-tile` 10 · `--r-ctl` 8 · `--r-chip` 7 · `--r-kbd` 5 ·
`--r-rail` 18. Switches, knobs and icon tiles are rounded squares, not circles.

## Typography

- **Plus Jakarta Sans** (`--sans`, bundled, 400–700) is the interface: headlines,
  labels, buttons, help text.
- **JetBrains Mono** (`--mono`) is the machine's data: shortcuts, model IDs, URLs,
  keys, the user's text and the result.
- Scale: page title 38/600 (Home 44), −0.045em · section 19 · card title 14.5/600 ·
  body 13 · help 12.5 · labels 11.5 · micro labels 10–10.5 uppercase, spaced.
  Numbers use tabular figures.

## Layout

- Preferences (fixed 900×640, not resizable): floating graphite rail (100px) with icon tiles and labels
  under them; one light tile slides to the current tab. Content column max 780px,
  cards stacked with 12px gaps, two-column grids where cards are short.
- Home: two columns of equal height (status headline, gesture card, four tiles |
  Last imprompt), then "This month" in three cards.
- API keeps its primary action in a floating bar at the bottom of the scroll area.
- Popup (496×430, resizable within limits): drag header, sunken captured text,
  preset track, result card, floating footer.
- Loader (224×46): the animated mark, "Imprompting" and three dots.

## Components

- **Buttons** (`.btn-dl`): secondary = raised card (becomes a gray block on top of
  a card), `.primary` = ink, `.danger` = red outline, `.btn-ghost` = text only.
- **Segmented** (`ui/Segmented.tsx`): sunken track, a raised pill that slides
  (`layoutId`). Buttons carry `aria-pressed`.
- **Switch** (`input.switch`): native checkbox, rectangular track, square knob.
- **Tiles** (`.tile`, `.ptile`, `.prov-tile`): sunken block, icon on a raised
  square, label below. Selection is an ink ring that slides between tiles.
- **Inputs** (`.input`, API fields): sunken, no border; focus lifts to a card with
  a ring; read-only is a thin outline.
- **Dropdown**: raised button, floating list that grows from the top, options in a
  short cascade.
- **Keys** (`kbd`): raised, mono.

## Motion

`motion/react` through `src/motion.ts`: springs `snappy` (sliding indicators),
`soft` (entrances) and `pop` (badges); `--spring` (`linear()`) and `--out` in CSS.

- Tab switches are synchronous; the new tab's sections enter in a cascade (45ms)
  from the direction of travel (`usePageEnter`).
- Rail tile, segmented pills, preset/provider rings and the popup's preset pill
  slide with a shared layout.
- Home numbers count up, bars grow in a cascade, the sparkline draws itself.
- Popup: opens at .965 scale with a cascade; the result card grows to its text and
  the text reveals top-down; actions cascade in; Apply shrinks the popup away;
  errors shake once. Copy/Copied swaps like a ticker (`ui/Swap.tsx`).
- Loader: the brackets open, the I reads a gray line left to right, the brackets
  close (2.4s loop).
- `MotionConfig reducedMotion="user"` and `prefers-reduced-motion` turn all of it
  into direct changes (no delays, static logo).
