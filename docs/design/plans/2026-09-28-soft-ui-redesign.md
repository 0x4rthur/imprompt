# Soft UI Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reestilizar o Imprompt inteiro (Preferências, popup, loader) na linguagem "soft UI" aprovada, com movimento fluido, sem mudar nenhum comportamento.

**Architecture:** O sistema visual vive em `src/styles.css` (tokens claro/escuro + componentes + telas). O movimento usa `motion/react` através de um módulo único (`src/motion.ts`: molas, entrada em cascata, contagem). Peças reutilizáveis novas: `Segmented` e ícones. O popup vira um componente testável (`src/Palette.tsx`). Um modo `vite --mode mock` troca os módulos do Tauri por mocks para a verificação visual no navegador.

**Tech Stack:** React 18 + TypeScript + Vite 5, Tauri 2 (Rust), Vitest + Testing Library (jsdom), `motion` 13, `@fontsource/plus-jakarta-sans` 5.

**Spec:** `docs/design/specs/2026-09-28-soft-ui-redesign.md`
**Mockups aprovados (referência visual e de CSS):** `docs/design/mockups/2026-09-28-soft-ui/{preferences,popup,loader}.html`

## Global Constraints

- Cores: só a paleta do Imprompt (neutros matiz 286, tinta, mint/âmbar/vermelho, matiz de preset). Nenhum laranja. Nenhuma cor literal fora dos tokens (exceto logos de provedores).
- Arredondamento: card 12px · tile 10px · controle 8px · chip 7px · tecla 5px; menu 18px. Nada de pílula/círculo, exceto pontos de status.
- Fontes: `--sans` = Plus Jakarta Sans 400/500/600/700 (latin + latin-ext); `--mono` = JetBrains Mono só para dados.
- Movimento: `motion/react` via `src/motion.ts`; `MotionConfig reducedMotion="user"`; CSS respeita `prefers-reduced-motion`. Sem esperar animação para mudar estado (troca de aba e ações são síncronas).
- Não mudar: comandos Tauri, formato de settings, fluxos, atalhos do popup, textos existentes e nomes acessíveis usados pelos testes ("Settings", "API", "Apply and test", "Prioritize speed", "Connected", "Model", "Custom", "API key", "Base URL", "API format", "Model id", "Check for updates", "Download and restart", "Testing…"), `data-testid="model-cost-note"`, MotorTab montada escondida.
- i18n: toda chave nova existe em `en` e `pt-BR` (o teste de paridade falha se não).
- Textos visíveis sem travessão (—) nas strings novas.
- Janelas: Preferências 920×720 (limites atuais), popup 496×430 (limites atuais), loader 224×46.

## Review Focus

1. **Textos longos** (pt-BR ~30% maior, nomes de preset/modelo compridos, texto capturado enorme): nada pode estourar a largura; rótulos do menu quebram/abreviam limpo, blocos usam reticências, chips quebram linha. Teste: Início com preset de nome longo e modelo longo renderiza com `title` completo (Task 5).
2. **Muitos presets** (custom > 6, > 9): grade de blocos e trilho de chips quebram em várias linhas; a peça deslizante acompanha; só os 9 primeiros têm número/atalho. Teste: Palette com 11 presets mostra números 1–9 e a tecla 9 escolhe o 9º (Task 10).
3. **Dados vazios** (sem histórico, sem meses de uso, zero tokens, custo 0): cards mostram estado vazio, nunca `NaN`/`Infinity`, linha do card escuro só com ≥ 2 meses. Teste: Início sem dados (Task 5).
4. **Interação rápida / movimento reduzido**: trocar de aba várias vezes seguidas, apertar 1–9 rápido, Enter segurado: nenhum elemento fica preso transparente; estado final sempre visível. Teste: `usePageEnter` conclui (não interrompe) animação anterior e não anima em ambiente sem `matchMedia` (Task 2); troca de aba síncrona coberta pelos testes do App.
5. **Tema ao vivo e contraste**: Sistema/Claro/Escuro trocam sem recarregar em todas as janelas, inclusive loader; nenhum token faltando no escuro. Verificação: checklist visual em `dev:mock` nos dois temas (Task 12) + teste de que todo token de `:root` existe em `[data-theme="dark"]` (Task 2).

---

## File Structure

