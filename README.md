# Imprompt

**Refine any prompt in place — fast, API-powered, without leaving your window.**

Select text in any app, hit **Ctrl+C twice**, and Imprompt rewrites it into a clearer,
stronger prompt right where you are — replacing the selection or leaving it on your
clipboard. Refinement runs on an **OpenAI-format LLM API** (OpenAI, OpenRouter, DeepSeek,
Gemini, and compatibles): you pick the provider and model.

Imprompt is a small, fast desktop app built with **Tauri 2** (Rust + React). The interface
is bilingual — **English / Português**.

---

## How it works

```
  Select text  →  Ctrl+C (copy)  →  Ctrl+C again (within ~400 ms)
                                           │
                                           ▼
                       ┌──────────────────────────────────────────┐
                       │  Imprompt (running in the system tray)     │
                       │    1. reads the selected text              │
                       │    2. shows a tiny "Imprompting…" badge     │
                       │    3. refines it with the chosen preset    │
                       │       (a call to your LLM provider)        │
                       │    4. replaces the selection OR copies it  │
                       └──────────────────────────────────────────┘
```

**Two modes** (configurable in the *Shortcut* tab):

- **Instant (default)** — uses your default preset immediately, no popup. Fastest.
- **Popup** — opens a small window to pick the preset on each trigger.

The result can **replace the selected text** automatically or go to the **clipboard**
(paste it wherever you want).

---

## Features

- **In-place refinement** via Ctrl+C×2 — works in any app and doesn't break a normal copy
  (the first Ctrl+C is the real copy; the second, quick one triggers Imprompt).
- **Presets** — each is just a system prompt. Built-ins: *Structure*, *Code prompt*,
  *Fix & clarify*, *Translate to English*, *Front-end*. Create, edit, duplicate, or restore your own.
- **Any OpenAI-compatible provider** — just set the Base URL and the model.
- **API key in the OS credential vault** — Windows Credential Manager / macOS Keychain /
  Linux Secret Service — never stored in plain text on disk.
- **Bilingual UI** — English (default) and Português, switchable in the *General* tab.
- **System tray** — runs in the background: open the app, undo the last imprompt, check for
  updates, quit.
- Monthly **usage/cost counter**, session **history with undo**, optional **auto-start**, and
  **signed auto-updates**.

---

## Install

Download the installer from the [Releases](https://github.com/0x4rthur/imprompt/releases) page
(when available), or **build from source** (below). Windows is the primary target today;
macOS and Linux build from the same source.

---

## Build from source

Prerequisites: [Rust](https://rustup.rs), [Node.js](https://nodejs.org), and the
[Tauri 2 system dependencies](https://tauri.app/start/prerequisites/). No C/C++ toolchain or
GPU stack is needed — the app doesn't compile any native model.

```bash
git clone https://github.com/0x4rthur/imprompt.git
cd imprompt
npm install

# run in dev (opens Preferences, hot-reloads the frontend)
npm run tauri dev

# build the installable app
npm run tauri build
```

---

## Usage

1. Open **Preferences** (from the tray, or on first launch) → the **API** tab.
2. Set the **Base URL** (e.g. `https://api.openai.com/v1`), the **model** (e.g. `gpt-4o-mini`),
   and your **API key**, then click **Apply & test**.
3. Pick a default preset, or switch the trigger to **Popup** mode in the **Shortcut** tab.
4. In any app: select text → **Ctrl+C, Ctrl+C** → your refined prompt replaces the selection
   (or lands on the clipboard).

It costs a few cents per refine on small models, and the app tracks your monthly usage.

> **Privacy:** the text you select is sent to the API provider you configure. The UI states
> this explicitly. Your API key stays in the OS credential vault, never in plain text.

---

## Why API-only (and not a bundled local model)?

An earlier design embedded a local model (llama.cpp). In testing, a model small enough to run
on a user's machine fell short on quality and latency, and bloated the app (multi-GB weights,
heavy native build, GPU/CUDA). A hosted API delivers much better quality and speed for a few
cents per refine — the conscious trade-off being that the selected text leaves the machine.

---

## Contributing

Issues and PRs are welcome. Before opening a PR, run the project's checks:

```bash
# backend (Rust)
cd src-tauri
cargo fmt --all --check
cargo clippy --all-targets -- -D warnings
cargo test

# frontend (from the repo root)
npm run typecheck
npm run test        # i18n catalog parity
npm run build
```

The core logic lives in `src-tauri/src/`: `api_engine.rs` (the engine), `presets.rs` (the
prompts + system-prompt assembly), `hotkey.rs` (the Ctrl+C×2 detector), and `lib.rs` (the
trigger → deliver flow). The frontend is in `src/` (React + a small custom i18n in `src/i18n/`).

---

## Support

Imprompt is free and open-source. If it helps you, you can
[support the project](https://donate.stripe.com/4gM7sK4Tz23E0JAbUl93y00) ♥

---

## License

[MIT](LICENSE) © 0x4rthur

---

*Architecture inspired by [Handy](https://github.com/cjpais/Handy), the open-source
transcription app — thanks to [@cjpais](https://github.com/cjpais).*
