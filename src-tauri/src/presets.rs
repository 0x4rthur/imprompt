//! presets.rs — O coração do produto.
//!
//! Cada preset é só um SYSTEM PROMPT. O modelo é o mesmo; o que muda é a
//! instrução. Adicionar um preset = adicionar uma entrada aqui. Sem retreino.
//!
//! ── Princípios (validados por pesquisa de engenharia de prompt) ──────────────
//!  1) UTILIDADE POR TOKEN: o que dilui (listas de proibição) sai; o que ensina
//!     (o exemplo) fica. Instrução enxuta — o exemplo carrega o peso.
//!  2) UM exemplo por preset, REPRESENTATIVO da tarefa. Em modelo pequeno, o
//!     exemplo ajuda muito mais que em modelo grande (ganhos de ~5-10%+ vs ~1%).
//!     Exagerar no nº de exemplos PIORA ("few-shot dilemma"); um exemplo atípico
//!     pode derrubar abaixo do zero-shot — por isso cada exemplo é um caso típico.
//!  3) CONTEÚDO FIXO PRIMEIRO (base + preset), texto do usuário por último: deixa
//!     o prefixo cacheável (prompt/prefix caching) — o custo do exemplo é pago
//!     uma vez, não a cada chamada.
//!  4) Formato do exemplo com "→": o modelo não copia isso como rótulo na saída.
//!
//! Quando um preset escorregar, AJUSTE O EXEMPLO (não volte a empilhar regras).
//! E o caminho definitivo de velocidade é fine-tuning: ele "absorve" os exemplos,
//! aí dá pra removê-los do prompt (mais rápido E preciso).
//!
//! ATUAL: o engine usa FEW-SHOT por TURNOS de conversa (configurável via
//! `use_examples`, default on). Antes rodávamos zero-shot porque o exemplo, quando
//! CONCATENADO no system prompt, vazava pra saída nos modelos minúsculos (<1B) —
//! que já foram removidos. Com os modelos atuais (modelos via API, ex.: gpt-4o-mini) e
//! o exemplo montado como turnos (user=entrada, assistant=saída) em vez de texto
//! solto no system, ele AJUDA e não vaza. Por isso cada preset guarda a entrada e
//! a saída SEPARADAS (`example_input`/`example_output`), pra montar os turnos.

use std::collections::{HashMap, HashSet};
use std::path::PathBuf;

use anyhow::{anyhow, Result};
use serde::{Deserialize, Serialize};

