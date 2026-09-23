//! Lowest documented reasoning effort for known provider/model pairs.
//! Unknown endpoints/models keep their wire defaults; see docs/LATENCY.md.
use serde_json::{json, Value};

use crate::api_endpoint::{ApiFormat, Endpoint};

pub fn apply(endpoint: &Endpoint, model: &str, body: &mut Value) -> Vec<&'static str> {
    let Ok(url) = url::Url::parse(&endpoint.base) else {
        return vec![];
    };
    let host = url.host_str().unwrap_or_default();
    let mut effort = None;
    match host {
        "api.openai.com" => {
            effort = match model {
                "gpt-5.6-luna" | "gpt-5.6-terra" => Some("none"),
                "gpt-5"
                | "gpt-5-mini"
                | "gpt-5-nano"
                | "gpt-5-2025-08-07"
                | "gpt-5-mini-2025-08-07"
                | "gpt-5-nano-2025-08-07" => Some("minimal"),
                _ => None,
            };
        }
        "api.deepseek.com" if matches!(model, "deepseek-flash" | "deepseek-v4-pro") => {
            if endpoint.format == ApiFormat::Responses {
                effort = Some("none");
            } else if matches!(
                endpoint.format,
                ApiFormat::ChatCompletions | ApiFormat::Anthropic
            ) {
                body["thinking"] = json!({ "type": "disabled" });
                return vec!["thinking"];
            }
        }
        "api.anthropic.com"
            if model == "claude-sonnet-5" && endpoint.format == ApiFormat::Anthropic =>
        {
            body["thinking"] = json!({ "type": "disabled" });
            return vec!["thinking"];
        }
        "generativelanguage.googleapis.com" if endpoint.format == ApiFormat::ChatCompletions => {
            effort = match model {
                "gemini-3.5-flash-lite" | "gemini-3.1-flash-lite" => Some("minimal"),
                "gemini-3.8-flash" => Some("low"),
                _ => None,
            };
        }
        "api.x.ai" if model == "grok-4.7" => effort = Some("low"),
        "openrouter.ai" if endpoint.format == ApiFormat::ChatCompletions => {
            let reasoning = match model {
                "openai/gpt-5.6-luna" => Some(json!({ "effort": "none" })),
                "openai/gpt-oss-20b" => Some(json!({ "effort": "low" })),
                "deepseek/deepseek-v4.1-flash" | "qwen/qwen3.5-flash-02-23" => {
                    Some(json!({ "enabled": false }))
                }
                _ => None,
            };
            if let Some(reasoning) = reasoning {
                body["reasoning"] = reasoning;
                return vec!["reasoning"];
            }
        }
        _ => {}
    }
    if let Some(effort) = effort {
        match endpoint.format {
            ApiFormat::Responses => {
                body["reasoning"] = json!({ "effort": effort });
                return vec!["reasoning"];
            }
            ApiFormat::ChatCompletions => {
                body["reasoning_effort"] = json!(effort);
                return vec!["reasoning_effort"];
            }
            _ => {}
        }
    }
    vec![]
}

