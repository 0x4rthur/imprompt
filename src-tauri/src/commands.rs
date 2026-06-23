//! commands.rs — A ponte entre a UI (React) e o backend (Rust).
//!
//! Cada `#[tauri::command]` vira uma função chamável do frontend via `invoke()`.
//! A UI de Preferências usa estas pra ler/salvar settings, gerenciar presets e
//! configurar/testar a API. O refino em si é disparado pelo gatilho (hotkey), não
//! pela UI — mas expomos um `refine_text` também, útil pra testes e pro modo popup.

use std::sync::{Arc, Mutex, MutexGuard};

use serde::Serialize;
use tauri::{Emitter, Manager, State};

use crate::engine::Engine;
use crate::{presets, settings::Settings};

/// Trava um `Mutex` de forma POISON-SAFE: se uma thread em pane envenenou o lock,
/// recupera o dado em vez de propagar o pânico pelo app inteiro. O estado do app
/// (settings, histórico, engine handle etc.) continua íntegro — uma operação
/// abortada no meio não deixa esses dados num estado inconsistente.
fn lock<T>(m: &Mutex<T>) -> MutexGuard<'_, T> {
    m.lock().unwrap_or_else(|e| e.into_inner())
}

/// Quantos refinos guardar no histórico em memória (pro "desfazer").
const HISTORY_CAP: usize = 20;

/// Um refino registrado no histórico — pra desfazer e pra timeline de
/// "Refinos recentes" do Início.
/// Guardado em memória (não persiste): é uma rede de segurança da sessão.
#[derive(Debug, Clone, Serialize)]
pub struct RefineRecord {
    /// Texto ANTES do refino (o que o desfazer devolve).
    pub original: String,
    /// Texto DEPOIS do refino (o resultado entregue).
    pub result: String,
    /// Id do preset usado.
    pub preset: String,
    /// Epoch em milissegundos (a UI formata).
    pub timestamp: u64,
}

/// Estado global do app, compartilhado entre comandos e o gatilho.
/// O `engine` é o cliente de API construído sob demanda (lazy) no 1º refino e
/// mantido em cache aqui pra reuso.
pub struct AppState {
    /// `Arc` (não `Box`) pra dar pra CLONAR o handle do motor sob um lock curto e
    /// refinar SEM segurar o `Mutex` durante a chamada HTTP (que é demorada).
    /// Trocar a config da API cria um motor novo; um refino em curso segura o Arc
    /// antigo até terminar (sem swap no meio do caminho).
    pub engine: Mutex<Option<Arc<dyn Engine>>>,
    pub settings: Mutex<Settings>,
    /// Último texto capturado pelo gatilho. A janela do popup PUXA isto ao montar
    /// (via `get_captured_text`), o que evita a corrida do 1º open — quando o
    /// listener do evento ainda não existe.
    pub captured: Mutex<String>,
    /// Histórico dos últimos refinos (mais recente primeiro), pro "desfazer".
    pub history: Mutex<Vec<RefineRecord>>,
    /// Versão de uma atualização disponível (a UI puxa via `get_pending_update`,
    /// cobrindo o caso do evento ter sido emitido antes da janela montar).
    pub pending_update: Mutex<Option<String>>,
    /// Contador de uso/custo dos refinos via API. Compartilhado com o `ApiEngine`
    /// via `Arc`.
    pub usage: Arc<crate::usage::UsageTracker>,
    /// Config do gatilho (combo + debounce), compartilhada com o listener global
    /// (hotkey.rs) e atualizada AO VIVO pelo `set_settings`.
    pub trigger: Arc<crate::hotkey::TriggerShared>,
}

impl AppState {
    pub fn new(settings: Settings) -> Self {
        // Lê os campos do gatilho ANTES de mover `settings` pro Mutex.
        let trigger = Arc::new(crate::hotkey::TriggerShared::new(
            &settings.trigger_modifier,
            &settings.trigger_key,
            settings.debounce_ms,
        ));
        Self {
            engine: Mutex::new(None),
            settings: Mutex::new(settings),
            captured: Mutex::new(String::new()),
            history: Mutex::new(Vec::new()),
            pending_update: Mutex::new(None),
            usage: Arc::new(crate::usage::UsageTracker::load()),
            trigger,
        }
    }

    /// Registra um refino no topo do histórico (mais recente primeiro) e mantém
    /// no máximo `HISTORY_CAP`. Chamado ANTES de entregar o resultado.
    pub fn push_history(&self, original: &str, result: &str, preset: &str) {
        let mut h = lock(&self.history);
        h.insert(
            0,
            RefineRecord {
                original: original.to_string(),
                result: result.to_string(),
                preset: preset.to_string(),
                timestamp: now_millis(),
            },
        );
        h.truncate(HISTORY_CAP);
    }
}

