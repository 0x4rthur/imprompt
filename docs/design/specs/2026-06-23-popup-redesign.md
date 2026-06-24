# Design — Refinamento do popup (leveza + lockup)

**Data:** 2026-06-23
**Status:** aprovado (mockup + escolha do usuário: direção C, wordmark "Imprompt" maiúsculo)

## Objetivo

Deixar o popup (Ctrl+C×2) mais leve e alinhado à identidade da logo, e enxugar texto —
sem mexer no fluxo nem na funcionalidade. Queixas do usuário: o wordmark "Imprompt" está
pesado (peso 600) e não casa com a logo geométrica; UX poderia ser mais leve / menos texto.

## Mudanças (só visuais; `src/popup.tsx` header + seção POPUP de `src/styles.css`)

1. **Header = lockup logo+wordmark.** `[I]` (BrandMark ~19) + "Imprompt" (maiúsculo, **peso 400**,
   levemente espaçado ~.02em, ~13.5px), colados como uma unidade (gap ~6px). **Remover** o
   sub "captured text" (`ph-sub`) — redundante com a citação. Esc empurrado à direita
   (`margin-left:auto`). Header segue como alça de arraste; `align-items:center`.
2. **Citação mais leve.** `border-left` de 3px sólido ink → **2px `var(--line-2)`** (cinza suave).
   Mantém line-clamp 3 + expandir ao clicar.
3. **Remover o rótulo "PRESET"** (`presets-label`) — os chips numerados se explicam. Dar à
   `.presets` um `margin-top` próprio (~22px) pra manter o respiro que o rótulo dava.
4. **Botão de ação mais leve.** `.refine` peso 600 → **500**. Rótulos "Imprompt"/"Imprompting…"
   (marca) e o `Enter` ficam. A nota "will replace the text" fica, em cinza fraco.
5. **Respiro.** Pequenos ajustes de espaçamento pro conjunto leve.

## Preservado (NÃO quebrar)

Fluxo e teclado: citação → preset (1–5/clique) → Imprompt (Enter) → resultado →
Aplicar/Copiar/Refazer. Foco + focus-trap de a11y, evento `captured-text` (reuso da janela),
arraste pelo topo, i18n (os `t()`), e o posicionamento (puxa pro centro) já corrigido.

## Fora de escopo (YAGNI)

Redesign das outras telas (fica pra um estudo próprio depois); mudar o fluxo; mexer no backend.

## Validação

`npm run typecheck && npm run build` verde; teste manual disparando o gatilho (header leve,
citação fina, sem "PRESET"/"captured text", botão leve; tudo funcionando) e reconsolidar no oficial.
