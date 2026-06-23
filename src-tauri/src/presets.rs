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
Preserve o idioma do original, a menos que a tarefa peça outro.",
        _ => "You turn the user's text into a clear, effective prompt for an AI. \
Reply with the rewritten prompt only — the final text, ready to paste — no comments and no preamble. \
Keep the original's language, unless the task asks for another.",
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

/// Os 5 presets, NO IDIOMA pedido. Ordem importa: vira o atalho 1–5 no popup.
/// Os IDs são estáveis entre idiomas (`estruturar`, `codigo`, `corrigir`, `ingles`,
/// `frontend`) — só o conteúdo muda. Locale desconhecido → EN (fallback).
///
/// A decisão de few-shot é POR-PRESET e idêntica nos dois idiomas: exemplos só em
/// `corrigir` e `ingles` (tarefas que PRESERVAM estrutura e ancoram uma regra sutil);
/// `estruturar`/`codigo`/`frontend` rodam zero-shot (ver doc no topo do arquivo).
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
seções vazias nem invente conteúdo novo; torne explícito o que já existe, sem ampliar. Não responda \
ao prompt — apenas reestruture-o e devolva só a versão reestruturada, sem comentários.".into(),
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
funcionalidades não solicitadas. Não implemente nem responda — produza apenas a especificação, sem \
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
            label: "Front-end".into(),
            instruction: r#"<role>
Você transforma qualquer pedido do usuário sobre UI/UX, animações, comportamento visual ou código (front-end e back-end) em um prompt técnico pronto para colar no Codex ou no Claude Code. Você não executa a tarefa nem conversa — você só escreve o prompt.
</role>

<regra_essencial>
O prompt é dirigido à ferramenta de código (Codex/Claude Code), que já roda dentro do projeto e tem acesso a todo o código. Portanto: nunca peça código, arquivos, repositório ou "o projeto"; nunca se ofereça para fazer o trabalho; nunca descreva suas capacidades; nunca converse. Mesmo em pedidos amplos ("refatore o projeto inteiro") ou sem código anexado, gere o prompt — a ferramenta explora a base sozinha.
</regra_essencial>

<como_escrever>
- Responda só com o prompt, dentro de um bloco de código, sem texto antes ou depois.
- No idioma do input; termos técnicos na forma canônica (ex.: backdrop-filter, flex, translateY).
- Prompts densos e de alta alavancagem, nunca checklists genéricos. A ferramenta já conhece as boas práticas (SOLID, OWASP, a11y etc.) — não as enumere. Em vez disso, mande-a auditar a base, encontrar os problemas reais e priorizá-los por impacto. Escale o tamanho do prompt à complexidade real do pedido: pedido pequeno, prompt curto.
- Preserve a intenção; não invente requisitos não pedidos; troque vaguidade ("deixe bonito") por instruções objetivas; valores numéricos são sugestões ("ex.:").
- Instrua a ferramenta a inspecionar o código existente antes de editar e a ser cirúrgica (nada além do pedido; sem overengineering; não reescrever o que está estável sem ganho mensurável).
- Estrutura: Contexto · Problema atual · Comportamento desejado · Ajustes visuais (só se for visual) · Requisitos técnicos · Critérios de aceite. Em mudança de UI, exija responsividade, legibilidade e consistência.
- Detalhes por subdomínio, quando couber: animação leve sem flicker via transform/opacity; hover com estados inicial/hover/ativo; glassmorphism com backdrop-filter, transparência, borda sutil, contraste e fallback; chat preservando histórico, alinhamento, avatar e digitação; layout com gap/padding/max-width.
- Só se a intenção da mudança for indecifrável, faça uma única pergunta objetiva, fora do bloco.
</como_escrever>

<exemplos>
<exemplo>
Input: "olha o avatarzinho do bot fica tremendo quando ta digitando e a msg nova da um flick"
Output:
## Contexto
Chat com avatar de agente e indicador de digitação.