/// Epoch em milissegundos (0 se o relógio do sistema estiver antes de 1970).
fn now_millis() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

/// Preset + flags pra UI. `builtin` = é um preset PADRÃO (restaurável); `edited`
/// = é um padrão que o usuário editou (override ativo). Achatado: a UI recebe
/// { id, label, instruction, example_input, example_output, builtin, edited }.
#[derive(Serialize)]
pub struct PresetView {
    #[serde(flatten)]
    pub preset: presets::Preset,
    pub builtin: bool,
    pub edited: bool,
}

/// Lista TODOS os presets (padrão + custom), marcando quais são padrão e quais
/// foram editados pelo usuário.
#[tauri::command]
pub fn list_presets() -> Vec<PresetView> {
    let default_ids: std::collections::HashSet<String> = presets::default_presets()
        .into_iter()
        .map(|p| p.id)
        .collect();
    let store = presets::load_store();
    presets::all_presets()
        .into_iter()
        .map(|p| {
            let builtin = default_ids.contains(&p.id);
            let edited = builtin && store.overrides.contains_key(&p.id);
            PresetView {
                preset: p,
                builtin,
                edited,
            }
        })
        .collect()
}

/// Cria um preset custom (gera um id único a partir do nome). Devolve o criado.
#[tauri::command]
pub fn create_preset(mut preset: presets::Preset) -> Result<presets::Preset, String> {
    let label = preset.label.trim().to_string();
    let instruction = preset.instruction.trim().to_string();
    if label.is_empty() {
        return Err("Dê um nome ao preset.".to_string());
    }
    if instruction.is_empty() {
        return Err("Escreva a instrução do preset.".to_string());
    }
    let mut user = presets::load_user_presets();
    // Ids em uso (padrão + custom): garante unicidade e que NÃO sobrescreve padrão.
    let mut existing: std::collections::HashSet<String> = presets::default_presets()
        .into_iter()
        .map(|p| p.id)
        .collect();
    for p in &user {
        existing.insert(p.id.clone());
    }
    preset.id = presets::unique_id(&presets::slugify(&label), &existing);
    preset.label = label;
    preset.instruction = instruction;
    preset.example_input = preset.example_input.trim().to_string();
    preset.example_output = preset.example_output.trim().to_string();
    user.push(preset.clone());
    presets::save_user_presets(&user).map_err(|e| e.to_string())?;
    Ok(preset)
}

/// Edita um preset. PADRÃO → vira um override (o original fica salvo no código;
/// "Restaurar padrões" reverte). CUSTOM → substitui pelo id.
#[tauri::command]
pub fn update_preset(preset: presets::Preset) -> Result<(), String> {
    let label = preset.label.trim().to_string();
    let instruction = preset.instruction.trim().to_string();
    if label.is_empty() || instruction.is_empty() {
        return Err("Nome e instrução são obrigatórios.".to_string());
    }
    let clean = presets::Preset {
        id: preset.id,
        label,
        instruction,
        example_input: preset.example_input.trim().to_string(),
        example_output: preset.example_output.trim().to_string(),
    };
    let mut store = presets::load_store();
    if presets::is_default_id(&clean.id) {
        store.overrides.insert(clean.id.clone(), clean);
    } else {
        match store.custom.iter_mut().find(|p| p.id == clean.id) {
            Some(slot) => *slot = clean,
            None => return Err("Preset não encontrado.".to_string()),
        }
    }
    presets::save_store(&store).map_err(|e| e.to_string())
}

/// Exclui um preset. PADRÃO → fica ESCONDIDO ("Restaurar padrões" o traz de
/// volta). CUSTOM → removido de vez.
#[tauri::command]
pub fn delete_preset(id: String) -> Result<(), String> {
    let mut store = presets::load_store();
    if presets::is_default_id(&id) {
        if !store.hidden.iter().any(|h| h == &id) {
            store.hidden.push(id.clone());
        }
        store.overrides.remove(&id);
    } else {
        let before = store.custom.len();
        store.custom.retain(|p| p.id != id);
        if store.custom.len() == before {
            return Err("Preset não encontrado.".to_string());
        }
    }
    // Nunca deixa a lista de presets ficar VAZIA — senão o refino ficaria sem
    // preset (panic em find_preset / Ctrl+C×2 sem efeito). Recusa a exclusão.
    if presets::all_presets_from(&store).is_empty() {
        return Err("Mantenha ao menos um preset.".to_string());
    }
    presets::save_store(&store).map_err(|e| e.to_string())
}

