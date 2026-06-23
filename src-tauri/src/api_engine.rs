//! api_engine.rs — Motor via API externa (formato OpenAI).
//!
//! Implementa a `trait Engine` (única implementação hoje), então o resto do app
//! fala com a trait e não precisa saber que por baixo é uma chamada HTTP. Um único
//! cliente cobre OpenAI, OpenRouter, DeepSeek, Gemini etc.: basta trocar a
//! `base_url` e o `model`.
//!
//! IMPORTANTE: usa `reqwest::blocking`, que NÃO pode rodar dentro do runtime
//! async do tokio (entra em pane). Por isso `refine` só é chamado de uma
//! `std::thread` real (o `refine_text` e o fluxo do gatilho fazem isso). O
//! `ApiEngine::new` só constrói o cliente (não faz request), então pode ser
//! criado em qualquer thread.

use std::sync::Arc;

use anyhow::{anyhow, Result};
use serde::{Deserialize, Serialize};

use crate::engine::{clean_output, Engine};
use crate::usage::{estimate_tokens, UsageTracker};

/// Timeout por requisição. Refino é curto; 20s cobre folgado e evita travar o
/// gatilho quando a API some.
const REQUEST_TIMEOUT: std::time::Duration = std::time::Duration::from_secs(20);

/// Quantas RETENTATIVAS após a 1ª falha transitória (total = 1 + MAX_RETRIES).
const MAX_RETRIES: usize = 2;

/// Backoff exponencial curto ANTES de cada retentativa (0,5s e depois 1,5s).
const BACKOFFS: [std::time::Duration; MAX_RETRIES] = [
    std::time::Duration::from_millis(500),
    std::time::Duration::from_millis(1500),
];

/// Teto GLOBAL de latência da cadeia de tentativas. Não iniciamos uma nova
/// tentativa se ela puder estourar isto — blinda o pior caso (timeouts repetidos
/// ~3×20s) sem deixar o usuário esperando ~1 min. Erros rápidos (429/5xx) ainda
/// fazem todas as retentativas; um timeout cheio (~20s) não dispara outra.
const TOTAL_DEADLINE: std::time::Duration = std::time::Duration::from_secs(25);

/// Chave i18n pra falha de transporte (timeout / sem conexão / DNS). A tradução
/// acontece na BORDA (comando/notify) via `i18n::tr_msg`.
const MSG_NETWORK: &str = "err.api.network";

pub struct ApiEngine {
    base_url: String,
    model: String,
    api_key: String,
    client: reqwest::blocking::Client,
    /// Contador de uso/custo da API. `None` nos usos que NÃO devem contar (ex.: o
    /// ping do "testar conexão" e os testes criam o ApiEngine sem tracker).
    usage_tracker: Option<Arc<UsageTracker>>,
}

impl ApiEngine {
    pub fn new(base_url: &str, model: &str, api_key: &str) -> Result<Self> {
        // Erros viram CHAVES i18n (traduzidas na borda via tr_msg). As mensagens
        // NUNCA ecoam a chave — as chaves de URL falam só da URL.
        if api_key.trim().is_empty() {
            return Err(anyhow!("err.api.no_key"));
        }
        if model.trim().is_empty() {
            return Err(anyhow!("err.api.no_model"));
        }
        // Valida a base_url ANTES de criar o cliente. Exige host; exige https —
        // EXCETO localhost/127.0.0.1, onde http é legítimo (proxy/servidor local).
        let trimmed_base = base_url.trim().trim_end_matches('/');
        let parsed = url::Url::parse(trimmed_base).map_err(|_| anyhow!("err.api.bad_url"))?;
        let scheme = parsed.scheme();
        if scheme != "http" && scheme != "https" {
            return Err(anyhow!("err.api.bad_url"));
        }
        let host = parsed
            .host_str()
            .ok_or_else(|| anyhow!("err.api.no_host"))?;
        let is_local =
            host.eq_ignore_ascii_case("localhost") || host == "127.0.0.1" || host == "::1";
        if scheme == "http" && !is_local {
            return Err(anyhow!("err.api.https_required"));
        }
        let client = reqwest::blocking::Client::builder()
            .timeout(REQUEST_TIMEOUT)
            // Sem redirects: um POST /chat/completions de API OpenAI-compatível
            // responde 200 direto. Não seguir redirects evita que um endpoint
            // comprometido encadeie saltos carregando o header Authorization (SEC-3).
            .redirect(reqwest::redirect::Policy::none())
            .build()
            .map_err(|e| {
                anyhow!(crate::i18n::key_with_args(
                    "err.api.client",
                    &[&e.to_string()]
                ))
            })?;
        Ok(Self {
            // Sem barra no fim pra não virar "//chat/completions" (já trimada acima).
            base_url: trimmed_base.to_string(),
            model: model.trim().to_string(),
            api_key: api_key.trim().to_string(),
            client,
            usage_tracker: None,
        })
    }

