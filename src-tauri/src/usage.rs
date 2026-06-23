//! usage.rs — Contagem de refinos via API + estimativa de custo (visibilidade).
//!
//! Conta os refinos via API. O `UsageTracker` é ligado ao `ApiEngine` só no
//! caminho de produção (`commands::build_engine` → `with_usage_tracker`). O ping
//! de testar conexão e os testes criam um `ApiEngine` SEM tracker, então não
//! entram no contador. Agrega POR MÊS em `usage.json` na pasta de config.
//!
//! Custo: usa os tokens do campo `usage` da resposta quando disponíveis; senão
//! estima por ~4 chars/token. Os preços por modelo vêm de `prices.json` (criado
//! com defaults na 1ª vez, editável) — é a "tabela de preço configurável".

use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::Mutex;

use anyhow::{anyhow, Result};
use serde::{Deserialize, Serialize};

/// Preço de um modelo, em US$ por 1 milhão de tokens.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ModelPrice {
    pub input_per_1m: f64,
    pub output_per_1m: f64,
}

/// Agregado de um mês.
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct MonthUsage {
    pub refinements: u64,
    pub prompt_tokens: u64,
    pub completion_tokens: u64,
    pub cost_usd: f64,
    /// `true` se ao menos um refino do mês usou um modelo SEM preço próprio na
    /// tabela (caiu no genérico) → o custo do mês é só uma aproximação grosseira.
    #[serde(default)]
    pub approx_cost: bool,
}

/// Forma persistida em usage.json: mês "YYYY-MM" → agregado.
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
struct UsageData {
    months: HashMap<String, MonthUsage>,
}

/// Resumo enxuto pra UI (mês corrente).
#[derive(Debug, Clone, Serialize)]
pub struct UsageSummary {
    pub month: String,
    pub refinements: u64,
    pub cost_usd: f64,
    /// Custo é aproximado (algum modelo do mês não está em prices.json).
    pub approximate: bool,
}

/// Resumo de UM mês pro histórico/dashboard (espelha MonthUsage + a chave do mês).
#[derive(Debug, Clone, Serialize)]
pub struct MonthSummary {
    pub month: String,
    pub refinements: u64,
    pub cost_usd: f64,
    pub prompt_tokens: u64,
    pub completion_tokens: u64,
    pub approximate: bool,
}

/// Preço GENÉRICO (fallback) quando o modelo não está na tabela — fonte única
/// de verdade (usado tanto nos defaults quanto no fallback de `price_for`).
const DEFAULT_PRICE: ModelPrice = ModelPrice {
    input_per_1m: 0.5,
    output_per_1m: 1.5,
};

/// Rastreia o uso da API (em memória, compartilhado via Arc). Thread-safe.
pub struct UsageTracker {
    data: Mutex<UsageData>,
}

impl UsageTracker {
    /// Carrega o agregado do disco; garante que prices.json exista (defaults).
    pub fn load() -> Self {
        let _ = load_or_init_prices(); // cria prices.json na 1ª vez (editável)
        Self {
            data: Mutex::new(load_usage().unwrap_or_default()),
        }
    }

    /// Registra UM refino de API: tokens (reais ou estimados), calcula o custo
    /// pela tabela e persiste. Chamado só pelo ApiEngine. Recarrega prices.json
    /// A CADA refino → editar a tabela passa a valer já no próximo refino.
    pub fn record(&self, model: &str, prompt_tokens: u64, completion_tokens: u64) {
        let prices = load_or_init_prices();
        let (price, exact) = price_for(&prices, model);
        let cost = cost_of(&price, prompt_tokens, completion_tokens);
        let key = current_month_key();
        let mut data = self.data.lock().unwrap_or_else(|e| e.into_inner());
        let m = data.months.entry(key).or_default();
        m.refinements += 1;
        m.prompt_tokens += prompt_tokens;
        m.completion_tokens += completion_tokens;
        m.cost_usd += cost;
        if !exact {
            // Usou o preço genérico (modelo fora da tabela) → custo do mês é só
            // uma aproximação grosseira. A UI avisa.
            m.approx_cost = true;
        }
        // best-effort: falha de disco não quebra o refino — mas logamos pra
        // diagnóstico (disco cheio/permissão); senão o custo some no próximo load.
        if let Err(e) = save_usage(&data) {
            eprintln!("[usage] falha ao persistir usage.json: {e}");
        }
    }

    /// Resumo do mês corrente (pra UI).
    pub fn summary(&self) -> UsageSummary {
        let key = current_month_key();
        let data = self.data.lock().unwrap_or_else(|e| e.into_inner());
        let m = data.months.get(&key).cloned().unwrap_or_default();
        UsageSummary {
            month: key,
            refinements: m.refinements,
            cost_usd: m.cost_usd,
            approximate: m.approx_cost,
        }
    }

    /// Zera o contador (limpa todos os meses) e persiste.
    pub fn reset(&self) {
        let mut data = self.data.lock().unwrap_or_else(|e| e.into_inner());
        data.months.clear();
        let _ = save_usage(&data);
    }

