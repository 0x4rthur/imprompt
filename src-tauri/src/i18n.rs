//! i18n.rs — strings de chrome do BACKEND (bandeja, notificações, erros).
//!
//! Cada entrada carrega EN e PT na MESMA linha → paridade por construção (não dá
//! pra adicionar uma sem a outra). Fallback de `tr`: EN se o locale não for
//! "pt-BR". Interpolação posicional `{0}`, `{1}` via `tr_args`.
//!
//! As camadas profundas (api_engine, clipboard, secrets, commands, IO) emitem
//! CHAVES estáveis no lugar do texto cru; a tradução acontece na BORDA (comandos
//! `#[tauri::command]` e sites de notificação) via `tr`/`tr_msg`/`tr_args`, onde
//! o locale do `AppState` é conhecido. O teste `no_dup_keys_and_nonempty` protege
//! o catálogo conforme ele cresce.

/// Separador (UNIT SEPARATOR, U+001F) entre uma CHAVE e seus argumentos quando
/// uma camada profunda precisa carregar valores dinâmicos (código HTTP, detalhe
/// técnico) num único `String`. `tr_msg` reconhece o padrão `"chave\u{1f}arg0\u{1f}arg1"`
/// e interpola via `tr_args`. Erros técnicos crus NUNCA contêm este byte → passam
/// intactos. Use `key_with_args` pra montar.
pub const ARG_SEP: char = '\u{1f}';

/// Monta `"chave\u{1f}arg0\u{1f}arg1…"` pra uma chave que carrega dados dinâmicos.
/// A tradução acontece na borda via `tr_msg`.
pub fn key_with_args(key: &str, args: &[&str]) -> String {
    let mut s = String::from(key);
    for a in args {
        s.push(ARG_SEP);
        s.push_str(a);
    }
    s
}