    /// Liga a contagem de uso/custo (só o motor da API em cache usa isto; o ping
    /// do "testar conexão" e os testes não, pra não poluir o contador).
    pub fn with_usage_tracker(mut self, tracker: Arc<UsageTracker>) -> Self {
        self.usage_tracker = Some(tracker);
        self
    }
}

// ── Tipos do payload (Chat Completions, formato OpenAI) ─────────────────────
#[derive(Serialize)]
struct ChatReq<'a> {
    model: &'a str,
    messages: Vec<ChatMsg<'a>>,
    temperature: f32,
}
#[derive(Serialize)]
struct ChatMsg<'a> {
    role: &'a str,
    content: &'a str,
}
#[derive(Deserialize)]
struct ChatResp {
    choices: Vec<Choice>,
    /// Contagem de tokens (formato OpenAI). Opcional: alguns provedores omitem.
    #[serde(default)]
    usage: Option<ApiUsage>,
}
#[derive(Deserialize)]
struct Choice {
    message: RespMsg,
}
#[derive(Deserialize)]
struct RespMsg {
    content: String,
}
#[derive(Deserialize)]
struct ApiUsage {
    #[serde(default)]
    prompt_tokens: Option<u64>,
    #[serde(default)]
    completion_tokens: Option<u64>,
}

impl Engine for ApiEngine {
    /// Refino robusto: timeout curto, retentativas com backoff em falhas
    /// transitórias (429, 5xx 500–504, timeout/conexão) e mensagens claras e
    /// acionáveis. Falhas do usuário (400/401/403) NÃO são repetidas.
    fn refine(
        &self,
        system_prompt: &str,
        example: Option<(&str, &str)>,
        user_text: &str,
    ) -> Result<String> {
        // Few-shot por TURNOS: system = base+diretiva; se houver exemplo, um turno
        // `user` (entrada) + um turno `assistant` (saída); por fim o texto real.
        // Montar como turnos — em vez de concatenar o exemplo no system — é o que
        // evita o exemplo vazar pra saída.
        let mut messages = vec![ChatMsg {
            role: "system",
            content: system_prompt,
        }];
        if let Some((input, output)) = example {
            messages.push(ChatMsg {
                role: "user",
                content: input,
            });
            messages.push(ChatMsg {
                role: "assistant",
                content: output,
            });
        }
        messages.push(ChatMsg {
            role: "user",
            content: user_text,
        });
        let body = ChatReq {
            model: &self.model,
            messages,
            // Baixo: refino deve ser fiel e estável, não criativo.
            temperature: 0.3,
        };
        let url = format!("{}/chat/completions", self.base_url);

        // 1 tentativa + até MAX_RETRIES retentativas; só repete em erro transitório
        // E enquanto couber no teto global de latência (TOTAL_DEADLINE).
        let start = std::time::Instant::now();
        let mut attempt = 0usize;
        loop {
            match self.try_once(&url, &body) {
                Ok((text, usage)) => {
                    // Contabiliza o refino (só se este motor tiver tracker = API).
                    self.record_usage(&body, &text, usage);
                    return Ok(text);
                }
                Err(err) => {
                    if should_retry(attempt, start.elapsed(), err.is_transient()) {
                        std::thread::sleep(BACKOFFS[attempt]);
                        attempt += 1;
                        continue;
                    }
                    return Err(anyhow!("{}", err.into_message()));
                }
            }
        }
    }
}