/// Base enxuta e positiva, sempre presente. A cláusula final deixa o preset de
/// tradução sobrescrever o idioma sem contradição.
pub const BASE_INSTRUCTION: &str = "Você transforma o texto do usuário em um prompt claro e eficaz para uma IA. \
Responda apenas com o prompt reescrito — o texto final, pronto para colar — sem comentários nem preâmbulo. \
Preserve o idioma do original, a menos que a tarefa peça outro.";

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
    /// system prompt final = base + diretiva (SEM o exemplo — ele vai por turnos).
    pub fn system_prompt(&self) -> String {
        format!("{}\n\n{}", BASE_INSTRUCTION, self.instruction)
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

/// Os 5 presets. Ordem importa: vira o atalho 1–5 no popup.
/// (`\` no fim da linha continua a string sem quebrar; `\n` insere uma quebra
/// real — é assim que controlamos exatamente o que o modelo lê.)
pub fn default_presets() -> Vec<Preset> {
    vec![
        Preset {
            id: "estruturar".into(),
            label: "Estruturar".into(),
            instruction: "Dê estrutura clara ao prompt: defina papel, contexto, tarefa e formato de \
saída, em ordem lógica.".into(),
            example_input: "me ajuda a escrever um email de cobrança pra um cliente atrasado".into(),
            example_output: "Papel: assistente de cobrança cordial. Contexto: cliente com pagamento atrasado. \
Tarefa: escreva um e-mail lembrando do valor e da data e oferecendo ajuda. \
Tom: firme e respeitoso. Saída: somente o e-mail.".into(),
        },
        Preset {
            id: "codigo".into(),
            label: "Prompt de código".into(),
            instruction: "Transforme em uma tarefa de engenharia precisa: o que construir, restrições, \
casos de borda, tecnologia quando indicada, e o formato exato da saída.".into(),
            example_input: "faz um código que ordena uma lista".into(),
            example_output: "Escreva uma função em Python que ordena uma lista de inteiros em ordem crescente. \
Restrições: não usar sorted(); tratar lista vazia; O(n log n). Saída: apenas o código, com um comentário breve.".into(),
        },
        Preset {
            id: "corrigir".into(),
            label: "Corrigir & clarear".into(),
            instruction: "Corrija gramática, ortografia e ambiguidade, deixando a intenção inequívoca. \
Mantenha o tamanho e o tom do original (não expanda).".into(),
            example_input: "qero q vc escreva um resumo sobre os planeta do sistema solar pq tenho prova".into(),
            example_output: "Quero que você escreva um resumo sobre os planetas do sistema solar, porque tenho prova.".into(),
        },
        Preset {
            id: "ingles".into(),
            label: "Traduzir p/ EN".into(),
            instruction: "Reescreva o prompt em inglês claro e idiomático para uma IA, preservando 100% \
da intenção. Devolva apenas a versão em inglês.".into(),
            example_input: "escreve um email formal pedindo reembolso de um produto com defeito".into(),
            example_output: "Write a formal email requesting a refund for a defective product, clearly stating the issue and the desired resolution.".into(),
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

/// Acha um preset pelo id (ou cai no primeiro como fallback seguro). TOTAL: nunca
/// faz panic — se a fatia estiver vazia (lista totalmente escondida + sem custom),
/// cai num preset padrão (default_presets sempre tem ≥1).
pub fn find_preset(presets: &[Preset], id: &str) -> Preset {
    presets
        .iter()
        .find(|p| p.id == id)
        .cloned()
        .or_else(|| presets.first().cloned())
        .unwrap_or_else(|| default_presets().swap_remove(0))
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
        .ok_or_else(|| anyhow!("Não achei a pasta de config do sistema."))?
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

/// O id pertence a um preset PADRÃO?
pub fn is_default_id(id: &str) -> bool {
    default_presets().iter().any(|p| p.id == id)
}

/// Lista COMPLETA: padrões (com overrides aplicados, pulando os hidden) + custom.
pub fn all_presets() -> Vec<Preset> {
    all_presets_from(&load_store())
}

/// PURA → testável. Aplica overrides nos padrões, pula os hidden, e anexa os
/// custom (ids únicos; padrão tem prioridade na ordem).
pub fn all_presets_from(store: &PresetStore) -> Vec<Preset> {
    let effective_defaults: Vec<Preset> = default_presets()
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
        all_presets_from, default_presets, find_preset, merge_unique, slugify, unique_id, Preset,
        PresetStore,
    };
    use std::collections::HashSet;

    #[test]
    fn presets_expose_examples_except_frontend() {
        for p in default_presets() {
            if p.id == "frontend" {
                assert!(!p.has_example(), "frontend não tem exemplo (zero-shot)");
            } else {
                assert!(
                    p.has_example(),
                    "preset '{}' deveria ter exemplo few-shot",
                    p.id
                );
                // O exemplo NÃO pode mais estar embutido na diretiva.
                assert!(
                    !p.instruction.contains("Exemplo:"),
                    "'{}' ainda embute o exemplo",
                    p.id
                );
            }
        }
    }

    #[test]
    fn system_prompt_has_base_and_directive_but_not_example() {
        let p = find_preset(&default_presets(), "estruturar");
        let sys = p.system_prompt();
        assert!(sys.starts_with("Você transforma")); // base
        assert!(sys.contains("Dê estrutura clara")); // diretiva
        assert!(!sys.contains("cobrança")); // o exemplo NÃO entra no system prompt
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
        let defaults = default_presets();
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
        let all = all_presets_from(&store);
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
        assert!(all_presets().iter().any(|p| p.id == "selftest-xyz"));
        // Restaura o estado original (não deixa lixo).
        save_user_presets(&original).unwrap();
        assert!(!load_user_presets().iter().any(|p| p.id == "selftest-xyz"));
    }
}
