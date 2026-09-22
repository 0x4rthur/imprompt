//! secrets.rs — Armazenamento seguro da chave de API.
//!
//! A chave NÃO fica mais em texto puro no settings.json. Ela vai pro cofre de
//! credenciais do próprio sistema operacional via a crate `keyring`:
//!   - Windows  → Credential Manager
//!   - macOS    → Keychain
//!   - Linux    → Secret Service (GNOME Keyring / KWallet)
//!
//! Cada endpoint tem sua própria entrada sob service `"imprompt"`. A chave só existe em
//! memória pelo tempo de uma operação; NUNCA é logada (nem em erro, nem em debug):
//! os erros da `keyring` falam só da operação no cofre, não do valor.

use anyhow::Result;
use keyring::{Entry, Error as KeyringError};

/// Nome do "serviço" no cofre — agrupa as credenciais do Imprompt.
const SERVICE: &str = "imprompt";
/// "Usuário"/conta da entrada — a chave da API externa.
const USER: &str = "api_key";

// ── Núcleo parametrizado pelo `user` ────────────────────────────────────────
// A API pública abaixo fixa `user = USER`; os testes de integração usam um user
// de teste dedicado pra exercitar o cofre REAL sem tocar na chave do app.

/// Abre a entrada do cofre pra (SERVICE, user).
fn entry(user: &str) -> Result<Entry> {
    Entry::new(SERVICE, user).map_err(|e| {
        anyhow::anyhow!(crate::i18n::key_with_args(
            "err.secret.vault_unavailable",
            &[&e.to_string()]
        ))
    })
}

/// Grava no cofre. Valor vazio = apaga (idempotente). Nunca logamos `value`.
fn store(user: &str, value: &str) -> Result<()> {
    let value = value.trim();
    if value.is_empty() {
        return clear(user);
    }
    entry(user)?.set_password(value).map_err(|e| {
        anyhow::anyhow!(crate::i18n::key_with_args(
            "err.secret.save",
            &[&e.to_string()]
        ))
    })?;
    Ok(())
}

/// Lê do cofre. `None` se não houver nada salvo (ou o cofre falhar).
fn read_checked(user: &str) -> Result<Option<String>> {
    let entry = entry(user)?;
    match entry.get_password() {
        Ok(v) if !v.trim().is_empty() => Ok(Some(v)),
        Ok(_) | Err(KeyringError::NoEntry) => Ok(None),
        Err(_) => Err(anyhow::anyhow!(crate::i18n::key_with_args(
            "err.secret.vault_unavailable",
            &["read failed"],
        ))),
    }
}

#[cfg(test)]
fn read(user: &str) -> Option<String> {
    read_checked(user).ok().flatten()
}

/// Apaga do cofre. "Não existe" conta como sucesso (idempotente).
fn clear(user: &str) -> Result<()> {
    let entry = entry(user)?;
    match entry.delete_credential() {
        Ok(()) => Ok(()),
        Err(KeyringError::NoEntry) => Ok(()), // já não havia nada pra apagar
        Err(e) => Err(anyhow::anyhow!(crate::i18n::key_with_args(
            "err.secret.delete",
            &[&e.to_string()]
        ))),
    }
}

// ── API pública (a chave da API externa) ─────────────────────────────────────

/// Grava a chave da API no cofre do SO. Chave vazia = apaga (idempotente).
fn account(base_url: &str) -> Result<String> {
    let endpoint =
        crate::api_endpoint::Endpoint::parse(base_url, crate::api_endpoint::ApiFormat::Auto)?;
    Ok(format!("api_key:{}", endpoint.base))
}

pub fn save_api_key(base_url: &str, key: &str) -> Result<()> {
    store(&account(base_url)?, key)
}

/// Lê a chave da API do cofre — nunca propaga o valor por outro canal.
pub fn load_api_key(base_url: &str) -> Result<Option<String>> {
    read_checked(&account(base_url)?)
}

