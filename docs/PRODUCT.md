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

Precise, quiet, tool-like. The brand mark is a text cursor between brackets, `[I]`,
and the interface speaks the same language: monospaced type for everything the
machine identifies (labels, values, keys, model IDs, the user's text), a plain sans
for explanations. Black ink on a near-white page, or the inverse at night. Color
is a signal, never decoration: mint means connected / safe, amber means your text
leaves the machine.

## Anti-references

- SaaS dashboards with hero metrics, gradient accents and identical card grids.
- Glassmorphism, glow buttons, gradient text (all removed in earlier revisions).
- Chat-app chrome: bubbles, avatars, sparkle icons for "AI".
- Settings pages where every row looks the same and nothing says what matters.

## Design Principles

1. **Get out of the way.** The popup and loader live on top of someone else's work:
   small, fast, keyboard-first, gone on Esc.
2. **Show state, not decoration.** Connection health, where text is sent, what a
   refinement costs and what the shortcut will do are always one glance away.
3. **One vocabulary everywhere.** The same switch for every on/off, the same chip
   for every preset, the same button hierarchy on every screen.
4. **Mono is the voice, sans is the explanation.** Type tells the user what is data
   and what is guidance.
5. **Follow the system.** Light or dark comes from the OS so the popup never
   flashes the wrong theme over the user's app.

## Accessibility & Inclusion

- WCAG 2.2 AA contrast for all text, in both themes (tertiary text included).
- Full keyboard operation: visible focus rings, popup focus trap, shortcuts 1–9,
  Enter and Esc.
- `prefers-reduced-motion` disables all non-essential animation.
- Bilingual UI (EN / pt-BR); layouts must absorb Portuguese strings ~30% longer.
