//! engine.rs — Interface estável (trait `Engine`) + saneamento da saída
//! (`clean_output`), compartilhados pelo `ApiEngine`.
//!
//! O Imprompt fala com o motor pela trait `Engine`: quem chama (commands.rs) não
//! precisa saber QUAL implementação está por baixo. Hoje há uma só — o `ApiEngine`
//! (motor de API externa, em api_engine.rs). A limpeza de saída mora aqui porque é
//! independente do motor: tira preâmbulos, cabeçalhos, aspas e cercas de markdown
//! que o modelo às vezes embrulha no resultado.

use anyhow::Result;

/// Interface estável com o resto do app. Quem chama (commands.rs) não precisa
/// saber QUAL motor está por baixo.
pub trait Engine: Send + Sync {
    /// Roda um refino: o system prompt (base+diretiva, SEM exemplo), um exemplo
    /// few-shot OPCIONAL `(entrada, saída)` montado como TURNOS de conversa, e o
    /// texto do usuário. Devolve o texto melhorado e já limpo.
    fn refine(
        &self,
        system_prompt: &str,
        example: Option<(&str, &str)>,
        user_text: &str,
    ) -> Result<String>;
}

/// Limpeza da saída — o passo "chato mas essencial". Modelos às vezes embrulham o
/// prompt com preâmbulo ("Entendido…"), um cabeçalho ("**Prompt melhorado:**"),
/// aspas ou tokens de chat. Aqui a gente tira esse lixo pra entregar só o prompt
/// limpo.
pub(crate) fn clean_output(raw: &str) -> String {
    let mut s = raw.trim().to_string();

    // 1) Remove tokens de chat que possam ter vazado.
    for tok in [
        "<|im_start|>assistant",
        "<|im_end|>",
        "<|im_start|>",
        "<|endoftext|>",
        "<|startoftext|>",
    ] {
        s = s.replace(tok, "");
    }
    s = s.trim().to_string();

    // 1b) Se a saída INTEIRA vier cercada em markdown (```lang ... ```), tira a
    //     cerca. O Imprompt cola texto puro onde o usuário está, então a cerca
    //     vira lixo (acontece bastante no preset de código). Só age quando a 1ª
    //     linha é SÓ a abertura (``` + um nome de linguagem opcional) e o texto
    //     TERMINA numa cerca de fechamento; cercas internas — parte legítima do
    //     conteúdo — ficam intactas (não embrulham tudo, então não disparam).
    if s.starts_with("```") {
        if let Some(first_nl) = s.find('\n') {
            // A 1ª linha, depois das 3 crases, só pode ter um nome de linguagem
            // (sem espaços) — senão é conteúdo de verdade, não uma cerca.
            let lang = s[3..first_nl].trim();
            let is_fence_open = lang
                .chars()
                .all(|c| c.is_alphanumeric() || matches!(c, '+' | '-' | '#' | '_' | '.'));
            if is_fence_open {
                let body = s[first_nl + 1..].trim_end();
                // A cerca de fechamento é o ÚLTIMO ``` e tem que estar no fim.
                if let Some(close) = body.rfind("```") {
                    if body[close + 3..].trim().is_empty() {
                        s = body[..close].trim().to_string();
                    }
                }
            }
        }
    }

    // 2) Se houver um cabeçalho tipo "Prompt melhorado:" no começo, fica só com o
    //    que vem DEPOIS dele (corta o preâmbulo + o cabeçalho). Só procura nos
    //    primeiros caracteres, pra não cortar conteúdo legítimo lá no meio.
    let markers = [
        "prompt melhorado:",
        "prompt aprimorado:",
        "prompt refinado:",
        "versão melhorada:",
        "improved prompt:",
        "refined prompt:",
        "here's the improved prompt:",
        "prompt reescrito:",
        "prompt reformulado:",
    ];
    let lower = s.to_lowercase();
    let mut cut = 0usize;
    for m in markers {
        if let Some(pos) = lower.find(m) {
            if pos < 200 {
                cut = cut.max(pos + m.len());
            }
        }
    }
    if cut > 0 && s.is_char_boundary(cut) {
        s = s[cut..].to_string();
    }

    // 3) Remove preâmbulos conversacionais comuns no começo (PT e EN).
    let prefixes = [
        "aqui está o prompt:",
        "aqui está:",
        "aqui vai:",
        "segue o prompt:",
        "segue:",
        "entendido.",
        "entendido,",
        "claro!",
        "claro,",
        "here is:",
        "here's:",
        "sure,",
        "okay,",
    ];
    loop {
        let trimmed = s.trim_start();
        let lead = s.len() - trimmed.len();
        let lower = trimmed.to_lowercase();
        let hit = prefixes
            .iter()
            .find(|p| lower.starts_with(*p))
            .map(|p| lead + p.len());
        match hit {
            Some(c) if s.is_char_boundary(c) => s = s[c..].to_string(),
            _ => break,
        }
    }

    // 3b) Preâmbulo de UMA frase que começa com um abridor conhecido e termina
    //     em ":" (ex.: "aqui está uma versão refinada do prompt:"). Corta até o
    //     ":". Seguro: só dispara com abridor + frase única (sem quebra antes do
    //     ":"), então não quebra o preset "estruturar" (que começa com "Papel:").
    s = s.trim_start().to_string();
    {
        let lower = s.to_lowercase();
        let openers = [
            "aqui está",
            "aqui vai",
            "segue",
            "claro",
            "entendido",
            "com certeza",
            "here is",
            "here's",
            "sure",
        ];
        if openers.iter().any(|o| lower.starts_with(o)) {
            if let Some(colon) = s.find(':') {
                if colon < 200 && !s[..colon].contains('\n') {
                    s = s[colon + 1..].trim_start().to_string();
                }
            }
        }
    }

    // 4) Tira ênfase/pontuação solta que sobrou no começo (ex.: "**", "#", ":").
    s = s
        .trim_start_matches(|c: char| matches!(c, '*' | '#' | ':' | '-' | '>') || c.is_whitespace())
        .to_string();
    s = s.trim().to_string();

    // 5) Tira aspas (ou ** **) que envolvem o texto inteiro. A cerca markdown que
    //    embrulha TUDO já saiu no passo 1b; aqui o guard evita que a regra de uma
    //    crase só (`) mexa numa cerca ``` interna ou solta que tenha sobrado.
    for (open, close) in [("\"", "\""), ("'", "'"), ("**", "**"), ("`", "`")] {
        if open == "`" && s.starts_with("```") {
            continue;
        }
        if s.len() > open.len() + close.len() && s.starts_with(open) && s.ends_with(close) {
            s = s[open.len()..s.len() - close.len()].trim().to_string();
        }
    }

    s.trim().to_string()
}