impl ApiEngine {
    /// Contabiliza UM refino no tracker (se houver). Usa os tokens do `usage` da
    /// resposta; se ausente, estima por ~4 chars/token a partir do prompt e da saída.
    fn record_usage(&self, body: &ChatReq, output: &str, usage: Option<(u64, u64)>) {
        let Some(tracker) = &self.usage_tracker else {
            return;
        };
        let (prompt, completion) = usage.unwrap_or_else(|| {
            let prompt_text: String = body
                .messages
                .iter()
                .map(|m| m.content)
                .collect::<Vec<_>>()
                .join("\n");
            (estimate_tokens(&prompt_text), estimate_tokens(output))
        });
        tracker.record(&self.model, prompt, completion);
    }

    /// UMA tentativa. Devolve `(texto, Option<(prompt_tokens, completion_tokens)>)`
    /// no sucesso; classifica falha em transitória (vale retry) ou permanente.
    fn try_once(
        &self,
        url: &str,
        body: &ChatReq,
    ) -> std::result::Result<(String, Option<(u64, u64)>), RefineError> {
        let resp = self
            .client
            .post(url)
            .bearer_auth(&self.api_key)
            .json(body)
            .send()
            .map_err(|_| {
                // Falha de transporte (timeout, conexão recusada, DNS): transitória.
                // Não interpolamos o erro (nem vaza a chave, nem confunde o usuário).
                RefineError::Transient(MSG_NETWORK.to_string())
            })?;

        let status = resp.status();
        if status.is_success() {
            let parsed: ChatResp = resp.json().map_err(|e| {
                RefineError::Permanent(crate::i18n::key_with_args(
                    "err.api.bad_format",
                    &[&e.to_string()],
                ))
            })?;
            // Tokens reais, se a API mandou (prompt E completion).
            let usage =
                parsed
                    .usage
                    .as_ref()
                    .and_then(|u| match (u.prompt_tokens, u.completion_tokens) {
                        (Some(p), Some(c)) => Some((p, c)),
                        _ => None,
                    });
            let content = parsed
                .choices
                .into_iter()
                .next()
                .map(|c| c.message.content)
                .ok_or_else(|| RefineError::Permanent("err.api.no_response".to_string()))?;
            // Limpeza compartilhada (engine::clean_output): tira cerca de markdown, preâmbulos etc.
            let cleaned = clean_output(&content);
            // Saída vazia APÓS a limpeza (ex.: modelo devolveu só uma cerca ``` ```,
            // ou só um preâmbulo conversacional que foi cortado). Sem este guard, o
            // modo Substituir colaria "" por cima da seleção, APAGANDO o texto do
            // usuário sem aviso (ver auditoria BUG-3) — vira erro permanente, que no
            // fluxo Instant cai em notify_error e no popup mostra a mensagem.
            if cleaned.trim().is_empty() {
                return Err(RefineError::Permanent("err.api.empty".to_string()));
            }
            return Ok((cleaned, usage));
        }

        let code = status.as_u16();
        let raw_body = resp.text().unwrap_or_default();
        Err(classify_status(code, &raw_body))
    }
}

/// Resultado de uma tentativa que falhou: a mensagem pronta pra UI + se vale
/// tentar de novo.
enum RefineError {
    /// Pode tentar de novo (429, 5xx 500–504, timeout/conexão).
    Transient(String),
    /// Não adianta repetir (401/403, demais 4xx, corpo inválido).
    Permanent(String),
}

impl RefineError {
    fn is_transient(&self) -> bool {
        matches!(self, RefineError::Transient(_))
    }
    fn into_message(self) -> String {
        match self {
            RefineError::Transient(m) | RefineError::Permanent(m) => m,
        }
    }
}

