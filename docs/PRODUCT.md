# Product

## Register

product

## Users

People who write prompts for AI tools all day: developers, designers and writers,
in English or Portuguese. They are mid-task in another app (editor, browser, chat)
when they select text and press Ctrl+C twice. They open the Preferences window only
briefly: to connect a provider, check this month's spend, tweak a preset or change
the shortcut. The popup appears over whatever they were doing and must be dismissed
in seconds.

## Product Purpose

Imprompt rewrites selected text into a clearer, stronger prompt in place, through
the user's own LLM API. Success is invisible: the gesture works, the result lands
where the cursor was, and the settings window answers "is it working, what does it
cost, what will it do" at a glance.

## Brand Personality

Precise, calm, tactile. The brand mark is a text cursor between brackets, `[I]`,
and its square geometry shapes the interface: soft, raised cards and sunken wells
with rounded but rectangular corners. A geometric sans speaks for the interface;
monospaced type marks what the machine identifies (keys, model IDs, URLs, the
user's text and the result). Black ink on a light gray canvas, or the inverse at
night. Color is a signal, never decoration: mint means connected / safe, amber
means your text leaves the machine.

## Anti-references

- Colored accents for their own sake (the soft UI reference used orange; Imprompt
  uses its ink).
- Glassmorphism, glow buttons, gradient text.
- Chat-app chrome beyond the one "Last imprompt" panel: avatars, typing bubbles,
  sparkle icons for "AI".
- Pills and circles that fight the square `[I]` mark.
- Settings pages where every row looks the same and nothing says what matters.

## Design Principles

1. **Get out of the way.** The popup and loader live on top of someone else's work:
   small, fast, keyboard-first, gone on Esc.
2. **Show state, not decoration.** Connection health, where text is sent, what a
   refinement costs and what the shortcut will do are always one glance away.
3. **One vocabulary everywhere.** The same switch for every on/off, the same chip
   for every preset, the same button hierarchy on every screen.
4. **Sans is the interface, mono is the data.** Type tells the user what the
   machine will use verbatim.
5. **Motion explains state.** Things slide to where the choice is, grow to fit
   what arrived and leave the way they will go; nothing moves just to move, and
   reduced motion turns it all into direct changes.
6. **Follow the system by default.** Light or dark comes from the OS unless the
   user picks one, and every window (popup and loader included) follows it.

## Accessibility & Inclusion

- WCAG 2.2 AA contrast for all text, in both themes (tertiary text included).
- Full keyboard operation: visible focus rings, popup focus trap, shortcuts 1–9,
  Enter and Esc.
- `prefers-reduced-motion` disables all non-essential animation (and its delays).
- Bilingual UI (EN / pt-BR); layouts must absorb Portuguese strings ~30% longer.