    /// Histórico por mês, ordenado do mais antigo ao mais recente (pro dashboard).
    pub fn history(&self) -> Vec<MonthSummary> {
        let data = self.data.lock().unwrap_or_else(|e| e.into_inner());
        let mut out: Vec<MonthSummary> = data
            .months
            .iter()
            .map(|(month, m)| MonthSummary {
                month: month.clone(),
                refinements: m.refinements,
                cost_usd: m.cost_usd,
                prompt_tokens: m.prompt_tokens,
                completion_tokens: m.completion_tokens,
                approximate: m.approx_cost,
            })
            .collect();
        out.sort_by(|a, b| a.month.cmp(&b.month));
        out
    }
}

/// Preço do modelo + se é EXATO (`true`, achou na tabela) ou o GENÉRICO de
/// fallback (`false` → custo aproximado). PURA.
fn price_for(prices: &HashMap<String, ModelPrice>, model: &str) -> (ModelPrice, bool) {
    if let Some(p) = prices.get(model) {
        return (p.clone(), true);
    }
    let generic = prices.get("default").cloned().unwrap_or(DEFAULT_PRICE);
    (generic, false)
}

/// Custo em US$ de (prompt, completion) tokens segundo o preço. PURA.
pub fn cost_of(price: &ModelPrice, prompt_tokens: u64, completion_tokens: u64) -> f64 {
    (prompt_tokens as f64) * price.input_per_1m / 1_000_000.0
        + (completion_tokens as f64) * price.output_per_1m / 1_000_000.0
}

/// Estimativa grosseira de tokens a partir do texto (~4 chars/token). Usada
/// quando a API não devolve `usage`. PURA.
pub fn estimate_tokens(text: &str) -> u64 {
    ((text.chars().count() as u64) / 4).max(1)
}

// ── Persistência ─────────────────────────────────────────────────────────────

fn config_dir() -> Result<PathBuf> {
    let dir = dirs::config_dir()
        .ok_or_else(|| anyhow!("err.config.no_dir"))?
        .join("imprompt");
    std::fs::create_dir_all(&dir).ok();
    Ok(dir)
}

fn usage_path() -> Result<PathBuf> {
    Ok(config_dir()?.join("usage.json"))
}
fn prices_path() -> Result<PathBuf> {
    Ok(config_dir()?.join("prices.json"))
}

fn load_usage() -> Result<UsageData> {
    let json = std::fs::read_to_string(usage_path()?)?;
    Ok(serde_json::from_str(&json).unwrap_or_default())
}
fn save_usage(data: &UsageData) -> Result<()> {
    // Gravação ATÔMICA: escreve num .tmp e renomeia, pra um crash no meio não
    // deixar um usage.json truncado (que zeraria o histórico no próximo load).
    let path = usage_path()?;
    let tmp = path.with_extension("json.tmp");
    std::fs::write(&tmp, serde_json::to_string_pretty(data)?)?;
    std::fs::rename(&tmp, &path)?;
    Ok(())
}

/// Preços default (US$ / 1M tokens), por modelo. Valores APROXIMADOS de referência
/// (jun/2026) pros provedores fixos do app; o usuário ajusta editando prices.json.
fn default_prices() -> HashMap<String, ModelPrice> {
    let mut m = HashMap::new();
    let mut ins = |id: &str, input: f64, output: f64| {
        m.insert(
            id.to_string(),
            ModelPrice {
                input_per_1m: input,
                output_per_1m: output,
            },
        );
    };
    // OpenAI
    ins("gpt-4o-mini", 0.15, 0.60);
    ins("gpt-4o", 2.50, 10.00);
    ins("gpt-4.1-mini", 0.40, 1.60);
    ins("o4-mini", 1.10, 4.40);
    // Anthropic (Claude)
    ins("claude-haiku-4-5", 1.00, 5.00);
    ins("claude-sonnet-4-6", 3.00, 15.00);
    ins("claude-opus-4-8", 15.00, 75.00);
    // DeepSeek
    ins("deepseek-chat", 0.28, 1.10);
    ins("deepseek-reasoner", 0.55, 2.19);
    // Google Gemini
    ins("gemini-2.5-flash", 0.30, 2.50);
    ins("gemini-2.5-pro", 1.25, 10.00);
    ins("gemini-2.5-flash-lite", 0.10, 0.40);
    // xAI (Grok)
    ins("grok-4", 3.00, 15.00);
    ins("grok-3", 3.00, 15.00);
    ins("grok-code-fast-1", 0.20, 1.50);
    // OpenRouter (modelos namespaced) — espelham o preço do modelo de origem.
    ins("openai/gpt-4o-mini", 0.15, 0.60);
    ins("anthropic/claude-sonnet-4.6", 3.00, 15.00);
    ins("google/gemini-2.5-flash", 0.30, 2.50);
    ins("deepseek/deepseek-chat", 0.28, 1.10);
    // Fallback pra modelos não listados (mesma fonte do fallback de price_for).
    m.insert("default".into(), DEFAULT_PRICE);
    m
}