/// Mapeia um status HTTP de erro para CHAVE i18n (+ args via ARG_SEP) e se é
/// transitório. A tradução acontece na borda (`tr_msg`). O detalhe técnico da API
/// (extraído do corpo) é anexado como arg `{1}` JÁ com espaço à esquerda (ou vazio),
/// pra ficar "Erro temporário da API (503). model overloaded". PURA → testável.
fn classify_status(code: u16, raw_body: &str) -> RefineError {
    let detail = extract_api_error_message(raw_body);
    let detail_arg = with_detail("", &detail); // " detail" ou ""
    let code = code.to_string();
    match code.as_str() {
        "401" | "403" => RefineError::Permanent("err.api.unauthorized".to_string()),
        "429" => RefineError::Transient("err.api.rate_limit".to_string()),
        "500" | "501" | "502" | "503" | "504" => RefineError::Transient(
            crate::i18n::key_with_args("err.api.temporary", &[&code, &detail_arg]),
        ),
        _ => RefineError::Permanent(crate::i18n::key_with_args(
            "err.api.status",
            &[&code, &detail_arg],
        )),
    }
}

/// Extrai a mensagem de erro do corpo (formato OpenAI: `{"error":{"message":"…"}}`);
/// senão devolve um trecho do corpo cru.
fn extract_api_error_message(raw_body: &str) -> String {
    let body = raw_body.trim();
    if body.is_empty() {
        return String::new();
    }
    if let Ok(v) = serde_json::from_str::<serde_json::Value>(body) {
        if let Some(msg) = v
            .get("error")
            .and_then(|e| e.get("message"))
            .and_then(|m| m.as_str())
        {
            return msg.trim().to_string();
        }
    }
    body.chars().take(200).collect()
}

/// Concatena base + detalhe (se houver).
fn with_detail(base: &str, detail: &str) -> String {
    if detail.is_empty() {
        base.to_string()
    } else {
        format!("{base} {detail}")
    }
}

/// Decide se vale OUTRA tentativa: erro transitório, ainda dentro do nº de
/// retentativas, E com tempo no orçamento — não iniciamos uma tentativa cujo
/// pior caso (backoff + timeout cheio) estouraria o teto global. PURA → testável.
fn should_retry(attempt: usize, elapsed: std::time::Duration, transient: bool) -> bool {
    transient
        && attempt < MAX_RETRIES
        && elapsed + BACKOFFS[attempt] + REQUEST_TIMEOUT <= TOTAL_DEADLINE
}

#[cfg(test)]
mod tests {
    use super::*;

    // ── Validação de segurança da base_url em ApiEngine::new (sem rede) ──────────
    // Trava o comportamento que decide PARA ONDE a chave de API é enviada e confirma
    // que as mensagens de erro NUNCA ecoam a chave (auditoria TEST-2). new() não faz
    // request, então rodam offline.
    // As mensagens de erro agora são CHAVES i18n (traduzidas na borda). Os testes
    // verificam a CHAVE e confirmam que ela jamais ecoa a chave de API (SECRET).
    #[test]
    fn new_rejects_non_http_schemes() {
        for url in ["file:///etc/passwd", "javascript:alert(1)", "ftp://host/x"] {
            let e = ApiEngine::new(url, "gpt-4o-mini", "sk-key-SECRET")
                .err()
                .unwrap()
                .to_string();
            assert_eq!(e, "err.api.bad_url", "url={url}");
            assert!(!e.contains("SECRET"), "erro vazou a chave: {e}");
        }
    }

    #[test]
    fn new_rejects_http_for_remote_host() {
        let e = ApiEngine::new("http://example.com/v1", "gpt-4o-mini", "sk-key-SECRET")
            .err()
            .unwrap()
            .to_string();
        assert_eq!(e, "err.api.https_required", "msg={e}");
        assert!(!e.contains("SECRET"), "erro vazou a chave: {e}");
    }

