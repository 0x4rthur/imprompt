# Design

The visual system behind the Preferences window, the popup and the loader. Tokens
live in `src/styles.css` (`:root`, overridden under `prefers-color-scheme: dark`);
`loader.html` repeats the few it needs inline. See [PRODUCT.md](PRODUCT.md) for
who this serves and why.

## Theme

"Mono / Cream" by day, "Mono / Ink" by night, chosen by the OS. Near-white page
with black ink, or the inverse. Neutrals are tinted slightly cool (OKLCH hue 286).
Color strategy: **restrained**. Neutrals carry the interface; color only signals
state.

| Role | Light | Dark | Use |
|---|---|---|---|
| `--bg` | `oklch(.992 .002 286)` | `oklch(.185 .005 286)` | Page |
| `--bg-rail` | `.975` | `.162` | Rail, popup footer (second neutral layer) |
| `--surface-soft` | `.975` | `.215` | Inputs, quiet blocks |
| `--ink` | `oklch(.21 .006 286)` | `oklch(.955 .003 286)` | Text, primary fills, selection |
| `--body` / `--dim` / `--stone` / `--faint` | .37 / .44 / .50 / .54 | .87 / .79 / .72 / .66 | Text ramp; every step ≥ 4.5:1 |
| `--ghost` | `.76` | `.44` | Decoration only (title brackets) |
| `--mint*` | | | Connected, safe, success |
| `--amber*` | | | Text leaves the machine, attention |
| `--danger*` | | | Errors, destructive actions |

Presets get a hue (`--pc-h`, from `presetColor.ts`) used only as an 8px dot or a
tinted timeline tag; the tag's lightness comes from `--tag-*` so it reads in both
themes.

## Typography

- **JetBrains Mono** (`--mono`) is the voice: page and section titles, labels,
  buttons, values, model IDs, shortcuts, and the user's own text.
- **System sans** (`--sans`, Segoe UI on Windows) is the explanation: help text,
  descriptions, empty states, error messages.
- Scale: page title 20/600 · section title 13.5/600 · body 13 · meta 11–12.
- Section titles are wrapped in brackets, `[ Title ]`, echoing the `[I]` mark. The
  brackets use `content: "[" / ""` so screen readers skip them.

## Layout

- Preferences: full-height rail (212px) + content column (max 720px). The custom
  title bar sits over the content only; the rail's brand row is also a drag region.
- Each page opens with `h1` + one-line description, then sections separated by
  hairlines (`.field`), not boxed in cards.
- The API page keeps its primary action in a sticky bar at the bottom of the scroll
  area (`.apply-bar`).
- Popup (496×430, fixed): drag header, scrollable body (captured text → presets →
  result), fixed footer with the output note and actions.

## Components

- **Buttons** (`.btn-dl`): neutral outline; `.primary` ink fill; `.danger` red
  outline. Popup uses `.refine`/`.replace` (primary) and `.copy`/`.redo` (neutral).
- **Segmented control** (`.seg`): exclusive choice in a track; active segment in ink.
- **Switch** (`input.switch` inside `label.switch-row`): every on/off setting.
  Native checkbox, so semantics and tests stay `checkbox`.
- **Chips** (`.chip`): neutral with a hue dot; active is ink-filled. Popup chips
  add the 1–9 shortcut number.
- **Inputs / dropdown**: soft surface, ink border + 3px focus ring on focus;
  read-only fields are dashed and transparent.
- **Callouts**: `.privacy.warn` (amber) where the provider is chosen; `.callout`
  on Home when the API is not connected; `.banner` for global notices.

## Motion

150–250ms, ease-out curves only (`--ease-out`, `--ease-out-expo`), no bounce.
Motion marks state: page entry fade, accordion open, switch/segment change,
skeleton while refining. Nav icons get a small hover gesture. Everything collapses
under `prefers-reduced-motion`.