**Criar**
- `src/motion.ts` — molas, `reducedMotion()`, `usePageEnter(ref, key, dir)`, `useCountUp(value)`.
- `src/motion.test.ts` — testes do módulo de movimento.
- `src/ui/Segmented.tsx` + `src/ui/Segmented.test.tsx` — seletor com peça deslizante.
- `src/ui/icons.tsx` — ícones de linha compartilhados (seta, chevron, check, cadeado, teclado, saída, tema, coração, [I]).
- `src/tabs/InicioTab.test.tsx` — Início (estado, último imprompt, vazio, seletor).
- `src/Palette.tsx` — componente do popup (antes dentro de `popup.tsx`).
- `src/Palette.test.tsx` — fluxo do popup por teclado.
- `src/styles.tokens.test.ts` — paridade de tokens claro/escuro.
- `src/dev/tauri-mock/{core,event,window,app,autostart}.ts` — mocks para `vite --mode mock`.
- `docs/design/mockups/2026-09-28-soft-ui/*.html` — mockups aprovados.

**Modificar**
- `package.json` (deps + script `dev:mock`), `vite.config.ts` (aliases no modo mock), `vitest.config.ts` (nada; ambiente por arquivo).
- `src/fonts.ts`, `src/styles.css` (reescrito), `src/App.tsx`, `src/ConnectionStatus.tsx`, `src/tabs/*.tsx`, `src/ModelBenchmark.tsx`, `src/UpdateStatus.tsx`, `src/popup.tsx`, `src/i18n/catalog.ts`, `loader.html`, `src-tauri/src/lib.rs` (loader 224).
- `docs/DESIGN.md`, `docs/PRODUCT.md`.

---

### Task 1: Dependências, mockups e modo mock

**Files:**
- Modify: `package.json`, `vite.config.ts`
- Create: `src/dev/tauri-mock/core.ts`, `event.ts`, `window.ts`, `app.ts`, `autostart.ts`
- Create: `docs/design/mockups/2026-09-28-soft-ui/*.html`

**Interfaces:**
- Produces: `npm run dev:mock` serve `index.html`, `popup.html`, `loader.html` com dados de exemplo; query `?empty=1` (sem histórico/uso), `?err=1` (conexão falha), `?lang=en` (locale inglês).

- [ ] **Step 1: Instalar deps**

Run: `npm install motion@^13.4.4 @fontsource/plus-jakarta-sans@^5.3.0`

- [ ] **Step 2: Script e aliases do modo mock**

`package.json` → `"dev:mock": "vite --mode mock"`.

`vite.config.ts`:
```ts
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";

// Multi-página: a janela principal (Preferências), o loader e o popup.
// `vite --mode mock` troca os módulos do Tauri por mocks (src/dev/tauri-mock)
// pra ver as janelas no navegador com dados de exemplo. Não afeta o build.
const mock = (f: string) => fileURLToPath(new URL(`./src/dev/tauri-mock/${f}.ts`, import.meta.url));

export default defineConfig(({ mode }) => ({
  plugins: [react()],
  clearScreen: false,
  server: { port: 5173, strictPort: true },
  resolve: mode === "mock" ? {
    alias: {
      "@tauri-apps/api/core": mock("core"),
      "@tauri-apps/api/event": mock("event"),
      "@tauri-apps/api/window": mock("window"),
      "@tauri-apps/api/app": mock("app"),
      "@tauri-apps/plugin-autostart": mock("autostart"),
    },
  } : undefined,
  build: { rollupOptions: { input: { main: "index.html", loader: "loader.html", popup: "popup.html" } } },
}));
```

- [ ] **Step 3: Mocks**

`src/dev/tauri-mock/core.ts` implementa `invoke<T>(cmd, args?)` com estado em memória (settings em `localStorage["mock.settings"]`), presets padrão (6, rótulos pt-BR/en), histórico (3 itens), uso (132 imprompts, US$ 0,42), 6 meses, status da chave salvo, `test_api_connection` (600 ms; rejeita com `?err=1`), `apply_api_configuration` (900 ms, devolve settings), `refine_text` (1200 ms), `get_captured_text`, `deliver_result`, `check_for_updates` (800 ms → `null`), CRUD de presets, `restore_default_presets`. `event.ts`: `listen` → `Promise<() => void>`. `window.ts`: `getCurrentWindow()` com `minimize/close/hide/show/setFocus/onFocusChanged` no-op. `app.ts`: `getVersion()` → `"0.1.7"`. `autostart.ts`: `enable/disable/isEnabled` em memória.

- [ ] **Step 4: Verificar**

Run: `npm run typecheck` → sem erros. Run: `npm run dev:mock` e abrir `http://localhost:5173/` e `/popup.html` → telas atuais aparecem com dados.

- [ ] **Step 5: Commit** — `git add package.json package-lock.json vite.config.ts src/dev docs/design/mockups && git commit -m "Add motion, Plus Jakarta Sans and a mock mode for visual checks"`

---

### Task 2: Tokens, base e módulo de movimento