#[cfg(test)]
mod tests {
    use super::clean_output;

    #[test]
    fn strips_preamble_and_quotes() {
        let raw = "Prompt melhorado: \"Escreva um e-mail formal.\"<|im_end|>";
        assert_eq!(clean_output(raw), "Escreva um e-mail formal.");
    }

    #[test]
    fn leaves_clean_text_alone() {
        let raw = "Escreva um e-mail formal pedindo aumento.";
        assert_eq!(clean_output(raw), raw);
    }

    #[test]
    fn strips_conversational_preamble_and_header() {
        let raw = "Entendido. Aqui está uma versão melhorada.\n\n**Prompt Melhorado:**\nEscreva um e-mail formal.";
        assert_eq!(clean_output(raw), "Escreva um e-mail formal.");
    }

    #[test]
    fn strips_full_markdown_fence() {
        // Cerca com linguagem (caso pedido).
        assert_eq!(clean_output("```python\ncodigo\n```"), "codigo");
        // Cerca sem linguagem.
        assert_eq!(clean_output("```\ncodigo\n```"), "codigo");
        // Cerca INTERNA legítima (não embrulha tudo) NÃO é mexida.
        let inner = "Use isto:\n```js\nx()\n```\nfim";
        assert_eq!(clean_output(inner), inner);
    }
}
