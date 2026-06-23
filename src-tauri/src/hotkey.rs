//! hotkey.rs — O gatilho (padrão: Ctrl+C×2), agora CONFIGURÁVEL.
//!
//! O detalhe delicado continua: o PRIMEIRO toque do combo é o atalho normal do
//! sistema (não mexemos nele); o SEGUNDO, se vier rápido (dentro da janela de
//! debounce), ATIVA o Imprompt. Por isso o combo recomendado é o Ctrl+C — é ele
//! que COPIA a seleção pro clipboard, que é de onde lemos o texto.
//!
//! Configurável: o modificador (Ctrl/Alt/Shift), a tecla (uma letra) e a janela
//! de debounce vivem num `TriggerShared` (atômicos) compartilhado com o app. As
//! Preferências atualizam isso AO VIVO — o callback do `rdev::listen` relê a
//! config a cada evento, sem precisar reiniciar o listener.
//!
//! Usamos `rdev` pra escutar eventos globais de teclado (mesma abordagem do
//! Handy). O `rdev` roda numa thread própria e é bloqueante.

use std::sync::atomic::{AtomicU64, AtomicU8, Ordering};
use std::sync::mpsc::Sender;
use std::sync::Arc;
use std::time::{Duration, Instant};

use rdev::{listen, Event, EventType, Key};

/// Limites da janela de debounce (ms) — espelham o slider da UI.
const DEBOUNCE_MIN: u64 = 250;
const DEBOUNCE_MAX: u64 = 600;

/// Por quanto tempo um press do modificador é considerado "ainda em baixo" sem um
/// novo evento. É só a REDE DE SEGURANÇA contra um `KeyRelease` perdido pelo rdev
/// (que, com um bool, latcharia `true` pra sempre). Generoso de propósito: o
/// usuário pode segurar o Ctrl e levar um tempinho entre os dois toques da tecla;
/// ainda assim, um modificador "preso" expira sozinho bem antes de causar um
/// disparo-fantasma de um duplo-toque solto muito depois.
const MOD_STALE_MS: u64 = 3_000;

/// Mensagem enviada pro resto do app quando o gatilho dispara.
pub enum HotkeyEvent {
    /// Combo×2 detectado — hora de capturar a seleção e refinar.
    Triggered,
}

/// Config do gatilho, compartilhada e atualizável ao vivo (atômicos = sem lock
/// no caminho quente do listener global).
pub struct TriggerShared {
    /// 0 = Ctrl, 1 = Alt, 2 = Shift.
    modifier: AtomicU8,
    /// Índice da letra: 0 = 'a' … 25 = 'z'.
    key: AtomicU8,
    /// Janela entre os dois toques (ms), já saneada pra [DEBOUNCE_MIN, DEBOUNCE_MAX].
    debounce_ms: AtomicU64,
}

impl TriggerShared {
    pub fn new(modifier: &str, key: &str, debounce_ms: u64) -> Self {
        Self {
            modifier: AtomicU8::new(modifier_code(modifier)),
            key: AtomicU8::new(key_index(key)),
            debounce_ms: AtomicU64::new(debounce_ms.clamp(DEBOUNCE_MIN, DEBOUNCE_MAX)),
        }
    }

    /// Atualiza a config (chamado pelo `set_settings`) — vale no próximo evento.
    pub fn set(&self, modifier: &str, key: &str, debounce_ms: u64) {
        self.modifier
            .store(modifier_code(modifier), Ordering::Relaxed);
        self.key.store(key_index(key), Ordering::Relaxed);
        self.debounce_ms.store(
            debounce_ms.clamp(DEBOUNCE_MIN, DEBOUNCE_MAX),
            Ordering::Relaxed,
        );
    }

    /// As duas variantes (esq./dir.) do modificador escolhido.
    fn modifier_keys(&self) -> (Key, Key) {
        match self.modifier.load(Ordering::Relaxed) {
            1 => (Key::Alt, Key::AltGr),
            2 => (Key::ShiftLeft, Key::ShiftRight),
            _ => (Key::ControlLeft, Key::ControlRight),
        }
    }

    fn activation_key(&self) -> Key {
        index_to_key(self.key.load(Ordering::Relaxed))
    }

    fn window(&self) -> Duration {
        Duration::from_millis(self.debounce_ms.load(Ordering::Relaxed))
    }
}