**Files:**
- Modify: `src/fonts.ts`, `src/styles.css` (bloco de tokens, base, controles)
- Create: `src/motion.ts`, `src/motion.test.ts`, `src/styles.tokens.test.ts`

**Interfaces:**
- Produces:
  - `spring.snappy | spring.soft | spring.pop` (objetos `Transition` do Motion), `ease.out`, `ease.in`.
  - `reducedMotion(): boolean` — `true` se `prefers-reduced-motion` ou sem `matchMedia` (testes).
  - `usePageEnter(ref: RefObject<HTMLElement | null>, key: unknown, dir: 1 | -1): void` — anima `[data-enter]` visíveis de `ref` quando `key` muda; cleanup chama `complete()`.
  - `useCountUp(value: number): number` — conta do último valor mostrado até `value`; imediato com movimento reduzido.
  - Classes CSS de base: `.btn-dl`, `.btn-dl.primary`, `.btn-dl.danger`, `.btn-ghost`, `.seg`, `.seg-pill`, `.switch-row`, `.switch`, `.field-card` (card), `.card-title`, `.help`, inputs `.in`, `.dd*`, `kbd`, `.tag`, `.banner`, `.callout`.

- [ ] **Step 1: Teste dos tokens**

```ts
// styles.tokens.test.ts
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const css = readFileSync(new URL("./styles.css", import.meta.url), "utf8");
function block(selector: string): string[] {
  const start = css.indexOf(selector + "{");
  const body = css.slice(start + selector.length + 1, css.indexOf("\n}", start));
  return [...body.matchAll(/(--[a-z0-9-]+)\s*:/g)].map((m) => m[1]);
}

describe("tokens de tema", () => {
  it("todo token de cor do claro existe no escuro", () => {
    const light = new Set(block(":root"));
    const dark = new Set(block(':root[data-theme="dark"]'));
    const themeOnly = ["--sans", "--mono", "--r-card", "--r-tile", "--r-ctl", "--r-chip", "--r-kbd", "--r-rail", "--spring", "--out", "--ease-out", "--ease-out-expo", "--pill"];
    const missing = [...light].filter((t) => !themeOnly.includes(t) && !dark.has(t));
    expect(missing).toEqual([]);
  });
});
```

- [ ] **Step 2: Teste do movimento**

```ts
// motion.test.ts
// @vitest-environment jsdom
import { renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { reducedMotion, useCountUp } from "./motion";

describe("motion", () => {
  it("sem matchMedia (testes) conta como movimento reduzido", () => {
    expect(reducedMotion()).toBe(true);
  });
  it("useCountUp mostra o valor final na hora quando o movimento é reduzido", () => {
    const { result, rerender } = renderHook(({ v }) => useCountUp(v), { initialProps: { v: 132 } });
    expect(result.current).toBe(132);
    rerender({ v: 140 });
    expect(result.current).toBe(140);
  });
});
```

- [ ] **Step 3: Rodar e ver falhar** — `npx vitest run src/motion.test.ts src/styles.tokens.test.ts` → FAIL (módulo inexistente / tokens).

- [ ] **Step 4: `src/motion.ts`**

```ts
// motion.ts — vocabulário de movimento do Imprompt num lugar só.
import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from "react";
import { animate, stagger, type Transition } from "motion/react";

export const spring = {
  snappy: { type: "spring", stiffness: 520, damping: 40, mass: 0.9 } as Transition,
  soft: { type: "spring", stiffness: 260, damping: 28 } as Transition,
  pop: { type: "spring", stiffness: 600, damping: 22 } as Transition,
};
export const ease = { out: [0.16, 1, 0.3, 1] as const, in: [0.4, 0, 1, 1] as const };

export function reducedMotion(): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return true;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export function usePageEnter(ref: RefObject<HTMLElement | null>, key: unknown, dir: 1 | -1): void {
  useLayoutEffect(() => {
    const root = ref.current;
    if (!root || reducedMotion()) return;
    const els = Array.from(root.querySelectorAll<HTMLElement>("[data-enter]")).filter((el) => el.getClientRects().length > 0);
    if (!els.length) return;
    const controls = animate(els, { opacity: [0, 1], y: [16 * dir, 0] }, { ...spring.soft, delay: stagger(0.045) });
    return () => controls.complete();
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps
}

export function useCountUp(value: number): number {
  const [shown, setShown] = useState(() => (reducedMotion() ? value : 0));
  const last = useRef(shown);
  useEffect(() => {
    if (reducedMotion()) { last.current = value; setShown(value); return; }
    const controls = animate(last.current, value, { duration: 0.9, ease: ease.out, onUpdate: (v) => { last.current = v; setShown(v); } });
    return () => controls.stop();
  }, [value]);
  return shown;
}
```