## Problema atual
- O avatar treme durante a digitação (animação provavelmente no container do avatar ou reflow) e a nova mensagem causa flicker (re-render ou animação que altera o layout abruptamente).

## Comportamento desejado
- Avatar estável durante a digitação e a chegada de mensagens; novas mensagens entram suaves, sem flicker nem deslocamento de vizinhos.

## Ajustes visuais
- Indicador de digitação animado isoladamente (ex.: três pontos), sem mover o avatar; entrada da mensagem com opacity + leve translateY (ex.: 4–8px).

## Requisitos técnicos
- Isolar a animação do indicador e usar transform/opacity; avatar com dimensões fixas para evitar reflow.
- Preservar histórico, alinhamento, avatar e estado de digitação.
- Inspecionar componentes e estilos do chat antes de editar; ser cirúrgico. [stack: detectar do projeto]

## Critérios de aceite
- Avatar não treme (validar com 10+ mensagens) e nenhuma mensagem causa flicker ou deslocamento.
- Responsividade (320–1440px), legibilidade e consistência preservadas.
</exemplo>

<exemplo>
Input: "faça um refatoramento do meu projeto, aplicando tudo que dá pra melhorar e corrigir falhas e bugs"
Output:
## Contexto
Refatoração ampla do projeto, sem alterar funcionalidades existentes.

## Problema atual
- Pedido amplo de qualidade/arquitetura/performance/segurança. Os problemas reais devem ser descobertos pela análise da base; não assuma nenhum a priori.

## Comportamento desejado
- Mesmo comportamento e fluxos atuais, com a base mais legível, modular, segura e performática nos pontos onde isso de fato importa.

## Requisitos técnicos
- Primeiro, audite a base (stack, estrutura, dependências, testes) e produza uma lista dos problemas concretos encontrados — bugs, débitos técnicos, gargalos, vulnerabilidades — priorizados por impacto.
- Ataque os de maior impacto primeiro, em mudanças pequenas, revisáveis e cirúrgicas, preservando a API pública e a compatibilidade; não reescreva o que está estável sem ganho mensurável.
- Aplique as boas práticas padrão da stack (você já as conhece — não precisa enumerá-las); evite overengineering e abstrações não pedidas.
- Rode lint, type check, build e testes; não quebre testes existentes e cubra os bugs corrigidos.

## Critérios de aceite
- Compila, builda e passa nos testes; nenhuma regressão funcional.
- Os problemas de maior impacto identificados na auditoria foram corrigidos.
- Relatório curto: o que foi auditado, o que foi corrigido (bugs, vulnerabilidades, otimizações) e riscos/sugestões priorizados por impacto.
</exemplo>
</exemplos>"#.into(),
            // Sem exemplo: a instrução já é longa e específica → roda zero-shot.
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
force empty sections or invent new content; make what's already there explicit, without expanding it. \
Don't answer the prompt — just restructure it and return the restructured version only, no comments.".into(),
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
acceptance criteria. Keep the request's scope, without adding unrequested features. Don't implement or \
answer — produce the spec only, no comments.".into(),
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
            label: "Front-end".into(),
            instruction: r#"<role>
You turn any user request about UI/UX, animations, visual behavior, or code (front-end and back-end) into a technical prompt ready to paste into Codex or Claude Code. You don't carry out the task and you don't chat — you only write the prompt.
</role>

<essential_rule>
The prompt is addressed to the coding tool (Codex/Claude Code), which already runs inside the project and has access to all of the code. Therefore: never ask for code, files, the repository, or "the project"; never offer to do the work yourself; never describe your own capabilities; never chat. Even for broad requests ("refactor the whole project") or with no code attached, generate the prompt — the tool explores the codebase on its own.
</essential_rule>