/// Only retry an explicit rejection of an optional field we actually sent.
/// Invalid models, auth, quota, timeouts and unrelated 400s never take this path.
pub fn rejected_optional(status: u16, raw: &str, fields: &[&str]) -> bool {
    if !matches!(status, 400 | 422) || fields.is_empty() {
        return false;
    }
    let Ok(error) = serde_json::from_str::<Value>(raw) else {
        return false;
    };
    let error = &error["error"];
    let message = error["message"]
        .as_str()
        .unwrap_or_default()
        .to_ascii_lowercase();
    let param = error["param"].as_str().unwrap_or_default();
    let rejected = [
        "unsupported",
        "not supported",
        "not support",
        "not allowed",
        "unrecognized",
        "unknown parameter",
        "invalid value",
        "must be one of",
        "extra inputs",
    ]
    .iter()
    .any(|text| message.contains(text));
    rejected
        && fields.iter().any(|field| {
            param == *field || param.starts_with(&format!("{field}.")) || message.contains(field)
        })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn selects_supported_low_latency_controls_across_providers() {
        for (base, model, format, expected) in [
            (
                "https://api.openai.com/v1",
                "gpt-5-nano",
                ApiFormat::ChatCompletions,
                json!({"reasoning_effort":"minimal"}),
            ),
            (
                "https://api.openai.com/v1",
                "gpt-5.6-luna",
                ApiFormat::Responses,
                json!({"reasoning":{"effort":"none"}}),
            ),
            (
                "https://api.anthropic.com/v1",
                "claude-sonnet-5",
                ApiFormat::Anthropic,
                json!({"thinking":{"type":"disabled"}}),
            ),
            (
                "https://api.deepseek.com/v1",
                "deepseek-flash",
                ApiFormat::ChatCompletions,
                json!({"thinking":{"type":"disabled"}}),
            ),
            (
                "https://api.deepseek.com/v1",
                "deepseek-flash",
                ApiFormat::Responses,
                json!({"reasoning":{"effort":"none"}}),
            ),
            (
                "https://generativelanguage.googleapis.com/v1beta/openai",
                "gemini-3.1-flash-lite",
                ApiFormat::ChatCompletions,
                json!({"reasoning_effort":"minimal"}),
            ),
            (
                "https://generativelanguage.googleapis.com/v1beta/openai",
                "gemini-3.8-flash",
                ApiFormat::ChatCompletions,
                json!({"reasoning_effort":"low"}),
            ),
            (
                "https://api.x.ai/v1",
                "grok-4.7",
                ApiFormat::Responses,
                json!({"reasoning":{"effort":"low"}}),
            ),
            (
                "https://openrouter.ai/api/v1",
                "openai/gpt-oss-20b",
                ApiFormat::ChatCompletions,
                json!({"reasoning":{"effort":"low"}}),
            ),
            (
                "https://openrouter.ai/api/v1",
                "deepseek/deepseek-v4.1-flash",
                ApiFormat::ChatCompletions,
                json!({"reasoning":{"enabled":false}}),
            ),
        ] {
            let mut body = json!({});
            assert!(!apply(&Endpoint::parse(base, format).unwrap(), model, &mut body).is_empty());
            assert_eq!(body, expected, "{model}");
        }
    }

    #[test]
    fn leaves_unknown_models_endpoints_and_formats_untouched() {
        for (base, model, format) in [
            (
                "https://proxy.example/v1",
                "gpt-5.6-luna",
                ApiFormat::ChatCompletions,
            ),
            (
                "http://localhost:1234/v1",
                "gpt-5-nano",
                ApiFormat::ChatCompletions,
            ),
            (
                "https://api.openai.com/v1",
                "my-custom-deployment",
                ApiFormat::ChatCompletions,
            ),
            (
                "https://api.openai.com/v1",
                "gpt-5-nano",
                ApiFormat::Anthropic,
            ),
            (
                "https://api.x.ai/v1",
                "grok-build-0.1",
                ApiFormat::ChatCompletions,
            ),
        ] {
            let mut body = json!({"model":model});
            assert!(apply(&Endpoint::parse(base, format).unwrap(), model, &mut body).is_empty());
            assert_eq!(body, json!({"model":model}));
        }
    }

    #[test]
    fn retries_only_a_rejected_control_that_was_sent() {
        let error = r#"{"error":{"message":"Unsupported value: reasoning_effort minimal","param":"reasoning_effort"}}"#;
        assert!(rejected_optional(400, error, &["reasoning_effort"]));
        assert!(!rejected_optional(401, error, &["reasoning_effort"]));
        assert!(!rejected_optional(400, error, &[]));
        assert!(!rejected_optional(
            400,
            r#"{"error":{"message":"Unknown model"}}"#,
            &["reasoning_effort"]
        ));
    }
}
