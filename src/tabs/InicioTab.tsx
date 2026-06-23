// InicioTab.tsx — "Início": DASHBOARD (visão geral). Uma linguagem visual só:
// barras horizontais de alto contraste (tinta sobre trilho claro). Uso/custo do mês,
// composição de tokens (entrada→saída), gastos por mês e atalhos. Sem chamadas ao
// backend (recebe tudo do App). A timeline de refinos fica na aba "Histórico".
import type { CSSProperties } from "react";
import type { MonthUsage, Preset, Settings, Tab, UsageSummary } from "../types";
import { presetHue } from "../presetColor";
import { ApiProviderIcon, providerName } from "../ApiProviderIcon";
import { useT } from "../i18n/useT";
import { Trans } from "../i18n/Trans";
import type { Key } from "../i18n/catalog";

type Props = {
  settings: Settings;
  usage: UsageSummary | null;
  usageHistory: MonthUsage[];
  presets: Preset[];
  onNavigate: (t: Tab) => void;
};

// Reusa as chaves canônicas mod.* (Ctrl/Alt/Shift); traduzidas no render.
const MOD_LABEL: Record<Settings["trigger_modifier"], Key> = { ctrl: "mod.ctrl", alt: "mod.alt", shift: "mod.shift" };

// Custo em US$ conforme o locale (separador decimal '.' em en-US, ',' em pt-BR):
// 4 casas pra centavos, 2 acima de $1. O app é cobrado em USD, daí o "~US$".
function fmtCost(c: number, localeTag: string): string {
  const digits = c < 1 ? 4 : 2;
  return c.toLocaleString(localeTag, { minimumFractionDigits: digits, maximumFractionDigits: digits });
}
// Tokens abreviados: 12900 → "12,9k" (pt-BR) / "12.9k" (en-US); <1000 mostra cru.
function fmtTok(n: number, localeTag: string): string {
  if (n >= 1000) return (n / 1000).toLocaleString(localeTag, { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + "k";
  return String(n);
}
function hostOf(url: string): string {
  try { return new URL(url).host || url; } catch { return url || "—"; }
}
// "2026-06" → "jun" (rótulo curto do mês, conforme o locale).
function monthShort(key: string, localeTag: string): string {
  const [y, m] = key.split("-").map(Number);
  if (!y || !m) return key;
  return new Date(y, m - 1, 1).toLocaleDateString(localeTag, { month: "short" }).replace(".", "");
}

export default function InicioTab({ settings, usage, usageHistory, presets, onNavigate }: Props) {
  const { t, locale } = useT();
  const localeTag = locale === "pt-BR" ? "pt-BR" : "en-US";
  const mod = t(MOD_LABEL[settings.trigger_modifier] ?? "mod.ctrl");
  const key = (settings.trigger_key || "c").toUpperCase();

  const refinos = usage?.refinements ?? 0;
  const custo = usage?.cost_usd ?? 0;
  const custoMedio = refinos > 0 ? custo / refinos : 0;
  const curMonth = usage?.month ?? "";

  // Tokens do mês atual (entrada/saída) — vêm do MonthUsage do mês corrente.
  const curM = usageHistory.find((m) => m.month === curMonth);
  const tokIn = curM?.prompt_tokens ?? 0;
  const tokOut = curM?.completion_tokens ?? 0;
  const tokTotal = tokIn + tokOut;
  const outPct = tokTotal ? Math.round((tokOut / tokTotal) * 100) : 0;
  const inPct = 100 - outPct;

  // Gastos por mês: últimos 6, do mais recente pro mais antigo. maxCost normaliza as barras.
  const months = [...usageHistory.slice(-6)].reverse();
  const maxCost = Math.max(...months.map((m) => m.cost_usd), 0.0001);

  const defPreset = presets.find((p) => p.id === settings.default_preset);
  const host = hostOf(settings.api_base_url);

  return (
    <div className="inicio">
      {/* Faixa fina do atalho — utilitário no topo, não billboard. */}
      <div className="dash-strip">
        <span>
          <Trans
            k="inicio.strip.mode"
            slots={{ mode: <strong>{settings.mode === "popup" ? t("inicio.strip.mode.popup") : t("inicio.strip.mode.instant")}</strong> }}
          />
        </span>
        <span className="dash-strip-r">
          <Trans k="inicio.strip.hint" slots={{ mod: <kbd>{mod}</kbd>, key: <kbd>{key}</kbd> }} />
        </span>
      </div>

      {/* Este mês — custo em destaque, demais secundários. */}
      <div className="ey">{t("inicio.month")}</div>
      <div className="stats-row">
        <div className="st"><div className="n">~US$ {fmtCost(custo, localeTag)}</div><div className="l">{t("inicio.month.cost")}</div></div>
        <div className="st muted"><div className="n">{refinos}</div><div className="l">{t("inicio.month.imprompts")}</div></div>
        <div className="st muted"><div className="n">{refinos > 0 ? `~US$ ${fmtCost(custoMedio, localeTag)}` : "—"}</div><div className="l">{t("inicio.month.perImprompt")}</div></div>
      </div>

      {/* Tokens — barra empilhada entrada → saída. */}
      <div className="ey">{t("inicio.tokens")} {tokTotal > 0 && <span className="t">{t("inicio.tokens.month", { n: fmtTok(tokTotal, localeTag) })}</span>}</div>
      {tokTotal > 0 ? (
        <>
          <div className="tbar" role="img" aria-label={t("inicio.tokens.aria", { in: fmtTok(tokIn, localeTag), inPct, out: fmtTok(tokOut, localeTag), outPct })}>
            <span className="seg in" style={{ width: inPct + "%" }} />
            <span className="seg out" style={{ width: outPct + "%" }} />
          </div>
          <div className="tleg">
            <span><span className="dot" style={{ background: "#cdcdd2" }} />{t("inicio.tokens.in")} · {fmtTok(tokIn, localeTag)} <span className="pct">{inPct}%</span></span>
            <span><span className="dot" style={{ background: "var(--ink)" }} />{t("inicio.tokens.out")} · {fmtTok(tokOut, localeTag)} <span className="pct">{outPct}%</span></span>
          </div>
        </>
      ) : (
        <div className="tnone">{t("inicio.tokens.empty")}</div>
      )}

      {/* Gastos por mês — barras horizontais (rótulo + trilho + valor). */}
      <div className="ey">{t("inicio.spend")}</div>
      {months.length === 0 ? (
        <div className="tnone">{t("inicio.spend.empty")}</div>
      ) : (
        <div role="img" aria-label={t("inicio.spend.aria", { list: months.map((m) => `${monthShort(m.month, localeTag)} ~US$ ${fmtCost(m.cost_usd, localeTag)}`).join(", ") })}>
          {months.map((m) => {
            const w = Math.max(3, Math.round((m.cost_usd / maxCost) * 100));
            return (
              <div className={"mrow" + (m.month === curMonth ? " cur" : "")} key={m.month} title={t("inicio.spend.rowTitle", { month: m.month, n: m.refinements, cost: fmtCost(m.cost_usd, localeTag) })}>
                <span className="mx">{monthShort(m.month, localeTag)}</span>
                <span className="mt"><span className="mf" style={{ width: w + "%" }} /></span>
                <span className="mv">~US$ {fmtCost(m.cost_usd, localeTag)}</span>
              </div>
            );
          })}
          {months.length < 2 && <div className="hint">{t("inicio.spend.hint")}</div>}
        </div>
      )}

      {/* Atalhos — preferências + presets. */}
      <div className="ey">{t("inicio.shortcuts")}</div>
      <div className="dash-short">
        <button className="short-card" onClick={() => onNavigate("motor")}>
          <span className="short-ico"><ApiProviderIcon host={host} size={20} /></span>
          <span className="short-tt">{t("tab.api")}</span>
          <span className="short-sub">{providerName(host)} · {settings.api_model || "—"}</span>
        </button>
        <button className="short-card" onClick={() => onNavigate("presets")}>
          <span className="short-tt">{t("tab.presets")}</span>
          <span className="short-sub">
            {defPreset ? (
              <Trans
                k="inicio.short.presets.default"
                slots={{ label: <span className="tl-preset" style={{ "--pc-h": presetHue(defPreset.id) } as CSSProperties}>{defPreset.label}</span> }}
              />
            ) : "—"}
          </span>
        </button>
        <button className="short-card" onClick={() => onNavigate("gatilho")}>
          <span className="short-tt">{t("tab.gatilho")}</span>
          <span className="short-sub">{t("inicio.short.gatilho.sub", { mod, key, action: settings.output === "replace" ? t("inicio.short.gatilho.replace") : t("inicio.short.gatilho.copy") })}</span>
        </button>
        <button className="short-card" onClick={() => onNavigate("geral")}>
          <span className="short-tt">{t("tab.sobre")}</span>
          <span className="short-sub">{t("inicio.short.sobre.sub")}</span>
        </button>
      </div>
    </div>
  );
}
