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
pub fn read_selection() -> Result<String> {
    let mut cb = Clipboard::new().map_err(|e| anyhow!("Sem acesso ao clipboard: {e}"))?;
    // Caminho rápido (caso comum): já há texto não-vazio.
    if let Ok(t) = cb.get_text() {
        let trimmed = t.trim();
        if !trimmed.is_empty() {
            return Ok(trimmed.to_string());
        }
    }
    // Clipboard vazio agora: espera o copy chegar (apps lentos), até ~200ms.
    let deadline = std::time::Instant::now() + std::time::Duration::from_millis(200);
    loop {
        std::thread::sleep(std::time::Duration::from_millis(15));
        if let Ok(t) = cb.get_text() {
            let trimmed = t.trim();
            if !trimmed.is_empty() {
                return Ok(trimmed.to_string());
            }
        }
        if std::time::Instant::now() >= deadline {
            return Err(anyhow!("Nada de texto selecionado."));
        }
    }
}

/// Entrega o resultado conforme o modo escolhido.
pub fn deliver(result: &str, mode: OutputMode) -> Result<()> {
    // Em qualquer modo, o resultado vai pro clipboard.
    let mut cb = Clipboard::new().map_err(|e| anyhow!("Sem acesso ao clipboard: {e}"))?;
    cb.set_text(result.to_string())
        .map_err(|e| anyhow!("Falha ao escrever no clipboard: {e}"))?;

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
    std::thread::sleep(std::time::Duration::from_millis(60));
    let mut enigo = Enigo::new(&Settings::default()).map_err(|e| anyhow!("enigo: {e}"))?;
    enigo
        .key(Key::Control, Direction::Press)
        .map_err(|e| anyhow!("enigo: {e}"))?;
    // SEMPRE solta o Control, mesmo se o 'v' falhar — senão o modificador fica
    // logicamente preso até o próximo evento real de teclado. Avalia o erro do
    // colar SÓ depois de garantir o Release, e propaga (em vez de engolir com .ok)
    // pra que o caminho Instant notifique a falha em vez de mentir que colou.
    let pasted = enigo.key(Key::Unicode('v'), Direction::Click);
    let released = enigo.key(Key::Control, Direction::Release);
    pasted.map_err(|e| anyhow!("Falha ao colar (Ctrl+V): {e}"))?;
    released.map_err(|e| anyhow!("enigo: {e}"))?;
    Ok(())
}

#[cfg(target_os = "macos")]
fn paste_over_selection() -> Result<()> {
    use enigo::{Direction, Enigo, Key, Keyboard, Settings};
    std::thread::sleep(std::time::Duration::from_millis(60));
    let mut enigo = Enigo::new(&Settings::default()).map_err(|e| anyhow!("enigo: {e}"))?;
    enigo
        .key(Key::Meta, Direction::Press)
        .map_err(|e| anyhow!("enigo: {e}"))?; // Cmd no macOS
                                              // SEMPRE solta o Cmd, mesmo se o 'v' falhar (ver versão não-macOS).
    let pasted = enigo.key(Key::Unicode('v'), Direction::Click);
    let released = enigo.key(Key::Meta, Direction::Release);
    pasted.map_err(|e| anyhow!("Falha ao colar (Cmd+V): {e}"))?;
    released.map_err(|e| anyhow!("enigo: {e}"))?;
    Ok(())
}

// NOTA (Linux): assim como no Handy, em Wayland o "colar" simulado pode precisar
// de ferramentas externas (wtype/ydotool) e pode não funcionar em todos os
// compositores. No modo "Clipboard" (Ctrl+V manual) você evita esse problema —
// vale considerar deixá-lo como padrão no Linux.
