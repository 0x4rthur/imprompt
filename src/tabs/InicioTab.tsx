// InicioTab.tsx — "Início": DASHBOARD (visão geral). Uma linguagem visual só:
// barras horizontais de alto contraste (tinta sobre trilho claro). Uso/custo do mês,
// composição de tokens (entrada→saída), gastos por mês e atalhos. Sem chamadas ao
// backend (recebe tudo do App). A timeline de refinos fica na aba "Histórico".
import type { CSSProperties } from "react";
import type { MonthUsage, Preset, Settings, Tab, UsageSummary } from "../types";
import { presetHue } from "../presetColor";
import { ApiProviderIcon, providerName } from "../ApiProviderIcon";

type Props = {
  settings: Settings;
  usage: UsageSummary | null;
  usageHistory: MonthUsage[];
  presets: Preset[];
  onNavigate: (t: Tab) => void;
};

const MOD: Record<Settings["trigger_modifier"], string> = { ctrl: "Ctrl", alt: "Alt", shift: "Shift" };

// Custo em US$ no formato pt-BR (vírgula): 4 casas pra centavos, 2 acima de $1.
function fmtCost(c: number): string {
  return (c < 1 ? c.toFixed(4) : c.toFixed(2)).replace(".", ",");
}
// Tokens abreviados: 12900 → "12,9k"; <1000 mostra cru.
function fmtTok(n: number): string {
  if (n >= 1000) return (n / 1000).toFixed(1).replace(".", ",") + "k";
  return String(n);
}
function hostOf(url: string): string {
  try { return new URL(url).host || url; } catch { return url || "—"; }
}
// "2026-06" → "jun" (rótulo curto do mês).
function monthShort(key: string): string {
  const [y, m] = key.split("-").map(Number);
  if (!y || !m) return key;
  return new Date(y, m - 1, 1).toLocaleDateString("pt-BR", { month: "short" }).replace(".", "");
}

export default function InicioTab({ settings, usage, usageHistory, presets, onNavigate }: Props) {
  const mod = MOD[settings.trigger_modifier] ?? "Ctrl";
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
        <span>modo <strong>{settings.mode === "popup" ? "Mostrar popup" : "Instantâneo"}</strong> · via API</span>
        <span className="dash-strip-r">Selecione e aperte <kbd>{mod}</kbd> + <kbd>{key}</kbd> ×2</span>
      </div>

      {/* Este mês — custo em destaque, demais secundários. */}
      <div className="ey">Este mês</div>
      <div className="stats-row">
        <div className="st"><div className="n">~US$ {fmtCost(custo)}</div><div className="l">custo</div></div>
        <div className="st muted"><div className="n">{refinos}</div><div className="l">imprompts</div></div>
        <div className="st muted"><div className="n">{refinos > 0 ? `~US$ ${fmtCost(custoMedio)}` : "—"}</div><div className="l">por imprompt</div></div>
      </div>

      {/* Tokens — barra empilhada entrada → saída. */}
      <div className="ey">Tokens {tokTotal > 0 && <span className="t">· {fmtTok(tokTotal)} no mês</span>}</div>
      {tokTotal > 0 ? (
        <>
          <div className="tbar" role="img" aria-label={`Tokens: entrada ${fmtTok(tokIn)} (${inPct}%), saída ${fmtTok(tokOut)} (${outPct}%)`}>
            <span className="seg in" style={{ width: inPct + "%" }} />
            <span className="seg out" style={{ width: outPct + "%" }} />
          </div>
          <div className="tleg">
            <span><span className="dot" style={{ background: "#cdcdd2" }} />entrada · {fmtTok(tokIn)} <span className="pct">{inPct}%</span></span>
            <span><span className="dot" style={{ background: "var(--ink)" }} />saída · {fmtTok(tokOut)} <span className="pct">{outPct}%</span></span>
          </div>
        </>
      ) : (
        <div className="tnone">Sem tokens neste mês ainda — aparecem após o primeiro imprompt.</div>
      )}

      {/* Gastos por mês — barras horizontais (rótulo + trilho + valor). */}
      <div className="ey">Gastos por mês</div>
      {months.length === 0 ? (
        <div className="tnone">Sem dados ainda. Seus gastos por mês aparecem aqui conforme você usa.</div>
      ) : (
        <div role="img" aria-label={`Gastos por mês: ${months.map((m) => `${monthShort(m.month)} ~US$ ${fmtCost(m.cost_usd)}`).join(", ")}`}>
          {months.map((m) => {
            const w = Math.max(3, Math.round((m.cost_usd / maxCost) * 100));
            return (
              <div className={"mrow" + (m.month === curMonth ? " cur" : "")} key={m.month} title={`${m.month}: ${m.refinements} imprompt(s) · ~US$ ${fmtCost(m.cost_usd)}`}>
                <span className="mx">{monthShort(m.month)}</span>
                <span className="mt"><span className="mf" style={{ width: w + "%" }} /></span>
                <span className="mv">~US$ {fmtCost(m.cost_usd)}</span>
              </div>
            );
          })}
          {months.length < 2 && <div className="hint">As barras dos meses anteriores entram aqui conforme você usa.</div>}
        </div>
      )}

      {/* Atalhos — preferências + presets. */}
      <div className="ey">Atalhos</div>
      <div className="dash-short">
        <button className="short-card" onClick={() => onNavigate("motor")}>
          <span className="short-ico"><ApiProviderIcon host={host} size={20} /></span>
          <span className="short-tt">API</span>
          <span className="short-sub">{providerName(host)} · {settings.api_model || "—"}</span>
        </button>
        <button className="short-card" onClick={() => onNavigate("presets")}>
          <span className="short-tt">Presets</span>
          <span className="short-sub">
            {defPreset ? (
              <>padrão: <span className="tl-preset" style={{ "--pc-h": presetHue(defPreset.id) } as CSSProperties}>{defPreset.label}</span></>
            ) : "—"}
          </span>
        </button>
        <button className="short-card" onClick={() => onNavigate("gatilho")}>
          <span className="short-tt">Atalho</span>
          <span className="short-sub">{mod}+{key} ×2 · {settings.output === "replace" ? "substitui" : "copia"}</span>
        </button>
        <button className="short-card" onClick={() => onNavigate("geral")}>
          <span className="short-tt">Sobre</span>
          <span className="short-sub">autostart · versão</span>
        </button>
      </div>
    </div>
  );
}