- [ ] **Step 5: Fontes** — `src/fonts.ts` importa `@fontsource/plus-jakarta-sans/latin-{400,500,600,700}.css` e `latin-ext-{400,500,600,700}.css` (além da JetBrains Mono).

- [ ] **Step 6: Tokens e base em `styles.css`** — substituir o bloco `:root` / `:root[data-theme="dark"]` e a seção "Base/Controles" pelos tokens da spec (tabela "Superfícies e sombras") e pelos estilos de controle do mockup `preferences.html` (seções "Botões", "Segmentado", "Switch retangular", "Campos", "Teclas"), com os nomes de classe reais listados em Interfaces. `--faint`/`--stone` do claro: `.52`/`.49`.

- [ ] **Step 7: Rodar testes** — `npx vitest run` → PASS (inclusive os antigos).

- [ ] **Step 8: Commit** — `git commit -m "Soft UI tokens, fonts and the motion module"`

---

### Task 3: Seletor segmentado

**Files:**
- Create: `src/ui/Segmented.tsx`, `src/ui/Segmented.test.tsx`, `src/ui/icons.tsx`
- Modify: `src/tabs/GatilhoTab.tsx`, `src/tabs/GeralTab.tsx`

**Interfaces:**
- Produces: `Segmented<T extends string>({ options: { value: T; label: string }[]; value: T; onChange(v: T): void; ariaLabel: string; className?: string })` → `div.seg[role=group]` com `button[aria-pressed]` e `.seg-pill` (layoutId) no ativo.

- [ ] **Step 1: Teste**

```tsx
// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import Segmented from "./Segmented";

it("marca a opção escolhida e avisa a troca", () => {
  const onChange = vi.fn();
  render(<Segmented ariaLabel="Mode" value="a" onChange={onChange}
    options={[{ value: "a", label: "Instant" }, { value: "b", label: "Popup" }]} />);
  expect(screen.getByRole("group", { name: "Mode" })).toBeTruthy();
  expect(screen.getByRole("button", { name: "Instant" }).getAttribute("aria-pressed")).toBe("true");
  expect(screen.getByRole("button", { name: "Popup" }).getAttribute("aria-pressed")).toBe("false");
  fireEvent.click(screen.getByRole("button", { name: "Popup" }));
  expect(onChange).toHaveBeenCalledWith("b");
});
```

- [ ] **Step 2: Falhar** — `npx vitest run src/ui/Segmented.test.tsx` → FAIL (módulo inexistente).

- [ ] **Step 3: Implementar**