/// Bind the old shared key only to the endpoint selected before this upgrade.
/// A durable marker prevents rebinding if deleting the legacy entry fails.
pub fn migrate_legacy_key(base_url: &str) -> Result<()> {
    let target = account(base_url)?;
    let owner = read_checked("legacy_api_key_owner")?;
    if owner.as_ref().is_some_and(|owner| owner != &target) {
        return Ok(());
    }
    if let Some(key) = read_checked(USER)? {
        store("legacy_api_key_owner", &target)?;
        if read_checked(&target)?.is_none() {
            store(&target, &key)?;
        }
        clear(USER)?;
    }
    Ok(())
}

/// Mascara a chave pra exibir na UI sem vazar o valor (ex.: "sk-…AB12").
/// Chaves curtas (≤ 8) viram só bolinhas — não dá pra mostrar prefixo/sufixo
/// sem revelar quase tudo.
pub fn mask(key: &str) -> String {
    let chars: Vec<char> = key.trim().chars().collect();
    let n = chars.len();
    if n == 0 {
        return String::new();
    }
    if n <= 8 {
        return "•".repeat(n);
    }
    let prefix: String = chars[..3].iter().collect();
    let suffix: String = chars[n - 4..].iter().collect();
    format!("{prefix}…{suffix}")
}

#[cfg(test)]
mod tests {
    use super::{clear, mask, read, store};

    // Valores de teste — user dedicado pra NÃO tocar na chave real do app ("api_key").
    const SELFTEST_USER: &str = "selftest";
    const SENTINEL: &str = "sk-selftest-DO-NOT-USE-9999";

    #[test]
    fn credentials_are_scoped_to_the_canonical_endpoint() {
        use super::account;
        assert_eq!(
            account(" https://api.openai.com/v1/ ").unwrap(),
            account("https://api.openai.com/v1/chat/completions").unwrap()
        );
        assert_eq!(
            account("https://api.openai.com").unwrap(),
            account("https://api.openai.com/v1/responses").unwrap()
        );
        assert_ne!(
            account("https://api.openai.com/v1").unwrap(),
            account("https://openrouter.ai/api/v1").unwrap()
        );
        assert_ne!(
            account("https://proxy.example/team-a/v1").unwrap(),
            account("https://proxy.example/team-b/v1").unwrap()
        );
        assert_ne!(
            account("http://localhost:1234/v1").unwrap(),
            account("http://localhost:11434/v1").unwrap()
        );
    }

    // ── Testes de integração que tocam o COFRE REAL do SO ──────────────────────
    // Marcados `#[ignore]` → não rodam no `cargo test` normal nem em CI sem cofre.
    // Pra provar PERSISTÊNCIA ENTRE REINÍCIOS, rode em DOIS processos separados:
    //   cargo test --ignored it_write_persists_to_real_vault   (processo 1: grava)
    //   cargo test --ignored it_read_back_then_cleanup         (processo 2: lê e limpa)
    // O 2º processo lê o que o 1º gravou → o valor sobreviveu ao "reinício".
    #[test]
    #[ignore]
    fn it_write_persists_to_real_vault() {
        store(SELFTEST_USER, SENTINEL).expect("gravar no cofre real");
    }

    #[test]
    #[ignore]
    fn it_read_back_then_cleanup() {
        // Lê o que o processo anterior gravou (persistiu entre reinícios).
        assert_eq!(read(SELFTEST_USER).as_deref(), Some(SENTINEL));
        // Limpa e confirma que sumiu.
        clear(SELFTEST_USER).expect("apagar do cofre real");
        assert_eq!(read(SELFTEST_USER), None);
    }

    #[test]
    fn masks_long_key_with_prefix_and_suffix() {
        assert_eq!(mask("sk-proj-ABCDEFGH1234"), "sk-…1234");
    }

    #[test]
    fn masks_short_key_fully() {
        assert_eq!(mask("abcd"), "••••");
        assert_eq!(mask("sk-1234"), "•••••••"); // 7 chars → tudo escondido
        assert_eq!(mask(""), "");
    }

    #[test]
    fn never_reveals_the_secret_middle() {
        let secret = "sk-supersecretmiddlevalue9999";
        let masked = mask(secret);
        assert!(!masked.contains("supersecret"));
        assert!(!masked.contains("middlevalue"));
        // Só o prefixo curto e os 4 últimos podem aparecer.
        assert!(masked.starts_with("sk-"));
        assert!(masked.ends_with("9999"));
    }
}
