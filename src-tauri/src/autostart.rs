//! autostart.rs — a inicialização com o sistema pode ser DESATIVADA por fora.
//!
//! Quem liga/desliga "Iniciar com o sistema" é o plugin de autostart: ele grava o
//! comando do app em `HKCU\…\CurrentVersion\Run`. Mas o Windows tem um segundo
//! interruptor, o do Gerenciador de Tarefas / Configurações → Inicialização, em
//! `HKCU\…\Explorer\StartupApproved\Run`: um valor binário cujo 1º byte diz se a
//! entrada está aprovada (par: 02, 06) ou desativada (ímpar: 03, 07).
//!
//! O plugin só considera "desativado" quando há uma DATA nos últimos 8 bytes. Um
//! valor `03 00 00 00` + zeros (visto na prática) passa por "ligado": a opção
//! aparece ligada nas Preferências e o app nunca abre com o sistema. Este módulo
//! lê o interruptor do Windows do jeito que o Windows lê, pra UI poder avisar.

/// O valor de `StartupApproved\Run` diz "desativado"? PURA → testável.
pub fn approval_disabled(bytes: &[u8]) -> bool {
    bytes.first().is_some_and(|flag| flag & 1 == 1)
}

/// A inicialização está REGISTRADA pelo app mas bloqueada pelo Windows? PURA.
pub fn blocked_from(registered: bool, approval: Option<&[u8]>) -> bool {
    registered && approval.is_some_and(approval_disabled)
}

/// O app `app_name` está registrado pra iniciar com o sistema, mas o Windows
/// desativou essa inicialização? Fora do Windows não existe esse 2º interruptor.
#[cfg(windows)]
pub fn blocked(app_name: &str) -> bool {
    use winreg::enums::{HKEY_CURRENT_USER, KEY_READ};
    use winreg::RegKey;
    const RUN: &str = r"SOFTWARE\Microsoft\Windows\CurrentVersion\Run";
    const APPROVED: &str =
        r"SOFTWARE\Microsoft\Windows\CurrentVersion\Explorer\StartupApproved\Run";

    let hkcu = RegKey::predef(HKEY_CURRENT_USER);
    // Só leitura. Chave ou valor ausente = "não registrado" / "sem interruptor".
    let registered = hkcu
        .open_subkey_with_flags(RUN, KEY_READ)
        .and_then(|run| run.get_raw_value(app_name))
        .is_ok();
    let approval = hkcu
        .open_subkey_with_flags(APPROVED, KEY_READ)
        .and_then(|key| key.get_raw_value(app_name))
        .ok();
    blocked_from(registered, approval.as_ref().map(|v| v.bytes.as_slice()))
}

#[cfg(not(windows))]
pub fn blocked(_app_name: &str) -> bool {
    false
}

#[cfg(test)]
mod tests {
    use super::{approval_disabled, blocked_from};

    #[test]
    fn reads_the_startup_switch_the_way_windows_does() {
        // Aprovado (o que o plugin grava ao ligar; 06 também é "ligado").
        assert!(!approval_disabled(&[2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]));
        assert!(!approval_disabled(&[6, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]));
        // Desativado pelo Gerenciador de Tarefas (com a data nos últimos 8 bytes).
        assert!(approval_disabled(&[
            3, 0, 0, 0, 0x30, 0x9c, 0x41, 0x7f, 0x52, 0x1d, 0xdc, 0x01
        ]));
        // Desativado SEM data: o caso real que o plugin lê como "ligado".
        assert!(approval_disabled(&[3, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]));
        assert!(approval_disabled(&[7, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]));
        // Valor vazio: nada a dizer.
        assert!(!approval_disabled(&[]));
    }

    #[test]
    fn only_a_registered_entry_can_be_blocked() {
        let off = [3u8, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
        let on = [2u8, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
        assert!(blocked_from(true, Some(&off)));
        assert!(!blocked_from(true, Some(&on)));
        // Sem o interruptor do Windows (app nunca listado lá): não está bloqueado.
        assert!(!blocked_from(true, None));
        // O app não se registrou (opção desligada): não há o que bloquear, mesmo
        // que tenha sobrado um "desativado" antigo no Windows.
        assert!(!blocked_from(false, Some(&off)));
    }

    /// Lê o registro DESTA máquina (só leitura). Rode com:
    /// `cargo test it_reports_this_machine -- --ignored --nocapture`
    #[test]
    #[ignore]
    fn it_reports_this_machines_startup_state() {
        println!(
            "Imprompt startup blocked by Windows: {}",
            super::blocked("Imprompt")
        );
    }
}