```tsx
import { useId } from "react";
import { motion } from "motion/react";
import { spring } from "../motion";

export type SegOption<T extends string> = { value: T; label: string };

export default function Segmented<T extends string>({ options, value, onChange, ariaLabel, className }: {
  options: SegOption<T>[]; value: T; onChange: (v: T) => void; ariaLabel: string; className?: string;
}) {
  const id = useId();
  return (
    <div className={"seg" + (className ? " " + className : "")} role="group" aria-label={ariaLabel}>
      {options.map((o) => {
        const on = o.value === value;
        return (
          <button key={o.value} type="button" aria-pressed={on} className={on ? "active" : ""} onClick={() => onChange(o.value)}>
            {on && <motion.span className="seg-pill" layoutId={"seg-" + id} transition={spring.snappy} aria-hidden="true" />}
            <span className="seg-label">{o.label}</span>
          </button>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 4: Usar** em GatilhoTab (modo e saída) e GeralTab (idioma e tema).
- [ ] **Step 5: Passar** — `npx vitest run` → PASS.
- [ ] **Step 6: Commit** — `git commit -m "Segmented control with a sliding pill"`

---

### Task 4: Casca da janela (menu, barra de título, entrada das abas)

**Files:** Modify `src/App.tsx`, `src/ConnectionStatus.tsx`, `src/styles.css` (shell, menu, banners, cabeçalho).

**Interfaces:**
- Consumes: `spring`, `usePageEnter` (Task 2).
- Produces: `nav-item` com `.nav-ico` (bloco 42px), `.nav-pill` (layoutId `"nav-pill"`), `.nav-label`; `main-inner` com `[data-enter]`; `InicioTab` recebe `history`.

- [ ] **Step 1: Teste** (em `App.connection.test.tsx`, novo `it`):

```tsx
it("marks the current tab in the rail and switches synchronously", async () => {
  await openApp();
  const api = screen.getByRole("button", { name: "API" });
  expect(api.getAttribute("aria-current")).toBe("page");
  fireEvent.click(screen.getByRole("button", { name: "Settings" }));
  expect(screen.getByRole("button", { name: "Settings" }).getAttribute("aria-current")).toBe("page");
  expect(screen.getByRole("button", { name: "Check for updates" })).toBeTruthy();
});
```

- [ ] **Step 2: Implementar** o menu grafite (marca, itens com bloco de ícone e rótulo embaixo, pílula deslizante só no ativo, rodapé com Configurações e `ConnectionStatus` no mesmo formato + ponto de status com pulso), barra de título (controles 30×26), `MotionConfig reducedMotion="user"` na raiz, `usePageEnter(mainInnerRef, tab, dir)` com `dir` calculado pela ordem de `TABS`, `data-enter` nos banners/cabeçalho, cabeçalho genérico escondido no Início, carregamento com o logo animado.
- [ ] **Step 3: Passar** — `npx vitest run` → PASS.
- [ ] **Step 4: Conferir** em `dev:mock` (claro/escuro): menu, troca de aba, pílula deslizando.
- [ ] **Step 5: Commit** — `git commit -m "Floating graphite rail with a sliding active tile and staggered tab entrances"`

---

### Task 5: Início

**Files:** Modify `src/tabs/InicioTab.tsx`, `src/i18n/catalog.ts`, `src/styles.css`; Create `src/tabs/InicioTab.test.tsx`.

**Interfaces:**
- Consumes: `useCountUp`, `Segmented`, ícones.
- Produces: props `{ settings, usage, usageHistory, presets, history: RefineRecord[], onNavigate }`.
- Chaves novas (en / pt-BR): `inicio.hero.ready` All set. / Tudo pronto. · `inicio.hero.checking` One moment… / Um instante… · `inicio.hero.setup` Connect your API. / Falta conectar a API. · `inicio.gesture.title` Select text in any app and press / Selecione um texto em qualquer app e aperte · `inicio.gesture.open` Shortcut settings / Configurar o atalho · `inicio.gesture.replace` replaces the text / substitui o texto · `inicio.gesture.copy` copies to the clipboard / copia para a área de transferência · `inicio.tile.api` API / API · `inicio.tile.preset` Preset / Preset · `inicio.tile.output` Output / Saída · `inicio.tile.theme` Theme / Tema · `inicio.tile.replace` Replaces / Substitui · `inicio.tile.copy` Copies / Copia · `inicio.last.title` Last imprompt / Último imprompt · `inicio.last.more` View in History / Ver no Histórico · `inicio.last.empty` Nothing in this session yet. Select text in any app and press {mod} + {key} ×2. / Nada nesta sessão ainda. Selecione um texto em qualquer app e aperte {mod} + {key} ×2. · `inicio.metric` Metric / Métrica · `inicio.metric.cost` Cost / Custo · `inicio.metric.count` Imprompts / Imprompts · `inicio.count.month` Imprompts by month / Imprompts por mês · `inicio.tokens.total` Tokens this month / Tokens no mês · `inicio.count.each` ~US$ {cost} each / ~US$ {cost} cada · `inicio.count.none` No imprompts yet / Nenhum imprompt ainda.

- [ ] **Step 1: Testes**

```tsx
// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import InicioTab from "./InicioTab";
import type { Settings } from "../types";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn(() => Promise.reject("no")) }));

const settings: Settings = { default_preset: "estruturar", mode: "instant", output: "replace", autostart: false,
  api_base_url: "https://api.openai.com/v1", api_model: "gpt-5.6-luna", api_format: "auto", api_custom: false,
  use_examples: true, trigger_modifier: "ctrl", trigger_key: "c", debounce_ms: 400, locale: "en", theme: "system" };
const presets = [{ id: "estruturar", label: "Structure", instruction: "", example_input: "", example_output: "", builtin: true, edited: false }];

