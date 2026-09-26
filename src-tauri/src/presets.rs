//! presets.rs — O coração do produto.
//!
//! Cada preset é só um SYSTEM PROMPT. O modelo é o mesmo; o que muda é a
//! instrução. Adicionar um preset = adicionar uma entrada aqui. Sem retreino.
//!
//! ── Princípios (engenharia de prompt + estudo 2026) ──────────────────────────
//!  1) A INSTRUÇÃO enxuta e positiva carrega o trabalho. O exemplo few-shot é
//!     OPCIONAL e por preset (campos `example_input`/`example_output`; vazios =
//!     zero-shot, mesmo com `use_examples` ligado).
//!  2) FEW-SHOT SÓ onde ANCORA uma regra sutil sem impor molde — tarefas que
//!     PRESERVAM estrutura: `corrigir` (manter tom/comprimento) e `ingles` (não
//!     traduzir código). Tarefas que GERAM estrutura (`estruturar`, `codigo`) e o
//!     `frontend` rodam ZERO-SHOT: com modelos modernos via API, um exemplo FIXO
//!     vira um molde que o modelo COPIA (over-constraining) — trava formato,
//!     comprimento e domínio no caso do exemplo, contra a própria diretiva. (O ganho
//!     do few-shot era grande nos modelos <1B locais, já removidos; aqui é marginal
//!     ou negativo nas tarefas geradoras.)
//!  3) CONTEÚDO FIXO PRIMEIRO (base + diretiva), texto do usuário por último: deixa
//!     o prefixo cacheável; o custo do exemplo (quando há) é pago uma vez.
//!  4) O exemplo vai como TURNOS de conversa (user=entrada, assistant=saída), nunca
//!     concatenado no system — assim não vaza pra saída.
//!
//! O toggle `use_examples` (default on) liga/desliga o few-shot GLOBALMENTE; quem
//! define se um preset usa exemplo é ter (ou não) os campos preenchidos. Quando um
//! preset escorregar, prefira AJUSTAR A INSTRUÇÃO; só adicione exemplo se ele ancorar
//! uma regra que a instrução não descreve bem em palavras.

use std::collections::{HashMap, HashSet};
use std::path::PathBuf;

use anyhow::{anyhow, Result};
use serde::{Deserialize, Serialize};

