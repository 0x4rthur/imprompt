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

    /// Abre a conexão com o provedor ANTES do 1º pedido (DNS + TCP + TLS), pra o
    /// refino seguinte não pagar esse custo. Não envia texto nem a chave. Padrão:
    /// não faz nada.
    fn warm_up(&self) {}
}

/// Limpeza da saída — o passo "chato mas essencial". Modelos às vezes embrulham o
/// prompt com preâmbulo ("Aqui está o prompt:"), um cabeçalho ("**Prompt
/// melhorado:**"), aspas, uma cerca markdown ou tokens de chat. Aqui a gente tira
/// esse lixo pra entregar só o texto.
///
/// REGRA DE OURO: na dúvida, não mexe. Cada passo só age em formas que não são
/// conteúdo legítimo (um resultado pode começar com "Claro!", "**Papel:**", "##"
/// ou uma aspa), e a limpeza nunca devolve vazio se o modelo respondeu algo.
#[cfg(test)]
pub(crate) fn clean_output(raw: &str) -> String {
    clean_output_for(raw, None)
}

/// Como `clean_output`, sabendo o texto do usuário: se o ORIGINAL já tinha a
/// forma de um preâmbulo (1ª linha terminando em ":", ou começando com o mesmo
/// abridor/cabeçalho), essa forma na saída é conteúdo e fica.
pub(crate) fn clean_output_for(raw: &str, user_text: Option<&str>) -> String {
    let user_lower = user_text.unwrap_or_default().trim().to_lowercase();
    let user_head: String = user_lower.chars().take(200).collect();
    let user_opens_with_colon_line = user_lower
        .lines()
        .next()
        .is_some_and(|l| l.trim_end().ends_with(':'));

    let mut s = raw.trim().to_string();

    // 0) Raciocínio embutido (<think>…</think>) antes da resposta: fora.
    if s.starts_with("<think>") {
        if let Some(end) = s.find("</think>") {
            s = s[end + "</think>".len()..].trim().to_string();
        }
    }

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
    let answered = s.clone(); // o que o modelo respondeu, sem tokens

    // 1b) Se a saída INTEIRA vier cercada em markdown, tira a cerca: o Imprompt
    //     cola texto puro onde o usuário está, então a cerca vira lixo.
    if let Some(inner) = unwrap_whole_fence(&s) {
        s = inner;
    }

    // Daqui pra baixo, `cut` marca se algum preâmbulo/cabeçalho foi cortado — só
    // nesse caso sobra pontuação solta ("**", ":") pra limpar no passo 4.
    let mut cut_any = false;

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
        if user_head.contains(m) {
            continue; // o próprio texto do usuário tem esse cabeçalho
        }
        if let Some(pos) = lower.find(m) {
            if pos < 200 {
                cut = cut.max(pos + m.len());
            }
        }
    }
    if cut > 0 && s.is_char_boundary(cut) {
        s = s[cut..].to_string();
        cut_any = true;
    }

    // 3) Remove preâmbulos conversacionais no começo (PT e EN). Só formas que
    //    terminam em ":" — palavras soltas ("Claro!", "Sure,") abrem respostas e
    //    mensagens de verdade, então NÃO entram aqui.
    let prefixes = [
        "aqui está o prompt:",
        "aqui está:",
        "aqui vai:",
        "segue o prompt:",
        "segue:",
        "here is:",
        "here's:",
    ];
    loop {
        let trimmed = s.trim_start();
        let lead = s.len() - trimmed.len();
        let lower = trimmed.to_lowercase();
        let hit = prefixes
            .iter()
            .find(|p| lower.starts_with(*p) && !user_lower.starts_with(*p))
            .map(|p| lead + p.len());
        match hit {
            Some(c) if s.is_char_boundary(c) => {
                s = s[c..].to_string();
                cut_any = true;
            }
            _ => break,
        }
    }

    // 3b) Preâmbulo de UMA linha: começa com um abridor conhecido, TERMINA em ":"
    //     e é seguido de conteúdo nas linhas de baixo (ex.: "Claro! Aqui está uma
    //     versão refinada:\n…"). Uma frase com ":" no meio ("Prazo: sexta.") ou
    //     uma resposta de uma linha só não é preâmbulo.
    s = s.trim_start().to_string();
    if !user_opens_with_colon_line {
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
            if let Some(nl) = s.find('\n') {
                let first = s[..nl].trim_end();
                let rest = s[nl + 1..].trim_start();
                if first.len() < 200 && first.ends_with(':') && !rest.is_empty() {
                    s = rest.to_string();
                    cut_any = true;
                }
            }
        }
    }

    // 4) Depois de um corte, tira a ênfase/pontuação solta que sobrou no começo
    //    (ex.: "**", ":"). Sem corte, "**Papel:**", "##" ou "- " são do resultado.
    if cut_any {
        s = s
            .trim_start_matches(|c: char| {
                matches!(c, '*' | '#' | ':' | '-' | '>') || c.is_whitespace()
            })
            .to_string();
    }
    s = s.trim().to_string();

    // 5) Tira aspas (ou ** **) que ENVOLVEM o texto inteiro: começa e termina com
    //    o delimitador e ele não aparece no meio (senão são trechos citados, não
    //    um embrulho). O guard evita mexer numa cerca ``` que tenha sobrado.
    for delim in ["\"", "'", "**", "`"] {
        if delim == "`" && s.starts_with("```") {
            continue;
        }
        if s.len() > delim.len() * 2 && s.starts_with(delim) && s.ends_with(delim) {
            let inner = &s[delim.len()..s.len() - delim.len()];
            if !inner.contains(delim) {
                s = inner.trim().to_string();
            }
        }
    }

    let s = s.trim().to_string();
    // A limpeza nunca transforma uma resposta em "sem resposta".
    if s.is_empty() {
        answered
    } else {
        s
    }
}