/// "ctrl"/"alt"/"shift" → código. Default Ctrl.
fn modifier_code(s: &str) -> u8 {
    match s.trim().to_ascii_lowercase().as_str() {
        "alt" => 1,
        "shift" => 2,
        _ => 0,
    }
}

/// Primeira letra a–z → índice 0..25. Senão 'c' (índice 2).
fn key_index(s: &str) -> u8 {
    match s.trim().to_ascii_lowercase().bytes().next() {
        Some(b) if b.is_ascii_lowercase() => b - b'a',
        _ => 2,
    }
}

/// Índice 0..25 → tecla do rdev (a–z). Fallback: KeyC.
fn index_to_key(idx: u8) -> Key {
    match idx {
        0 => Key::KeyA,
        1 => Key::KeyB,
        2 => Key::KeyC,
        3 => Key::KeyD,
        4 => Key::KeyE,
        5 => Key::KeyF,
        6 => Key::KeyG,
        7 => Key::KeyH,
        8 => Key::KeyI,
        9 => Key::KeyJ,
        10 => Key::KeyK,
        11 => Key::KeyL,
        12 => Key::KeyM,
        13 => Key::KeyN,
        14 => Key::KeyO,
        15 => Key::KeyP,
        16 => Key::KeyQ,
        17 => Key::KeyR,
        18 => Key::KeyS,
        19 => Key::KeyT,
        20 => Key::KeyU,
        21 => Key::KeyV,
        22 => Key::KeyW,
        23 => Key::KeyX,
        24 => Key::KeyY,
        25 => Key::KeyZ,
        _ => Key::KeyC,
    }
}

/// Estado interno do detector de duplo-toque.
struct TapState {
    shared: Arc<TriggerShared>,
    /// QUANDO o modificador foi visto pressionado (não um bool: um `KeyRelease`
    /// perdido pelo rdev deixaria um bool `true` preso pra sempre, fazendo um
    /// duplo-toque solto da tecla — SEM o modificador — disparar por engano). Com
    /// um timestamp, consideramos o modificador "em baixo" só se o press foi
    /// RECENTE (dentro da janela de debounce), e a expiração da janela o zera.
    mod_down_at: Option<Instant>,
    last: Option<Instant>,
}

impl TapState {
    fn new(shared: Arc<TriggerShared>) -> Self {
        Self {
            shared,
            mod_down_at: None,
            last: None,
        }
    }

    /// O modificador conta como "pressionado" só se o press foi recente (dentro da
    /// janela). Isso re-valida o estado na ativação e descarta um `KeyRelease`
    /// perdido — sem isso um bool latcharia `true` indefinidamente.
    fn mod_is_active(&self, now: Instant) -> bool {
        self.mod_down_at
            .map(|t| now.duration_since(t) <= Duration::from_millis(MOD_STALE_MS))
            .unwrap_or(false)
    }

    /// Processa um evento; `true` se foi o SEGUNDO toque do combo dentro da janela.
    fn handle(&mut self, event: &Event) -> bool {
        let (ml, mr) = self.shared.modifier_keys();
        let actk = self.shared.activation_key();
        match event.event_type {
            EventType::KeyPress(k) if k == ml || k == mr => {
                self.mod_down_at = Some(Instant::now());
                false
            }
            EventType::KeyRelease(k) if k == ml || k == mr => {
                self.mod_down_at = None;
                false
            }
            EventType::KeyPress(k) if k == actk => {
                let now = Instant::now();
                // Re-valida o modificador AGORA: precisa estar genuinamente em
                // baixo (press recente). Um KeyRelease perdido expira sozinho.
                if !self.mod_is_active(now) {
                    // Sem modificador ativo → não é o nosso combo. Zera a janela
                    // pra um duplo-toque solto não "vazar" pra uma ativação futura.
                    self.last = None;
                    return false;
                }
                let is_double = self
                    .last
                    .map(|t| now.duration_since(t) <= self.shared.window())
                    .unwrap_or(false);
                if is_double {
                    // 2º toque dentro da janela → dispara e zera (não dispara em
                    // cadeia se a pessoa segurar).
                    self.last = None;
                    true
                } else {
                    // 1º toque → só registra o tempo. O atalho normal do SO
                    // acontece naturalmente; a gente nem intercepta.
                    self.last = Some(now);
                    false
                }
            }
            _ => false,
        }
    }
}

