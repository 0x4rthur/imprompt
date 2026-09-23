//! api_engine.rs — Motor via API externa (formato OpenAI).
//!
//! Implementa a `trait Engine` (única implementação hoje), então o resto do app
//! fala com a trait e não precisa saber que por baixo é uma chamada HTTP. Um único
//! cliente cobre Chat Completions, Responses e Anthropic Messages.
//!
//! IMPORTANTE: usa `reqwest::blocking`, que NÃO pode rodar dentro do runtime
//! async do tokio (entra em pane). Por isso `refine` só é chamado de uma
//! `std::thread` real (o `refine_text` e o fluxo do gatilho fazem isso). O
//! A construção e destruição do cliente também ficam fora do runtime async.

use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;

use anyhow::{anyhow, Result};
use serde::Serialize;
use serde_json::{json, Value};

use crate::api_endpoint::{ApiFormat, Endpoint};
use crate::engine::{clean_output, Engine};
use crate::usage::{estimate_tokens, UsageTracker};

/// Reasoning models can need longer even for a short refinement.
const REQUEST_TIMEOUT: std::time::Duration = std::time::Duration::from_secs(90);

/// Quantas RETENTATIVAS após a 1ª falha transitória (total = 1 + MAX_RETRIES).
const MAX_RETRIES: usize = 2;

/// Backoff exponencial curto ANTES de cada retentativa (0,5s e depois 1,5s).
const BACKOFFS: [std::time::Duration; MAX_RETRIES] = [
    std::time::Duration::from_millis(500),
    std::time::Duration::from_millis(1500),
];

/// Teto GLOBAL de latência da cadeia de tentativas. Não iniciamos uma nova
/// tentativa se ela puder estourar isto. Erros rápidos (429/5xx) ainda
/// fazem todas as retentativas; um timeout cheio não dispara outra.
const TOTAL_DEADLINE: std::time::Duration = std::time::Duration::from_secs(95);

/// Chave i18n pra falha de transporte (timeout / sem conexão / DNS). A tradução
/// acontece na BORDA (comando/notify) via `i18n::tr_msg`.
const MSG_NETWORK: &str = "err.api.network";

pub struct ApiEngine {
    endpoint: Endpoint,
    model: String,
    api_key: String,
    client: reqwest::blocking::Client,
    /// Contador de uso/custo da API. `None` nos usos que NÃO devem contar (ex.: o
    /// ping do "testar conexão" e os testes criam o ApiEngine sem tracker).
    usage_tracker: Option<Arc<UsageTracker>>,
    fast_mode: AtomicBool,
}

impl ApiEngine {
    #[cfg(test)]
    pub fn new(base_url: &str, model: &str, api_key: &str) -> Result<Self> {
        Self::with_format(base_url, model, api_key, ApiFormat::Auto)
    }

    pub fn with_format(
        base_url: &str,
        model: &str,
        api_key: &str,
        format: ApiFormat,
    ) -> Result<Self> {
        // Erros viram CHAVES i18n (traduzidas na borda via tr_msg). As mensagens
        // NUNCA ecoam a chave — as chaves de URL falam só da URL.
        let endpoint = Endpoint::parse(base_url, format)?;
        if api_key.trim().is_empty() && !endpoint.local {
            return Err(anyhow!("err.api.no_key"));
        }
        if model.trim().is_empty() {
            return Err(anyhow!("err.api.no_model"));
        }
        let client = reqwest::blocking::Client::builder()
            .timeout(REQUEST_TIMEOUT)
            .connect_timeout(std::time::Duration::from_secs(10))
            .pool_idle_timeout(std::time::Duration::from_secs(600))
            .tcp_keepalive(std::time::Duration::from_secs(60))
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
            endpoint,
            model: model.trim().to_string(),
            api_key: api_key.trim().to_string(),
            client,
            usage_tracker: None,
            fast_mode: AtomicBool::new(true),
        })
    }

    /// Liga a contagem de uso/custo (só o motor da API em cache usa isto; o ping
    /// do "testar conexão" e os testes não, pra não poluir o contador).
    pub fn with_usage_tracker(mut self, tracker: Arc<UsageTracker>) -> Self {
        self.usage_tracker = Some(tracker);
        self
    }

    pub fn with_fast_mode(self, enabled: bool) -> Self {
        self.fast_mode.store(enabled, Ordering::Relaxed);
        self
    }
}

