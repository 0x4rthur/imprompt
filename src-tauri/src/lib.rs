//! lib.rs — A cola que une tudo.
//!
//! - Carrega settings e constrói o cliente de API sob demanda (em cache).
//! - Sobe a thread do gatilho Ctrl+C×2.
//! - Quando o gatilho dispara, executa o FLUXO: captura → refina → entrega,
//!   mostrando a janelinha "Refinando…" durante o processamento.

mod api_engine;
mod clipboard;
mod commands;
mod engine;
mod hotkey;
mod i18n;
mod presets;
mod secrets;
mod settings;
mod usage;

use std::panic::{catch_unwind, AssertUnwindSafe};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::mpsc;
use std::thread;

use tauri::menu::{Menu, MenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{Emitter, Manager, PhysicalPosition, WebviewUrl, WebviewWindowBuilder};

use commands::AppState;
use settings::{ActivationMode, Settings};

/// Trava um `Mutex` de forma POISON-SAFE: se uma thread em pane envenenou o lock,
/// recupera o dado em vez de propagar o pânico — o estado do app continua íntegro.
fn lock<T>(m: &std::sync::Mutex<T>) -> std::sync::MutexGuard<'_, T> {
    m.lock().unwrap_or_else(|e| e.into_inner())
}

/// Handles concretos dos `MenuItem` da bandeja (runtime `Wry`). Vivem AQUI (não em
/// commands.rs) pra o binário de testes da lib não puxar o WebView2 no load.
/// Guardados no `AppState` atrás do trait `commands::TrayRelabel`.
struct TrayItems {
    prefs: MenuItem<tauri::Wry>,
    undo: MenuItem<tauri::Wry>,
    update: MenuItem<tauri::Wry>,
    quit: MenuItem<tauri::Wry>,
}