/// Inicia o listener global. BLOQUEANTE — rode numa thread dedicada. Lê a config
/// (combo + debounce) AO VIVO do `shared` a cada evento.
pub fn run(tx: Sender<HotkeyEvent>, shared: Arc<TriggerShared>) {
    let mut state = TapState::new(shared);
    let callback = move |event: Event| {
        if state.handle(&event) {
            // Ignora erro de envio: se o receptor sumiu, o app está fechando.
            let _ = tx.send(HotkeyEvent::Triggered);
        }
    };
    if let Err(err) = listen(callback) {
        eprintln!("[hotkey] erro no listener global: {:?}", err);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn ev(t: EventType) -> Event {
        Event {
            time: std::time::SystemTime::now(),
            name: None,
            event_type: t,
        }
    }
    fn shared(modifier: &str, key: &str) -> Arc<TriggerShared> {
        Arc::new(TriggerShared::new(modifier, key, 400))
    }

    #[test]
    fn single_copy_does_not_trigger() {
        let mut s = TapState::new(shared("ctrl", "c"));
        assert!(!s.handle(&ev(EventType::KeyPress(Key::ControlLeft))));
        assert!(!s.handle(&ev(EventType::KeyPress(Key::KeyC))));
    }

    #[test]
    fn double_copy_triggers_default_ctrl_c() {
        let mut s = TapState::new(shared("ctrl", "c"));
        s.handle(&ev(EventType::KeyPress(Key::ControlLeft)));
        assert!(!s.handle(&ev(EventType::KeyPress(Key::KeyC)))); // 1º
        assert!(s.handle(&ev(EventType::KeyPress(Key::KeyC)))); // 2º → dispara
    }

    #[test]
    fn respects_configured_combo_alt_x() {
        let mut s = TapState::new(shared("alt", "x"));
        // Ctrl+C agora NÃO dispara (não é o combo configurado).
        s.handle(&ev(EventType::KeyPress(Key::ControlLeft)));
        assert!(!s.handle(&ev(EventType::KeyPress(Key::KeyC))));
        assert!(!s.handle(&ev(EventType::KeyPress(Key::KeyC))));
        // Alt+X×2 dispara.
        s.handle(&ev(EventType::KeyPress(Key::Alt)));
        assert!(!s.handle(&ev(EventType::KeyPress(Key::KeyX)))); // 1º
        assert!(s.handle(&ev(EventType::KeyPress(Key::KeyX)))); // 2º → dispara
    }

    #[test]
    fn live_update_changes_combo() {
        let sh = shared("ctrl", "c");
        let mut s = TapState::new(sh.clone());
        // Troca pro Alt+Q ao vivo.
        sh.set("alt", "q", 300);
        s.handle(&ev(EventType::KeyPress(Key::Alt)));
        assert!(!s.handle(&ev(EventType::KeyPress(Key::KeyQ))));
        assert!(s.handle(&ev(EventType::KeyPress(Key::KeyQ))));
    }

    #[test]
    fn lone_double_tap_without_modifier_does_not_trigger() {
        // Sem NENHUM press do modificador, dois toques rápidos da tecla de
        // ativação NÃO podem disparar (cobre o caso de um KeyRelease perdido que,
        // com um bool latchado, dispararia um refino-fantasma).
        let mut s = TapState::new(shared("ctrl", "c"));
        assert!(!s.handle(&ev(EventType::KeyPress(Key::KeyC)))); // 1º (solto)
        assert!(!s.handle(&ev(EventType::KeyPress(Key::KeyC)))); // 2º (solto)
    }

    #[test]
    fn release_then_lone_double_tap_does_not_trigger() {
        // Combo real seguido de um RELEASE do modificador e depois um duplo-toque
        // solto da tecla: o release zera o estado, então não dispara.
        let mut s = TapState::new(shared("ctrl", "c"));
        s.handle(&ev(EventType::KeyPress(Key::ControlLeft)));
        s.handle(&ev(EventType::KeyRelease(Key::ControlLeft)));
        assert!(!s.handle(&ev(EventType::KeyPress(Key::KeyC))));
        assert!(!s.handle(&ev(EventType::KeyPress(Key::KeyC))));
    }

    #[test]
    fn debounce_is_clamped() {
        let sh = TriggerShared::new("ctrl", "c", 999); // acima do máximo
        assert_eq!(sh.window(), Duration::from_millis(DEBOUNCE_MAX));
        sh.set("ctrl", "c", 10); // abaixo do mínimo
        assert_eq!(sh.window(), Duration::from_millis(DEBOUNCE_MIN));
    }
}
