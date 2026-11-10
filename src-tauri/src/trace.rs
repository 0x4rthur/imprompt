//! trace.rs — rastro de diagnóstico do popup (`popup-trace.log`, na pasta de dados).
//!
//! O popup manda linhas com teclas, presets escolhidos, pedidos e tempos — NUNCA
//! o texto do usuário nem o resultado. Serve pra ver o que aconteceu de verdade
//! quando alguém relata um comportamento estranho (em vez de adivinhar). O
//! arquivo é pequeno: passando do limite, só o final é mantido.

use std::time::{SystemTime, UNIX_EPOCH};

/// Tamanho máximo do arquivo.
const MAX_BYTES: usize = 96 * 1024;
/// Limites por chamada: o arquivo não cresce à toa nem com uma chamada estranha.
const MAX_LINES: usize = 400;
const MAX_LINE_CHARS: usize = 160;

/// Bloco de uma sessão do popup, pronto pra anexar. PURA → testável.
pub fn block(version: &str, unix_secs: u64, lines: &[String]) -> String {
    let mut out = format!("--- {unix_secs} v{version}\n");
    for line in lines.iter().take(MAX_LINES) {
        let clean: String = line
            .chars()
            .filter(|c| !c.is_control())
            .take(MAX_LINE_CHARS)
            .collect();
        out.push_str(&clean);
        out.push('\n');
    }
    out
}

/// Junta o que já havia com o bloco novo; passando de `max`, mantém só o FINAL,
/// em linhas inteiras. PURA → testável.
pub fn capped(existing: &str, addition: &str, max: usize) -> String {
    let mut all = String::with_capacity(existing.len() + addition.len());
    all.push_str(existing);
    all.push_str(addition);
    if all.len() <= max {
        return all;
    }
    let mut cut = all.len() - max;
    while !all.is_char_boundary(cut) {
        cut += 1;
    }
    match all[cut..].find('\n') {
        Some(newline) => all[cut + newline + 1..].to_string(),
        None => String::new(),
    }
}

/// Anexa as linhas ao arquivo de rastro. Erro aqui nunca atrapalha o popup: quem
/// chama ignora.
pub fn append(lines: &[String]) -> anyhow::Result<()> {
    append_in(&crate::settings::data_dir()?, lines)
}

fn append_in(dir: &std::path::Path, lines: &[String]) -> anyhow::Result<()> {
    let path = dir.join("popup-trace.log");
    let existing = std::fs::read_to_string(&path).unwrap_or_default();
    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0);
    let next = capped(
        &existing,
        &block(env!("CARGO_PKG_VERSION"), now, lines),
        MAX_BYTES,
    );
    std::fs::write(&path, next)?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::{append_in, block, capped};

    #[test]
    fn each_popup_session_is_appended_to_the_file() {
        let dir = std::env::temp_dir().join(format!("imprompt-trace-test-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        append_in(&dir, &["1 open preset=corrigir".to_string()]).unwrap();
        append_in(&dir, &["2 enter state=idle".to_string()]).unwrap();
        let saved = std::fs::read_to_string(dir.join("popup-trace.log")).unwrap();
        std::fs::remove_dir_all(&dir).ok();
        let lines: Vec<&str> = saved.lines().collect();
        assert_eq!(lines.len(), 4);
        assert!(
            lines[0].starts_with("--- ")
                && lines[0].ends_with(concat!(" v", env!("CARGO_PKG_VERSION")))
        );
        assert_eq!(lines[1], "1 open preset=corrigir");
        assert!(lines[2].starts_with("--- "));
        assert_eq!(lines[3], "2 enter state=idle");
    }

    #[test]
    fn a_block_has_a_header_and_one_clean_line_per_event() {
        let lines = vec![
            "12 enter state=idle".to_string(),
            "40 a\tb\r\nc".to_string(),
        ];
        assert_eq!(
            block("0.1.18", 1_800_000_000, &lines),
            "--- 1800000000 v0.1.18\n12 enter state=idle\n40 abc\n"
        );
    }

    #[test]
    fn a_block_is_bounded_in_lines_and_in_line_length() {
        let many: Vec<String> = (0..1000).map(|i| format!("{i} x")).collect();
        assert_eq!(block("v", 0, &many).lines().count(), 1 + 400);
        let long = vec!["é".repeat(500)];
        let out = block("v", 0, &long);
        assert_eq!(out.lines().nth(1).unwrap().chars().count(), 160);
    }

    #[test]
    fn the_log_keeps_only_its_tail_in_whole_lines() {
        assert_eq!(capped("a\nb\n", "c\n", 100), "a\nb\nc\n");
        // Passou do limite: o começo sai, sempre numa quebra de linha.
        assert_eq!(capped("aaaa\nbbbb\n", "cccc\n", 11), "bbbb\ncccc\n");
        assert_eq!(capped("aaaa\nbbbb\n", "cccc\n", 7), "cccc\n");
        // Corte no meio de um caractere de vários bytes não quebra nada.
        let out = capped("ééééé\n", "ok\n", 6);
        assert_eq!(out, "ok\n");
        // Uma linha maior que o limite inteiro: nada sobra dela.
        assert_eq!(capped("", "abcdefghij", 4), "");
    }
}
