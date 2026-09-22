import { describe, expect, it } from "vitest";
import { CATALOG_CHECKED_AT, CATEGORY_KEYS, PROVIDERS, benchmarkLevels, exampleRefinementCost, formatModelPrice, formatRefinementCost, modelBenchmark, modelPrice } from "./modelCatalog";
import { CATALOG } from "./i18n/catalog";

describe("curated model catalog", () => {
  it("calculates a different refinement estimate for each selected model", () => {
    const models = PROVIDERS[0].models;
    expect(exampleRefinementCost(models.find((m) => m.id === "gpt-5.6-luna")!)).toBeCloseTo(0.0008);
    expect(exampleRefinementCost(models.find((m) => m.id === "gpt-5-nano")!)).toBeCloseTo(0.00025);
    expect(exampleRefinementCost(models.find((m) => m.id === "gpt-5.6-terra")!)).toBeCloseTo(0.008);
    expect(formatRefinementCost(0.000063, "en")).toBe("$0.000063");
  });

  it("provides benchmark data or explicit unknowns for every curated option", () => {
    for (const model of PROVIDERS.flatMap((provider) => provider.models)) {
      const benchmark = modelBenchmark(model.id);
      expect(benchmark).toBeDefined();
      if (benchmark?.score != null) {
        expect(benchmark.source).toMatch(/^https:\/\/artificialanalysis.ai\/models\//);
        expect(benchmark.indexVersion).toBe("v4.3.2");
        expect(benchmark.tokensPerSecond).toBeGreaterThan(0);
      } else {
        expect(benchmarkLevels(model).quality).toBe(0);
        expect(benchmarkLevels(model).speed).toBe(0);
      }
    }
    expect(modelBenchmark("my-private-model")).toBeUndefined();
    expect(benchmarkLevels()).toEqual({ quality: 0, speed: 0, cost: 0 });
    expect(modelBenchmark("openai/gpt-5.6-luna")).toEqual(modelBenchmark("gpt-5.6-luna"));
  });

  it("contains usable defaults, unique IDs, localized descriptions and valid reference prices", () => {
    expect(CATALOG_CHECKED_AT).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(PROVIDERS).toHaveLength(6);
    const ids = PROVIDERS.flatMap((provider) => provider.models.map((model) => model.id));
    expect(new Set(ids).size).toBe(ids.length);
    for (const provider of PROVIDERS) {
      expect(provider.models.some((model) => model.id === provider.model)).toBe(true);
      expect(new URL(provider.pricingUrl).protocol).toBe("https:");
      for (const model of provider.models) {
        expect(model.id).toBe(model.id.trim());
        expect(CATEGORY_KEYS[model.category]).toBeTruthy();
        for (const locale of ["en", "pt-BR"] as const) {
          expect(model.description[locale]).toBeTruthy();
          expect(CATALOG[locale][CATEGORY_KEYS[model.category]]).toBeTruthy();
        }
        expect(Number.isFinite(model.input_per_1m) && model.input_per_1m > 0).toBe(true);
        expect(Number.isFinite(model.output_per_1m) && model.output_per_1m > 0).toBe(true);
      }
    }
  });

  it("switches both Gemini promotional rates on January 1, 2027", () => {
    const model = PROVIDERS.flatMap((provider) => provider.models).find((m) => m.id === "gemini-3.8-flash")!;
    expect(modelPrice(model, "2026-12-31")).toMatchObject({ input_per_1m: 0.75, output_per_1m: 3.75 });
    expect(modelPrice(model, "2027-01-01")).toMatchObject({ input_per_1m: 1.5, output_per_1m: 7.5 });
  });

  it("preserves small price differences and localizes decimal separators", () => {
    expect(formatModelPrice(0.018, "en")).toBe("$0.018");
    expect(formatModelPrice(0.065, "pt-BR")).toContain("0,065");
  });
});