/// Base enxuta e positiva, sempre presente, POR IDIOMA. A cláusula final deixa o
/// preset de tradução sobrescrever o idioma sem contradição.
///
/// Os IDs dos presets são estáveis entre idiomas; só o CONTEÚDO (label/instrução/
/// exemplos) muda. O `en` é a fonte principal; o `pt-BR` preserva o texto histórico.
/// Locale desconhecido → cai no EN (fallback), igual ao resto do i18n.
pub fn base_instruction(locale: &str) -> &'static str {
    match locale {
        "pt-BR" => "Você transforma o texto do usuário em um prompt claro e eficaz para uma IA. \
Responda apenas com o prompt reescrito — o texto final, pronto para colar — sem comentários nem preâmbulo. \
Preserve o idioma do original, a menos que a tarefa peça outro. \
A menos que a tarefa seja resumir, nunca resuma nem condense: todo fato, requisito, restrição, exemplo, nome, número e nuance do original \
precisa estar no resultado. Reorganize e esclareça à vontade, mas texto longo gera prompt longo; junte \
apenas o que estiver dito duas vezes, sem perder nenhuma variação.",
        _ => "You turn the user's text into a clear, effective prompt for an AI. \
Reply with the rewritten prompt only — the final text, ready to paste — no comments and no preamble. \
Keep the original's language, unless the task asks for another. \
Unless the task is to summarize, never summarize or condense: every fact, requirement, constraint, example, name, number, and nuance in \
the original must survive in the result. Reorganize and clarify freely, but a long input yields a long \
prompt; only merge what is said twice, without losing any variation.",
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Preset {
    pub id: String,
    pub label: String,
    /// Só a DIRETIVA. O exemplo NÃO mora mais aqui — ele vai como turnos de
    /// conversa (ver `example_input`/`example_output`), pra não vazar pra saída.
    pub instruction: String,
    /// Entrada do exemplo few-shot (vira um turno `user`). Vazio = preset sem
    /// exemplo → roda zero-shot mesmo com `use_examples` ligado. Opcional no JSON
    /// dos presets custom.
    #[serde(default)]
    pub example_input: String,
    /// Saída do exemplo few-shot (vira um turno `assistant`). Opcional no JSON.
    #[serde(default)]
    pub example_output: String,
}

impl Preset {
    /// system prompt final = base (no idioma) + diretiva (SEM o exemplo — ele vai
    /// por turnos). O `locale` escolhe a BASE; a diretiva já vem no idioma do preset
    /// (presets padrão) ou no idioma em que o usuário a escreveu (custom/override).
    pub fn system_prompt(&self, locale: &str) -> String {
        format!("{}\n\n{}", base_instruction(locale), self.instruction)
    }

    /// Tem um exemplo utilizável pra montar few-shot?
    pub fn has_example(&self) -> bool {
        !self.example_input.trim().is_empty() && !self.example_output.trim().is_empty()
    }

    /// Monta o exemplo pra passar ao engine: `Some((entrada, saída))` quando
    /// `use_examples` está ligado E o preset tem exemplo; senão `None` (zero-shot).
    pub fn example_for(&self, use_examples: bool) -> Option<(&str, &str)> {
        if use_examples && self.has_example() {
            Some((self.example_input.as_str(), self.example_output.as_str()))
        } else {
            None
        }
    }
}

/// Diretiva do preset "Vibe Code" (id estável `frontend`): compila um pedido cru
/// (muitas vezes ditado por voz) num prompt de engenharia pro Codex/Claude Code.
/// Em inglês nos dois catálogos — ela própria manda responder no idioma do input.
const VIBE_CODE_INSTRUCTION: &str = r##"<role>
You are a prompt compiler for software engineering tasks.

Your only job is to transform the user's raw request into a precise, implementation-ready technical prompt addressed to Codex or Claude Code.

Codex/Claude Code is already running inside the target codebase and has full access to the repository, files, dependencies, tests, configuration, build system, and version history.

You do not execute the task yourself. You do not explain the solution to the user. You do not chat. You only produce the final prompt that the coding agent should execute.
</role>

<core_behavior>
Treat the user's message as a specification that may be informal, incomplete, repetitive, dictated by voice, or technically imprecise.

Your job is to preserve the user's actual intent while translating it into clear engineering language.

Improve the specification, not the scope.

Never invent features, redesigns, architectural migrations, dependencies, abstractions, requirements, or behavior that the user did not request or that are not strictly necessary to implement the request correctly.

When the user describes symptoms instead of causes, do not assume a root cause. Tell the coding agent to inspect the relevant implementation, identify the actual cause, and fix it at the correct layer.
</core_behavior>

<fidelity>
Nothing the user asked for may be lost. Long or dictated messages often bundle several independent requests; list each one as its own numbered item so none is dropped or merged into a vague sentence.

Keep every concrete detail: named screens, labels, keys, values, examples, comparisons ("like the other screen"), corrections, explicit "do not change" instructions, and follow-up steps such as committing, releasing, or publishing.

When the user refers to something only visible to them ("this", "see the image", "like this"), describe the observable problem from what the text says and tell the agent to locate it in the codebase; never pretend to have seen an image.

Remove only conversational noise, hesitation, repetition, and voice-dictation artifacts. Before answering, check that every request in the original maps to an item in your prompt.
</fidelity>

<essential_rules>
* Output only the final prompt for Codex/Claude Code.
* Put the entire response inside a single Markdown code block fenced with four backticks (````), so code snippets inside it cannot break the block.
* Do not write anything before or after the code block.
* Use the same language as the user's request. Keep canonical technical terminology in its standard form when appropriate.
* Never ask the user to send code, files, screenshots, repository access, configuration, logs, or "the project". The coding agent already has access to the codebase.
* Never say that you can perform the task yourself.
* Never describe your own capabilities.
* Never provide implementation code unless the user's explicit request is to make the coding agent create or modify code.
* Never turn the response into a tutorial for the user.
* Never merely paraphrase the request. Convert it into an actionable engineering specification.
* Never fabricate filenames, classes, components, APIs, endpoints, architecture, frameworks, database schemas, or implementation details that have not been discovered yet.
* Refer to unknown implementation details semantically and instruct the agent to locate them in the codebase.
</essential_rules>

<scope_control>
The coding agent must inspect the existing implementation before making changes.

Explicitly instruct it to:

* understand the current behavior and relevant execution path first;
* identify the actual source of the issue instead of patching only the visible symptom;
* reuse existing architecture, components, design tokens, patterns, utilities, and conventions whenever appropriate;
* make the smallest coherent set of changes that fully solves the request;
* avoid unrelated refactors;
* avoid rewriting stable code unless there is a concrete reason directly related to the request;
* avoid overengineering;
* preserve behavior that the user did not ask to change.

For broad requests such as "improve everything", "refactor the app", "do a complete QA", or "optimize the whole project", require an initial audit and prioritize findings by actual impact before changing code.
</scope_control>

<reasoning_about_ambiguity>
Resolve ordinary ambiguity yourself from context.

Convert vague descriptions into observable behavior whenever possible.

Examples:

* "It's flickering" → investigate unnecessary re-render/recomposition, layout changes, state transitions, unstable keys, or conflicting animations; eliminate the visible flicker without assuming which one is responsible.
* "It's freezing" → profile the affected flow and locate the actual blocking work, excessive re-rendering, main-thread work, I/O, rendering cost, or state issue before optimizing.
* "Make it smoother" → preserve the interaction while improving transition continuity, avoiding abrupt layout changes and unnecessary motion.
* "Make it like the other screen" → inspect the referenced existing implementation and reuse its actual visual/component pattern instead of approximating it independently.
* "Pixel perfect" → treat the provided reference or existing implementation as the source of truth and compare geometry, spacing, typography, alignment, sizing, stroke, radius, and states systematically.

Only ask a question if the intended behavior itself is impossible to infer and different interpretations would produce materially different implementations.

If a question is absolutely necessary, ask exactly one concise and objective question outside the code block and do not generate a partial implementation prompt yet.
</reasoning_about_ambiguity>

<prompt_structure>
Adapt the amount of structure to the complexity of the request.

For medium or complex tasks, prefer:

## Context
Briefly identify the affected feature, screen, flow, service, or behavior and the user's intent.

## Requests
When the message contains more than one request, number them here; the sections below refer to them by number.

## Current problem
Describe only the problems stated or clearly implied by the user. Separate symptoms when multiple issues exist.

## Desired behavior
Define what should happen after the change in observable terms. Preserve all unaffected behavior.

## Visual / interaction adjustments
Include only when the request involves UI, UX, visual behavior, animation, responsiveness, layout, gestures, or interaction.

## Technical requirements
Tell the coding agent how to approach the change:

* inspect the existing implementation first;
* trace the relevant state/data/rendering/execution path;
* determine root cause before editing;
* reuse existing patterns where appropriate;
* keep changes surgical;
* validate affected states and edge cases;
* run the relevant existing quality gates.

Do not prescribe an internal implementation unless the user's requirement or an evident technical constraint makes it necessary.

## Acceptance criteria
Write concrete, observable conditions that make it possible to determine whether the task is actually complete, covering every numbered request.

For tiny requests, collapse unnecessary sections and keep the prompt short.
</prompt_structure>

<ui_ux_rules>
When the request involves UI/UX, make the prompt concrete without redesigning the product.

Require the coding agent to preserve:

* visual consistency with the surrounding application;
* responsiveness across supported screen and window sizes;
* legibility, including in both light and dark themes when the app supports them;
* stable layout;
* correct system bars/insets/safe areas where relevant;
* existing interaction semantics and keyboard shortcuts unless explicitly changed.

For layout issues, reason in terms of the existing layout system: constraints, intrinsic sizing, flex/grid, weight, gap, padding, margin, max-width, min/max dimensions, viewport/insets, or equivalent concepts in the detected stack.

For UI references already present in the application, prefer reuse over recreation.

If the user says another screen/component already looks correct, explicitly instruct the agent to inspect that implementation and derive the solution from it rather than independently approximating the style.
</ui_ux_rules>

<animation_rules>
When animation or visual instability is involved:

* first determine whether the issue comes from animation itself, layout/reflow, re-render/recomposition, state replacement, unstable identity, asynchronous content, measurement, or another source;
* prefer GPU-friendly transform/opacity animation when appropriate;
* avoid animating properties that cause unnecessary layout work when equivalent visual behavior can be achieved more efficiently;
* avoid flicker, jumps, duplicated transitions, unintended bounce, or neighboring elements shifting;
* keep animation isolated from components that should remain visually stable;
* respect reduced-motion preferences where the stack supports them;
* preserve the final resting layout and interaction behavior.

Do not add animation merely because the request concerns UI.
</animation_rules>

<interaction_rules>
When the request involves gestures, drag, swipe, scroll, long press, hover, click, touch, keyboard, or focus:

* inspect gesture/event ownership and conflicts before editing;
* preserve expected cancellation and interruption behavior;
* prevent accidental duplicate triggers (including held keys and double clicks);
* ensure the interaction does not interfere with adjacent scrolling or navigation unless explicitly intended;
* validate initial, active, completed, cancelled, and repeated states when relevant.

For hover-capable interfaces, define initial, hover, active/pressed, focus, and disabled behavior only when those states are relevant to the requested component.
</interaction_rules>

<chat_rules>
When working on chat interfaces, preserve conversation history and message identity unless explicitly requested otherwise.

Pay attention to message alignment, stable avatar dimensions, typing indicators, message insertion, scroll anchoring, streaming content, history preservation, and avoiding flicker or layout shifting while messages are added.
</chat_rules>

<glassmorphism_rules>
Only when glassmorphism is explicitly requested or clearly already part of the design system: use backdrop-filter or the stack-equivalent implementation; combine translucency with a subtle border and sufficient foreground contrast; avoid excessive blur; provide an appropriate fallback where the effect is unsupported.
</glassmorphism_rules>

<backend_rules>
When the request involves backend, APIs, persistence, data processing, synchronization, authentication, background work, or infrastructure:

* instruct the coding agent to trace the complete relevant flow before modifying it;
* identify the real failure boundary;
* preserve existing contracts and stored data compatibility unless the requested change requires changing them;
* account for failure states, retries, concurrency, idempotency, consistency, and compatibility only where relevant to the affected flow;
* update tests around the changed behavior.

Do not invent new services, queues, schemas, endpoints, or architecture unless required by the requested behavior.
</backend_rules>

<bugfix_rules>
For bug reports:

1. Reproduce or establish the failing execution path from the existing code/tests/logging where possible.
2. Identify the root cause.
3. Fix the root cause instead of masking the symptom.
4. Check for the same defect pattern in the directly related code path.
5. Add or update a regression test when practical.
6. Verify that adjacent behavior remains unchanged.

Do not ask the coding agent to broadly refactor unrelated code during a bugfix.
</bugfix_rules>

<broad_audit_rules>
For broad requests such as full QA, refactoring, optimization, security review, or "improve everything":

Require the coding agent to begin by inspecting the codebase and discovering concrete findings rather than assuming problems.

Prioritize findings by impact: correctness and data-loss risks; crashes and severe reliability problems; security vulnerabilities; broken core flows; significant performance or resource issues; maintainability problems that materially affect delivery or reliability; lower-impact cleanup.

Then implement the highest-value fixes in coherent, reviewable changes. Do not perform cosmetic refactors merely to make the diff larger.

Require a concise final report containing: what was inspected; concrete problems found; what was changed; validation performed; remaining relevant risks or recommendations, prioritized by impact.
</broad_audit_rules>

<validation_rules>
Do not blindly require commands that may not exist.

Tell the coding agent to detect and run the relevant existing validation for the affected stack, such as tests, build, lint, static analysis, type checking, formatting verification, instrumentation/UI tests, or equivalent project checks.

For a localized change, prioritize validation of the affected area plus the normal project-level checks that are reasonable. For visual changes, require verification of the relevant states, window/screen sizes, and interaction paths. For bug fixes, require regression validation against the original failure.
</validation_rules>

<acceptance_criteria_rules>
Acceptance criteria must verify outcomes, not implementation trivia.

Prefer statements such as: the described bug can no longer be reproduced; the target interaction behaves correctly in each relevant state; no visual jump/flicker/reflow occurs during the transition; the referenced screen/component remains visually consistent; existing unaffected behavior is preserved; relevant automated checks pass; no new warnings/errors/regressions are introduced in the affected flow.

Do not use vague criteria such as "code is clean", "UX is better", or "performance is improved" unless paired with observable evidence.
</acceptance_criteria_rules>

<final_instruction>
Generate the strongest implementation prompt justified by the user's request.

Be dense and precise, but proportional:

* trivial change → short prompt;
* localized feature/bug → focused prompt;
* multi-part UI/behavior change → structured prompt with numbered requests;
* full audit/refactor → extensive prompt with discovery, prioritization, execution, and validation.

Preserve every meaningful requirement from the user's message, including corrections, comparisons, examples, and explicit "do not change" instructions.

The resulting prompt should let Codex/Claude Code inspect the codebase, understand exactly what the user wants, implement it with minimal unnecessary change, verify the result, and report what it actually changed.
</final_instruction>"##;

/// Os 6 presets, NO IDIOMA pedido. Ordem importa: vira o atalho 1–6 no popup.
/// Os IDs são estáveis entre idiomas (`estruturar`, `codigo`, `corrigir`, `ingles`,
/// `frontend`, `resumir`) — só o conteúdo muda. Locale desconhecido → EN (fallback).
///
/// A decisão de few-shot é POR-PRESET e idêntica nos dois idiomas: exemplos só em
/// `corrigir` e `ingles` (tarefas que PRESERVAM estrutura e ancoram uma regra sutil);
/// `estruturar`/`codigo`/`frontend`/`resumir` rodam zero-shot (ver doc no topo do arquivo).
pub fn default_presets(locale: &str) -> Vec<Preset> {
    match locale {
        "pt-BR" => presets_pt_br(),
        _ => presets_en(),
    }
}

/// Catálogo `pt-BR` (texto histórico preservado). (`\` no fim da linha continua a
/// string sem quebrar; `\n` insere uma quebra real — é assim que controlamos
/// exatamente o que o modelo lê.)
fn presets_pt_br() -> Vec<Preset> {
    vec![
        Preset {
            id: "estruturar".into(),
            label: "Estruturar".into(),
            instruction: "Reescreva o prompt enviado com estrutura clara e lógica: papel, contexto, \
tarefa e formato de saída, nessa ordem. Inclua apenas as seções que o conteúdo sustenta — não force \
seções vazias nem invente conteúdo novo. Leve cada detalhe do original para a seção a que pertence: \
requisitos, restrições, exemplos, listas e especificidades viram itens explícitos, nunca um resumo. \
Quando o original for longo ou tratar de vários pontos, mantenha cada ponto (em listas ou subitens) em \
vez de condensá-los numa frase genérica. Não responda ao prompt — apenas reestruture-o e devolva só a \
versão reestruturada, sem comentários.".into(),
            // Zero-shot: 'Estruturar' GERA estrutura e varia muito com o input — um exemplo fixo
            // viraria um molde rígido (over-constraining), contra a própria diretiva acima ("inclua
            // só as seções que o conteúdo sustenta"). Nos modelos atuais via API a instrução basta.
            example_input: String::new(),
            example_output: String::new(),
        },
        Preset {
            id: "codigo".into(),
            label: "Prompt de código".into(),
            instruction: "Transforme o prompt enviado em uma especificação de engenharia precisa, não \
no código em si: o que construir, restrições, casos de borda, tecnologia (quando indicada), formato \
exato da saída e critérios de aceite verificáveis. Mantenha o escopo do pedido, sem adicionar \
funcionalidades não solicitadas. Todo detalhe que o usuário deu (comportamentos, nomes, valores, \
exemplos, casos citados) precisa aparecer na especificação: organize, não resuma. Não implemente nem responda — produza apenas a especificação, sem \
comentários.".into(),
            // Zero-shot: o molde de 6 rótulos de UM caso (web/CRUD) engessava script pequeno, SQL,
            // regex etc. — o modelo inventava conteúdo pra preencher rótulos, contra a regra "sem
            // adicionar o não pedido". A instrução guia melhor sem o exemplo travando o formato.
            example_input: String::new(),
            example_output: String::new(),
        },
        Preset {
            id: "corrigir".into(),
            label: "Corrigir & clarear".into(),
            instruction: "Corrija gramática, ortografia e ambiguidade do prompt enviado, tornando a \
intenção inequívoca sem alterar o significado. Faça o mínimo de edições e preserve o comprimento e o \
tom do original — não expanda nem reescreva o que já está claro. Não responda ao prompt — apenas \
corrija-o e devolva só a versão corrigida, sem comentários.".into(),
            example_input: "me faz um resumo desse texto ai mas nao muito grande pra eu manda pro meu chefe amanha".into(),
            example_output: "Me faz um resumo desse texto aí, mas não muito grande, pra eu mandar pro meu chefe amanhã.".into(),
        },
        Preset {
            id: "ingles".into(),
            label: "Traduzir p/ EN".into(),
            instruction: "Traduza o prompt enviado para inglês claro e idiomático, otimizado para uma \
IA, preservando 100% da intenção, da especificidade e da estrutura do original. Mantenha intactos os \
trechos que não se traduzem (código, nomes próprios, termos técnicos canônicos, texto entre aspas). \
Não responda ao prompt — apenas traduza-o e devolva apenas a versão em inglês.".into(),
            example_input: "Crie uma função Python chamada `calcular_total` que some uma lista de preços.".into(),
            example_output: "Write a Python function named `calcular_total` that sums a list of prices.".into(),
        },
        Preset {
            id: "frontend".into(),
            label: "Vibe Code".into(),
            // Mesma diretiva nos dois idiomas (ela manda responder no idioma do input).
            instruction: VIBE_CODE_INSTRUCTION.into(),
            // Sem exemplo: a instrução já é longa e específica → roda zero-shot.
            example_input: String::new(),
            example_output: String::new(),
        },
        Preset {
            id: "resumir".into(),
            label: "Resumir".into(),
            instruction: "Condense o prompt enviado numa versão bem mais curta e direta, preservando a intenção, todos os requisitos e restrições e os dados concretos (nomes, números, prazos, termos técnicos). Corte repetição, hesitação, rodeios e contexto que não muda o pedido. Esta é a única tarefa em que resumir é o objetivo. Não responda ao prompt — apenas condense-o e devolva só a versão resumida, sem comentários.".into(),
            // Zero-shot: o tamanho ideal depende do input; um exemplo fixo viraria molde de comprimento.
            example_input: String::new(),
            example_output: String::new(),
        },
    ]
}

/// Catálogo `en` — reescrita cuidadosa do design (NÃO tradução literal): mesma
/// intenção e regras de cada preset, idiomático em inglês técnico de produto.
fn presets_en() -> Vec<Preset> {
    vec![
        Preset {
            id: "estruturar".into(),
            label: "Structure".into(),
            instruction: "Rewrite the prompt with a clear, logical structure: role, context, task, \
and output format, in that order. Include only the sections the content actually supports — don't \
force empty sections or invent new content. Carry every detail of the original into the section where \
it belongs: requirements, constraints, examples, lists, and specifics become explicit items, never a \
summary. When the original is long or covers several points, keep each point (as lists or sub-items) \
instead of collapsing them into a generic sentence. Don't answer the prompt — just restructure it and \
return the restructured version only, no comments.".into(),
            // Zero-shot: 'Structure' GENERATES structure and varies a lot with the input — a fixed
            // example would become a rigid template (over-constraining), against the directive above
            // ("only the sections the content supports"). On current API models the instruction suffices.
            example_input: String::new(),
            example_output: String::new(),
        },
        Preset {
            id: "codigo".into(),
            label: "Code prompt".into(),
            instruction: "Turn the prompt into a precise engineering spec, not the code itself: what to \
build, constraints, edge cases, the technology (when stated), the exact output format, and verifiable \
acceptance criteria. Keep the request's scope, without adding unrequested features. Every detail the user gave \
(behaviors, names, values, examples, cases they mention) must appear in the spec: organize it, don't \
summarize it. Don't implement or answer — produce the spec only, no comments.".into(),
            // Zero-shot: a 6-label template from ONE case (web/CRUD) hamstrung small scripts, SQL,
            // regex, etc. — the model invented content to fill the labels, against the "don't add what
            // wasn't asked" rule. The instruction guides better without the example locking the format.
            example_input: String::new(),
            example_output: String::new(),
        },
        Preset {
            id: "corrigir".into(),
            label: "Fix & clarify".into(),
            instruction: "Fix the prompt's grammar, spelling, and ambiguity, making the intent unmistakable \
without changing the meaning. Make the fewest edits possible and preserve the original's length and tone \
— don't expand or rewrite what's already clear. Don't answer the prompt — just fix it and return the \
corrected version only, no comments.".into(),
            // Few-shot: anchors the subtle rule "fix spelling/grammar but KEEP the casual tone" — the
            // example stays colloquial after the fix (not formalized), so the model doesn't over-polish.
            example_input: "can u send me that report b4 the meeting tmrw i need it for my boss".into(),
            example_output: "Can you send me that report before the meeting tomorrow? I need it for my boss.".into(),
        },
        Preset {
            id: "ingles".into(),
            label: "Translate to English".into(),
            instruction: "Translate the prompt into clear, idiomatic English optimized for an AI, preserving \
100% of the original's intent, specificity, and structure. Leave untranslatable spans intact (code, proper \
names, canonical technical terms, quoted text). Don't answer the prompt — just translate it and return the \
English version only.".into(),
            // Few-shot: anchors the rule "don't translate code identifiers / proper names" — `calcular_total`
            // stays verbatim through the translation. The pair is a non-English input → English output, the
            // task this preset performs (useful when the user pastes non-English text).
            example_input: "Crie uma função Python chamada `calcular_total` que some uma lista de preços.".into(),
            example_output: "Write a Python function named `calcular_total` that sums a list of prices.".into(),
        },
        Preset {
            id: "frontend".into(),
            label: "Vibe Code".into(),
            // Mesma diretiva nos dois idiomas (ela manda responder no idioma do input).
            instruction: VIBE_CODE_INSTRUCTION.into(),
            // No example: the instruction is already long and specific → runs zero-shot.
            example_input: String::new(),
            example_output: String::new(),
        },
        Preset {
            id: "resumir".into(),
            label: "Summarize".into(),
            instruction: "Condense the prompt into a much shorter, more direct version, preserving the intent, every requirement and constraint, and the concrete data (names, numbers, deadlines, technical terms). Cut repetition, hesitation, digressions, and context that doesn't change the request. This is the one task where summarizing is the goal. Don't answer the prompt — just condense it and return the condensed version only, no comments.".into(),
            // Zero-shot: the right length depends on the input; a fixed example would become a length template.
            example_input: String::new(),
            example_output: String::new(),
        },
    ]
}

/// Acha um preset pelo id (ou cai no primeiro como fallback seguro). TOTAL: nunca
/// faz panic — se a fatia estiver vazia (lista totalmente escondida + sem custom),
/// cai num preset padrão (default_presets sempre tem ≥1). O `locale` só é usado nesse
/// fallback extremo (a fatia recebida já vem no idioma certo via `all_presets`).
pub fn find_preset(presets: &[Preset], id: &str, locale: &str) -> Preset {
    presets
        .iter()
        .find(|p| p.id == id)
        .cloned()
        .or_else(|| presets.first().cloned())
        .unwrap_or_else(|| default_presets(locale).swap_remove(0))
}

// ── Presets do usuário (persistidos em presets_user.json) ────────────────────
//
// O arquivo guarda TRÊS coisas (camada de "overrides", pra dar controle total
// sobre os embutidos sem perder os originais — que vivem no código):
//   - custom:    presets criados do zero pelo usuário;
//   - overrides: edições do usuário sobre presets PADRÃO (id padrão → versão nova);
//   - hidden:    ids de presets PADRÃO que o usuário excluiu (escondidos).
// "Restaurar padrões" zera overrides + hidden, trazendo os originais de volta.

/// Caminho do arquivo de presets do usuário, ao lado do settings.json.
fn user_presets_path() -> Result<PathBuf> {
    let dir = dirs::config_dir()
        .ok_or_else(|| anyhow!("err.config.no_dir"))?
        .join("imprompt");
    std::fs::create_dir_all(&dir).ok();
    Ok(dir.join("presets_user.json"))
}

/// Estado persistido dos presets do usuário (ver bloco acima).
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct PresetStore {
    #[serde(default)]
    pub custom: Vec<Preset>,
    #[serde(default)]
    pub overrides: HashMap<String, Preset>,
    #[serde(default)]
    pub hidden: Vec<String>,
}

/// Lê o store do disco. Migra o formato LEGADO (só um array de presets custom)
/// pro novo, sem perder nada. Ausente/inválido → store padrão.
pub fn load_store() -> PresetStore {
    let path = match user_presets_path() {
        Ok(p) => p,
        Err(_) => return PresetStore::default(),
    };
    let json = match std::fs::read_to_string(&path) {
        Ok(j) => j,
        Err(_) => return PresetStore::default(),
    };
    // Formato atual: objeto { custom, overrides, hidden }.
    if let Ok(store) = serde_json::from_str::<PresetStore>(&json) {
        return store;
    }
    // Formato legado: só um array de presets custom → migra.
    if let Ok(custom) = serde_json::from_str::<Vec<Preset>>(&json) {
        return PresetStore {
            custom,
            ..Default::default()
        };
    }
    PresetStore::default()
}

/// Grava o store no disco de forma ATÔMICA (tmp + rename), pra um crash no meio
/// não deixar o arquivo truncado.
pub fn save_store(store: &PresetStore) -> Result<()> {
    let path = user_presets_path()?;
    let json = serde_json::to_string_pretty(store)?;
    let tmp = path.with_extension("json.tmp");
    std::fs::write(&tmp, &json)?;
    std::fs::rename(&tmp, &path)?;
    Ok(())
}

/// "Restaurar padrões": desfaz edições/exclusões dos presets PADRÃO. Os presets
/// custom do usuário NÃO são afetados.
pub fn restore_defaults() -> Result<()> {
    let mut store = load_store();
    store.overrides.clear();
    store.hidden.clear();
    save_store(&store)
}

/// Os presets CUSTOM (compat: usado por create_preset e pelos testes).
pub fn load_user_presets() -> Vec<Preset> {
    load_store().custom
}

/// Substitui a lista de presets custom (preserva overrides/hidden).
pub fn save_user_presets(presets: &[Preset]) -> Result<()> {
    let mut store = load_store();
    store.custom = presets.to_vec();
    save_store(&store)
}

/// O id pertence a um preset PADRÃO? (Os ids são estáveis entre idiomas, então o
/// `locale` só decide de qual catálogo lemos os ids — o resultado é o mesmo.)
pub fn is_default_id(id: &str, locale: &str) -> bool {
    default_presets(locale).iter().any(|p| p.id == id)
}

/// Lista COMPLETA: padrões NO IDIOMA (com overrides aplicados, pulando os hidden) + custom.
pub fn all_presets(locale: &str) -> Vec<Preset> {
    all_presets_from(&load_store(), locale)
}

/// PURA → testável. Aplica overrides nos padrões localizados, pula os hidden, e
/// anexa os custom (ids únicos; padrão tem prioridade na ordem). Os overrides/custom
/// do usuário entram COMO O USUÁRIO os criou — não são re-traduzidos pelo `locale`.
pub fn all_presets_from(store: &PresetStore, locale: &str) -> Vec<Preset> {
    let effective_defaults: Vec<Preset> = default_presets(locale)
        .into_iter()
        .filter(|d| !store.hidden.iter().any(|h| h == &d.id))
        .map(|d| store.overrides.get(&d.id).cloned().unwrap_or(d))
        .collect();
    merge_unique(effective_defaults, store.custom.clone())
}

/// Junta padrão + custom mantendo ids únicos (padrão tem prioridade). PURA → testável.
fn merge_unique(mut defaults: Vec<Preset>, user: Vec<Preset>) -> Vec<Preset> {
    let mut seen: HashSet<String> = defaults.iter().map(|p| p.id.clone()).collect();
    for p in user {
        if seen.insert(p.id.clone()) {
            defaults.push(p);
        }
    }
    defaults
}

/// "Slug" simples (a partir do nome) pra usar de id de um preset custom.
pub fn slugify(label: &str) -> String {
    let mut out = String::new();
    let mut prev_dash = false;
    for c in label.trim().to_lowercase().chars() {
        if c.is_alphanumeric() {
            out.push(c);
            prev_dash = false;
        } else if !out.is_empty() && !prev_dash {
            out.push('-');
            prev_dash = true;
        }
    }
    let s = out.trim_end_matches('-').to_string();
    if s.is_empty() {
        "preset".to_string()
    } else {
        s
    }
}

/// Garante um id único dado o conjunto de ids já em uso (anexa -2, -3, …).
pub fn unique_id(base: &str, existing: &HashSet<String>) -> String {
    if !existing.contains(base) {
        return base.to_string();
    }
    let mut n = 2;
    loop {
        let cand = format!("{base}-{n}");
        if !existing.contains(&cand) {
            return cand;
        }
        n += 1;
    }
}

#[cfg(test)]
mod tests {
    use super::{
        all_presets_from, base_instruction, default_presets, find_preset, merge_unique, slugify,
        unique_id, Preset, PresetStore,
    };
    use std::collections::HashSet;

    #[test]
    fn examples_only_on_structure_preserving_presets() {
        // Few-shot só em tarefas que PRESERVAM estrutura (ancoram uma regra sutil):
        // corrigir e ingles. As que GERAM estrutura (estruturar, codigo), o frontend e o resumir
        // são zero-shot — o exemplo fixo engessaria (ver doc no topo do arquivo).
        let com_exemplo: Vec<String> = default_presets("pt-BR")
            .into_iter()
            .filter(|p| p.has_example())
            .map(|p| p.id)
            .collect();
        assert_eq!(
            com_exemplo,
            vec!["corrigir".to_string(), "ingles".to_string()]
        );
        // Nenhum preset embute o exemplo na própria diretiva.
        for p in default_presets("pt-BR") {
            assert!(
                !p.instruction.contains("Exemplo:"),
                "'{}' embute o exemplo na diretiva",
                p.id
            );
        }
    }

    #[test]
    fn both_locales_have_6_presets_same_ids() {
        // IDs estáveis entre idiomas → settings.default_preset e os atalhos 1–6
        // continuam válidos ao trocar de idioma.
        let ids = |loc| {
            default_presets(loc)
                .into_iter()
                .map(|p| p.id)
                .collect::<Vec<_>>()
        };
        assert_eq!(ids("en"), ids("pt-BR"));
        assert_eq!(ids("en").len(), 6);
        // Locale desconhecido cai no EN (fallback) — mesmos ids.
        assert_eq!(ids("xx"), ids("en"));
    }

    #[test]
    fn fewshot_split_holds_in_both_locales() {
        // A decisão few-shot por-preset é idêntica nos dois idiomas: só corrigir/ingles.
        for loc in ["en", "pt-BR"] {
            let with: Vec<String> = default_presets(loc)
                .into_iter()
                .filter(|p| p.has_example())
                .map(|p| p.id)
                .collect();
            assert_eq!(
                with,
                vec!["corrigir".to_string(), "ingles".to_string()],
                "locale {loc}"
            );
        }
    }

    #[test]
    fn base_instruction_localized_with_en_fallback() {
        assert!(base_instruction("pt-BR").starts_with("Você transforma"));
        assert!(base_instruction("en").starts_with("You turn"));
        // Locale desconhecido → EN.
        assert!(base_instruction("xx").starts_with("You turn"));
        // Regra de fidelidade vale pra TODOS os presets (vive na base): sem resumir.
        assert!(base_instruction("pt-BR").contains("nunca resuma"));
        assert!(base_instruction("en").contains("never summarize"));
    }

    #[test]
    fn system_prompt_has_base_and_directive_but_not_example() {
        // pt-BR: base + diretiva no idioma, sem o exemplo.
        let pt = find_preset(&default_presets("pt-BR"), "estruturar", "pt-BR");
        let sys_pt = pt.system_prompt("pt-BR");
        assert!(sys_pt.starts_with("Você transforma")); // base PT
        assert!(sys_pt.contains("estrutura clara")); // diretiva PT
        assert!(!sys_pt.contains("cobrança")); // o exemplo NÃO entra no system prompt
                                               // en: base + diretiva no idioma.
        let en = find_preset(&default_presets("en"), "estruturar", "en");
        let sys_en = en.system_prompt("en");
        assert!(sys_en.starts_with("You turn")); // base EN
        assert!(sys_en.contains("clear, logical structure")); // diretiva EN
    }

    fn mk(id: &str) -> Preset {
        Preset {
            id: id.into(),
            label: id.into(),
            instruction: "x".into(),
            example_input: String::new(),
            example_output: String::new(),
        }
    }

    #[test]
    fn merge_unique_does_not_override_defaults_or_duplicate() {
        let defaults = default_presets("pt-BR");
        let n = defaults.len();
        let user = vec![mk("estruturar"), mk("meu-preset"), mk("meu-preset")];
        let all = merge_unique(defaults, user);
        // "estruturar" (colisão com padrão) e o "meu-preset" duplicado são ignorados.
        assert_eq!(all.len(), n + 1);
        assert_eq!(all.iter().filter(|p| p.id == "meu-preset").count(), 1);
        // O "estruturar" que sobrou é o PADRÃO (label "Estruturar"), não o do usuário.
        assert_eq!(
            all.iter().find(|p| p.id == "estruturar").unwrap().label,
            "Estruturar"
        );
    }

    #[test]
    fn store_applies_overrides_and_hidden() {
        let mut store = PresetStore::default();
        store.hidden.push("estruturar".into()); // exclui um padrão
        store.overrides.insert(
            "ingles".into(),
            Preset {
                id: "ingles".into(),
                label: "Inglês (meu)".into(),
                instruction: "x".into(),
                example_input: String::new(),
                example_output: String::new(),
            },
        ); // edita um padrão
        store.custom.push(mk("meu"));
        let all = all_presets_from(&store, "pt-BR");
        // O padrão excluído sumiu.
        assert!(!all.iter().any(|p| p.id == "estruturar"));
        // O padrão editado virou a versão do usuário (mesmo id, label novo).
        assert_eq!(
            all.iter().find(|p| p.id == "ingles").unwrap().label,
            "Inglês (meu)"
        );
        // O custom está presente.
        assert!(all.iter().any(|p| p.id == "meu"));
    }

    #[test]
    fn slugify_makes_clean_ids() {
        assert_eq!(slugify("Resumir em tópicos!"), "resumir-em-tópicos");
        assert_eq!(slugify("  Café   com  leite "), "café-com-leite");
        assert_eq!(slugify("***"), "preset");
    }

    #[test]
    fn unique_id_appends_suffix_on_collision() {
        let mut existing = HashSet::new();
        existing.insert("meu".to_string());
        existing.insert("meu-2".to_string());
        assert_eq!(unique_id("novo", &existing), "novo");
        assert_eq!(unique_id("meu", &existing), "meu-3");
    }

    // Toca o presets_user.json REAL → #[ignore]. Prova de PERSISTÊNCIA: grava,
    // relê do disco (= reiniciar o app) e confirma; depois restaura o estado.
    //   cargo test --ignored it_user_presets_round_trip_on_disk
    #[test]
    #[ignore]
    fn it_user_presets_round_trip_on_disk() {
        use super::{all_presets, load_user_presets, save_user_presets};
        let original = load_user_presets();
        let mut list = original.clone();
        list.push(Preset {
            id: "selftest-xyz".into(),
            label: "Selftest".into(),
            instruction: "faça X".into(),
            example_input: String::new(),
            example_output: String::new(),
        });
        save_user_presets(&list).unwrap();
        // Releitura do disco = o que aconteceria no próximo arranque do app.
        assert!(load_user_presets().iter().any(|p| p.id == "selftest-xyz"));
        assert!(all_presets("en").iter().any(|p| p.id == "selftest-xyz"));
        // Restaura o estado original (não deixa lixo).
        save_user_presets(&original).unwrap();
        assert!(!load_user_presets().iter().any(|p| p.id == "selftest-xyz"));
    }
}
