// InicioTab.tsx — "Início": DASHBOARD (visão geral). Uma linguagem visual só:
// barras horizontais de alto contraste (tinta sobre trilho claro). Uso/custo do mês,
// composição de tokens (entrada→saída), gastos por mês e a configuração atual (cada
// linha leva à aba correspondente). Se a API não conecta, um aviso de primeiro uso
// aponta pra aba API. A timeline de refinos fica na aba "Histórico".
import { useSyncExternalStore } from "react";
import type { CSSProperties } from "react";
import type { MonthUsage, Preset, Settings, Tab, UsageSummary } from "../types";
import { presetHue } from "../presetColor";
import { ApiProviderIcon, providerName } from "../ApiProviderIcon";
import { apiConfig, connection } from "../connection";
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

function RowChevron() {
  return (
    <svg className="setup-chev" viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M6 4l4 4-4 4" />
    </svg>
  );
}

export default function InicioTab({ settings, usage, usageHistory, presets, onNavigate }: Props) {
  const { t, locale } = useT();
  const localeTag = locale === "pt-BR" ? "pt-BR" : "en-US";
  const mod = t(MOD_LABEL[settings.trigger_modifier] ?? "mod.ctrl");
  const key = (settings.trigger_key || "c").toUpperCase();
  // Mesmo estado de saúde que o rail mostra (o rail dispara o teste; aqui só lê).
  const config = apiConfig(settings);
  const { health } = useSyncExternalStore(connection.subscribe, () => connection.snapshot(config));

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
      {/* Primeiro uso / conexão quebrada: o próximo passo em destaque. */}
      {health === "error" && (
        <div className="callout" role="status">
          <div className="callout-text">
            <strong>{t("inicio.setup.title")}</strong>
            <p>{t("inicio.setup.body")}</p>
          </div>
          <button className="btn-dl primary" onClick={() => onNavigate("motor")}>{t("inicio.setup.cta")}</button>
        </div>
      )}

      {/* Faixa do gesto — utilitário, não billboard. */}
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
      <section className="dash-sec">
        <h2 className="sec-title">{t("inicio.month")}</h2>
        <div className="stats-row">
          <div className="st lead"><div className="n">~US$ {fmtCost(custo, localeTag)}</div><div className="l">{t("inicio.month.cost")}</div></div>
          <div className="st"><div className="n">{refinos}</div><div className="l">{t("inicio.month.imprompts")}</div></div>
          <div className="st"><div className="n">{refinos > 0 ? `~US$ ${fmtCost(custoMedio, localeTag)}` : "—"}</div><div className="l">{t("inicio.month.perImprompt")}</div></div>
        </div>
      </section>

      {/* Tokens — barra empilhada entrada → saída. */}
      <section className="dash-sec">
        <h2 className="sec-title">{t("inicio.tokens")}{tokTotal > 0 && <span className="sec-meta">{t("inicio.tokens.month", { n: fmtTok(tokTotal, localeTag) })}</span>}</h2>
        {tokTotal > 0 ? (
          <>
            <div className="tbar" role="img" aria-label={t("inicio.tokens.aria", { in: fmtTok(tokIn, localeTag), inPct, out: fmtTok(tokOut, localeTag), outPct })}>
              <span className="tbar-seg in" style={{ width: inPct + "%" }} />
              <span className="tbar-seg out" style={{ width: outPct + "%" }} />
            </div>
            <div className="tleg">
              <span><span className="dot in" />{t("inicio.tokens.in")} · {fmtTok(tokIn, localeTag)} <span className="pct">{inPct}%</span></span>
              <span><span className="dot out" />{t("inicio.tokens.out")} · {fmtTok(tokOut, localeTag)} <span className="pct">{outPct}%</span></span>
            </div>
          </>
        ) : (
          <p className="tnone">{t("inicio.tokens.empty")}</p>
        )}
      </section>

      {/* Gastos por mês — barras horizontais (rótulo + trilho + valor). */}
      <section className="dash-sec">
        <h2 className="sec-title">{t("inicio.spend")}</h2>
        {months.length === 0 ? (
          <p className="tnone">{t("inicio.spend.empty")}</p>
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
            {months.length < 2 && <p className="hint">{t("inicio.spend.hint")}</p>}
          </div>
        )}
      </section>

      {/* Sua configuração — estado atual; cada linha leva à aba que o altera. */}
      <section className="dash-sec">
        <h2 className="sec-title">{t("inicio.setup")}</h2>
        <div className="setup-list">
          <button className="setup-row" onClick={() => onNavigate("motor")}>
            <span className="setup-k">{t("tab.api")}</span>
            <span className="setup-v">
              <ApiProviderIcon host={host} size={15} />
              <span className="setup-txt">{providerName(host)} · {settings.api_model || "—"}</span>
            </span>
            <RowChevron />
          </button>
          <button className="setup-row" onClick={() => onNavigate("presets")}>
            <span className="setup-k">{t("presets.default")}</span>
            <span className="setup-v">
              {defPreset && <span className="p-dot" style={{ "--pc-h": presetHue(defPreset.id) } as CSSProperties} aria-hidden="true" />}
              <span className="setup-txt">{defPreset?.label ?? "—"}</span>
            </span>
            <RowChevron />
          </button>
          <button className="setup-row" onClick={() => onNavigate("gatilho")}>
            <span className="setup-k">{t("tab.gatilho")}</span>
            <span className="setup-v">
              <span className="setup-txt">{t("inicio.short.gatilho.sub", { mod, key, action: settings.output === "replace" ? t("inicio.short.gatilho.replace") : t("inicio.short.gatilho.copy") })}</span>
            </span>
            <RowChevron />
          </button>
        </div>
      </section>
    </div>
  );
}