    #[test]
    fn new_allows_http_only_for_localhost() {
        for url in ["http://localhost:1234/v1", "http://127.0.0.1:8080/v1"] {
            assert!(
                ApiEngine::new(url, "gpt-4o-mini", "sk-key").is_ok(),
                "deveria aceitar {url}"
            );
        }
    }

    #[test]
    fn new_allows_https_remote() {
        for url in ["https://api.openai.com/v1", "https://openrouter.ai/api/v1"] {
            assert!(
                ApiEngine::new(url, "gpt-4o-mini", "sk-key").is_ok(),
                "deveria aceitar {url}"
            );
        }
    }

    // classify_status agora devolve CHAVES i18n (+ args via ARG_SEP). Traduzimos a
    // mensagem com `i18n::tr_msg` antes de checar o texto user-facing.
    #[test]
    fn maps_auth_errors_to_invalid_key_and_no_retry() {
        for code in [401u16, 403] {
            let e = classify_status(code, "");
            assert!(!e.is_transient(), "{code} não deve repetir");
            assert_eq!(e.into_message(), "err.api.unauthorized");
        }
    }

    #[test]
    fn maps_429_to_rate_limit_and_retries() {
        let e = classify_status(429, "");
        assert!(e.is_transient());
        assert_eq!(e.into_message(), "err.api.rate_limit");
        assert_eq!(
            crate::i18n::tr_msg("pt-BR", "err.api.rate_limit"),
            "Limite de uso atingido. Tente em instantes."
        );
    }

    #[test]
    fn maps_5xx_500_504_to_transient_with_status() {
        for code in [500u16, 502, 503, 504] {
            let e = classify_status(code, "");
            assert!(e.is_transient(), "{code} deve repetir");
            // O código entra no texto traduzido (arg {0}).
            let m = crate::i18n::tr_msg("pt-BR", &e.into_message());
            assert!(m.contains(&code.to_string()), "msg={m}");
        }
    }