/// Carrega prices.json; na 1ª vez grava os defaults (assim fica visível/editável).
fn load_or_init_prices() -> HashMap<String, ModelPrice> {
    if let Ok(path) = prices_path() {
        match std::fs::read_to_string(&path) {
            // Arquivo existe: se o usuário introduziu JSON inválido, usa os defaults
            // só EM MEMÓRIA — NÃO regrava o prices.json por cima das edições dele
            // (antes, um parse falho sobrescrevia o arquivo a cada refino — PERF-2).
            Ok(json) => serde_json::from_str::<HashMap<String, ModelPrice>>(&json)
                .unwrap_or_else(|_| default_prices()),
            // Arquivo ausente (1ª vez): grava os defaults pra ficar visível/editável.
            Err(_) => {
                let defaults = default_prices();
                if let Ok(json) = serde_json::to_string_pretty(&defaults) {
                    let _ = std::fs::write(&path, json);
                }
                defaults
            }
        }
    } else {
        default_prices()
    }
}

// ── Data (sem dependência de crate de calendário) ───────────────────────────

/// Chave "YYYY-MM" do mês corrente, bucketizado em HORÁRIO LOCAL — a virada de
/// mês no fuso do usuário, não em UTC (um refino feito 23h do dia 31 num fuso
/// negativo não deve cair no mês seguinte). Aplica o offset UTC local ao epoch
/// e só então extrai o ano/mês. Se o SO não expõe o offset (caso raro em
/// multi-thread no Linux), cai pra UTC EXPLÍCITO via `year_month`.
fn current_month_key() -> String {
    let secs = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs() as i64)
        .unwrap_or(0);
    // Offset no instante ATUAL (não em 1970): em fusos com DST o offset de janeiro/70
    // difere do de hoje, e usar o de 1970 podia jogar um refino feito na virada do mês
    // pro bucket errado (ver auditoria BUG-5). `local_offset_at` pode falhar (ambiente
    // multi-thread sem fonte de offset): nesse caso o offset é 0 (= UTC explícito).
    let now_dt =
        time::OffsetDateTime::from_unix_timestamp(secs).unwrap_or(time::OffsetDateTime::UNIX_EPOCH);
    let offset_secs = time::UtcOffset::local_offset_at(now_dt)
        .map(|o| o.whole_seconds() as i64)
        .unwrap_or(0);
    let (y, m) = year_month(secs + offset_secs);
    format!("{y:04}-{m:02}")
}

/// (ano, mês) a partir de epoch-segundos (UTC). Algoritmo civil_from_days
/// (Howard Hinnant) — evita depender de uma crate de calendário. PURA.
fn year_month(epoch_secs: i64) -> (i64, u32) {
    let days = epoch_secs.div_euclid(86_400);
    let z = days + 719_468;
    let era = if z >= 0 { z } else { z - 146_096 } / 146_097;
    let doe = z - era * 146_097; // [0, 146096]
    let yoe = (doe - doe / 1460 + doe / 36_524 - doe / 146_096) / 365; // [0, 399]
    let y = yoe + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100); // [0, 365]
    let mp = (5 * doy + 2) / 153; // [0, 11]
    let m = if mp < 10 { mp + 3 } else { mp - 9 }; // [1, 12]
    let year = if m <= 2 { y + 1 } else { y };
    (year, m as u32)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn year_month_known_dates() {
        assert_eq!(year_month(0), (1970, 1)); // 1970-01-01
        assert_eq!(year_month(1_704_067_200), (2024, 1)); // 2024-01-01T00:00:00Z
        assert_eq!(year_month(1_750_000_000), (2025, 6)); // 2025-06-15T...Z
    }

    #[test]
    fn cost_uses_per_million_pricing() {
        let p = ModelPrice {
            input_per_1m: 0.15,
            output_per_1m: 0.60,
        };
        // 1M input + 1M output = 0.15 + 0.60
        assert!((cost_of(&p, 1_000_000, 1_000_000) - 0.75).abs() < 1e-9);
        // tokens zero → custo zero
        assert_eq!(cost_of(&p, 0, 0), 0.0);
    }

    #[test]
    fn estimate_tokens_is_chars_over_four() {
        assert_eq!(estimate_tokens("12345678"), 2); // 8/4
        assert_eq!(estimate_tokens(""), 1); // mínimo 1
    }

    #[test]
    fn price_for_flags_exact_vs_generic() {
        let mut prices = HashMap::new();
        prices.insert(
            "gpt-4o-mini".to_string(),
            ModelPrice {
                input_per_1m: 0.15,
                output_per_1m: 0.60,
            },
        );
        prices.insert("default".to_string(), DEFAULT_PRICE);
        // Modelo na tabela → exato.
        let (p, exact) = price_for(&prices, "gpt-4o-mini");
        assert!(exact);
        assert_eq!(p.input_per_1m, 0.15);
        // Modelo fora da tabela (ex.: DeepSeek) → genérico, marcado como aproximado.
        let (g, exact2) = price_for(&prices, "deepseek-chat");
        assert!(!exact2);
        assert_eq!(g.input_per_1m, DEFAULT_PRICE.input_per_1m);
    }
}