impl commands::TrayRelabel for TrayItems {
    /// Re-rotula cada item no idioma dado (`set_text` é best-effort: ignora o erro
    /// raro de IPC do menu — a bandeja simplesmente fica no rótulo anterior).
    fn relabel(&self, locale: &str) {
        let _ = self.prefs.set_text(i18n::tr(locale, "tray.prefs"));
        let _ = self.undo.set_text(i18n::tr(locale, "tray.undo"));
        let _ = self.update.set_text(i18n::tr(locale, "tray.update"));
        let _ = self.quit.set_text(i18n::tr(locale, "tray.quit"));
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let loaded = Settings::load();

    tauri::Builder::default()
        // Instância única: precisa ser o 1º plugin. Encaminha uma 2ª invocação
        // (ex.: `imprompt --trigger` disparado por um atalho global do sistema no
        // Wayland) pra instância que já roda, em vez de abrir outra.
        .plugin(tauri_plugin_single_instance::init(|app, argv, _cwd| {
            if argv.iter().any(|a| a == "--trigger") {
                // Refina usando o motor (cliente de API) em cache da instância atual.
                let h = app.clone();
                std::thread::spawn(move || run_refine_flow(&h));
            } else if let Some(w) = app.get_webview_window("main") {
                // 2ª abertura normal → traz a janela de Preferências pra frente.
                let _ = w.show();
                let _ = w.set_focus();
            }
        }))
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            Some(vec!["--start-hidden"]),
        ))
        // Notificações nativas: avisam falha de refino no modo Instantâneo, que
        // não tem janela pra mostrar o erro.
        .plugin(tauri_plugin_notification::init())
        // Updater oficial (desktop): checa/baixa/instala releases assinados com a
        // chave cuja pública está no tauri.conf.json (ver UPDATER.md).
        .plugin(tauri_plugin_updater::Builder::new().build())
        .manage(AppState::new(loaded))
        .invoke_handler(tauri::generate_handler![
            commands::list_presets,
            commands::create_preset,
            commands::update_preset,
            commands::delete_preset,
            commands::restore_default_presets,
            commands::get_settings,
            commands::set_settings,
            commands::refine_text,
            commands::test_api_connection,
            commands::set_api_key,
            commands::get_api_key_status,
            commands::deliver_result,
            commands::get_history,
            commands::get_captured_text,
            commands::check_accessibility,
            commands::open_accessibility_settings,
            commands::open_url,
            commands::get_pending_update,
            commands::install_update,
            commands::get_usage,
            commands::get_usage_history,
            commands::reset_usage,
        ])
        .setup(|app| {
            let handle = app.handle().clone();

            // 1) Bandeja (tray) com menu: "Preferências" mostra a janela; "Sair"
            //    encerra o app de verdade. (Saímos da config e criamos aqui pra
            //    ter o menu.) Os rótulos saem do catálogo i18n no idioma INICIAL
            //    (lido do AppState); `set_settings` os re-rotula AO VIVO ao trocar
            //    de idioma, via os handles guardados em `AppState.tray_items`.
            let locale0 = lock(&handle.state::<commands::AppState>().settings)
                .locale
                .clone();
            let prefs_i = MenuItem::with_id(
                app,
                "prefs",
                i18n::tr(&locale0, "tray.prefs"),
                true,
                None::<&str>,
            )?;
            let undo_i = MenuItem::with_id(
                app,
                "undo",
                i18n::tr(&locale0, "tray.undo"),
                true,
                None::<&str>,
            )?;
            let update_i = MenuItem::with_id(
                app,
                "update",
                i18n::tr(&locale0, "tray.update"),
                true,
                None::<&str>,
            )?;
            let quit_i = MenuItem::with_id(
                app,
                "quit",
                i18n::tr(&locale0, "tray.quit"),
                true,
                None::<&str>,
            )?;
            let menu = Menu::with_items(app, &[&prefs_i, &undo_i, &update_i, &quit_i])?;
            // Guarda os handles (runtime concreto Wry) atrás do trait object
            // `TrayRelabel`, pra re-rotular ao vivo na troca de idioma.
            *lock(&handle.state::<commands::AppState>().tray_items) = Some(Box::new(TrayItems {
                prefs: prefs_i.clone(),
                undo: undo_i.clone(),
                update: update_i.clone(),
                quit: quit_i.clone(),
            }));
            let _tray = TrayIconBuilder::with_id("main")
                .icon(tauri::include_image!("icons/tray.png"))
                .tooltip("Imprompt")
                .menu(&menu)
                // Menu de contexto só no clique DIREITO (padrão Windows). O clique
                // ESQUERDO é tratado em on_tray_icon_event (abre as Preferências).
                .show_menu_on_left_click(false)
                .on_tray_icon_event(|tray, event| {
                    if let TrayIconEvent::Click {
                        button: MouseButton::Left,
                        button_state: MouseButtonState::Up,
                        ..
                    } = event
                    {
                        if let Some(w) = tray.app_handle().get_webview_window("main") {
                            let _ = w.show();
                            let _ = w.set_focus();
                        }
                    }
                })
                .on_menu_event(|app, event| match event.id.as_ref() {
                    "prefs" => {
                        if let Some(w) = app.get_webview_window("main") {
                            let _ = w.show();
                            let _ = w.set_focus();
                        }
                    }
                    "undo" => {
                        // Numa thread: o "colar" precisa do menu fechado e do foco
                        // de volta no app de origem.
                        let h = app.clone();
                        std::thread::spawn(move || undo_last_refine(&h));
                    }
                    "update" => {
                        // Mostra Preferências (onde o banner de update aparece) e
                        // checa sob demanda (explícito: avisa achando ou não).
                        if let Some(w) = app.get_webview_window("main") {
                            let _ = w.show();
                            let _ = w.set_focus();
                        }
                        spawn_update_check(app.clone(), true);
                    }
                    "quit" => app.exit(0),
                    _ => {}
                })
                .build(app)?;

            // 2) Janela "main" persistente: FECHAR não encerra o app — só esconde
            //    (ele continua na bandeja escutando o gatilho). E mostramos a
            //    janela na hora, a menos que o app tenha iniciado escondido
            //    (autostart com --start-hidden).
            let started_hidden = std::env::args().any(|a| a == "--start-hidden");
            if let Some(main) = app.get_webview_window("main") {
                let main_clone = main.clone();
                main.on_window_event(move |event| match event {
                    tauri::WindowEvent::CloseRequested { api, .. } => {
                        api.prevent_close();
                        let _ = main_clone.hide();
                    }
                    // Janela de tamanho LIMITADO e sem maximizar: se algo do SO
                    // maximizar mesmo assim (duplo-clique na barra custom, Win+↑,
                    // aero-snap pro topo — caminhos que `maximizable:false` NÃO cobre
                    // no Windows, ver tauri-apps/tauri#12006), desfaz na hora. Senão a
                    // janela "maximizada" fica grudada no canto e cortada pelos limites
                    // de maxWidth/maxHeight.
                    tauri::WindowEvent::Resized(_)
                        if main_clone.is_maximized().unwrap_or(false) =>
                    {
                        let _ = main_clone.unmaximize();
                    }
                    _ => {}
                });
                if !started_hidden {
                    let _ = main.show();
                    let _ = main.set_focus();
                }
            }

            // 3) LAZY-LOAD: o cliente de API é construído sob demanda, no PRIMEIRO
            //    refino, via `commands::ensure_engine_loaded` (o fluxo do gatilho
            //    mostra a janelinha "Refinando…" durante essa espera) — e fica
            //    em cache daí em diante. Construir o cliente de API é barato; o lazy
            //    serve pra ler a chave do cofre e aplicar as settings na hora do 1º refino.

            // 4) Sobe a thread do gatilho global + a thread que roda o fluxo.
            //    O listener lê a config (combo + debounce) AO VIVO do AppState.
            let (tx, rx) = mpsc::channel();
            let trigger = handle.state::<commands::AppState>().trigger.clone();
            thread::spawn(move || hotkey::run(tx, trigger));
            let flow_handle = handle.clone();
            thread::spawn(move || {
                while rx.recv().is_ok() {
                    // catch_unwind: se run_refine_flow entrar em panic (ex.: pânico
                    // interno do arboard/enigo/tauri), a thread NÃO morre — senão o
                    // gatilho ficaria permanentemente morto sem aviso. O RefiningGuard
                    // já zera REFINING no unwind; o estado compartilhado é protegido
                    // por locks poison-safe, então AssertUnwindSafe é aceitável.
                    if catch_unwind(AssertUnwindSafe(|| run_refine_flow(&flow_handle))).is_err() {
                        eprintln!(
                            "[fluxo] run_refine_flow entrou em panic; mantendo a thread viva."
                        );
                    }
                    // Descarta gatilhos que chegaram DURANTE o refino: não
                    // enfileira refinos em cadeia se o usuário insistir no Ctrl+C×2.
                    while rx.try_recv().is_ok() {}
                }
            });

            // 5) Checagem de atualização no startup — SILENCIOSA: só avisa (e mostra
            //    o banner) se ACHAR algo; erro de rede/endpoint é ignorado.
            spawn_update_check(handle.clone(), false);

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("erro ao iniciar o Imprompt");
}

/// Flag global anti-sobreposição: `true` enquanto um refino do gatilho roda.
/// Um novo gatilho durante esse tempo é IGNORADO (não enfileira nem sobrepõe).
static REFINING: AtomicBool = AtomicBool::new(false);

/// Reseta `REFINING` ao sair do fluxo por QUALQUER caminho (early return ou
/// panic). RAII pra nunca esquecer de liberar o flag.
struct RefiningGuard;
impl Drop for RefiningGuard {
    fn drop(&mut self) {
        REFINING.store(false, Ordering::SeqCst);
    }
}

/// O FLUXO completo, do gatilho à entrega. Roda fora da UI thread.
fn run_refine_flow(app: &tauri::AppHandle) {
    // Anti-sobreposição: se já tem um refino rolando, ignora este gatilho.
    if REFINING
        .compare_exchange(false, true, Ordering::SeqCst, Ordering::SeqCst)
        .is_err()
    {
        return;
    }
    let _guard = RefiningGuard; // libera o flag ao sair (qualquer caminho)

    // Lê as preferências atuais.
    let (mode, preset_id, output, use_examples, locale) = {
        let state: tauri::State<AppState> = app.state();
        let s = lock(&state.settings);
        (
            s.mode.clone(),
            s.default_preset.clone(),
            s.output.clone(),
            s.use_examples,
            s.locale.clone(),
        )
    };

    // Captura o texto que o usuário acabou de copiar.
    let text = match clipboard::read_selection() {
        Ok(t) => t,
        Err(_) => return, // clipboard vazio: não faz nada (e não atrapalha)
    };

    match mode {
        ActivationMode::Instant => {
            // Mostra a janelinha "Refinando…".
            show_loader(app);

            // LAZY-LOAD: garante o motor carregado (constrói o cliente de API no 1º
            // refino; a janelinha acima cobre a espera) e clona o handle. O refino
            // roda FORA de qualquer lock — não segura o lock do engine durante o HTTP.
            let result = match commands::ensure_engine_loaded(app) {
                Ok(engine) => {
                    let all = presets::all_presets(&locale);
                    let preset = presets::find_preset(&all, &preset_id, &locale);
                    let example = preset.example_for(use_examples);
                    engine.refine(&preset.system_prompt(&locale), example, &text)
                }
                Err(e) => Err(e),
            };

            hide_loader(app);

            match result {
                Ok(refined) => {
                    // Registra no histórico ANTES de entregar (pro "desfazer").
                    {
                        let state: tauri::State<AppState> = app.state();
                        state.push_history(&text, &refined, &preset_id);
                    }
                    let _ = clipboard::deliver(&refined, output.into());
                }
                Err(e) => {
                    // Sem janela no modo Instantâneo → avisa com uma notificação
                    // nativa do SO (em vez de só logar e falhar mudo). A mensagem do
                    // erro é uma CHAVE i18n (ou detalhe técnico cru) → traduz aqui.
                    notify_error(app, &i18n::tr_msg(&locale, &e.to_string()));
                }
            }
        }
        ActivationMode::Popup => {
            // No modo popup, abre a janela de escolha de preset, passando o texto.
            // (A janela popup é um WebviewWindow separado que usa os comandos
            // refine_text/list_presets e chama clipboard::deliver no fim.)
            open_popup_window(app, &text);
        }
    }
}

/// Cria/mostra a micro-janela "Refinando…". Sem bordas, sempre no topo, some
/// quando o refino acaba. É o indicador de processamento durante o refino.
fn show_loader(app: &tauri::AppHandle) {
    if let Some(win) = app.get_webview_window("loader") {
        // Já existe (reuso entre ativações): só mostra. Loga falha em vez de
        // engolir — se a janelinha não aparecer, o usuário fica sem feedback.
        if let Err(e) = win.show() {
            eprintln!("[loader] falha ao mostrar a janelinha: {e}");
        }
        return;
    }
    // 1ª vez: constrói a micro-janela. Loga falha de build (build silencioso
    // deixaria o refino rodando sem nenhum indicador visível).
    if let Err(e) = WebviewWindowBuilder::new(app, "loader", WebviewUrl::App("loader.html".into()))
        .title("Imprompt")
        .inner_size(190.0, 56.0)
        .decorations(false)
        .always_on_top(true)
        .resizable(false)
        .skip_taskbar(true)
        .transparent(true)
        .build()
    {
        eprintln!("[loader] falha ao criar a janelinha: {e}");
    }
}

fn hide_loader(app: &tauri::AppHandle) {
    if let Some(win) = app.get_webview_window("loader") {
        if let Err(e) = win.hide() {
            eprintln!("[loader] falha ao esconder a janelinha: {e}");
        }
    }
}

/// Notificação nativa do SO (best-effort: se o SO recusar, não quebra o fluxo).
fn notify(app: &tauri::AppHandle, title: &str, body: &str) {
    use tauri_plugin_notification::NotificationExt;
    let _ = app.notification().builder().title(title).body(body).show();
}

/// Lê o locale atual do `AppState` (fonte da verdade do idioma).
fn current_locale(app: &tauri::AppHandle) -> String {
    let state: tauri::State<AppState> = app.state();
    let guard = lock(&state.settings);
    guard.locale.clone()
}

/// Atalho pra notificar falha de refino. `message` JÁ vem traduzido (ou é um
/// detalhe técnico cru); o título sai do catálogo no idioma atual.
fn notify_error(app: &tauri::AppHandle, message: &str) {
    let loc = current_locale(app);
    notify(app, i18n::tr(&loc, "notif.fail.title"), message);
}

/// Checa atualização em background. `explicit` = o usuário pediu pela bandeja
/// (avisa também "já está atualizado" e erros); no startup é silencioso (só
/// surfaceia se ACHAR uma versão nova). O banner de "baixar e reiniciar" aparece
/// na janela de Preferências via o evento `update-available` (+ pull em
/// get_pending_update, que cobre a janela ainda não montada).
fn spawn_update_check(app: tauri::AppHandle, explicit: bool) {
    tauri::async_runtime::spawn(async move {
        use tauri_plugin_updater::UpdaterExt;
        let checked = match app.updater() {
            Ok(updater) => updater.check().await,
            Err(e) => Err(e),
        };
        let loc = current_locale(&app);
        match checked {
            Ok(Some(update)) => {
                let version = update.version.clone();
                {
                    let state: tauri::State<AppState> = app.state();
                    *lock(&state.pending_update) = Some(version.clone());
                }
                let _ = app.emit("update-available", version.clone());
                notify(
                    &app,
                    i18n::tr(&loc, "notif.update.title"),
                    &i18n::tr_args(&loc, "notif.update.available", &[&version]),
                );
            }
            Ok(None) => {
                {
                    let state: tauri::State<AppState> = app.state();
                    *lock(&state.pending_update) = None;
                }
                if explicit {
                    let _ = app.emit("update-none", ());
                    notify(
                        &app,
                        i18n::tr(&loc, "notif.update.title"),
                        i18n::tr(&loc, "notif.update.uptodate"),
                    );
                }
            }
            Err(e) => {
                // Startup: erro de rede/endpoint é silencioso (não atrapalha o uso).
                if explicit {
                    notify(
                        &app,
                        i18n::tr(&loc, "notif.update.checkfail.title"),
                        &i18n::tr_args(&loc, "notif.update.checkfail", &[&e.to_string()]),
                    );
                }
            }
        }
    });
}

/// Desfaz o último refino: devolve o texto ORIGINAL (do histórico) ao clipboard
/// e, no modo Substituir, cola por cima (mesmo mecanismo de `clipboard::deliver`).
/// Roda numa thread própria (chamado do menu da bandeja).
fn undo_last_refine(app: &tauri::AppHandle) {
    let state: tauri::State<AppState> = app.state();

    let loc = lock(&state.settings).locale.clone();

    // Pega o original do refino mais recente (sem segurar o lock além do statement).
    let original = lock(&state.history).first().map(|r| r.original.clone());
    let Some(original) = original else {
        notify(
            app,
            i18n::tr(&loc, "notif.update.title"),
            i18n::tr(&loc, "notif.undo.none"),
        );
        return;
    };

    // Modo de saída atual: cola por cima (Substituir) ou só repõe o clipboard.
    let mode: clipboard::OutputMode = lock(&state.settings).output.clone().into();

    // Deixa o menu da bandeja fechar e o foco voltar pro app de origem antes do paste.
    std::thread::sleep(std::time::Duration::from_millis(150));
    let _ = clipboard::deliver(&original, mode);

    let msg_key = match mode {
        clipboard::OutputMode::Replace => "notif.undo.pasted",
        clipboard::OutputMode::Clipboard => "notif.undo.clipboard",
    };
    notify(
        app,
        i18n::tr(&loc, "notif.undo.title"),
        i18n::tr(&loc, msg_key),
    );
}

/// Posiciona o popup PERTO DO CURSOR (com um pequeno offset pra não cobrir a
/// setinha), fazendo clamp na área de trabalho do monitor sob o cursor pra a
/// janela caber inteira na tela. Fallback: centraliza. Posiciona em coordenadas
/// FÍSICAS (Win32/Tauri já são físicas). Chamado a CADA abertura (build e reuso).
fn position_popup(app: &tauri::AppHandle, win: &tauri::WebviewWindow) {
    let cursor = match app.cursor_position() {
        Ok(c) => c,
        Err(_) => {
            let _ = win.center();
            return;
        }
    };
    let (cx, cy) = (cursor.x as i32, cursor.y as i32);
    // Tamanho FIXO da janela do popup (sem resize dinâmico — evita qualquer loop).
    let (w, h) = (496i32, 430i32);
    // Monitor sob o cursor (fallback: primário) pra posicionar/clampar na tela certa.
    let mon = app
        .available_monitors()
        .ok()
        .and_then(|ms| {
            ms.into_iter().find(|m| {
                let p = m.position();
                let s = m.size();
                cx >= p.x && cx < p.x + s.width as i32 && cy >= p.y && cy < p.y + s.height as i32
            })
        })
        .or_else(|| app.primary_monitor().ok().flatten());
    // Sem monitor → fallback seguro: centraliza.
    let m = match mon {
        Some(m) => m,
        None => {
            let _ = win.center();
            return;
        }
    };
    let p = m.position();
    let s = m.size();
    // Centro do popup = o cursor PUXADO em direção ao centro da tela. Assim ele
    // aparece perto de onde o texto foi copiado, mas gravita pro meio — não cola
    // nas bordas nem fica "muito embaixo" (atrás da barra de tarefas). A VERTICAL
    // puxa mais (era a queixa); a HORIZONTAL fica mais perto do cursor (do texto).
    let scx = p.x + s.width as i32 / 2;
    let scy = p.y + s.height as i32 / 2;
    let pcx = cx + ((scx - cx) as f32 * 0.30) as i32;
    let pcy = cy + ((scy - cy) as f32 * 0.55) as i32;
    // Margem generosa pra respirar das bordas e da barra de tarefas.
    let margin = 24;
    let min_x = p.x + margin;
    let min_y = p.y + margin;
    let max_x = (p.x + s.width as i32 - w - margin).max(min_x);
    let max_y = (p.y + s.height as i32 - h - margin).max(min_y);
    let x = (pcx - w / 2).clamp(min_x, max_x);
    let y = (pcy - h / 2).clamp(min_y, max_y);
    let _ = win.set_position(PhysicalPosition::new(x, y));
}

/// Abre a janela do popup (modo Popup) e entrega o texto capturado pra ela.
/// Guarda o texto no estado (a janela PUXA via `get_captured_text` ao montar —
/// cobre o 1º open sem corrida) e EMITE um evento `captured-text` (atualiza a
/// janela quando ela é reusada num gatilho seguinte).
fn open_popup_window(app: &tauri::AppHandle, captured_text: &str) {
    {
        let state: tauri::State<AppState> = app.state();
        *lock(&state.captured) = captured_text.to_string();
    }

    if let Some(win) = app.get_webview_window("popup") {
        position_popup(app, &win); // re-ancora perto do cursor a CADA abertura (não só no build)
        let _ = win.show();
        let _ = win.set_focus();
    } else {
        match WebviewWindowBuilder::new(app, "popup", WebviewUrl::App("popup.html".into()))
            .title("Imprompt")
            .inner_size(496.0, 430.0)
            .decorations(false)
            .shadow(true) // janela OPACA com sombra nativa (igual à principal) — sem
            // transparência, então nenhuma animação revela o desktop atrás ("vidro").
            .skip_taskbar(true)
            .always_on_top(true)
            .visible(false) // constrói oculto, posiciona, e só então mostra (sem flash no centro)
            .build()
        {
            Ok(win) => {
                position_popup(app, &win);
                let _ = win.show();
                let _ = win.set_focus();
            }
            Err(e) => eprintln!("[popup] falha ao criar a janela: {e}"),
        }
    }

    // Avisa a janela do texto novo (chega se o listener já estiver montado).
    let _ = app.emit_to("popup", "captured-text", captured_text.to_string());
}