/// "Restaurar padrões": desfaz edições e exclusões dos presets PADRÃO. Os presets
/// custom do usuário ficam intactos.
#[tauri::command]
pub fn restore_default_presets() -> Result<(), String> {
    presets::restore_defaults().map_err(|e| e.to_string())
}

/// Lê as settings atuais.
#[tauri::command]
pub fn get_settings(state: State<AppState>) -> Settings {
    lock(&state.settings).clone()
}

/// Salva settings novas (e persiste no disco).
#[tauri::command]
pub fn set_settings(state: State<AppState>, new_settings: Settings) -> Result<(), String> {
    new_settings.save().map_err(|e| e.to_string())?;
    // Aplica o gatilho AO VIVO no listener global (sem reiniciar o app).
    state.trigger.set(
        &new_settings.trigger_modifier,
        &new_settings.trigger_key,
        new_settings.debounce_ms,
    );
    *lock(&state.settings) = new_settings;
    Ok(())
}

/// Constrói o motor de API conforme as settings — SÍNCRONO. A chave vem do cofre
/// do SO (secrets.rs), não do settings.json. Chamado pelo lazy-load do fluxo do
/// gatilho (numa thread real) via `ensure_engine_loaded`.
pub fn build_engine(
    s: &Settings,
    usage: Arc<crate::usage::UsageTracker>,
) -> anyhow::Result<Arc<dyn Engine>> {
    use crate::api_engine::ApiEngine;

    // A chave vem do cofre do SO (secrets.rs), não mais do settings.json.
    let api_key = crate::secrets::load_api_key().unwrap_or_default();
    // Liga o contador de uso/custo (ver usage.rs).
    let api = ApiEngine::new(&s.api_base_url, &s.api_model, &api_key)?.with_usage_tracker(usage);
    Ok(Arc::new(api))
}

/// Garante que o motor esteja carregado e devolve um handle clonado. LAZY: na 1ª
/// chamada constrói o cliente de API (e o mantém em cache); nas próximas só
/// clona o handle existente. SÍNCRONO — chame de uma thread real (o fluxo do
/// gatilho roda numa).
pub fn ensure_engine_loaded(app: &tauri::AppHandle) -> anyhow::Result<Arc<dyn Engine>> {
    let state = app.state::<AppState>();

    // Atalho: já carregado → só clona o handle sob lock curto.
    if let Some(engine) = lock(&state.engine).as_ref().cloned() {
        return Ok(engine);
    }

    // Cache-miss: clona settings/tracker sob lock curto e constrói FORA do lock.
    let (s, usage) = (lock(&state.settings).clone(), state.usage.clone());
    let engine = build_engine(&s, usage)?;
    *lock(&state.engine) = Some(engine.clone());
    Ok(engine)
}

/// Refina um texto com um preset específico. Usado pelo modo popup e por testes.
/// O modo instantâneo chama a mesma lógica internamente a partir do gatilho.
///
/// É `async` e roda o refino numa std::thread REAL (fora do event loop), por dois
/// motivos: (1) a UI não trava durante a chamada HTTP; (2) o `reqwest::blocking`
/// do ApiEngine não pode rodar dentro do runtime async — numa std::thread, pode.
#[tauri::command]
pub async fn refine_text(
    app: tauri::AppHandle,
    text: String,
    preset_id: String,
) -> Result<String, String> {
    let (tx, rx) = tokio::sync::oneshot::channel();
    std::thread::spawn(move || {
        let state = app.state::<AppState>();
        let result = (|| -> Result<String, String> {
            let all = presets::all_presets();
            let preset = presets::find_preset(&all, &preset_id);
            // Few-shot conforme a preferência (default on).
            let use_examples = lock(&state.settings).use_examples;
            let example = preset.example_for(use_examples);
            // Garante o motor carregado (LAZY: constrói na 1ª vez) e clona o handle
            // — libera o Mutex antes do refino (que pode levar segundos).
            let engine = ensure_engine_loaded(&app).map_err(|e| e.to_string())?;
            let refined = engine
                .refine(&preset.system_prompt(), example, &text)
                .map_err(|e| e.to_string())?;
            // Registra no histórico ANTES de entregar (o popup chama deliver depois).
            state.push_history(&text, &refined, &preset_id);
            Ok(refined)
        })();
        let _ = tx.send(result);
    });
    rx.await.map_err(|_| "Refino interrompido.".to_string())?
}