/// Se `s` INTEIRO é um bloco cercado (``` + linguagem opcional … ```), devolve o
/// miolo. A abertura pode ter 3+ crases; o fechamento é a ÚLTIMA linha, só crases,
/// com pelo menos o mesmo tanto. Se uma linha anterior também fecha o bloco, o
/// texto é "bloco, prosa, bloco" e fica como está — exceto quando a abertura não
/// tem linguagem de código (embrulho de prosa com blocos internos).
fn unwrap_whole_fence(s: &str) -> Option<String> {
    let n = s.chars().take_while(|c| *c == '`').count();
    if n < 3 {
        return None;
    }
    let first_nl = s.find('\n')?;
    // Depois das crases, a 1ª linha só pode ter um nome de linguagem (sem
    // espaços) — senão é conteúdo de verdade, não uma cerca.
    let lang = s[n..first_nl].trim();
    if !lang
        .chars()
        .all(|c| c.is_alphanumeric() || matches!(c, '+' | '-' | '#' | '_' | '.'))
    {
        return None;
    }
    let body = s[first_nl + 1..].trim_end();
    let (inner, last_line) = match body.rfind('\n') {
        Some(i) => (&body[..i], &body[i + 1..]),
        None => ("", body),
    };
    let closes = |line: &str| {
        let t = line.trim();
        t.len() >= n && t.chars().all(|c| c == '`')
    };
    if !closes(last_line) {
        return None;
    }
    let prose_wrapper = matches!(
        lang.to_ascii_lowercase().as_str(),
        "" | "markdown" | "md" | "text" | "txt" | "plaintext" | "plain"
    );
    if !prose_wrapper && inner.lines().any(closes) {
        return None;
    }
    Some(inner.trim().to_string())
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

    #[test]
    fn keeps_results_that_start_with_a_conversational_word() {
        // O preset Responder (e qualquer texto do usuário) pode começar assim.
        for s in [
            "Claro!",
            "Entendido.",
            "Sure, I'll send it by Friday.",
            "Sure thing — see you at 10:30 tomorrow.",
            "Segue em anexo o relatório atualizado. Prazo: sexta.",
            "Okay, vamos marcar para terça.",
        ] {
            assert_eq!(clean_output(s), s);
        }
    }

    #[test]
    fn still_strips_a_one_line_preamble_that_ends_in_a_colon() {
        assert_eq!(
            clean_output("Aqui está o prompt melhorado:\n\nEscreva um e-mail."),
            "Escreva um e-mail."
        );
        assert_eq!(
            clean_output("Claro! Aqui está uma versão refinada:\nEscreva um e-mail."),
            "Escreva um e-mail."
        );
        assert_eq!(
            clean_output("Sure, here's the refined version:\n\nWrite an email."),
            "Write an email."
        );
    }

    #[test]
    fn keeps_the_users_own_opening_line() {
        // O texto do usuário já tinha a forma "abridor … :" — é conteúdo.
        let user = "Aqui está meu código, me diga o que há de errado:\n```py\nx()\n```";
        let out = "Here is my code, tell me what's wrong:\n```py\nx()\n```";
        assert_eq!(super::clean_output_for(out, Some(user)), out);
    }

    #[test]
    fn keeps_leading_markdown_of_structured_results() {
        for s in [
            "**Papel:** Você é um redator.\n**Tarefa:** escreva.",
            "## Papel\nRedator\n## Contexto\nX",
            "- Objetivo: A\n- Prazo: B",
            "> citação\nresto",
        ] {
            assert_eq!(clean_output(s), s);
        }
    }

    #[test]
    fn unwrapped_code_keeps_its_first_character() {
        assert_eq!(
            clean_output("```c\n#include <stdio.h>\nint main(){}\n```"),
            "#include <stdio.h>\nint main(){}"
        );
    }

    #[test]
    fn two_separate_code_blocks_are_not_unwrapped() {
        let s = "```py\na()\n```\nFix this error:\n```\nTraceback\n```";
        assert_eq!(clean_output(s), s);
    }

    #[test]
    fn unwraps_a_four_backtick_wrapper_and_keeps_inner_fences() {
        assert_eq!(
            clean_output("````\n## Context\n```js\nx()\n```\n````"),
            "## Context\n```js\nx()\n```"
        );
        // Embrulho de prosa com 3 crases e bloco interno: segue desembrulhando.
        assert_eq!(
            clean_output("```\nIntro\n```js\nx()\n```\nfim\n```"),
            "Intro\n```js\nx()\n```\nfim"
        );
    }

    #[test]
    fn quotes_that_do_not_wrap_the_whole_text_stay() {
        let a = "\"Valor inválido\" must appear when the user types \"abc\"";
        assert_eq!(clean_output(a), a);
        let b = "`calcular_total` must call `somar`";
        assert_eq!(clean_output(b), b);
        assert_eq!(clean_output("\"Escreva um e-mail.\""), "Escreva um e-mail.");
    }

    #[test]
    fn drops_inline_reasoning() {
        assert_eq!(
            clean_output("<think>\nplan\n</think>\n\nFinal text"),
            "Final text"
        );
    }

    #[test]
    fn never_cleans_a_result_down_to_nothing() {
        assert_eq!(clean_output("Prompt melhorado:"), "Prompt melhorado:");
    }
}
