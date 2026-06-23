# Design — Redesign da seção "API" (provedores, seletor por logos, benchmark)

Data: 2026-06-22 · App: Imprompt (Tauri + React, pt-BR) · Arquivo principal: `src/tabs/MotorTab.tsx`

## Objetivo

Tornar a seleção de provedor/modelo mais clara e "profissional": provedores como **botões com logo** (não dropdown), incluir o **Claude (Anthropic)** e o **xAI**, e um **mini-benchmark por modelo**. Mais corrigir bugs ativos descobertos na pesquisa.

## Decisões do usuário (4 perguntas)

1. **Layout:** pílulas (logo + nome), fileira que quebra em 2 linhas. `role="radiogroup"`.
2. **Provedores fixos (6):** OpenAI, Anthropic, OpenRouter, DeepSeek, Gemini, xAI. Mistral, Together via "Personalizado". (Nota: o "Groq" cogitado na pesquisa foi descartado a pedido do usuário — é outra empresa, não o Grok da xAI.)
3. **Logos:** **coloridas de marca** (não monocromáticas). → o estado ativo NÃO pode depender da cor da logo: usa borda `--ink` 1.5px + fundo `--cream` + marcador `●` + `aria-checked`.
4. **Benchmark:** sim, 3 pontinhos por eixo (qualidade/velocidade/custo), convenção **"barato = 3 pontos"** (mais = melhor), rótulo em texto, e **marca de incerteza** para dados de baixa confiança.

## Correções/bugs verificados no código (entram no mesmo lote)

- **BUG ATIVO — Gemini 404:** os modelos do app (`gemini-2.0-flash`, `gemini-1.5-flash`, `gemini-1.5-pro`, e `google/gemini-2.0-flash-001` no OpenRouter) foram desligados em 2026-06-01. Escolher Gemini e testar falha hoje. → trocar para `gemini-2.5-flash` / `gemini-2.5-pro` / `gemini-2.5-flash-lite`.
- **"Barra final" é não-problema:** `api_engine.rs` faz `trim_end_matches('/')` e monta `/chat/completions`. Base URLs sem barra funcionam (Anthropic = `https://api.anthropic.com/v1`).
- **DeepSeek continua botão fixo** (sk- ambíguo já é tratado por `if detected==="openai" && active==="deepseek" return`). Não rebaixar.
- **Preços:** `usage.rs::default_prices()` só tem gpt-4o-mini/gpt-4o/default → custo de Claude/Gemini/Groq sairia "aproximado". Adicionar preços dos modelos recomendados.

## Escopo (este lote)

### 1. `PROVIDERS` (MotorTab.tsx) — 6 provedores
| id | label | baseUrl | modelo default | host | keyPrefix |
|---|---|---|---|---|---|
| openai | OpenAI | `https://api.openai.com/v1` | gpt-4o-mini | api.openai.com | sk- |
| anthropic | Anthropic | `https://api.anthropic.com/v1` | claude-haiku-4-5 | api.anthropic.com | sk-ant- |
| openrouter | OpenRouter | `https://openrouter.ai/api/v1` | openai/gpt-4o-mini | openrouter.ai | sk-or-v1- |
| deepseek | DeepSeek | `https://api.deepseek.com/v1` | deepseek-chat | api.deepseek.com | sk- (ambíguo) |
| gemini | Gemini | `https://generativelanguage.googleapis.com/v1beta/openai` | gemini-2.5-flash | generativelanguage.googleapis.com | AIza |
| xai | xAI | `https://api.x.ai/v1` | grok-4 | api.x.ai | xai- |

Modelos por provedor (datalist/dropdown): IDs atuais verificados (Claude: claude-opus-4-8 / claude-sonnet-4-6 / claude-haiku-4-5; Gemini 2.5-*; Groq llama-3.3-70b-versatile / llama-3.1-8b-instant).

