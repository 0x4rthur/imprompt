//! clipboard.rs — Captura o texto e devolve o resultado.
//!
//! Dois trabalhos:
//!  1. LER o que o usuário acabou de copiar (o 2º Ctrl+C já colocou no clipboard).
//!  2. ENTREGAR o resultado: ou substituindo no lugar (cola por cima da seleção),
//!     ou só deixando no clipboard pro usuário dar Ctrl+V quando quiser.
//!
//! `arboard` cuida de ler/escrever o clipboard (multiplataforma). `enigo`
//! simula o atalho de colar quando o modo é "substituir".

use anyhow::{anyhow, Result};
use arboard::Clipboard;

/// O que fazer com o resultado — espelha a preferência do usuário.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum OutputMode {
    /// Cola por cima da seleção, automaticamente.
    Replace,
    /// Só coloca no clipboard; o usuário dá Ctrl+V.
    Clipboard,
}

/// Lê o texto recém-copiado (a seleção do usuário). Caminho rápido: o gesto é um
/// DUPLO Ctrl+C, então o 1º Ctrl+C normalmente já populou o clipboard e uma
/// leitura não-vazia retorna NA HORA (sem penalizar o caso comum). Só quando o
/// clipboard está vazio agora — o copy do app em foco pode estar em voo num app
/// lento — fazemos um poll curto com timeout, para o gatilho parar de "não
/// disparar" de forma intermitente em vez de abortar mudo (ver auditoria BUG-2).
fn read_raw() -> Result<String> {
    let mut cb = Clipboard::new().map_err(|e| {
        anyhow!(crate::i18n::key_with_args(
            "err.clipboard.no_access",
            &[&e.to_string()]
        ))
    })?;
    // Caminho rápido (caso comum): já há texto não-vazio.
    if let Ok(t) = cb.get_text() {
        if !t.trim().is_empty() {
            return Ok(t);
        }
    }
    // Clipboard vazio agora: espera o copy chegar (apps lentos), até ~200ms.
    let deadline = std::time::Instant::now() + std::time::Duration::from_millis(200);
    loop {
        std::thread::sleep(std::time::Duration::from_millis(15));
        if let Ok(t) = cb.get_text() {
            if !t.trim().is_empty() {
                return Ok(t);
            }
        }
        if std::time::Instant::now() >= deadline {
            return Err(anyhow!("err.clipboard.empty"));
        }
    }
}

/// Separa o espaço em branco em volta do texto: `(início, miolo, fim)`. Uma
/// seleção só de espaço devolve tudo vazio.
pub fn split_wrap(raw: &str) -> (&str, &str, &str) {
    let core = raw.trim();
    if core.is_empty() {
        return ("", "", "");
    }
    let start = raw.len() - raw.trim_start().len();
    (&raw[..start], core, &raw[start + core.len()..])
}

/// Devolve ao resultado o espaço que cercava a seleção original.
pub fn rewrap(lead: &str, refined: &str, trail: &str) -> String {
    format!("{lead}{refined}{trail}")
}

/// Como `read_selection`, mas devolve também o espaço em branco que cercava o
/// texto: `(texto, início, fim)`.
pub fn read_selection_wrapped() -> Result<(String, String, String)> {
    let raw = read_raw()?;
    let (lead, core, trail) = split_wrap(&raw);
    Ok((core.to_string(), lead.to_string(), trail.to_string()))
}

/// Entrega o resultado conforme o modo escolhido.
pub fn deliver(result: &str, mode: OutputMode) -> Result<()> {
    // Em qualquer modo, o resultado vai pro clipboard.
    let mut cb = Clipboard::new().map_err(|e| {
        anyhow!(crate::i18n::key_with_args(
            "err.clipboard.no_access",
            &[&e.to_string()]
        ))
    })?;
    cb.set_text(result.to_string()).map_err(|e| {
        anyhow!(crate::i18n::key_with_args(
            "err.clipboard.write",
            &[&e.to_string()]
        ))
    })?;

    if mode == OutputMode::Replace {
        // Substituir = colar por cima. Como o texto ainda está selecionado no
        // app de origem, um Ctrl+V (Cmd+V no macOS) sobrescreve a seleção.
        paste_over_selection()?;
    }

    Ok(())
}

