//! Endpoint normalization shared by requests and credential storage.
use anyhow::{anyhow, Result};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ApiFormat {
    #[default]
    Auto,
    ChatCompletions,
    Responses,
    Anthropic,
}

pub struct Endpoint {
    pub base: String,
    pub url: String,
    pub format: ApiFormat,
    pub local: bool,
}

impl Endpoint {
    pub fn parse(base: &str, format: ApiFormat) -> Result<Self> {
        let mut url = url::Url::parse(base.trim()).map_err(|_| anyhow!("err.api.bad_url"))?;
        if !matches!(url.scheme(), "http" | "https")
            || !url.username().is_empty()
            || url.password().is_some()
            || url.fragment().is_some()
        {
            return Err(anyhow!("err.api.bad_url"));
        }
        let host = url.host().ok_or_else(|| anyhow!("err.api.no_host"))?;
        let local = match host {
            url::Host::Domain(name) => name.eq_ignore_ascii_case("localhost"),
            url::Host::Ipv4(ip) => ip.is_loopback(),
            url::Host::Ipv6(ip) => ip.is_loopback(),
        };
        if url.scheme() == "http" && !local {
            return Err(anyhow!("err.api.https_required"));
        }
        let mut path = url.path().trim_end_matches('/').to_string();
        let mut detected = None;
        for (suffix, wire_format) in [
            ("/chat/completions", ApiFormat::ChatCompletions),
            ("/responses", ApiFormat::Responses),
            ("/messages", ApiFormat::Anthropic),
        ] {
            if path.ends_with(suffix) {
                path.truncate(path.len() - suffix.len());
                detected = Some(wire_format);
                break;
            }
        }
        if path.is_empty() {
            path = match url.host_str().unwrap_or_default() {
                "api.openai.com" | "api.anthropic.com" | "api.deepseek.com" | "api.x.ai" => "/v1",
                "openrouter.ai" => "/api/v1",
                "generativelanguage.googleapis.com" => "/v1beta/openai",
                _ => "",
            }
            .to_string();
        }
        let format = if format == ApiFormat::Auto {
            detected.unwrap_or_else(|| {
                if url.host_str() == Some("api.anthropic.com") {
                    ApiFormat::Anthropic
                } else {
                    ApiFormat::ChatCompletions
                }
            })
        } else {
            format
        };
        url.set_path(&path);
        let base = url.to_string();
        let suffix = match format {
            ApiFormat::Responses => "/responses",
            ApiFormat::Anthropic => "/messages",
            _ => "/chat/completions",
        };
        url.set_path(&format!("{path}{suffix}"));
        Ok(Self {
            base,
            url: url.into(),
            format,
            local,
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn normalizes_all_builtin_providers() {
        for (base, expected) in [
            (
                "https://api.openai.com",
                "https://api.openai.com/v1/chat/completions",
            ),
            (
                "https://api.anthropic.com/v1/",
                "https://api.anthropic.com/v1/messages",
            ),
            (
                "https://openrouter.ai/api/v1",
                "https://openrouter.ai/api/v1/chat/completions",
            ),
            (
                "https://api.deepseek.com",
                "https://api.deepseek.com/v1/chat/completions",
            ),
            (
                "https://generativelanguage.googleapis.com/v1beta/openai/",
                "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions",
            ),
            (
                "https://api.x.ai/v1",
                "https://api.x.ai/v1/chat/completions",
            ),
        ] {
            assert_eq!(
                Endpoint::parse(base, ApiFormat::Auto).unwrap().url,
                expected
            );
        }
    }

    #[test]
    fn full_urls_preserve_custom_paths_and_queries() {
        let endpoint = Endpoint::parse(
            " https://proxy.example/team/responses/?api-version=1 ",
            ApiFormat::Auto,
        )
        .unwrap();
        assert_eq!(endpoint.format, ApiFormat::Responses);
        assert_eq!(
            endpoint.url,
            "https://proxy.example/team/responses?api-version=1"
        );
        assert_eq!(endpoint.base, "https://proxy.example/team?api-version=1");
        let chat =
            Endpoint::parse("http://[::1]:1234/v1/chat/completions", ApiFormat::Auto).unwrap();
        assert!(chat.local);
        assert_eq!(chat.url, "http://[::1]:1234/v1/chat/completions");
    }

    #[test]
    fn rejects_unsafe_urls() {
        for base in [
            "http://example.com/v1",
            "https://user:secret@example.com/v1",
            "https://example.com/#frag",
            "file:///tmp/x",
        ] {
            assert!(Endpoint::parse(base, ApiFormat::Auto).is_err());
        }
    }
}
