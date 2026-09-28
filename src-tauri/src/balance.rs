//! balance.rs — saldo da conta no provedor da API (quando ele deixa ler).
//!
//! Só dois provedores expõem isso com a chave comum de API:
//! - DeepSeek: `GET /user/balance` → saldo total da conta.
//! - OpenRouter: `GET /api/v1/key` → crédito restante DESTA chave (se ela tiver
//!   limite de gasto); sem limite, só o total já gasto por ela.
//!
//! Nos outros (OpenAI, Anthropic, Gemini, xAI) o saldo só aparece no site; a UI
//! mostra o link da página de cobrança.

use serde::Serialize;
use serde_json::Value;

#[derive(Serialize, Debug, PartialEq)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum Balance {
    /// Quanto ainda dá pra gastar.
    Remaining { amount: f64, currency: String },
    /// Só o gasto acumulado (chave sem limite no OpenRouter).
    Used { amount: f64, currency: String },
    /// O provedor não expõe saldo pela API; `billing_url` leva ao site (ou nada,
    /// em endpoint personalizado).
    Unsupported { billing_url: Option<String> },
}

#[derive(Debug, PartialEq, Clone, Copy)]
enum Provider {
    DeepSeek,
    OpenRouter,
    OpenAI,
    Anthropic,
    Gemini,
    Xai,
    Other,
}

fn provider(base_url: &str) -> Provider {
    let host = url::Url::parse(base_url.trim())
        .ok()
        .and_then(|u| u.host_str().map(str::to_ascii_lowercase))
        .unwrap_or_default();
    let is = |domain: &str| host == domain || host.ends_with(&format!(".{domain}"));
    if is("deepseek.com") {
        Provider::DeepSeek
    } else if is("openrouter.ai") {
        Provider::OpenRouter
    } else if is("openai.com") {
        Provider::OpenAI
    } else if is("anthropic.com") {
        Provider::Anthropic
    } else if is("googleapis.com") {
        Provider::Gemini
    } else if is("x.ai") {
        Provider::Xai
    } else {
        Provider::Other
    }
}

/// Página de cobrança do provedor (onde o saldo aparece).
fn billing_url(p: Provider) -> Option<&'static str> {
    match p {
        Provider::DeepSeek => Some("https://platform.deepseek.com/usage"),
        Provider::OpenRouter => Some("https://openrouter.ai/settings/credits"),
        Provider::OpenAI => {
            Some("https://platform.openai.com/settings/organization/billing/overview")
        }
        Provider::Anthropic => Some("https://console.anthropic.com/settings/billing"),
        Provider::Gemini => Some("https://aistudio.google.com/usage"),
        Provider::Xai => Some("https://console.x.ai/"),
        Provider::Other => None,
    }
}

fn unsupported(p: Provider) -> Balance {
    Balance::Unsupported {
        billing_url: billing_url(p).map(String::from),
    }
}

fn number(v: &Value) -> Option<f64> {
    match v {
        Value::Number(n) => n.as_f64(),
        Value::String(s) => s.trim().parse().ok(),
        _ => None,
    }
    .filter(|n: &f64| n.is_finite())
}

/// DeepSeek: `{ balance_infos: [{ currency, total_balance }] }` — prefere USD.
fn parse_deepseek(body: &str) -> Option<Balance> {
    let v: Value = serde_json::from_str(body).ok()?;
    let infos = v.get("balance_infos")?.as_array()?;
    let pick = infos
        .iter()
        .find(|i| i.get("currency").and_then(Value::as_str) == Some("USD"))
        .or_else(|| infos.first())?;
    Some(Balance::Remaining {
        amount: number(pick.get("total_balance")?)?,
        currency: pick
            .get("currency")
            .and_then(Value::as_str)
            .unwrap_or("USD")
            .to_string(),
    })
}

/// OpenRouter: `{ data: { limit_remaining, usage } }` (valores em USD).
fn parse_openrouter_key(body: &str) -> Option<Balance> {
    let v: Value = serde_json::from_str(body).ok()?;
    let data = v.get("data")?;
    if let Some(left) = data.get("limit_remaining").and_then(number) {
        return Some(Balance::Remaining {
            amount: left,
            currency: "USD".into(),
        });
    }
    Some(Balance::Used {
        amount: data.get("usage").and_then(number)?,
        currency: "USD".into(),
    })
}

/// URL de saldo de cada provedor que expõe (a partir da base configurada).
fn balance_endpoint(p: Provider, base_url: &str) -> Option<String> {
    let u = url::Url::parse(base_url.trim()).ok()?;
    let origin = format!("{}://{}", u.scheme(), u.host_str()?);
    match p {
        Provider::DeepSeek => Some(format!("{origin}/user/balance")),
        Provider::OpenRouter => Some(format!("{origin}/api/v1/key")),
        _ => None,
    }
}