/// (key, en, pt-BR)
const ENTRIES: &[(&str, &str, &str)] = &[
    // ── tray ────────────────────────────────────────────────────────────────
    ("tray.prefs", "Preferences", "Preferências"),
    (
        "tray.undo",
        "↩ Undo last imprompt",
        "↩ Desfazer último imprompt",
    ),
    ("tray.update", "Check for updates", "Verificar atualizações"),
    ("tray.quit", "Quit", "Sair"),
    // ── notif (notificações nativas do SO) ───────────────────────────────────
    ("notif.update.title", "Imprompt", "Imprompt"),
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
    (
        "notif.update.checkfail.title",
        "Imprompt — update",
        "Imprompt — atualização",
    ),
    (
        "notif.update.checkfail",
        "Couldn't check for updates: {0}",
        "Não consegui verificar: {0}",
    ),
    ("notif.fail.title", "Imprompt — failed", "Imprompt — falhou"),
    ("notif.undo.title", "Imprompt — undo", "Imprompt — desfazer"),
    (
        "notif.undo.none",
        "No imprompt to undo yet.",
        "Nenhum imprompt para desfazer ainda.",
    ),
    (
        "notif.undo.pasted",
        "Original text pasted back.",
        "Texto original colado de volta.",
    ),
    (
        "notif.undo.clipboard",
        "Original back on the clipboard — press Ctrl+V.",
        "Original de volta no clipboard — dê Ctrl+V.",
    ),
    // ── err.api.* (motor de API) ─────────────────────────────────────────────
    (
        "err.api.no_key",
        "Set the API key in Preferences.",
        "Configure a chave da API nas Preferências.",
    ),
    (
        "err.api.no_model",
        "Set the API model in Preferences.",
        "Configure o modelo da API nas Preferências.",
    ),
    (
        "err.api.bad_url",
        "Invalid API base URL in Preferences.",
        "URL base da API inválida nas Preferências.",
    ),
    (
        "err.api.no_host",
        "The API base URL must include a host.",
        "A URL base da API precisa ter um host.",
    ),
    (
        "err.api.https_required",
        "Use https for the API base URL (http is only allowed on localhost).",
        "Use https na URL base da API (http só é permitido em localhost).",
    ),
    (
        "err.api.client",
        "Failed to create the HTTP client: {0}",
        "Falha ao criar o cliente HTTP: {0}",
    ),
    (
        "err.api.network",
        "No response from the API (network?). Check your connection.",
        "Sem resposta da API (rede?). Verifique a conexão.",
    ),
    (
        "err.api.unauthorized",
        "Invalid API key or insufficient permission.",
        "Chave de API inválida ou sem permissão.",
    ),
    (
        "err.api.rate_limit",
        "Usage limit reached. Try again shortly.",
        "Limite de uso atingido. Tente em instantes.",
    ),
    (
        "err.api.temporary",
        "Temporary API error ({0}).{1}",
        "Erro temporário da API ({0}).{1}",
    ),
    (
        "err.api.status",
        "The API responded {0}.{1}",
        "API respondeu {0}.{1}",
    ),
    (
        "err.api.no_response",
        "The API returned no response.",
        "A API não devolveu nenhuma resposta.",
    ),
    (
        "err.api.empty",
        "The API returned an empty response.",
        "A API devolveu uma resposta vazia.",
    ),
    (
        "err.api.bad_format",
        "Unexpected response format from the API: {0}",
        "Resposta da API em formato inesperado: {0}",
    ),
    // ── err.clipboard.* ──────────────────────────────────────────────────────
    (
        "err.clipboard.no_access",
        "No clipboard access: {0}",
        "Sem acesso ao clipboard: {0}",
    ),
    (
        "err.clipboard.empty",
        "No text selected.",
        "Nada de texto selecionado.",
    ),
    (
        "err.clipboard.write",
        "Failed to write to the clipboard: {0}",
        "Falha ao escrever no clipboard: {0}",
    ),
    (
        "err.clipboard.paste",
        "Failed to paste (Ctrl+V): {0}",
        "Falha ao colar (Ctrl+V): {0}",
    ),
    (
        "err.clipboard.paste_mac",
        "Failed to paste (Cmd+V): {0}",
        "Falha ao colar (Cmd+V): {0}",
    ),
    // ── err.secret.* (cofre de credenciais) ──────────────────────────────────
    (
        "err.secret.vault_unavailable",
        "Credential vault unavailable: {0}",
        "Cofre de credenciais indisponível: {0}",
    ),
    (
        "err.secret.save",
        "Failed to save the key to the vault: {0}",
        "Falha ao salvar a chave no cofre: {0}",
    ),
    (
        "err.secret.delete",
        "Failed to delete the key from the vault: {0}",
        "Falha ao apagar a chave do cofre: {0}",
    ),
    // ── err.preset.* (validações de preset) ──────────────────────────────────
    (
        "err.preset.name",
        "Give the preset a name.",
        "Dê um nome ao preset.",
    ),
    (
        "err.preset.instruction",
        "Write the preset instruction.",
        "Escreva a instrução do preset.",
    ),
    (
        "err.preset.required",
        "Name and instruction are required.",
        "Nome e instrução são obrigatórios.",
    ),
    (
        "err.preset.not_found",
        "Preset not found.",
        "Preset não encontrado.",
    ),
    (
        "err.preset.keep_one",
        "Keep at least one preset.",
        "Mantenha ao menos um preset.",
    ),
    // ── err.refine.* / err.test.* ────────────────────────────────────────────
    (
        "err.refine.interrupted",
        "Refine interrupted.",
        "Refino interrompido.",
    ),
    (
        "err.test.interrupted",
        "Test interrupted.",
        "Teste interrompido.",
    ),
    ("err.test.ok", "Connection OK.", "Conexão OK."),
    (
        "err.test.no_key",
        "Set the API key in Preferences.",
        "Configure a chave da API nas Preferências.",
    ),
    // ── err.url.invalid (abrir URL externa) ──────────────────────────────────
    ("err.url.invalid", "Invalid URL.", "URL inválida."),
    // ── err.update.failed ────────────────────────────────────────────────────
    (
        "err.update.failed",
        "Couldn't check for the update right now (network?). Try again. [{0}]",
        "Não consegui verificar a atualização agora (rede?). Tente de novo. [{0}]",
    ),
    // ── err.config.no_dir (IO: settings/usage/presets) ───────────────────────
    (
        "err.config.no_dir",
        "Couldn't find the system config folder.",
        "Não achei a pasta de config do sistema.",
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

/// Traduz uma mensagem que pode ser:
///   1. uma CHAVE conhecida (`"err.api.unauthorized"`) → traduz;
///   2. uma chave + args via `ARG_SEP` (`"err.api.temporary\u{1f}500"`) → traduz
///      interpolando `{0}`, `{1}`…;
///   3. um detalhe técnico cru (`"enigo: timeout"`) → devolve como está (sem leak).
///
/// Usado na BORDA de erro, onde o texto pode ser qualquer um dos três — `tr_msg`
/// é a rede de segurança: nada quebra mesmo que a chave não exista no catálogo.
pub fn tr_msg(locale: &str, msg: &str) -> String {
    if let Some((head, rest)) = msg.split_once(ARG_SEP) {
        // Chave + argumentos posicionais.
        if entry(head).is_some() {
            let args: Vec<&str> = rest.split(ARG_SEP).collect();
            return tr_args(locale, head, &args);
        }
        // Cabeça não é chave conhecida → devolve o texto cru (sem o separador, que
        // não deveria aparecer em erro técnico legítimo).
        return msg.replace(ARG_SEP, " ");
    }
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
    fn tr_msg_translates_error_keys() {
        assert_eq!(
            tr_msg("pt-BR", "err.api.unauthorized"),
            "Chave de API inválida ou sem permissão."
        );
        assert_eq!(
            tr_msg("en", "err.api.unauthorized"),
            "Invalid API key or insufficient permission."
        );
    }

    #[test]
    fn tr_msg_handles_key_with_args() {
        // Chave + código HTTP ({0}) + detalhe ({1}, vazio aqui) via ARG_SEP.
        let msg = key_with_args("err.api.temporary", &["503", ""]);
        assert_eq!(tr_msg("pt-BR", &msg), "Erro temporário da API (503).");
        assert_eq!(tr_msg("en", &msg), "Temporary API error (503).");
        // Com detalhe anexado ({1} = " model overloaded", já com espaço à esquerda).
        let msg = key_with_args("err.api.status", &["400", " model overloaded"]);
        assert_eq!(
            tr_msg("en", &msg),
            "The API responded 400. model overloaded"
        );
        // Detalhe técnico anexado a uma chave de formato inesperado.
        let msg = key_with_args("err.api.bad_format", &["expected value at line 1"]);
        assert_eq!(
            tr_msg("en", &msg),
            "Unexpected response format from the API: expected value at line 1"
        );
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