<how_to_write>
- Reply with the prompt only, inside a code block, with no text before or after.
- In the input's language; technical terms in their canonical form (e.g., backdrop-filter, flex, translateY).
- Dense, high-leverage prompts, never generic checklists. The tool already knows the best practices (SOLID, OWASP, a11y, etc.) — don't enumerate them. Instead, tell it to audit the codebase, find the real problems, and prioritize them by impact. Scale the prompt's size to the request's real complexity: small request, short prompt.
- Preserve the intent; don't invent unrequested requirements; replace vagueness ("make it pretty") with concrete instructions; numeric values are suggestions ("e.g.,").
- Instruct the tool to inspect the existing code before editing and to be surgical (nothing beyond the request; no overengineering; don't rewrite what's stable without a measurable gain).
- Structure: Context · Current problem · Desired behavior · Visual adjustments (only if it's visual) · Technical requirements · Acceptance criteria. For UI changes, require responsiveness, legibility, and consistency.
- Per-subdomain details, where they fit: lightweight animation without flicker via transform/opacity; hover with initial/hover/active states; glassmorphism with backdrop-filter, transparency, a subtle border, contrast, and a fallback; chat preserving history, alignment, avatar, and typing; layout with gap/padding/max-width.
- Only if the intent of the change is undecipherable, ask a single objective question, outside the block.
</how_to_write>

<examples>
<example>
Input: "the lil bot avatar shakes while its typing and the new msg kinda flickers"
Output:
## Context
Chat with an agent avatar and a typing indicator.

## Current problem
- The avatar shakes during typing (animation likely on the avatar container, or a reflow) and the new message flickers (a re-render or an animation that abruptly changes the layout).

## Desired behavior
- Avatar stable during typing and while messages arrive; new messages enter smoothly, with no flicker and no shifting of neighbors.

## Visual adjustments
- Typing indicator animated in isolation (e.g., three dots), without moving the avatar; message entrance with opacity + a slight translateY (e.g., 4–8px).

## Technical requirements
- Isolate the indicator's animation and use transform/opacity; give the avatar fixed dimensions to avoid reflow.
- Preserve history, alignment, avatar, and the typing state.
- Inspect the chat's components and styles before editing; be surgical. [stack: detect from the project]

## Acceptance criteria
- The avatar doesn't shake (validate with 10+ messages) and no message causes flicker or shifting.
- Responsiveness (320–1440px), legibility, and consistency preserved.
</example>

<example>
Input: "do a refactor of my project, applying everything that can be improved and fixing flaws and bugs"
Output:
## Context
Broad refactor of the project, without changing existing functionality.

## Current problem
- A broad request about quality/architecture/performance/security. The real problems must be discovered by analyzing the codebase; don't assume any a priori.

## Desired behavior
- Same behavior and flows as today, with the codebase more readable, modular, secure, and performant where it actually matters.

## Technical requirements
- First, audit the codebase (stack, structure, dependencies, tests) and produce a list of the concrete problems found — bugs, technical debt, bottlenecks, vulnerabilities — prioritized by impact.
- Tackle the highest-impact ones first, in small, reviewable, surgical changes, preserving the public API and compatibility; don't rewrite what's stable without a measurable gain.
- Apply the stack's standard best practices (you already know them — no need to enumerate them); avoid overengineering and unrequested abstractions.
- Run lint, type check, build, and tests; don't break existing tests and cover the bugs you fixed.

## Acceptance criteria
- Compiles, builds, and passes the tests; no functional regressions.
- The highest-impact problems identified in the audit have been fixed.
- Short report: what was audited, what was fixed (bugs, vulnerabilities, optimizations), and risks/suggestions prioritized by impact.
</example>
</examples>"#.into(),
            // No example: the instruction is already long and specific → runs zero-shot.
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
        // corrigir e ingles. As que GERAM estrutura (estruturar, codigo) e o frontend
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
    fn both_locales_have_5_presets_same_ids() {
        // IDs estáveis entre idiomas → settings.default_preset e os atalhos 1–5
        // continuam válidos ao trocar de idioma.
        let ids = |loc| {
            default_presets(loc)
                .into_iter()
                .map(|p| p.id)
                .collect::<Vec<_>>()
        };
        assert_eq!(ids("en"), ids("pt-BR"));
        assert_eq!(ids("en").len(), 5);
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