describe("Home", () => {
  beforeEach(() => localStorage.clear());
  it("shows the last imprompt and jumps to History", () => {
    const onNavigate = vi.fn();
    render(<InicioTab settings={settings} usage={{ month: "2026-09", refinements: 3, cost_usd: 0.0123, approximate: true }}
      usageHistory={[{ month: "2026-08", refinements: 5, cost_usd: 0.02, prompt_tokens: 900, completion_tokens: 100, approximate: true },
        { month: "2026-09", refinements: 3, cost_usd: 0.0123, prompt_tokens: 3000, completion_tokens: 1000, approximate: true }]}
      presets={presets} history={[{ original: "fix my email", result: "Task: rewrite the email", preset: "estruturar", timestamp: Date.now() - 120000 }]}
      onNavigate={onNavigate} />);
    expect(screen.getByText("fix my email")).toBeTruthy();
    expect(screen.getByText("Task: rewrite the email")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "View in History" }));
    expect(onNavigate).toHaveBeenCalledWith("historico");
  });
  it("switches the monthly chart between cost and imprompts", () => {
    render(<InicioTab settings={settings} usage={{ month: "2026-09", refinements: 3, cost_usd: 0.0123, approximate: true }}
      usageHistory={[{ month: "2026-09", refinements: 3, cost_usd: 0.0123, prompt_tokens: 3000, completion_tokens: 1000, approximate: true }]}
      presets={presets} history={[]} onNavigate={() => {}} />);
    expect(screen.getByText("Spending by month")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Imprompts" }));
    expect(screen.getByText("Imprompts by month")).toBeTruthy();
  });
  it("renders empty data without NaN", () => {
    const { container } = render(<InicioTab settings={settings} usage={null} usageHistory={[]} presets={[]} history={[]} onNavigate={() => {}} />);
    expect(container.textContent).not.toMatch(/NaN|Infinity/);
    expect(screen.getByText(/Nothing in this session yet/)).toBeTruthy();
  });
});
```

- [ ] **Step 2: Falhar** — `npx vitest run src/tabs/InicioTab.test.tsx` → FAIL.
- [ ] **Step 3: Implementar** o layout da spec ("Início"): grade `top` com as duas colunas de mesma altura (`align-items: stretch`; coluna esquerda flex com o card do gesto `flex: 1`), título de estado com troca animada, card do gesto (ou chamado de configuração quando `health === "error"`), 4 blocos-botão, painel do último imprompt (`history[0]`, tempo com `Intl.RelativeTimeFormat(locale, { numeric: "auto", style: "short" })`), "Este mês" com `Segmented` Custo/Imprompts, card de tokens só com dados, barras (motion `height` 0→% com cascata), card escuro com contagem (`useCountUp`) e linha (`pathLength`) quando houver ≥ 2 meses. Valores longos com `title`. App passa `history`.
- [ ] **Step 4: Passar** — `npx vitest run` → PASS.
- [ ] **Step 5: Commit** — `git commit -m "Home: status headline, gesture card, tiles, last imprompt and monthly cards"`

---

### Task 6: Histórico

**Files:** Modify `src/tabs/HistoricoTab.tsx`, `src/styles.css`; Test em `src/tabs/HistoricoTab.test.tsx`.

- [ ] **Step 1: Teste**

```tsx
// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { expect, it } from "vitest";
import HistoricoTab from "./HistoricoTab";

it("expands an entry and exposes the full texts", () => {
  render(<HistoricoTab presets={[]} history={[{ original: "orig text", result: "result text", preset: "estruturar", timestamp: Date.now() }]} />);
  const head = screen.getByRole("button", { expanded: false });
  fireEvent.click(head);
  expect(head.getAttribute("aria-expanded")).toBe("true");
  expect(screen.getByText("result text")).toBeTruthy();
  expect(screen.getByRole("button", { name: "Copy result" })).toBeTruthy();
});
```

- [ ] **Step 2: Implementar** cards por item (hora mono, etiqueta, prévia, chevron em quadrado), corpo com altura animada (CSS grid 0fr→1fr com `--out`), Original afundado / Resultado com contorno, botão de copiar com troca deslizante "Copiado ✓", vazio em card instrutivo; `data-enter` nos grupos.
- [ ] **Step 3: Passar e commitar** — `git commit -m "History as expandable cards"`

---

### Task 7: Presets

**Files:** Modify `src/tabs/PresetsTab.tsx`, `src/styles.css`; Test `src/tabs/PresetsTab.test.tsx`.

- [ ] **Step 1: Teste**

```tsx
// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import PresetsTab from "./PresetsTab";
import type { Settings } from "../types";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn(() => Promise.resolve(null)) }));
const settings = { default_preset: "a", use_examples: true } as Settings;
const presets = [
  { id: "a", label: "Structure", instruction: "x", example_input: "", example_output: "", builtin: true, edited: false },
  { id: "b", label: "Code prompt", instruction: "y", example_input: "", example_output: "", builtin: true, edited: true },
];

