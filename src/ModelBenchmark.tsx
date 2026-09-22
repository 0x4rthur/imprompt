import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useT } from "./i18n/useT";
import { BENCHMARK_CHECKED_AT, benchmarkLevels, modelBenchmark } from "./modelCatalog";
import type { ModelOption } from "./modelCatalog";
import type { Key } from "./i18n/catalog";

const LEVEL_KEYS: Key[] = ["motor.benchmark.unknown", "motor.benchmark.low", "motor.benchmark.medium", "motor.benchmark.high"];
const COST_KEYS: Key[] = ["motor.benchmark.unknown", "motor.benchmark.cheap", "motor.benchmark.costMedium", "motor.benchmark.expensive"];

export default function ModelBenchmark({ model, modelId = model?.id }: { model?: ModelOption; modelId?: string }) {
  const { t, locale } = useT();
  const data = modelBenchmark(modelId);
  const levels = benchmarkLevels(model, modelId);
  const [sourceError, setSourceError] = useState(false);
  const axes = [
    { key: "quality", label: t("motor.benchmark.quality"), level: levels.quality, color: levels.quality, value: data?.score == null ? null : `AA ${data.score}` },
    { key: "speed", label: t("motor.benchmark.speed"), level: levels.speed, color: levels.speed, value: data?.tokensPerSecond == null ? null : `${new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(data.tokensPerSecond)} t/s` },
    { key: "cost", label: t("motor.benchmark.cost"), level: levels.cost, color: levels.cost ? 4 - levels.cost : 0, value: null },
  ];
  return (
    <div className="model-benchmark" aria-label={t("motor.benchmark.title")}>
      <div className="bench">
        {axes.map((axis) => (
          <div key={axis.key} className="bench-axis">
            <span>{axis.label} · {t((axis.key === "cost" ? COST_KEYS : LEVEL_KEYS)[axis.level])}</span>
            <span className={`bench-dots lvl-${axis.color}`} aria-hidden="true">{[1, 2, 3].map((i) => <span key={i} className={`bench-dot${i <= axis.level ? " on" : ""}`} />)}</span>
            {axis.value && <small>{axis.value}</small>}
          </div>
        ))}
      </div>
      <details className="model-price-details">
        <summary>{t("motor.benchmark.details")}</summary>
        {data?.source ? <>
          <p>{t("motor.benchmark.reference", { variant: data.variant, version: data.indexVersion ?? "", date: BENCHMARK_CHECKED_AT })}</p>
          <a href={data.source} onClick={(event) => {
            event.preventDefault();
            void invoke("open_url", { url: data.source }).then(() => setSourceError(false)).catch(() => setSourceError(true));
          }}>Artificial Analysis ↗</a>
          {sourceError && <p role="alert">{t("motor.models.sourceError", { url: data.source })}</p>}
        </> : <p>{t("motor.benchmark.unverified")}</p>}
        <p>{t("motor.benchmark.method")}</p>
        <p>{t("motor.benchmark.limits")}</p>
      </details>
    </div>
  );
}