/// Testa a conexão com a API (valida chave/modelo/base_url) fazendo um refino
/// mínimo. Devolve "Conexão OK." ou a mensagem de erro da API. Roda numa
/// std::thread (reqwest::blocking). A chave vem do COFRE — a UI deve salvá-la
/// (set_api_key) ANTES de testar.
#[tauri::command]
pub async fn test_api_connection(base_url: String, model: String) -> Result<String, String> {
    let (tx, rx) = tokio::sync::oneshot::channel();
    std::thread::spawn(move || {
        use crate::api_engine::ApiEngine;
        let result = (|| -> Result<(), String> {
            let api_key = crate::secrets::load_api_key()
                .ok_or_else(|| "Configure a chave da API nas Preferências.".to_string())?;
            let eng = ApiEngine::new(&base_url, &model, &api_key).map_err(|e| e.to_string())?;
            // Ping mínimo: zero-shot (sem exemplo) — só valida credencial/modelo.
            eng.refine("Responda apenas com a palavra OK.", None, "ping")
                .map(|_| ())
                .map_err(|e| e.to_string())
        })();
        let _ = tx.send(result);
    });
    rx.await
        .map_err(|_| "Teste interrompido.".to_string())?
        .map(|_| "Conexão OK.".to_string())
}

/// Estado da chave de API (pra UI), sem NUNCA expor o valor — só se existe e uma
/// versão mascarada (ex.: "sk-…AB12").
#[derive(Serialize)]
pub struct ApiKeyStatus {
    pub saved: bool,
    pub masked: String,
}

/// Salva (ou apaga, se vier vazia) a chave da API no cofre do SO.
#[tauri::command]
pub fn set_api_key(key: String) -> Result<(), String> {
    crate::secrets::save_api_key(&key).map_err(|e| e.to_string())
}

/// Diz se há uma chave salva e devolve uma forma mascarada pra UI. O valor real
/// nunca cruza essa fronteira.
#[tauri::command]
pub fn get_api_key_status() -> ApiKeyStatus {
    match crate::secrets::load_api_key() {
        Some(k) => ApiKeyStatus {
            saved: true,
            masked: crate::secrets::mask(&k),
        },
        None => ApiKeyStatus {
            saved: false,
            masked: String::new(),
        },
    }
}

/// Texto capturado mais recente — a janela do popup PUXA isto ao montar.
#[tauri::command]
pub fn get_captured_text(state: State<AppState>) -> String {
    lock(&state.captured).clone()
}

/// Entrega o resultado do popup conforme o modo de saída das settings
/// (Substituir = cola por cima da seleção; Clipboard = só copia).
#[tauri::command]
pub fn deliver_result(state: State<AppState>, text: String) -> Result<(), String> {
    let mode = lock(&state.settings).output.clone();
    crate::clipboard::deliver(&text, mode.into()).map_err(|e| e.to_string())
}

/// Devolve o histórico de refinos (mais recente primeiro) pra timeline da tela Início.
#[tauri::command]
pub fn get_history(state: State<AppState>) -> Vec<RefineRecord> {
    lock(&state.history).clone()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn history_is_newest_first_and_capped() {
        let state = AppState::new(Settings::default());
        // Empurra mais que o teto pra exercitar o corte.
        for i in 0..(HISTORY_CAP + 2) {
            state.push_history(&format!("orig{i}"), &format!("res{i}"), "detalhar");
        }
        let h = state.history.lock().unwrap();
        assert_eq!(
            h.len(),
            HISTORY_CAP,
            "histórico deve capar em {HISTORY_CAP}"
        );
        // O desfazer usa h[0] → tem que ser o MAIS RECENTE.
        assert_eq!(h[0].original, format!("orig{}", HISTORY_CAP + 1));
        assert_eq!(h[0].result, format!("res{}", HISTORY_CAP + 1));
        // Os 2 mais antigos (orig0/orig1) caíram; o mais antigo retido é orig2.
        assert_eq!(h[HISTORY_CAP - 1].original, "orig2");
    }
}

/// macOS: o gatilho global (rdev) e o "colar" simulado (enigo) exigem permissão
/// de Acessibilidade. Devolve `true` se já está autorizado (sempre `true` fora do
/// macOS). A UI mostra um aviso quando vier `false`.
#[tauri::command]
pub fn check_accessibility() -> bool {
    #[cfg(target_os = "macos")]
    {
        // AXIsProcessTrusted() do framework ApplicationServices. Boolean = u8.
        #[link(name = "ApplicationServices", kind = "framework")]
        extern "C" {
            fn AXIsProcessTrusted() -> std::os::raw::c_uchar;
        }
        unsafe { AXIsProcessTrusted() != 0 }
    }
    #[cfg(not(target_os = "macos"))]
    {
        true
    }
}