### 2. Auto-detecção pela chave (`maybeAutoSelectProvider`)
Ordem (específico → genérico): `sk-or-v1-` → `sk-ant-` (→ **anthropic**, hoje é `null`) → `gsk_` (→ groq, novo) → `AIza` → `sk-` (→ openai). Mantém o guard do DeepSeek. **Sem** `xai-` (xAI não é botão fixo).

### 3. Seletor por pílulas (substitui o `<Dropdown>` de provedor)
- `div role="radiogroup"` com uma pílula por provedor (logo colorida + nome) + pílula "Personalizado" (ícone `{…}`).
- Ativo: borda `--ink` 1.5px + fundo `--cream` + `●` + `aria-checked=true`. Logo mantém cor de marca nos dois estados.
- Selecionar "Personalizado" → `customMode`, libera/foca a Base URL (lógica atual preservada).
- Reusa toda a lógica `selectProvider` / `customMode` / `modelCustom` já existente.

### 4. Logos (`ApiProviderIcon.tsx` = fonte única)
- Estender o switch com **SVGs de marca precisos e coloridos** para: anthropic, openrouter, deepseek, gemini, groq (OpenAI já existe). Fonte: marcas oficiais (estilo simple-icons), cor de marca embutida. `+` glifo `{…}` para Personalizado.
- `ConnectionStatus` (rail) herda os mesmos ícones (consistência).
- **Risco:** renderizar marca errada — usar paths verificados; quando incerto, fallback ao glifo genérico (já existe).

### 5. Modelo + mini-benchmark
- Mantém o dropdown de modelo atual.
- Componente `<Bench>`: 3 eixos × 3 pontinhos (`●` cheio = tinta, `○` vazio = `--line`), rótulo de texto. Tabela estática `BENCH[modelId] = {quality, speed, cost, confidence}` (custo já normalizado barato=3).
- Baixa confiança: marca visual (ex.: contorno em vez de cheio, ou `~`). Sem entrada / "Personalizado…" → não mostra benchmark (ou "— sem dados" em `--faint`).

### 6. Backend (`usage.rs`)
- `default_prices()`: adicionar preços (US$/1M in/out) de claude-haiku-4-5 / claude-sonnet-4-6 / claude-opus-4-8 / gemini-2.5-flash / gemini-2.5-pro / llama-3.3-70b (Groq) / deepseek-chat, senão o custo sai "aproximado".
- Confirmar que `test_api_connection`/`ApiEngine` não filtram host por allowlist (não filtram — só montam a URL).

## Fora de escopo (follow-ups oferecidos, não agora)
- "Remover chave" (o `delete_api_key` já existe em `secrets.rs`, só expor) + toggle "olho" na chave.
- Custo derivado do `prices.json` (precisa ponte `get_prices()` front↔back) — por ora benchmark de custo é score fixo.
- Claude via `/v1/messages` nativo (usamos a camada compat OpenAI; suficiente p/ refino).
- Refresh de modelos via `GET /models` (evita hardcode defasar) — desejável, depois.

## Critérios de aceite
- `tsc` 0, `cargo` build, `npm run build` ok; verificação adversarial sem regressão.
- Pílulas renderizam com logos coloridas; ativo visível sem depender da cor.
- Auto-detecção: `sk-ant-` → Anthropic, `gsk_` → Groq, `sk-or-v1-` → OpenRouter, `AIza` → Gemini, `sk-` → OpenAI (DeepSeek preservado).
- Selecionar Gemini → `gemini-2.5-flash` → "Aplicar e testar" conecta (não mais 404).
- Benchmark aparece por modelo com marca de incerteza; some para modelo sem dado.
- Custo de Claude/Gemini/Groq não cai em "aproximado".

## Arquivos a tocar
`src/tabs/MotorTab.tsx`, `src/ApiProviderIcon.tsx`, `src/styles.css`, `src-tauri/src/usage.rs` (e possivelmente `src/ConnectionStatus.tsx` se o ícone colorido pedir ajuste).