it("picks the default preset from the tiles", () => {
  const update = vi.fn(() => Promise.resolve());
  render(<PresetsTab settings={settings} update={update} presets={presets} loadPresets={() => {}} />);
  const group = screen.getByRole("group", { name: "Default preset" });
  fireEvent.click(group.querySelectorAll("button")[1]);
  expect(update).toHaveBeenCalledWith({ default_preset: "b" });
});
```

- [ ] **Step 2: Implementar** grade de blocos (`repeat(auto-fill, minmax(104px, 1fr))`) com anel deslizante (`layoutId="preset-ring"`), card de lista (linhas com selos, Editar/Duplicar/lixeira armada), formulário no acordeão dentro do card, ações do rodapé, card da chave few-shot.
- [ ] **Step 3: Passar e commitar** — `git commit -m "Presets: tiles with a sliding ring and a list card"`

---

### Task 8: API

**Files:** Modify `src/tabs/MotorTab.tsx`, `src/ModelBenchmark.tsx`, `src/styles.css`.

- [ ] **Step 1: Implementar** cards: Provedor (blocos 7 colunas com logo num quadrado elevado; anel `layoutId="provider-ring"`; `aria-label`/`aria-pressed` preservados), faixa de privacidade âmbar, formato (select afundado) e Base URL; Modelo (dropdown elevado, lista flutuante com itens em cascata, ficha afundada com eixos em mini-cards e barras de 3 segmentos, preços, detalhes); Chave (campo afundado, selo de cofre mint); Priorizar velocidade (card com chave); notas; barra de aplicar flutuante com o selo "Connected" surgindo com mola (`spring.pop`) e o erro.
- [ ] **Step 2: Passar** — `npx vitest run src/App.connection.test.tsx` → PASS (todos os cenários de API).
- [ ] **Step 3: Commit** — `git commit -m "API tab: provider tiles, model sheet and floating apply bar"`

---

### Task 9: Atalho e Configurações

**Files:** Modify `src/tabs/GatilhoTab.tsx`, `src/tabs/GeralTab.tsx`, `src/UpdateStatus.tsx`, `src/styles.css`.

- [ ] **Step 1: Implementar** Atalho (card do gravador em área afundada, teclas elevadas, cursor ao gravar, teclas "caem" ao gravar um atalho novo; slider com trilho afundado + preenchimento de tinta + knob quadrado; dois cards lado a lado com `Segmented`), Configurações (grade 2 colunas: atualizações com versão grande; início com o sistema + idioma; tema em linha; card escuro de apoio com botão claro).
- [ ] **Step 2: Passar** — `npx vitest run` → PASS (inclui "checks for a new version inside Settings").
- [ ] **Step 3: Commit** — `git commit -m "Shortcut and Settings tabs in cards"`

---

### Task 10: Popup

**Files:** Create `src/Palette.tsx`, `src/Palette.test.tsx`; Modify `src/popup.tsx` (só entrada), `src/styles.css` (seção POPUP).

**Interfaces:**
- Produces: `export default function Palette()` (mesmo comportamento do componente atual).

- [ ] **Step 1: Testes**

```tsx
// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { invoke } from "@tauri-apps/api/core";

const hide = vi.fn(() => Promise.resolve());
vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));
vi.mock("@tauri-apps/api/event", () => ({ listen: vi.fn(() => Promise.resolve(() => {})) }));
vi.mock("@tauri-apps/api/window", () => ({ getCurrentWindow: () => ({ hide, show: vi.fn(() => Promise.resolve()) }) }));
vi.mock("./autoscroll", () => ({ initAutoScrollbars: () => () => {} }));
import Palette from "./Palette";

const presets = Array.from({ length: 11 }, (_, i) => ({ id: "p" + i, label: "Preset " + i, instruction: "", example_input: "", example_output: "", builtin: true, edited: false }));

beforeEach(() => {
  hide.mockClear();
  vi.mocked(invoke).mockReset();
  vi.mocked(invoke).mockImplementation(async (cmd: string) => {
    switch (cmd) {
      case "list_presets": return presets;
      case "get_captured_text": return "make this better";
      case "get_settings": return { default_preset: "p0", output: "replace", api_model: "gpt-x", locale: "en", theme: "system" };
      case "refine_text": return "Better text";
      default: return null;
    }
  });
});
afterEach(cleanup);

it("Enter refines, then Enter applies the result", async () => {
  render(<Palette />);
  await screen.findByText("make this better");
  fireEvent.keyDown(window, { key: "Enter" });
  await screen.findByText("Better text");
  expect(invoke).toHaveBeenCalledWith("refine_text", { text: "make this better", presetId: "p0" });
  fireEvent.keyDown(window, { key: "Enter" });
  await waitFor(() => expect(invoke).toHaveBeenCalledWith("deliver_result", { text: "Better text" }));
  expect(hide).toHaveBeenCalled();
});

it("number keys pick presets and only the first nine get a number", async () => {
  render(<Palette />);
  await screen.findByText("Preset 10");
  fireEvent.keyDown(window, { key: "9" });
  expect(screen.getByRole("button", { name: /Preset 8/ }).getAttribute("aria-pressed")).toBe("true");
  expect(screen.queryByText("10")).toBeNull();
});

