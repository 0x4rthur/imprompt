import catalog from "./modelCatalog.json";
import benchmarks from "./modelBenchmarks.json";
import type { Key, Locale } from "./i18n/catalog";

export type ModelPrice = { input_per_1m: number; output_per_1m: number };
export type ModelOption = ModelPrice & {
  id: string;
  name: string;
  category: string;
  description: Record<Locale, string>;
  future_price?: ModelPrice & { effective_from: string };
};
export type Provider = {
  id: string;
  label: string;
  base: string;
  model: string;
  pricingUrl: string;
  note?: Record<Locale, string>;
  models: ModelOption[];
};

export const PROVIDERS: Provider[] = catalog.providers;
export const CATALOG_CHECKED_AT = catalog.checkedAt;
export const CATEGORY_KEYS: Record<string, Key> = {
  economy: "motor.models.economy",
  balanced: "motor.models.balanced",
  advanced: "motor.models.advanced",
  fast: "motor.models.fast",
  code: "motor.models.code",
};

// The UI and Rust usage tracker share this catalog, including scheduled rates.
export function modelPrice(model: ModelOption, date = new Date().toISOString().slice(0, 10)): ModelPrice {
  return model.future_price && date >= model.future_price.effective_from ? model.future_price : model;
}

export function formatModelPrice(value: number, locale: Locale): string {
  return new Intl.NumberFormat(locale, { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 3 }).format(value);
}

export const BENCHMARK_CHECKED_AT = benchmarks.checkedAt;
export type ModelBenchmark = { score: number | null; tokensPerSecond: number | null; variant: string; indexVersion: string | null; source: string | null };
const benchmarkModels: Record<string, ModelBenchmark> = benchmarks.models;
const benchmarkAliases: Record<string, string> = benchmarks.aliases;
export function modelBenchmark(id?: string): ModelBenchmark | undefined {
  return id ? benchmarkModels[benchmarkAliases[id] ?? id] : undefined;
}

// A common workload makes token-price comparisons meaningful. This is not
// a measured average request: actual prompt, answer and reasoning lengths vary.
export function exampleRefinementCost(model: ModelOption, date?: string): number {
  const price = modelPrice(model, date);
  return (1000 * price.input_per_1m + 500 * price.output_per_1m) / 1_000_000;
}

export function benchmarkLevels(model?: ModelOption, modelId = model?.id) {
  const benchmark = modelBenchmark(modelId);
  const quality = benchmark?.score == null ? 0 : benchmark.score < 15 ? 1 : benchmark.score < 30 ? 2 : 3;
  const speed = benchmark?.tokensPerSecond == null ? 0 : benchmark.tokensPerSecond < 60 ? 1 : benchmark.tokensPerSecond < 150 ? 2 : 3;
  const cost = !model ? 0 : exampleRefinementCost(model) <= 0.001 ? 1 : exampleRefinementCost(model) <= 0.003 ? 2 : 3;
  return { quality, speed, cost };
}

export function formatRefinementCost(value: number, locale: Locale): string {
  return new Intl.NumberFormat(locale, { style: "currency", currency: "USD", minimumFractionDigits: 4, maximumFractionDigits: 6 }).format(value);
}
