//! i18n.rs — strings de chrome do BACKEND (bandeja, notificações, erros).
//!
//! Cada entrada carrega EN e PT na MESMA linha → paridade por construção (não dá
//! pra adicionar uma sem a outra). Fallback de `tr`: EN se o locale não for
//! "pt-BR". Interpolação posicional `{0}`, `{1}` via `tr_args`.
//!
//! Por ora só semeado com as chaves de exemplo (tray/notif); as chaves de erro
//! e o resto das notificações entram nas tasks seguintes. O teste de paridade
//! (`no_dup_keys_and_nonempty`) protege o catálogo conforme ele cresce.

// Este módulo é o ALICERCE do i18n do backend: `tr`/`tr_msg`/`tr_args` são
// consumidos pela bandeja, notificações e borda de erro nas tasks seguintes.
// Até lá ficam sem call-site — `allow(dead_code)` evita que o gate
// `clippy -D warnings` quebre por código de fundação ainda não fiado.
#![allow(dead_code)]

/// (key, en, pt-BR)
const ENTRIES: &[(&str, &str, &str)] = &[
    // tray
    ("tray.prefs", "Preferences", "Preferências"),
    (
        "tray.undo",
        "↩ Undo last imprompt",
        "↩ Desfazer último imprompt",
    ),
    ("tray.update", "Check for updates", "Verificar atualizações"),
    ("tray.quit", "Quit", "Sair"),
    // notif (exemplos — completar em task futura)
    (
        "notif.update.available",
        "Update {0} available.",
        "Atualização {0} disponível.",
    ),
    (
        "notif.update.uptodate",
        "You're on the latest version.",
        "Você já está na última versão.",
    ),
];

fn entry(key: &str) -> Option<&'static (&'static str, &'static str, &'static str)> {
    ENTRIES.iter().find(|e| e.0 == key)
}

/// Traduz uma chave CONHECIDA para o locale. Locale != "pt-BR" → EN (fallback).
/// Chave desconhecida → "" (só chamamos com chaves do catálogo; typo aparece vazio).
pub fn tr(locale: &str, key: &str) -> &'static str {
    match entry(key) {
        Some((_, en, pt)) => {
            if locale == "pt-BR" {
                pt
            } else {
                en
            }
        }
        None => "",
    }
}

/// Traduz se `msg` for uma chave CONHECIDA; senão devolve a própria `msg` crua.
/// Usado na BORDA de erro, onde o texto pode ser uma chave (traduzir) OU um
/// detalhe técnico (devolver como está — sem vazar nem traduzir errado).
pub fn tr_msg(locale: &str, msg: &str) -> String {
    if entry(msg).is_some() {
        tr(locale, msg).to_string()
    } else {
        msg.to_string()
    }
}

/// Como `tr`, mas interpola `{0}`, `{1}`… com `args` (na ordem).
pub fn tr_args(locale: &str, key: &str, args: &[&str]) -> String {
    let mut s = tr(locale, key).to_string();
    for (i, a) in args.iter().enumerate() {
        s = s.replace(&format!("{{{i}}}"), a);
    }
    s
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn no_dup_keys_and_nonempty() {
        let mut seen = std::collections::HashSet::new();
        for (k, en, pt) in ENTRIES {
            assert!(seen.insert(*k), "chave duplicada: {k}");
            assert!(!en.is_empty() && !pt.is_empty(), "vazio em {k}");
        }
    }

    #[test]
    fn falls_back_to_en() {
        assert_eq!(tr("xx", "tray.quit"), "Quit"); // locale desconhecido → EN
        assert_eq!(tr("pt-BR", "tray.quit"), "Sair");
    }

    #[test]
    fn tr_msg_passes_through_unknown() {
        // Detalhe técnico cru (não é chave) volta como está; chave conhecida traduz.
        assert_eq!(tr_msg("pt-BR", "enigo: timeout"), "enigo: timeout");
        assert_eq!(tr_msg("pt-BR", "tray.quit"), "Sair");
    }

    #[test]
    fn interpolates_args() {
        assert_eq!(
            tr_args("en", "notif.update.available", &["1.2.0"]),
            "Update 1.2.0 available."
        );
        assert_eq!(
            tr_args("pt-BR", "notif.update.available", &["1.2.0"]),
            "Atualização 1.2.0 disponível."
        );
    }
}