    #[test]
    fn maps_generic_4xx_to_permanent_with_status_and_body() {
        let e = classify_status(400, r#"{"error":{"message":"model not found"}}"#);
        assert!(!e.is_transient());
        let m = crate::i18n::tr_msg("en", &e.into_message());
        assert!(m.contains("400"), "msg={m}");
        assert!(m.contains("model not found"), "msg={m}");
    }

    #[test]
    fn extracts_openai_error_message_or_falls_back() {
        assert_eq!(
            extract_api_error_message(r#"{"error":{"message":"bad key"}}"#),
            "bad key"
        );
        assert_eq!(extract_api_error_message(""), "");
        assert_eq!(
            extract_api_error_message("texto cru qualquer"),
            "texto cru qualquer"
        );
    }

    #[test]
    fn should_retry_allows_fast_transient_within_budget() {
        use std::time::Duration;
        // Erros rápidos (429/5xx): ambas as retentativas cabem no teto.
        assert!(should_retry(0, Duration::from_millis(500), true));
        assert!(should_retry(1, Duration::from_millis(1500), true));
    }

    #[test]
    fn should_retry_stops_on_permanent_or_after_max() {
        use std::time::Duration;
        assert!(!should_retry(0, Duration::ZERO, false)); // permanente
        assert!(!should_retry(2, Duration::ZERO, true)); // estourou o nº de retries
    }

    #[test]
    fn should_retry_stops_when_budget_would_blow() {
        use std::time::Duration;
        // Após um timeout cheio (~20s), iniciar outra tentativa estouraria o teto.
        assert!(!should_retry(0, Duration::from_secs(20), true));
    }

    // ── Integração: forçam erros REAIS de rede → #[ignore]. Rodar com:
    //   cargo test --ignored it_bad_key_message           (precisa de internet → OpenAI 401)
    //   cargo test --ignored it_unreachable_host_message  (host .invalid → erro de rede)
    #[test]
    #[ignore]
    fn it_bad_key_message() {
        let eng = ApiEngine::new(
            "https://api.openai.com/v1",
            "gpt-4o-mini",
            "sk-invalid-deadbeef0000",
        )
        .unwrap();
        let err = eng
            .refine("Responda OK.", None, "ping")
            .err()
            .unwrap()
            .to_string();
        // refine() devolve a CHAVE crua (tradução é na borda).
        assert_eq!(err, "err.api.unauthorized", "msg inesperada: {err}");
    }

    #[test]
    #[ignore]
    fn it_unreachable_host_message() {
        // https pra passar a validação de base_url; o host .invalid falha no DNS.
        let eng = ApiEngine::new(
            "https://does-not-exist.invalid/v1",
            "gpt-4o-mini",
            "sk-whatever",
        )
        .unwrap();
        let err = eng
            .refine("Responda OK.", None, "ping")
            .err()
            .unwrap()
            .to_string();
        // refine() devolve a CHAVE crua de rede (tradução é na borda).
        assert_eq!(err, "err.api.network", "msg inesperada: {err}");
    }

    // ── A/B MANUAL: mesmo texto com few-shot ON vs OFF, nos presets pedidos.
    // Bate na API REAL (usa a chave do cofre e gasta alguns centavos) → #[ignore].
    // Rodar com:  cargo test --ignored ab_examples_on_off -- --nocapture
    #[test]
    #[ignore]
    fn ab_examples_on_off() {
        use crate::presets;
        let key = crate::secrets::load_api_key().expect("precisa de uma chave no cofre pro A/B");
        let eng = ApiEngine::new("https://api.openai.com/v1", "gpt-4o-mini", &key).unwrap();
        let all = presets::default_presets();
        let cases = [
            (
                "corrigir",
                "me faz um resumo desse texto ai mas nao muito grande pra eu manda pro chefe",
            ),
            (
                "ingles",
                "cria uma função python `soma_lista` que soma uma lista de números",
            ),
        ];
        for (pid, input) in cases {
            let p = presets::find_preset(&all, pid);
            let sys = p.system_prompt();
            let ex = (p.example_input.as_str(), p.example_output.as_str());
            let zero = eng.refine(&sys, None, input).unwrap();
            let few = eng.refine(&sys, Some(ex), input).unwrap();
            println!("\n========== preset={pid} | input={input:?}");
            println!("---------- ZERO-SHOT (use_examples=off) ----------\n{zero}");
            println!("---------- FEW-SHOT  (use_examples=on)  ----------\n{few}");
        }
    }

    // Conta refinos REAIS de API e confirma que o contador sobe E persiste (relê
    // do disco = reinício). Usa a chave do cofre e gasta alguns centavos → #[ignore].
    // Zera no fim pra não deixar lixo no contador. Rodar com:
    //   cargo test --ignored it_counts_and_persists_api_usage -- --nocapture
    #[test]
    #[ignore]
    fn it_counts_and_persists_api_usage() {
        use crate::usage::UsageTracker;
        let key = crate::secrets::load_api_key().expect("precisa de chave no cofre");
        let tracker = std::sync::Arc::new(UsageTracker::load());
        let before = tracker.summary().refinements;
        let eng = ApiEngine::new("https://api.openai.com/v1", "gpt-4o-mini", &key)
            .unwrap()
            .with_usage_tracker(tracker.clone());
        eng.refine("Responda apenas OK.", None, "ping um").unwrap();
        eng.refine("Responda apenas OK.", None, "ping dois")
            .unwrap();
        let after = tracker.summary();
        assert_eq!(after.refinements, before + 2, "o contador deve subir 2");
        assert!(after.cost_usd > 0.0, "o custo deve ser > 0");
        // Persistência: um tracker NOVO lê do disco e vê os mesmos refinos.
        let reloaded = UsageTracker::load();
        assert_eq!(reloaded.summary().refinements, after.refinements);
        println!(
            "uso após 2 refinos: {} refino(s) · US$ {:.6}",
            after.refinements, after.cost_usd
        );
        tracker.reset(); // não deixa o teste somando no contador real
    }
}