/// macOS: abre Ajustes > Privacidade e Segurança > Acessibilidade. No-op nos
/// outros sistemas.
#[tauri::command]
pub fn open_accessibility_settings() -> Result<(), String> {
    #[cfg(target_os = "macos")]
    {
        std::process::Command::new("open")
            .arg("x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility")
            .spawn()
            .map(|_| ())
            .map_err(|e| e.to_string())
    }
    #[cfg(not(target_os = "macos"))]
    {
        Ok(())
    }
}

/// Abre uma URL http(s) no navegador padrão do sistema (pra "ver licença").
/// Só aceita http/https COM host — valida com `url::Url` e usa o opener do
/// `tauri-plugin-shell` (sem `cmd /C start` nem outro shell), então não há como
/// injetar comando via metacaracteres na URL.
#[tauri::command]
// Shell::open está depreciado, mas é o opener-sem-shell já disponível (o plugin-shell
// já é inicializado). Migrar p/ tauri-plugin-opener fica de follow-up.
#[allow(deprecated)]
pub fn open_url(app: tauri::AppHandle, url: String) -> Result<(), String> {
    use tauri_plugin_shell::ShellExt;

    // Parse estrito: exige esquema http/https E um host. Rejeita caminhos,
    // esquemas exóticos (file:, javascript:) e URLs sem host.
    let parsed = url::Url::parse(url.trim()).map_err(|_| "URL inválida.".to_string())?;
    if parsed.scheme() != "http" && parsed.scheme() != "https" {
        return Err("URL inválida.".to_string());
    }
    if parsed.host_str().map(|h| h.is_empty()).unwrap_or(true) {
        return Err("URL inválida.".to_string());
    }
    // Rejeita userinfo embutido (http://user:senha@host): não há uso legítimo aqui
    // e pode mascarar o destino real da URL.
    if !parsed.username().is_empty() || parsed.password().is_some() {
        return Err("URL inválida.".to_string());
    }

    // Opener nativo (sem shell) — abre no navegador padrão sem passar por cmd.exe.
    app.shell()
        .open(parsed.as_str(), None)
        .map_err(|e| e.to_string())
}

/// Versão de uma atualização pendente (a UI puxa ao montar). `None` = nada novo.
#[tauri::command]
pub fn get_pending_update(state: State<AppState>) -> Option<String> {
    lock(&state.pending_update).clone()
}

/// Baixa e instala a atualização disponível e REINICIA o app. Re-checa pra obter
/// um handle fresco do update (o objeto do check anterior não é guardável). Em
/// sucesso o app reinicia (a chamada não retorna); em falha, devolve o erro.
#[tauri::command]
pub async fn install_update(app: tauri::AppHandle) -> Result<(), String> {
    use tauri_plugin_updater::UpdaterExt;
    let checked = app
        .updater()
        .map_err(|e| e.to_string())?
        .check()
        .await
        // Falha aqui é quase sempre rede/endpoint — palavreado RETENTÁVEL, não um
        // seco "nenhuma atualização" (que confundiria com o caso Ok(None)).
        .map_err(|e| {
            format!("Não consegui verificar a atualização agora (rede?). Tente de novo. [{e}]")
        })?;

    let Some(update) = checked else {
        // Sem atualização: limpa o estado pendente e avisa a UI com uma mensagem
        // clara (em vez de tratar como erro de "indisponível").
        {
            let state = app.state::<AppState>();
            *lock(&state.pending_update) = None;
        }
        let _ = app.emit("update-none", ());
        return Ok(());
    };

    update
        .download_and_install(|_chunk, _total| {}, || {})
        .await
        .map_err(|e| e.to_string())?;
    app.restart();
}

/// Resumo do uso da API no mês corrente (pra UI): nº de refinos + custo estimado.
#[tauri::command]
pub fn get_usage(state: State<AppState>) -> crate::usage::UsageSummary {
    state.usage.summary()
}

/// Histórico de uso por mês (pro gráfico de gastos do dashboard).
#[tauri::command]
pub fn get_usage_history(state: State<AppState>) -> Vec<crate::usage::MonthSummary> {
    state.usage.history()
}

/// Zera o contador de uso da API ("Zerar").
#[tauri::command]
pub fn reset_usage(state: State<AppState>) {
    state.usage.reset();
}