it("an error keeps Enter on retry instead of applying", async () => {
  vi.mocked(invoke).mockImplementation(async (cmd: string) => cmd === "refine_text" ? Promise.reject("Invalid key") :
    cmd === "list_presets" ? presets : cmd === "get_captured_text" ? "make this better" :
    cmd === "get_settings" ? { default_preset: "p0", output: "replace", api_model: "gpt-x", locale: "en", theme: "system" } : null);
  render(<Palette />);
  await screen.findByText("make this better");
  fireEvent.keyDown(window, { key: "Enter" });
  await screen.findByRole("alert");
  fireEvent.keyDown(window, { key: "Enter" });
  await waitFor(() => expect(vi.mocked(invoke).mock.calls.filter(([c]) => c === "refine_text")).toHaveLength(2));
  expect(vi.mocked(invoke).mock.calls.some(([c]) => c === "deliver_result")).toBe(false);
});

it("Esc hides the window", async () => {
  vi.useFakeTimers();
  render(<Palette />);
  fireEvent.keyDown(window, { key: "Escape" });
  await act(async () => { vi.advanceTimersByTime(400); });
  expect(hide).toHaveBeenCalled();
  vi.useRealTimers();
});
```

- [ ] **Step 2: Falhar** — `npx vitest run src/Palette.test.tsx` → FAIL (módulo inexistente).
- [ ] **Step 3: Implementar** mover o componente para `Palette.tsx` (export default), `popup.tsx` só monta `<MotionConfig reducedMotion="user"><Palette /></MotionConfig>`. Novo visual (spec "Popup") e movimento: entrada com escala + cascata (replay no `animSeq`), pílula dos presets (`layoutId="chip-pill"`), número pulando, card de resultado com `layout` + revelação (`clipPath`), esqueleto com brilho, ações com `AnimatePresence mode="popLayout"` em cascata, Copiar → "Copied ✓" (chave `popup.action.copied`), Aplicar com saída (190 ms) antes de `hide`, tremida no erro, Esc com fade. Tudo pulado em movimento reduzido.
- [ ] **Step 4: Passar** — `npx vitest run` → PASS.
- [ ] **Step 5: Commit** — `git commit -m "Popup in soft UI with animated states; Palette is now testable"`

---

### Task 11: Loader

**Files:** Modify `loader.html`, `src-tauri/src/lib.rs` (210→224 em `show_loader` e `position_loader`).

- [ ] **Step 1: Implementar** o SVG/CSS da variante A do mockup `loader.html` (colchetes abrem, linha cinza, "I" lê, fecha; 2,4 s), "Imprompting" + pontinhos, tokens claro/escuro, `prefers-reduced-motion` → logo parado.
- [ ] **Step 2: Verificar** — `cargo fmt --all --check`, `cargo clippy --all-targets -- -D warnings`, `cargo test` → PASS; `dev:mock` → `/loader.html` nos dois temas.
- [ ] **Step 3: Commit** — `git commit -m "Loader: bracket-opening logo animation"`

---

### Task 12: Documentação e verificação completa

- [ ] **Step 1:** Atualizar `docs/DESIGN.md` (tokens, tipografia, componentes, movimento, layout) e `docs/PRODUCT.md` (princípios e anti-referências coerentes com o soft UI).
- [ ] **Step 2:** `npm run typecheck && npm test && npm run build` → PASS; `cargo fmt/clippy/test` → PASS.
- [ ] **Step 3: Checklist visual em `dev:mock`** — para claro e escuro, `en` e `pt-BR`: Início (com dados, `?empty=1`, `?err=1`), Histórico (cheio/vazio), Presets (editar, novo, excluir armado), API (cada provedor, Personalizado, lista aberta, aplicar ok/erro), Atalho (gravando), Configurações, popup (inicial, carregando, resultado, erro, 11 presets, janela mínima 420×320), loader. Corrigir o que estiver errado.
- [ ] **Step 4: Commit** — `git commit -m "Docs for the soft UI design system"`

---

### Task 13: Revisão, versão e publicação

- [ ] **Step 1:** Revisão da branch inteira por um revisor novo; corrigir achados.
- [ ] **Step 2:** Versão 0.1.7 (`package.json`, `package-lock.json`, `src-tauri/Cargo.toml`, `src-tauri/Cargo.lock`, `src-tauri/tauri.conf.json`) + `docs/releases/v0.1.7.md`.
- [ ] **Step 3:** Push, PR, CI verde, merge.
- [ ] **Step 4:** Build assinado (`npm run tauri build -- --config src-tauri/tauri.release.conf.json`; se travar na senha, assinar com `npx tauri signer sign -f <chave> -p ""`), `latest.json`, `SHA256SUMS.txt`, release rascunho → conferir → publicar como latest.
