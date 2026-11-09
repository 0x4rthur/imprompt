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

/// O que aconteceu com o resultado na entrega.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Delivery {
    /// Colado por cima da seleção.
    Pasted,
    /// Só copiado (modo "Copiar", ou preset de resposta).
    Copied,
    /// Era pra colar, mas a janela de onde o texto veio não está mais na frente
    /// (o usuário trocou de janela enquanto a API respondia): ficou no clipboard.
    CopiedWindowChanged,
}

/// A janela que estava na frente quando o texto foi capturado — é nela que o
/// resultado deve ser colado. `hwnd == 0` = desconhecida (fora do Windows).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
pub struct Origin {
    pub hwnd: isize,
    pub pid: u32,
}

/// Duas funções triviais do user32, declaradas direto (sem dependência nova).
#[cfg(windows)]
mod win {
    #[link(name = "user32")]
    extern "system" {
        pub fn GetClipboardSequenceNumber() -> u32;
        pub fn GetForegroundWindow() -> isize;
        pub fn GetWindowThreadProcessId(hwnd: isize, pid: *mut u32) -> u32;
        pub fn IsWindow(hwnd: isize) -> i32;
    }
}

/// Contador de mudanças do clipboard: sobe a cada cópia. 0 = indisponível.
pub fn sequence() -> u32 {
    #[cfg(windows)]
    // SAFETY: função sem parâmetros nem pré-condições.
    unsafe {
        win::GetClipboardSequenceNumber()
    }
    #[cfg(not(windows))]
    0
}

/// A janela em primeiro plano agora.
pub fn foreground() -> Origin {
    #[cfg(windows)]
    // SAFETY: GetForegroundWindow não tem pré-condições; o ponteiro de saída do
    // pid aponta pra uma variável local viva durante a chamada.
    unsafe {
        let hwnd = win::GetForegroundWindow();
        let mut pid = 0u32;
        if hwnd != 0 {
            win::GetWindowThreadProcessId(hwnd, &mut pid);
        }
        Origin { hwnd, pid }
    }
    #[cfg(not(windows))]
    Origin::default()
}

/// A janela `hwnd` ainda existe?
fn window_alive(hwnd: isize) -> bool {
    #[cfg(windows)]
    // SAFETY: IsWindow aceita qualquer valor de handle.
    unsafe {
        win::IsWindow(hwnd) != 0
    }
    #[cfg(not(windows))]
    {
        let _ = hwnd;
        false
    }
}

/// PURA → testável. O clipboard mudou desde `before`? Sem contador (0) não dá
/// pra saber: assume que sim (comportamento antigo).
pub fn seq_changed(before: u32, now: u32) -> bool {
    before == 0 || now == 0 || now != before
}

/// Algo foi copiado desde `before` (o contador lido no 1º toque do atalho)?
/// Espera um pouco por apps lentos pra copiar. `None` = sem como saber → sim.
pub fn copied_since(before: Option<u32>) -> bool {
    let Some(before) = before else {
        return true;
    };
    let deadline = std::time::Instant::now() + std::time::Duration::from_millis(500);
    loop {
        if seq_changed(before, sequence()) {
            return true;
        }
        if std::time::Instant::now() >= deadline {
            return false;
        }
        std::thread::sleep(std::time::Duration::from_millis(15));
    }
}

/// PURA → testável. O resultado pode ser colado em `now`? Sim se é a MESMA
/// janela da captura; ou se aquela janela era passageira e já não existe
/// (um menu, uma caixa) e quem está na frente é o mesmo app.
pub fn same_place(origin: Origin, origin_alive: bool, now: Origin) -> bool {
    if origin.hwnd == 0 {
        return true; // origem desconhecida: comportamento antigo
    }
    now.hwnd == origin.hwnd || (!origin_alive && now.pid != 0 && now.pid == origin.pid)
}

/// Espera a janela de origem voltar pra frente depois que a nossa some. Dá o
/// tempo do foco assentar (60 ms, como antes) e confere por até ~300 ms.
fn origin_in_front(origin: Origin) -> bool {
    std::thread::sleep(std::time::Duration::from_millis(60));
    if origin.hwnd == 0 {
        return true;
    }
    let deadline = std::time::Instant::now() + std::time::Duration::from_millis(300);
    loop {
        if same_place(origin, window_alive(origin.hwnd), foreground()) {
            return true;
        }
        if std::time::Instant::now() >= deadline {
            return false;
        }
        std::thread::sleep(std::time::Duration::from_millis(20));
    }
}

/// Entrega o resultado conforme o modo escolhido, colando SÓ se a janela de
/// origem estiver na frente. Em qualquer caso o resultado fica no clipboard.
pub fn deliver_to(result: &str, mode: OutputMode, origin: Origin) -> Result<Delivery> {
    set_clipboard(result)?;
    if mode != OutputMode::Replace {
        return Ok(Delivery::Copied);
    }
    if !origin_in_front(origin) {
        return Ok(Delivery::CopiedWindowChanged);
    }
    // Substituir = colar por cima. Como o texto ainda está selecionado no app de
    // origem, um Ctrl+V (Cmd+V no macOS) sobrescreve a seleção.
    paste_over_selection()?;
    Ok(Delivery::Pasted)
}

/// Entrega sem conferir a janela (usado pelo "Desfazer" da bandeja).
pub fn deliver(result: &str, mode: OutputMode) -> Result<()> {
    deliver_to(result, mode, Origin::default()).map(|_| ())
}

fn set_clipboard(result: &str) -> Result<()> {
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
    })
}

/// Simula o atalho de colar (a espera pro foco voltar ao app de origem fica em
/// `origin_in_front`).
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
    // No Windows, a tecla V pelo CÓDIGO VIRTUAL: `Unicode('v')` é resolvido pelo
    // layout do teclado e falha onde a letra não existe (russo, grego, hebraico).
    #[cfg(windows)]
    let v = Key::V;
    #[cfg(not(windows))]
    let v = Key::Unicode('v');
    let pasted = enigo.key(v, Direction::Click);
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
    use super::{rewrap, same_place, seq_changed, split_wrap, Origin};

    #[test]
    fn a_copy_is_detected_by_the_clipboard_counter() {
        assert!(seq_changed(41, 42)); // copiou
        assert!(!seq_changed(42, 42)); // nada novo no clipboard
        assert!(seq_changed(0, 42)); // sem contador no 1º toque: não dá pra saber
        assert!(seq_changed(42, 0));
    }

    #[test]
    fn pastes_only_where_the_text_came_from() {
        let origin = Origin { hwnd: 100, pid: 7 };
        // Mesma janela na frente: cola.
        assert!(same_place(origin, true, Origin { hwnd: 100, pid: 7 }));
        // Outra janela (até do mesmo app): não cola.
        assert!(!same_place(origin, true, Origin { hwnd: 200, pid: 7 }));
        assert!(!same_place(origin, true, Origin { hwnd: 300, pid: 9 }));
        // Nada na frente ainda (foco em transição): não cola (ainda).
        assert!(!same_place(origin, true, Origin::default()));
        // A janela de origem era passageira e sumiu: vale o mesmo app na frente.
        assert!(same_place(origin, false, Origin { hwnd: 200, pid: 7 }));
        assert!(!same_place(origin, false, Origin { hwnd: 300, pid: 9 }));
        // Origem desconhecida (fora do Windows): comportamento antigo.
        assert!(same_place(
            Origin::default(),
            false,
            Origin { hwnd: 300, pid: 9 }
        ));
    }

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