/// Busca o saldo (bloqueante; chamar fora do runtime async). Erro de rede ou
/// resposta inesperada vira `Err` — a UI simplesmente não mostra o saldo.
pub fn fetch(base_url: &str, api_key: &str) -> anyhow::Result<Balance> {
    let p = provider(base_url);
    let Some(endpoint) = balance_endpoint(p, base_url) else {
        return Ok(unsupported(p));
    };
    if api_key.trim().is_empty() {
        anyhow::bail!("no key");
    }
    let client = reqwest::blocking::Client::builder()
        .timeout(std::time::Duration::from_secs(10))
        .redirect(reqwest::redirect::Policy::none())
        .build()?;
    let resp = client.get(&endpoint).bearer_auth(api_key.trim()).send()?;
    if !resp.status().is_success() {
        anyhow::bail!("status {}", resp.status().as_u16());
    }
    let body = resp.text()?;
    let parsed = match p {
        Provider::DeepSeek => parse_deepseek(&body),
        Provider::OpenRouter => parse_openrouter_key(&body),
        _ => None,
    };
    parsed.ok_or_else(|| anyhow::anyhow!("unexpected balance response"))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn deepseek_prefers_the_usd_balance() {
        let body = r#"{"is_available":true,"balance_infos":[
            {"currency":"CNY","total_balance":"110.00","granted_balance":"10.00","topped_up_balance":"100.00"},
            {"currency":"USD","total_balance":"4.20","granted_balance":"0.00","topped_up_balance":"4.20"}]}"#;
        assert_eq!(
            parse_deepseek(body),
            Some(Balance::Remaining {
                amount: 4.2,
                currency: "USD".into()
            })
        );
    }

    #[test]
    fn deepseek_falls_back_to_the_only_currency() {
        let body =
            r#"{"is_available":true,"balance_infos":[{"currency":"CNY","total_balance":"7.5"}]}"#;
        assert_eq!(
            parse_deepseek(body),
            Some(Balance::Remaining {
                amount: 7.5,
                currency: "CNY".into()
            })
        );
    }

    #[test]
    fn deepseek_without_balances_is_not_a_balance() {
        assert_eq!(
            parse_deepseek(r#"{"is_available":false,"balance_infos":[]}"#),
            None
        );
        assert_eq!(parse_deepseek("not json"), None);
    }

    #[test]
    fn openrouter_key_with_a_limit_reports_what_is_left() {
        let body = r#"{"data":{"label":"k","limit":10,"limit_remaining":3.25,"usage":6.75,"is_free_tier":false}}"#;
        assert_eq!(
            parse_openrouter_key(body),
            Some(Balance::Remaining {
                amount: 3.25,
                currency: "USD".into()
            })
        );
    }

    #[test]
    fn openrouter_key_without_a_limit_reports_what_was_spent() {
        let body = r#"{"data":{"label":"k","limit":null,"limit_remaining":null,"usage":1.5}}"#;
        assert_eq!(
            parse_openrouter_key(body),
            Some(Balance::Used {
                amount: 1.5,
                currency: "USD".into()
            })
        );
    }

    #[test]
    fn providers_are_recognised_by_host_not_by_substring() {
        assert_eq!(provider("https://api.deepseek.com"), Provider::DeepSeek);
        assert_eq!(
            provider("https://openrouter.ai/api/v1"),
            Provider::OpenRouter
        );
        assert_eq!(provider("https://api.openai.com/v1"), Provider::OpenAI);
        assert_eq!(
            provider("https://generativelanguage.googleapis.com/v1beta/openai"),
            Provider::Gemini
        );
        assert_eq!(provider("https://api.x.ai/v1"), Provider::Xai);
        assert_eq!(
            provider("https://deepseek.com.evil.example/v1"),
            Provider::Other
        );
        assert_eq!(provider("http://localhost:11434/v1"), Provider::Other);
    }

    #[test]
    fn balance_endpoints_use_the_provider_origin() {
        assert_eq!(
            balance_endpoint(Provider::DeepSeek, "https://api.deepseek.com/v1").as_deref(),
            Some("https://api.deepseek.com/user/balance")
        );
        assert_eq!(
            balance_endpoint(Provider::OpenRouter, "https://openrouter.ai/api/v1").as_deref(),
            Some("https://openrouter.ai/api/v1/key")
        );
        assert_eq!(
            balance_endpoint(Provider::OpenAI, "https://api.openai.com/v1"),
            None
        );
    }

    #[test]
    fn providers_without_a_balance_api_point_to_their_billing_page() {
        assert_eq!(
            fetch("https://api.anthropic.com/v1", "sk-x").unwrap(),
            Balance::Unsupported {
                billing_url: Some("https://console.anthropic.com/settings/billing".into())
            }
        );
        assert_eq!(
            fetch("http://localhost:1234/v1", "").unwrap(),
            Balance::Unsupported { billing_url: None }
        );
    }
}
