//! settings.rs — As preferências do usuário.
//!
//! Guarda as escolhas que conversamos: preset padrão, modo (instantâneo
//! ou popup), a configuração da API (base URL + modelo) e o que fazer com a
//! saída. Persiste em JSON na pasta de dados do app.

use std::fs;
use std::path::PathBuf;

use anyhow::{anyhow, Result};
use serde::{Deserialize, Serialize};

use crate::clipboard::OutputMode;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum ActivationMode {
    /// Roda o preset padrão na hora, sem popup. Padrão (mais rápido).
    Instant,
    /// Abre o popup pra escolher o preset a cada vez.
    Popup,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum OutputPref {
    Replace,
    Clipboard,
}

fn default_api_base() -> String {
    "https://api.openai.com/v1".into()
}
fn default_api_model() -> String {
    "gpt-4o-mini".into()
}
fn default_use_examples() -> bool {
    true
}
fn default_trigger_modifier() -> String {
    "ctrl".into()
}
fn default_trigger_key() -> String {
    "c".into()
}
fn default_debounce_ms() -> u64 {
    400
}
fn default_locale() -> String {
    "en".into()
}

impl From<OutputPref> for OutputMode {
    fn from(p: OutputPref) -> Self {
        match p {
            OutputPref::Replace => OutputMode::Replace,
            OutputPref::Clipboard => OutputMode::Clipboard,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Settings {
    /// Id do preset padrão usado no modo instantâneo (ex: "estruturar").
    pub default_preset: String,
    /// Instantâneo ou popup.
    pub mode: ActivationMode,
    /// Substituir no lugar ou copiar pro clipboard.
    pub output: OutputPref,
    /// Iniciar com o sistema (autostart). A UI reconcilia com o estado real do
    /// plugin de autostart. `serde(default)` mantém settings.json antigos válidos.
    #[serde(default)]
    pub autostart: bool,

    /// Base URL da API (formato OpenAI). Ex.: https://api.openai.com/v1
    #[serde(default = "default_api_base")]
    pub api_base_url: String,
    /// Modelo da API (ex.: gpt-4o-mini).
    #[serde(default = "default_api_model")]
    pub api_model: String,
    /// Usar exemplos few-shot (turnos do preset) no refino. Default on; a UI expõe
    /// um toggle pra A/B testar. `serde(default)` mantém settings.json antigos válidos.
    #[serde(default = "default_use_examples")]
    pub use_examples: bool,

    /// Gatilho configurável: modificador ("ctrl"/"alt"/"shift") + tecla (uma letra)
    /// + janela de debounce (ms) entre os dois toques. Default = Ctrl+C×2, 400ms.
    #[serde(default = "default_trigger_modifier")]
    pub trigger_modifier: String,
    #[serde(default = "default_trigger_key")]
    pub trigger_key: String,
    #[serde(default = "default_debounce_ms")]
    pub debounce_ms: u64,

    /// Idioma da UI ("en" ou "pt-BR"). Fonte da verdade do i18n. Default "en":
    /// instalações novas e settings.json legados (sem o campo) começam em inglês.
    /// `serde(default)` garante que JSONs antigos carreguem sem zerar as prefs.
    #[serde(default = "default_locale")]
    pub locale: String,
    // NOTA: a chave da API NÃO mora mais aqui. Ela vai pro cofre de credenciais
    // do SO (ver secrets.rs). Settings antigos que ainda tiverem "api_key" são
    // migrados em `load()` e o campo some do JSON. serde ignora campos extras,
    // então JSONs legados continuam desserializando sem erro.
}

impl Default for Settings {
    fn default() -> Self {
        Self {
            default_preset: "estruturar".into(),
            mode: ActivationMode::Instant,
            // No Linux (especialmente Wayland) o "colar" simulado é problemático,
            // então o padrão é só copiar (Ctrl+V manual). Nos outros, substitui.
            output: if cfg!(target_os = "linux") {
                OutputPref::Clipboard
            } else {
                OutputPref::Replace
            },
            autostart: false,
            api_base_url: default_api_base(),
            api_model: default_api_model(),
            use_examples: default_use_examples(),
            trigger_modifier: default_trigger_modifier(),
            trigger_key: default_trigger_key(),
            debounce_ms: default_debounce_ms(),
            locale: default_locale(),
        }
    }
}

impl Settings {
    /// Caminho do arquivo de settings, dentro da pasta de dados do app.
    /// (No app real, prefira usar o `app_data_dir()` do Tauri.)
    fn path() -> Result<PathBuf> {
        let dir = dirs::config_dir()
            .ok_or_else(|| anyhow!("Não achei a pasta de config do sistema."))?
            .join("imprompt");
        fs::create_dir_all(&dir).ok();
        Ok(dir.join("settings.json"))
    }

    /// Carrega do disco, ou devolve o padrão se não existir.
    ///
    /// MIGRAÇÃO ÚNICA E SILENCIOSA: se um settings.json antigo ainda tiver a
    /// `api_key` em texto puro, movemos pro cofre de credenciais do SO e
    /// reescrevemos o JSON sem ela. Só apagamos do JSON DEPOIS de gravar no cofre
    /// com sucesso — assim nunca perdemos a chave se o cofre estiver indisponível
    /// (a migração simplesmente tenta de novo no próximo arranque).
    pub fn load() -> Self {
        let json = match Self::path().and_then(|p| Ok(fs::read_to_string(p)?)) {
            Ok(json) => json,
            Err(_) => return Self::default(),
        };
        let settings: Settings = serde_json::from_str(&json).unwrap_or_default();

        if let Some(legacy_key) = extract_legacy_api_key(&json) {
            if crate::secrets::save_api_key(&legacy_key).is_ok() {
                // Reescreve o JSON já SEM o campo api_key (o struct não o tem mais).
                if let Err(e) = settings.save() {
                    // A chave já está no cofre, mas a reescrita falhou: ela continua
                    // em texto puro no settings.json até um save futuro funcionar. A
                    // migração tenta de novo no próximo arranque (idempotente). O erro
                    // contém só o caminho/IO — NUNCA a chave.
                    eprintln!(
                        "[settings] migração da api_key: falha ao reescrever o settings.json: {e}"
                    );
                }
            }
            // Não logamos a chave em nenhum caso.
        }

        settings
    }

    /// Salva no disco de forma ATÔMICA (tmp + rename), igual a `usage::save_usage`.
    /// Um `fs::write` direto deixaria o settings.json truncado se o processo morresse
    /// no meio da escrita — e o `load()` cai em `unwrap_or_default()`, zerando TODAS
    /// as preferências silenciosamente. O rename no mesmo diretório é atômico.
    pub fn save(&self) -> Result<()> {
        let path = Self::path()?;
        let json = serde_json::to_string_pretty(self)?;
        let tmp = path.with_extension("json.tmp");
        fs::write(&tmp, json)?;
        fs::rename(&tmp, &path)?;
        Ok(())
    }
}

/// Extrai a `api_key` (não-vazia) de um settings.json ANTIGO, pra migrar pro
/// cofre. É PURA (sem efeitos colaterais nem keyring) — dá pra testar a lógica de
/// detecção sem tocar no cofre do sistema.
fn extract_legacy_api_key(json: &str) -> Option<String> {
    let value: serde_json::Value = serde_json::from_str(json).ok()?;
    let key = value.get("api_key")?.as_str()?.trim();
    if key.is_empty() {
        None
    } else {
        Some(key.to_string())
    }
}

#[cfg(test)]
mod tests {
    use super::{extract_legacy_api_key, Settings};

    #[test]
    fn serialized_settings_never_contains_api_key() {
        // Garante a propriedade central: a chave NUNCA é serializada no JSON.
        let json = serde_json::to_string(&Settings::default()).unwrap();
        assert!(
            !json.contains("api_key"),
            "settings.json não pode conter a chave: {json}"
        );
    }

    // Toca o disco/cofre REAIS → #[ignore] (rodar com `cargo test --ignored`).
    // Pós-condição machine-independent do load(): depois dele, o settings.json
    // NUNCA pode conter api_key — ou foi migrado pro cofre, ou nunca existiu.
    // Rodar numa máquina com chave legada EXECUTA a migração de verdade.
    #[test]
    #[ignore]
    fn it_load_leaves_no_api_key_in_json() {
        let _ = Settings::load();
        if let Ok(path) = Settings::path() {
            if let Ok(json) = std::fs::read_to_string(&path) {
                assert!(
                    !json.contains("\"api_key\""),
                    "api_key ainda presente no settings.json após load()"
                );
            }
        }
    }

    #[test]
    fn locale_defaults_to_en_and_legacy_json_keeps_prefs() {
        // JSON legado SEM o campo `locale` (instalações anteriores ao i18n)
        // desserializa com locale="en" e PRESERVA as outras preferências —
        // o `#[serde(default = "default_locale")]` não pode zerar nada.
        // Inclui os campos sem serde-default (default_preset/mode/output).
        let legacy = r#"{"default_preset":"codigo","mode":"popup","output":"replace"}"#;
        let s: Settings = serde_json::from_str(legacy).unwrap();
        assert_eq!(s.locale, "en");
        assert_eq!(s.default_preset, "codigo"); // não zerou as outras prefs
        assert_eq!(s.mode, super::ActivationMode::Popup);
        assert_eq!(s.output, super::OutputPref::Replace);
    }

    #[test]
    fn finds_legacy_key_in_old_json() {
        // SCHEMA ANTIGO de propósito: os campos `model_id` e `engine` não
        // existem mais no struct atual. Estão aqui pra provar que serde os ignora
        // como campos extras na migração da api_key (o que importa é achar a chave).
        let json = r#"{"model_id":"gemma-4b","engine":"api","api_key":"sk-secret-123"}"#;
        assert_eq!(
            extract_legacy_api_key(json).as_deref(),
            Some("sk-secret-123")
        );
    }

    #[test]
    fn no_key_when_absent_empty_or_invalid() {
        assert_eq!(extract_legacy_api_key(r#"{"model_id":"x"}"#), None);
        assert_eq!(extract_legacy_api_key(r#"{"api_key":""}"#), None);
        assert_eq!(extract_legacy_api_key(r#"{"api_key":"   "}"#), None);
        assert_eq!(extract_legacy_api_key("isto não é json"), None);
    }
}
