//! Curated model IDs and standard text rates shared with the settings UI.
use std::collections::HashMap;
use std::sync::OnceLock;

use serde::Deserialize;

use crate::usage::ModelPrice;

#[derive(Deserialize)]
struct Catalog {
    providers: Vec<Provider>,
}

#[derive(Deserialize)]
struct Provider {
    id: String,
    model: String,
    models: Vec<Model>,
}

#[derive(Deserialize)]
struct Model {
    id: String,
    #[serde(flatten)]
    price: ModelPrice,
    future_price: Option<ScheduledPrice>,
}

#[derive(Deserialize)]
struct ScheduledPrice {
    effective_from: String,
    #[serde(flatten)]
    price: ModelPrice,
}

fn catalog() -> &'static Catalog {
    static CATALOG: OnceLock<Catalog> = OnceLock::new();
    CATALOG.get_or_init(|| {
        serde_json::from_str(include_str!("../../src/modelCatalog.json"))
            .expect("bundled model catalog must be valid")
    })
}

pub fn default_model() -> String {
    catalog()
        .providers
        .iter()
        .find(|provider| provider.id == "openai")
        .expect("catalog must include the default provider")
        .model
        .clone()
}

pub fn prices() -> HashMap<String, ModelPrice> {
    prices_on(&time::OffsetDateTime::now_utc().date().to_string())
}

fn prices_on(date: &str) -> HashMap<String, ModelPrice> {
    catalog()
        .providers
        .iter()
        .flat_map(|provider| &provider.models)
        .map(|model| {
            let price = model
                .future_price
                .as_ref()
                .filter(|next| date >= next.effective_from.as_str())
                .map(|next| &next.price)
                .unwrap_or(&model.price);
            (model.id.clone(), price.clone())
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn defaults_are_selectable_and_every_model_has_a_price() {
        let prices = prices_on("2026-09-22");
        for provider in &catalog().providers {
            assert!(provider
                .models
                .iter()
                .any(|model| model.id == provider.model));
            for model in &provider.models {
                let price = &prices[&model.id];
                assert!(price.input_per_1m > 0.0 && price.output_per_1m > 0.0);
            }
        }
        assert_eq!(default_model(), "gpt-5.6-luna");
        assert_eq!(prices["openai/gpt-oss-20b"].input_per_1m, 0.018);
    }

    #[test]
    fn scheduled_rate_changes_on_the_effective_date() {
        let model = "gemini-3.8-flash";
        let before = prices_on("2026-12-31");
        let after = prices_on("2027-01-01");
        assert_eq!(before[model].input_per_1m, 0.75);
        assert_eq!(before[model].output_per_1m, 3.75);
        assert_eq!(after[model].input_per_1m, 1.5);
        assert_eq!(after[model].output_per_1m, 7.5);
    }
}