/// Simula o atalho de colar. Pequeno delay antes ajuda o foco a voltar pro app
/// de origem depois que a nossa janelinha some.
#[cfg(not(target_os = "macos"))]
fn paste_over_selection() -> Result<()> {
    use enigo::{Direction, Enigo, Key, Keyboard, Settings};
    // Falha de colar → chave i18n `err.clipboard.paste` com o detalhe técnico
    // anexado (traduzida na borda via tr_msg).
    let paste_err = |e: enigo::InputError| {
        anyhow!(crate::i18n::key_with_args(
            "err.clipboard.paste",
            &[&e.to_string()]
        ))
    };
    std::thread::sleep(std::time::Duration::from_millis(60));
    let mut enigo = Enigo::new(&Settings::default()).map_err(|e| {
        anyhow!(crate::i18n::key_with_args(
            "err.clipboard.paste",
            &[&e.to_string()]
        ))
    })?;
    enigo
        .key(Key::Control, Direction::Press)
        .map_err(paste_err)?;
    // SEMPRE solta o Control, mesmo se o 'v' falhar — senão o modificador fica
    // logicamente preso até o próximo evento real de teclado. Avalia o erro do
    // colar SÓ depois de garantir o Release, e propaga (em vez de engolir com .ok)
    // pra que o caminho Instant notifique a falha em vez de mentir que colou.
    let pasted = enigo.key(Key::Unicode('v'), Direction::Click);
    let released = enigo.key(Key::Control, Direction::Release);
    pasted.map_err(paste_err)?;
    released.map_err(paste_err)?;
    Ok(())
}

#[cfg(target_os = "macos")]
fn paste_over_selection() -> Result<()> {
    use enigo::{Direction, Enigo, Key, Keyboard, Settings};
    // Falha de colar → chave i18n `err.clipboard.paste_mac` com o detalhe técnico
    // anexado (traduzida na borda via tr_msg).
    let paste_err = |e: enigo::InputError| {
        anyhow!(crate::i18n::key_with_args(
            "err.clipboard.paste_mac",
            &[&e.to_string()]
        ))
    };
    std::thread::sleep(std::time::Duration::from_millis(60));
    let mut enigo = Enigo::new(&Settings::default()).map_err(|e| {
        anyhow!(crate::i18n::key_with_args(
            "err.clipboard.paste_mac",
            &[&e.to_string()]
        ))
    })?;
    enigo.key(Key::Meta, Direction::Press).map_err(paste_err)?; // Cmd no macOS
                                                                // SEMPRE solta o Cmd, mesmo se o 'v' falhar (ver versão não-macOS).
    let pasted = enigo.key(Key::Unicode('v'), Direction::Click);
    let released = enigo.key(Key::Meta, Direction::Release);
    pasted.map_err(paste_err)?;
    released.map_err(paste_err)?;
    Ok(())
}

// NOTA (Linux): assim como no Handy, em Wayland o "colar" simulado pode precisar
// de ferramentas externas (wtype/ydotool) e pode não funcionar em todos os
// compositores. No modo "Clipboard" (Ctrl+V manual) você evita esse problema —
// vale considerar deixá-lo como padrão no Linux.

#[cfg(test)]
mod tests {
    use super::{rewrap, split_wrap};

    #[test]
    fn keeps_the_whitespace_around_the_selection() {
        // Seleção de linha inteira inclui a quebra do fim: colar sem ela juntaria
        // o resultado com o parágrafo de baixo.
        let (lead, core, trail) = split_wrap("  olá mundo\r\n");
        assert_eq!((lead, core, trail), ("  ", "olá mundo", "\r\n"));
        assert_eq!(rewrap(lead, "Olá, mundo!", trail), "  Olá, mundo!\r\n");
        assert_eq!(split_wrap("sem espaço"), ("", "sem espaço", ""));
        assert_eq!(split_wrap(" \n "), ("", "", ""));
    }
}