// ── Tipos do payload (Chat Completions, formato OpenAI) ─────────────────────
#[derive(Serialize)]
struct ChatMsg<'a> {
    role: &'a str,
    content: &'a str,
}

type Completion = (String, Option<(u64, u64)>);

fn request_body(model: &str, format: ApiFormat, messages: &[ChatMsg<'_>]) -> Value {
    // Optional sampling parameters are intentionally omitted: reasoning models
    // and custom deployments have different capabilities and safe defaults.
    match format {
        ApiFormat::Anthropic => json!({
            "model": model, "system": messages[0].content,
            "messages": &messages[1..], "max_tokens": 8192,
        }),
        ApiFormat::Responses => json!({
            "model": model, "instructions": messages[0].content,
            "input": &messages[1..], "store": false,
        }),
        _ => json!({ "model": model, "messages": messages }),
    }
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
        let mut body = request_body(&self.model, self.endpoint.format, &messages);
        let mut optional = if self.fast_mode.load(Ordering::Relaxed) {
            crate::latency_policy::apply(&self.endpoint, &self.model, &mut body)
        } else {
            vec![]
        };

        // 1 tentativa + até MAX_RETRIES retentativas; só repete em erro transitório
        // E enquanto couber no teto global de latência (TOTAL_DEADLINE).
        let start = std::time::Instant::now();
        let mut attempt = 0usize;
        loop {
            match self.try_once(&body, &optional) {
                Ok((text, usage)) => {
                    // Contabiliza o refino (só se este motor tiver tracker = API).
                    self.record_usage(&messages, &text, usage);
                    return Ok(text);
                }
                Err(RefineError::UnsupportedOptional(_))
                    if !optional.is_empty() && should_retry(attempt, start.elapsed(), true) =>
                {
                    // Retry once after explicit rejection, remembering compatibility
                    // on the cached client. No extra request on successful calls.
                    for field in optional.drain(..) {
                        body.as_object_mut().unwrap().remove(field);
                    }
                    self.fast_mode.store(false, Ordering::Relaxed);
                    attempt += 1;
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
    fn record_usage(&self, messages: &[ChatMsg<'_>], output: &str, usage: Option<(u64, u64)>) {
        let Some(tracker) = &self.usage_tracker else {
            return;
        };
        let (prompt, completion) = usage.unwrap_or_else(|| {
            let prompt_text: String = messages
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
        body: &Value,
        optional: &[&str],
    ) -> std::result::Result<Completion, RefineError> {
        let mut request = self.client.post(&self.endpoint.url);
        if !self.api_key.is_empty() {
            request = if self.endpoint.format == ApiFormat::Anthropic {
                request.header("x-api-key", &self.api_key)
            } else {
                request.bearer_auth(&self.api_key)
            };
        }
        if self.endpoint.format == ApiFormat::Anthropic {
            request = request.header("anthropic-version", "2023-06-01");
        }
        let resp = request.json(body).send().map_err(|_| {
            // Falha de transporte (timeout, conexão recusada, DNS): transitória.
            // Não interpolamos o erro (nem vaza a chave, nem confunde o usuário).
            RefineError::Transient(MSG_NETWORK.to_string())
        })?;

        let status = resp.status();
        if status.is_success() {
            let parsed: Value = resp.json().map_err(|_| {
                RefineError::Permanent(crate::i18n::key_with_args(
                    "err.api.bad_format",
                    &["expected JSON"],
                ))
            })?;
            return parse_response(self.endpoint.format, &parsed)
                .map_err(|err| err.redact(&self.api_key));
        }

        let code = status.as_u16();
        let raw_body = resp.text().unwrap_or_default();
        if crate::latency_policy::rejected_optional(code, &raw_body, optional) {
            return Err(RefineError::UnsupportedOptional(
                classify_status(code, &raw_body).into_message(),
            )
            .redact(&self.api_key));
        }
        Err(classify_status(code, &raw_body).redact(&self.api_key))
    }
}

fn text_content(value: &Value) -> String {
    if let Some(text) = value.as_str() {
        return text.to_string();
    }
    value
        .as_array()
        .map(|blocks| {
            blocks
                .iter()
                .filter_map(|block| match block["type"].as_str() {
                    Some("text" | "output_text") => block["text"].as_str(),
                    _ => None,
                })
                .collect::<Vec<_>>()
                .join("")
        })
        .unwrap_or_default()
}

fn parse_response(
    format: ApiFormat,
    value: &Value,
) -> std::result::Result<Completion, RefineError> {
    if !value["error"].is_null() {
        let code = value["error"]["code"]
            .as_u64()
            .and_then(|code| u16::try_from(code).ok())
            .unwrap_or(400);
        return Err(classify_status(code, &value.to_string()));
    }
    let (content, input_tokens, output_tokens) = match format {
        ApiFormat::Anthropic => {
            if value["stop_reason"] == "max_tokens" {
                return Err(RefineError::Permanent("err.api.truncated".into()));
            }
            (
                text_content(&value["content"]),
                "input_tokens",
                "output_tokens",
            )
        }
        ApiFormat::Responses => {
            if matches!(
                value["status"].as_str(),
                Some("incomplete" | "failed" | "cancelled")
            ) {
                return Err(RefineError::Permanent("err.api.truncated".into()));
            }
            let output = value["output"]
                .as_array()
                .map(|items| {
                    items
                        .iter()
                        .filter(|item| item["type"] == "message" && item["role"] == "assistant")
                        .map(|item| text_content(&item["content"]))
                        .collect::<Vec<_>>()
                        .join("\n")
                })
                .unwrap_or_default();
            (output, "input_tokens", "output_tokens")
        }
        _ => {
            let choice = value["choices"]
                .get(0)
                .ok_or_else(|| RefineError::Permanent("err.api.no_response".into()))?;
            if choice["finish_reason"] == "length" {
                return Err(RefineError::Permanent("err.api.truncated".into()));
            }
            (
                text_content(&choice["message"]["content"]),
                "prompt_tokens",
                "completion_tokens",
            )
        }
    };
    let cleaned = clean_output(&content);
    if cleaned.trim().is_empty() {
        return Err(RefineError::Permanent("err.api.empty".into()));
    }
    let usage = value["usage"][input_tokens]
        .as_u64()
        .zip(value["usage"][output_tokens].as_u64());
    Ok((cleaned, usage))
}

/// Resultado de uma tentativa que falhou: a mensagem pronta pra UI + se vale
/// tentar de novo.
#[derive(Debug)]
enum RefineError {
    UnsupportedOptional(String),
    /// Pode tentar de novo (429, 5xx 500–504, timeout/conexão).
    Transient(String),
    /// Não adianta repetir (401/403, demais 4xx, corpo inválido).
    Permanent(String),
}

impl RefineError {
    fn redact(self, key: &str) -> Self {
        // Redact before shortening; otherwise truncation can expose a prefix
        // of a credential echoed by a custom provider.
        let sanitize = |msg: String| {
            let msg = if key.is_empty() {
                msg
            } else {
                msg.replace(key, "[redacted]")
            };
            msg.chars().take(600).collect()
        };
        match self {
            Self::Transient(msg) => Self::Transient(sanitize(msg)),
            Self::UnsupportedOptional(msg) => Self::UnsupportedOptional(sanitize(msg)),
            Self::Permanent(msg) => Self::Permanent(sanitize(msg)),
        }
    }
    fn is_transient(&self) -> bool {
        matches!(self, RefineError::Transient(_))
    }
    fn into_message(self) -> String {
        match self {
            RefineError::Transient(m)
            | RefineError::Permanent(m)
            | RefineError::UnsupportedOptional(m) => m,
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
        "408" | "500" | "502" | "503" | "504" | "529" => RefineError::Transient(
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
    body.to_string()
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

    // Real HTTP transport against loopback only. Never reads the user's vault.
    fn server(responses: Vec<(u16, String)>) -> (String, std::thread::JoinHandle<Vec<String>>) {
        use std::io::{BufRead, BufReader, Read, Write};
        let listener = std::net::TcpListener::bind("127.0.0.1:0").unwrap();
        let base = format!("http://{}/v1", listener.local_addr().unwrap());
        listener.set_nonblocking(true).unwrap();
        let handle = std::thread::spawn(move || {
            let mut requests = Vec::new();
            for (status, body) in responses {
                let deadline = std::time::Instant::now() + std::time::Duration::from_secs(10);
                let mut stream = loop {
                    match listener.accept() {
                        Ok((stream, _)) => break stream,
                        Err(error)
                            if error.kind() == std::io::ErrorKind::WouldBlock
                                && std::time::Instant::now() < deadline =>
                        {
                            std::thread::sleep(std::time::Duration::from_millis(5))
                        }
                        Err(error) => panic!("mock server: {error}"),
                    }
                };
                // Windows accepts can inherit the listener's nonblocking mode.
                // Read the complete request with bounded blocking IO.
                stream.set_nonblocking(false).unwrap();
                stream
                    .set_read_timeout(Some(std::time::Duration::from_secs(5)))
                    .unwrap();
                let mut reader = BufReader::new(&mut stream);
                let mut headers = String::new();
                let mut size = 0;
                loop {
                    let mut line = String::new();
                    assert!(reader.read_line(&mut line).unwrap() > 0);
                    if line == "\r\n" {
                        break;
                    }
                    if let Some(value) = line.to_ascii_lowercase().strip_prefix("content-length:") {
                        size = value.trim().parse::<usize>().unwrap();
                    }
                    headers.push_str(&line);
                }
                let mut payload = vec![0; size];
                reader.read_exact(&mut payload).unwrap();
                requests.push(format!(
                    "{headers}\r\n{}",
                    String::from_utf8(payload).unwrap()
                ));
                write!(stream, "HTTP/1.1 {status} Mock\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{body}", body.len()).unwrap();
            }
            requests
        });
        (base, handle)
    }

    #[test]
    fn reasoning_and_custom_models_do_not_receive_unsupported_sampling_parameters() {
        for model in [
            "gpt-5.6-luna",
            "o4-mini",
            "deepseek-reasoner",
            "gemini-2.5-pro",
            "grok-4",
            "org/custom-model",
        ] {
            let (base, server) = server(vec![(
                200,
                r#"{"choices":[{"message":{"content":"Refined text"}}]}"#.into(),
            )]);
            let engine =
                ApiEngine::new(&format!("{base}/chat/completions/"), model, "test-key").unwrap();
            assert_eq!(
                engine
                    .refine(
                        "system",
                        Some(("example input", "example output")),
                        "original"
                    )
                    .unwrap(),
                "Refined text"
            );
            let requests = server.join().unwrap();
            assert!(requests[0].starts_with("POST /v1/chat/completions HTTP/1.1"));
            let body: Value =
                serde_json::from_str(requests[0].split_once("\r\n\r\n").unwrap().1).unwrap();
            assert_eq!(body["model"], model);
            assert_eq!(body["messages"][2]["role"], "assistant");
            assert_eq!(body["messages"][3]["content"], "original");
            assert!(body.get("temperature").is_none());
            assert!(body.get("max_tokens").is_none());
        }
    }

    #[test]
    fn rejected_fast_control_falls_back_once_and_is_remembered() {
        let (base, server) = server(vec![
            (400, r#"{"error":{"message":"Unsupported parameter: reasoning_effort","param":"reasoning_effort"}}"#.into()),
            (200, r#"{"choices":[{"message":{"content":"OK"}}]}"#.into()),
            (200, r#"{"choices":[{"message":{"content":"OK"}}]}"#.into()),
        ]);
        let mut engine = ApiEngine::new(&base, "gpt-5-nano", "test-key").unwrap();
        // Exercise production policy over loopback transport, never the real API.
        engine.endpoint.base = "https://api.openai.com/v1".into();
        assert_eq!(engine.refine("system", None, "original").unwrap(), "OK");
        assert_eq!(engine.refine("system", None, "next").unwrap(), "OK");
        let bodies: Vec<Value> = server
            .join()
            .unwrap()
            .iter()
            .map(|request| serde_json::from_str(request.split_once("\r\n\r\n").unwrap().1).unwrap())
            .collect();
        assert_eq!(bodies.len(), 3);
        assert_eq!(bodies[0]["reasoning_effort"], "minimal");
        assert!(bodies[1].get("reasoning_effort").is_none());
        assert!(bodies[2].get("reasoning_effort").is_none());
    }

    #[test]
    fn fast_mode_opt_out_and_success_use_one_request_without_truncating_input() {
        let text = "Mantenha calcular_total, R$ 12,50 e 日本語. ".repeat(400);
        for enabled in [true, false] {
            let (base, server) = server(vec![(
                200,
                r#"{"choices":[{"message":{"content":"Complete answer"}}]}"#.into(),
            )]);
            let mut engine = ApiEngine::new(&base, "gpt-5-nano", "test-key")
                .unwrap()
                .with_fast_mode(enabled);
            engine.endpoint.base = "https://api.openai.com/v1".into();
            engine.refine("system", None, &text).unwrap();
            let requests = server.join().unwrap();
            assert_eq!(requests.len(), 1);
            let body: Value =
                serde_json::from_str(requests[0].split_once("\r\n\r\n").unwrap().1).unwrap();
            assert_eq!(body["messages"][1]["content"], text);
            assert_eq!(body.get("reasoning_effort").is_some(), enabled);
            assert!(body.get("max_completion_tokens").is_none());
        }
    }

    #[test]
    fn anthropic_uses_native_auth_system_prompt_and_text_blocks() {
        let (base, server) = server(vec![(200, r#"{"content":[{"type":"thinking","thinking":"private"},{"type":"text","text":"Refined"},{"type":"text","text":" text"}],"stop_reason":"end_turn","usage":{"input_tokens":12,"output_tokens":3}}"#.into())]);
        let engine =
            ApiEngine::with_format(&base, "claude-custom", "test-key", ApiFormat::Anthropic)
                .unwrap();
        assert_eq!(
            engine
                .refine("system", Some(("in", "out")), "text")
                .unwrap(),
            "Refined text"
        );
        let requests = server.join().unwrap();
        assert!(requests[0].starts_with("POST /v1/messages HTTP/1.1"));
        assert!(requests[0].contains("x-api-key: test-key"));
        assert!(requests[0].contains("anthropic-version: 2023-06-01"));
        assert!(!requests[0].contains("authorization:"));
        let body: Value =
            serde_json::from_str(requests[0].split_once("\r\n\r\n").unwrap().1).unwrap();
        assert_eq!(body["system"], "system");
        assert_eq!(body["messages"][0]["role"], "user");
        assert_eq!(body["messages"][1]["role"], "assistant");
        assert_eq!(body["messages"][2]["content"], "text");
        assert!(body["max_tokens"].as_u64().unwrap() > 0);
        assert!(body.get("temperature").is_none());
    }

    #[test]
    fn responses_endpoint_and_local_server_without_a_key() {
        let (base, server) = server(vec![(200, r#"{"status":"completed","output":[{"type":"reasoning","summary":[]},{"type":"message","role":"assistant","content":[{"type":"output_text","text":"Refined text"}]}],"usage":{"input_tokens":8,"output_tokens":5}}"#.into())]);
        let engine = ApiEngine::new(&format!("{base}/responses"), "custom", "").unwrap();
        assert_eq!(
            engine.refine("system", None, "text").unwrap(),
            "Refined text"
        );
        let requests = server.join().unwrap();
        assert!(requests[0].starts_with("POST /v1/responses HTTP/1.1"));
        assert!(!requests[0].contains("authorization:"));
        let body: Value =
            serde_json::from_str(requests[0].split_once("\r\n\r\n").unwrap().1).unwrap();
        assert_eq!(body["instructions"], "system");
        assert_eq!(body["input"][0]["content"], "text");
        assert_eq!(body["store"], false);
    }

    #[test]
    fn never_delivers_empty_reasoning_refusal_or_truncated_output() {
        for (format, response, error) in [
            (
                ApiFormat::ChatCompletions,
                json!({"choices":[{"message":{"content":null,"reasoning_content":"private"}}]}),
                "err.api.empty",
            ),
            (
                ApiFormat::ChatCompletions,
                json!({"choices":[{"message":{"content":null,"refusal":"no"}}]}),
                "err.api.empty",
            ),
            (
                ApiFormat::ChatCompletions,
                json!({"choices":[{"message":{"content":"partial"},"finish_reason":"length"}]}),
                "err.api.truncated",
            ),
            (
                ApiFormat::Responses,
                json!({"status":"incomplete","output":[]}),
                "err.api.truncated",
            ),
            (
                ApiFormat::Anthropic,
                json!({"content":[{"type":"text","text":"partial"}],"stop_reason":"max_tokens"}),
                "err.api.truncated",
            ),
        ] {
            assert_eq!(
                parse_response(format, &response)
                    .unwrap_err()
                    .into_message(),
                error
            );
        }
    }

    #[test]
    fn parses_text_blocks_and_usage_for_each_wire_format() {
        for (format, response) in [
            (
                ApiFormat::ChatCompletions,
                json!({"choices":[{"message":{"content":[{"type":"text","text":"Hello"}]}}],"usage":{"prompt_tokens":12,"completion_tokens":3}}),
            ),
            (
                ApiFormat::Anthropic,
                json!({"content":[{"type":"text","text":"Hello"}],"usage":{"input_tokens":12,"output_tokens":3}}),
            ),
            (
                ApiFormat::Responses,
                json!({"output":[{"type":"message","role":"assistant","content":[{"type":"output_text","text":"Hello"}]}],"usage":{"input_tokens":12,"output_tokens":3}}),
            ),
        ] {
            assert_eq!(
                parse_response(format, &response).unwrap(),
                ("Hello".into(), Some((12, 3)))
            );
        }
    }

    #[test]
    fn retries_provider_overload_but_not_invalid_configuration() {
        let (base, server) = server(vec![
            (529, r#"{"error":{"message":"overloaded"}}"#.into()),
            (200, r#"{"choices":[{"message":{"content":"OK"}}]}"#.into()),
        ]);
        assert_eq!(
            ApiEngine::new(&base, "custom", "key")
                .unwrap()
                .refine("sys", None, "ping")
                .unwrap(),
            "OK"
        );
        assert_eq!(server.join().unwrap().len(), 2);
        let (base, server) = self::server(vec![(
            400,
            r#"{"error":{"message":"bad model test-secret"}}"#.into(),
        )]);
        let error = ApiEngine::new(&base, "custom", "test-secret")
            .unwrap()
            .refine("sys", None, "ping")
            .unwrap_err()
            .to_string();
        assert!(error.contains("bad model [redacted]"));
        assert!(!error.contains("test-secret"));
        assert_eq!(server.join().unwrap().len(), 1);
    }

    #[test]
    fn handles_provider_errors_inside_a_successful_http_response() {
        let error = parse_response(
            ApiFormat::ChatCompletions,
            &json!({"error":{"code":503,"message":"provider unavailable"}}),
        )
        .unwrap_err();
        assert!(error.is_transient());
        assert!(error.into_message().contains("provider unavailable"));
    }

    #[test]
    fn redacts_credentials_before_shortening_provider_errors() {
        let key = "sk-long-test-credential-1234567890";
        for message in [
            format!("{} {key}", "x".repeat(480)),
            format!("{} {key}", "x".repeat(190)),
        ] {
            for body in [
                message.clone(),
                json!({"error":{"message":message}}).to_string(),
            ] {
                let error = classify_status(400, &body).redact(key).into_message();
                assert!(!error.contains("sk-long-test"));
                assert!(error.contains("[redacted]"));
            }
        }
    }

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
        // A full timeout leaves no budget for another request.
        assert!(!should_retry(0, REQUEST_TIMEOUT, true));
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
        let key = crate::secrets::load_api_key("https://api.openai.com/v1")
            .unwrap()
            .expect("precisa de uma chave no cofre pro A/B");
        let eng = ApiEngine::new("https://api.openai.com/v1", "gpt-4o-mini", &key).unwrap();
        // A/B com os inputs PT → usa o catálogo pt-BR (label/exemplos no idioma).
        let all = presets::default_presets("pt-BR");
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
            let p = presets::find_preset(&all, pid, "pt-BR");
            let sys = p.system_prompt("pt-BR");
            let ex = (p.example_input.as_str(), p.example_output.as_str());
            let zero = eng.refine(&sys, None, input).unwrap();
            let few = eng.refine(&sys, Some(ex), input).unwrap();
            println!("\n========== preset={pid} | input={input:?}");
            println!("---------- ZERO-SHOT (use_examples=off) ----------\n{zero}");
            println!("---------- FEW-SHOT  (use_examples=on)  ----------\n{few}");
        }
    }

    /// Opt-in, paid A/B using only synthetic inputs and the saved provider/model.
    /// Never changes settings, credentials or the user's usage/history files.
    #[test]
    #[ignore]
    fn ab_latency_saved_model() {
        assert_eq!(
            std::env::var("IMPROMPT_LIVE_LATENCY_TEST").as_deref(),
            Ok("1")
        );
        let path = dirs::config_dir().unwrap().join("imprompt/settings.json");
        let settings: crate::settings::Settings =
            serde_json::from_slice(&std::fs::read(path).unwrap()).unwrap();
        let key = crate::secrets::load_api_key(&settings.api_base_url)
            .unwrap()
            .expect("A saved API credential is required");
        let eng = ApiEngine::with_format(
            &settings.api_base_url,
            &settings.api_model,
            &key,
            settings.api_format,
        )
        .unwrap();
        let mut controls = json!({});
        assert!(!crate::latency_policy::apply(&eng.endpoint, &eng.model, &mut controls).is_empty());
        let presets = crate::presets::default_presets("pt-BR");
        let cases = [
            ("corrigir", "me faz um resumo desse relatorio em 3 topicos e mantem o prazo 25/09/2026 e o valor R$ 1.250,50"),
            ("ingles", "Crie uma função Python chamada `calcular_total` que some os preços, ignore valores negativos e mantenha a mensagem \"Valor inválido\"."),
            ("frontend", "o avatar do chat treme enquanto o bot digita e a mensagem nova pisca. corrige isso sem mudar o historico nem o alinhamento das mensagens"),
        ];
        let report_path =
            std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("target/latency-ab.json");
        let mut records = vec![];
        for (index, (id, input)) in cases.into_iter().enumerate() {
            let preset = crate::presets::find_preset(&presets, id, "pt-BR");
            let system = preset.system_prompt("pt-BR");
            let example = (settings.use_examples && preset.has_example()).then_some((
                preset.example_input.as_str(),
                preset.example_output.as_str(),
            ));
            // Alternate order and reuse one HTTP client to reduce warm-up bias.
            for fast in if index % 2 == 0 {
                [false, true]
            } else {
                [true, false]
            } {
                eng.fast_mode.store(fast, Ordering::Relaxed);
                let start = std::time::Instant::now();
                let output = eng.refine(&system, example, input).unwrap();
                let millis = start.elapsed().as_millis();
                println!(
                    "preset={id} fast={fast} elapsed_ms={millis} chars={}",
                    output.chars().count()
                );
                assert_eq!(
                    eng.fast_mode.load(Ordering::Relaxed),
                    fast,
                    "Speed control was rejected"
                );
                records.push(json!({
                    "model": eng.model, "preset": id, "fast": fast,
                    "elapsed_ms": millis, "input": input, "output": output,
                }));
                std::fs::write(&report_path, serde_json::to_vec_pretty(&records).unwrap()).unwrap();
            }
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
        let key = crate::secrets::load_api_key("https://api.openai.com/v1")
            .unwrap()
            .expect("precisa de chave no cofre");
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
