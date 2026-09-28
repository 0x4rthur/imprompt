// InicioTab.tsx — "Início": o painel do Imprompt num relance (soft UI).
//
// Topo em duas colunas de MESMA altura: à esquerda o título de estado ("Tudo
// pronto." / "Um instante…" / "Falta conectar a API."), o card do gesto (atalho,
// modo e saída; sem conexão vira o chamado pra configurar a API) e 4 blocos da
// configuração que levam às abas; à direita o "Último imprompt" (original →
// resultado da sessão). Embaixo, "Este mês": tokens (só dados), barras por mês
// com o seletor Custo · Imprompts e o card escuro de imprompts com a linha.
import { useState, useSyncExternalStore, type CSSProperties, type ReactNode } from "react";
import { motion } from "motion/react";
import type { MonthUsage, Preset, RefineRecord, Settings, Tab, UsageSummary } from "../types";
import { presetHue } from "../presetColor";
import { ApiProviderIcon, providerName } from "../ApiProviderIcon";
import { apiConfig, connection } from "../connection";
import { useT } from "../i18n/useT";
import { Trans } from "../i18n/Trans";
import type { Key } from "../i18n/catalog";
import BrandMark from "../BrandMark";
import Segmented from "../ui/Segmented";
import { ArrowRightIcon, ClipboardIcon, KeyboardIcon, ReplaceIcon, ThemeIcon } from "../ui/icons";
import { ease, reducedMotion, spring, useCountUp } from "../motion";

type Props = {
  settings: Settings;
  usage: UsageSummary | null;
  usageHistory: MonthUsage[];
  presets: Preset[];
  history: RefineRecord[];
  onNavigate: (t: Tab) => void;
};

type Metric = "cost" | "count";

// Reusa as chaves canônicas mod.* (Ctrl/Alt/Shift); traduzidas no render.
const MOD_LABEL: Record<Settings["trigger_modifier"], Key> = { ctrl: "mod.ctrl", alt: "mod.alt", shift: "mod.shift" };

// Custo em US$ conforme o locale: 4 casas pra centavos, 2 acima de $1. Na
// contagem animada, as casas vêm do valor final (`target`), pra o número não
// mudar de largura no meio da contagem.
function fmtCost(c: number, localeTag: string, target = c): string {
  const v = Number.isFinite(c) ? c : 0;
  const digits = (Number.isFinite(target) ? target : 0) < 1 ? 4 : 2;
  return v.toLocaleString(localeTag, { minimumFractionDigits: digits, maximumFractionDigits: digits });
}
// Tokens abreviados: 12900 → "12,9k" (pt-BR) / "12.9k" (en-US); <1000 mostra cru.
function fmtTok(n: number, localeTag: string): string {
  if (n >= 1000) return (n / 1000).toLocaleString(localeTag, { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + "k";
  return String(Math.round(n));
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
// "há 2 min" / "2 min ago" — tempo relativo curto do último imprompt.
function relTime(ts: number, localeTag: string): string {
  const rtf = new Intl.RelativeTimeFormat(localeTag, { numeric: "auto", style: "short" });
  const s = Math.round((ts - Date.now()) / 1000);
  const abs = Math.abs(s);
  if (abs < 45) return rtf.format(0, "second");
  if (abs < 45 * 60) return rtf.format(Math.round(s / 60), "minute");
  if (abs < 22 * 3600) return rtf.format(Math.round(s / 3600), "hour");
  return rtf.format(Math.round(s / 86400), "day");
}

// Bloco de configuração: ícone num quadrado elevado + valor + rótulo; leva à aba.
function Tile({ icon, value, label, title, onClick }: { icon: ReactNode; value: string; label: string; title: string; onClick: () => void }) {
  return (
    <button type="button" className="tile" title={title} onClick={onClick}>
      <span className="tile-ico">{icon}</span>
      <span className="tile-v">{value}</span>
      <span className="tile-k">{label}</span>
    </button>
  );
}

export default function InicioTab({ settings, usage, usageHistory, presets, history, onNavigate }: Props) {
  const { t, locale } = useT();
  const localeTag = locale === "pt-BR" ? "pt-BR" : "en-US";
  const [animate] = useState(() => !reducedMotion());
  const [metric, setMetric] = useState<Metric>("cost");
  const mod = t(MOD_LABEL[settings.trigger_modifier] ?? "mod.ctrl");
  const key = (settings.trigger_key || "c").toUpperCase();
  // Mesmo estado de saúde que o menu mostra (o menu dispara o teste; aqui só lê).
  const config = apiConfig(settings);
  const { health } = useSyncExternalStore(connection.subscribe, () => connection.snapshot(config));
  const heroKey: Key = health === "connected" ? "inicio.hero.ready" : health === "error" ? "inicio.hero.setup" : "inicio.hero.checking";

  const refinos = usage?.refinements ?? 0;
  const custo = usage?.cost_usd ?? 0;
  const custoMedio = refinos > 0 ? custo / refinos : 0;
  const curMonth = usage?.month ?? "";

  // Tokens do mês corrente (entrada/saída).
  const curM = usageHistory.find((m) => m.month === curMonth);
  const tokIn = curM?.prompt_tokens ?? 0;
  const tokOut = curM?.completion_tokens ?? 0;
  const tokTotal = tokIn + tokOut;
  const outPct = tokTotal ? Math.round((tokOut / tokTotal) * 100) : 0;
  const inPct = tokTotal ? 100 - outPct : 0;

  // Últimos 6 meses, do mais antigo pro mais recente (esquerda → direita).
  const months = usageHistory.slice(-6);
  const values = months.map((m) => (metric === "cost" ? m.cost_usd : m.refinements));
  const max = Math.max(...values, 0);
  const countUp = useCountUp(refinos);
  const costUp = useCountUp(custo);
  const tokUp = useCountUp(tokTotal);

  const defPreset = presets.find((p) => p.id === settings.default_preset);
  const host = hostOf(settings.api_base_url);
  const provider = providerName(host);
  const last = history[0];
  const lastPreset = last ? presets.find((p) => p.id === last.preset)?.label ?? last.preset : "";

  // Linha do card escuro: imprompts por mês (só com 2+ meses pra ter o que ligar).
  const counts = months.map((m) => m.refinements);
  const cMax = Math.max(...counts, 1);
  const spark = counts.length >= 2
    ? counts.map((c, i) => `${(4 + (i * 112) / (counts.length - 1)).toFixed(1)},${(50 - (c / cMax) * 44).toFixed(1)}`).join(" ")
    : "";
  const sparkEnd = spark ? spark.split(" ").pop()!.split(",").map(Number) : null;

  const monthLabel = metric === "cost" ? t("inicio.spend") : t("inicio.count.month");
  const monthValue = metric === "cost" ? `~US$ ${fmtCost(costUp, localeTag, custo)}` : String(Math.round(countUp));
  const monthsAria = metric === "cost"
    ? t("inicio.spend.aria", { list: months.map((m) => `${monthShort(m.month, localeTag)} ~US$ ${fmtCost(m.cost_usd, localeTag)}`).join(", ") })
    : t("inicio.count.aria", { list: months.map((m) => `${monthShort(m.month, localeTag)} ${m.refinements}`).join(", ") });

  return (
    <div className="home">
      <div className="home-top">
        <div className="home-left">
          <div data-enter>
            <motion.h1 key={heroKey} className="hero" initial={animate ? { opacity: 0, y: 10 } : false} animate={{ opacity: 1, y: 0 }} transition={spring.soft}>
              {t(heroKey)}
            </motion.h1>
            <p className="lead">{t("page.inicio")}</p>
          </div>

          {health === "error" ? (
            <div className="gesture setup" data-enter role="status">
              <p className="gesture-title">{t("inicio.setup.title")}</p>
              <p className="gesture-body">{t("inicio.setup.body")}</p>
              <button className="btn-dl primary" onClick={() => onNavigate("motor")}>{t("inicio.setup.cta")}</button>
            </div>
          ) : (
            <div className="gesture" data-enter>
              <p className="gesture-title">{t("inicio.gesture.title")}</p>
              <div className="gesture-keys"><kbd>{mod}</kbd><span className="plus">+</span><kbd>{key}</kbd><span className="x2">×2</span></div>
              <div className="gesture-meta">
                <span><i aria-hidden="true" /><Trans k="inicio.strip.mode" slots={{ mode: settings.mode === "popup" ? t("inicio.strip.mode.popup") : t("inicio.strip.mode.instant") }} /></span>
                <span><i aria-hidden="true" />{settings.output === "replace" ? t("inicio.gesture.replace") : t("inicio.gesture.copy")}</span>
              </div>
              <button className="gesture-go" aria-label={t("inicio.gesture.open")} title={t("inicio.gesture.open")} onClick={() => onNavigate("gatilho")}>
                <KeyboardIcon size={18} />
              </button>
            </div>
          )}

          <div className="tiles" data-enter>
            <Tile icon={<ApiProviderIcon host={host} size={19} />} value={provider} label={t("inicio.tile.api")}
              title={`${provider} · ${settings.api_model || "—"}`} onClick={() => onNavigate("motor")} />
            <Tile icon={<span className="p-dot lg" style={{ "--pc-h": presetHue(settings.default_preset) } as CSSProperties} />}
              value={defPreset?.label ?? "—"} label={t("inicio.tile.preset")} title={defPreset?.label ?? "—"} onClick={() => onNavigate("presets")} />
            <Tile icon={settings.output === "replace" ? <ReplaceIcon size={18} /> : <ClipboardIcon size={18} />}
              value={settings.output === "replace" ? t("inicio.tile.replace") : t("inicio.tile.copy")} label={t("inicio.tile.output")}
              title={settings.output === "replace" ? t("gatilho.output.replace.help") : t("gatilho.output.clipboard.help")} onClick={() => onNavigate("gatilho")} />
            <Tile icon={<ThemeIcon size={18} />} value={t(`geral.theme.${settings.theme ?? "system"}`)} label={t("inicio.tile.theme")}
              title={t("geral.theme.help")} onClick={() => onNavigate("geral")} />
          </div>
        </div>

        <section className="last" data-enter aria-label={t("inicio.last.title")}>
          <span className="last-tag"><BrandMark size={11} />{t("inicio.last.title")}</span>
          {last ? (
            <>
              <p className="msg orig">{last.original}</p>
              <span className="msg-when">{relTime(last.timestamp, localeTag)}</span>
              <div className="msg res">
                <span className="msg-preset"><span className="p-dot" style={{ "--pc-h": presetHue(last.preset) } as CSSProperties} aria-hidden="true" />{lastPreset}</span>
                <p className="msg-text">{last.result}</p>
              </div>
            </>
          ) : (
            <p className="last-empty"><Trans k="inicio.last.empty" slots={{ mod: <kbd>{mod}</kbd>, key: <kbd>{key}</kbd> }} /></p>
          )}
          <button className="last-go" onClick={() => onNavigate("historico")}>
            <span>{t("inicio.last.more")}</span>
            <span className="go-ico" aria-hidden="true"><ArrowRightIcon size={14} /></span>
          </button>
        </section>
      </div>

      <div className="sum-head" data-enter>
        <h2>{t("inicio.month")}</h2>
        <Segmented ariaLabel={t("inicio.metric")} value={metric} onChange={setMetric}
          options={[{ value: "cost", label: t("inicio.metric.cost") }, { value: "count", label: t("inicio.metric.count") }]} />
      </div>

      <div className="sum" data-enter>
        <div className="sum-card">
          {tokTotal > 0 ? (
            <div className="tok-rows" role="img" aria-label={t("inicio.tokens.aria", { in: fmtTok(tokIn, localeTag), inPct, out: fmtTok(tokOut, localeTag), outPct })}>
              <div className="tok-row"><i className="tok-in" /><span>{t("inicio.tokens.in")}</span><b>{fmtTok(tokIn, localeTag)}</b><small>{inPct}%</small></div>
              <div className="tok-row"><i className="tok-out" /><span>{t("inicio.tokens.out")}</span><b>{fmtTok(tokOut, localeTag)}</b><small>{outPct}%</small></div>
            </div>
          ) : (
            <p className="sum-empty">{t("inicio.tokens.empty")}</p>
          )}
          <div>
            <div className="sum-k">{t("inicio.tokens.total")}</div>
            <div className="sum-v">{fmtTok(tokUp, localeTag)}</div>
          </div>
        </div>

        <div className="sum-card">
          {months.length > 0 ? (
            <div className="bars" role="img" aria-label={monthsAria}>
              {months.map((m, i) => {
                const v = values[i];
                const h = max > 0 && v > 0 ? Math.max(4, Math.round((v / max) * 100)) : 0;
                const cur = m.month === curMonth;
                return (
                  <div className={"bar" + (cur ? " cur" : "")} key={m.month}
                    title={t("inicio.spend.rowTitle", { month: m.month, n: m.refinements, cost: fmtCost(m.cost_usd, localeTag) })}>
                    <span className="bar-trk">
                      <motion.span className="bar-fill" initial={animate ? { height: "0%" } : false} animate={{ height: h + "%" }}
                        transition={{ ...spring.soft, delay: animate ? 0.12 + i * 0.05 : 0 }} />
                    </span>
                    <span className="bar-m">{monthShort(m.month, localeTag)}</span>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="sum-empty">{t("inicio.spend.empty")}</p>
          )}
          <div>
            <div className="sum-k">{monthLabel}</div>
            <div className="sum-v">{monthValue}</div>
          </div>
        </div>

        <div className="sum-dark">
          {spark && sparkEnd && (
            <svg className="spark" viewBox="0 0 120 56" preserveAspectRatio="none" aria-hidden="true">
              {/* Sem vector-effect: com ele o traço tracejado do pathLength sairia da escala. */}
              <motion.polyline points={spark} fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round"
                initial={animate ? { pathLength: 0 } : false} animate={{ pathLength: 1 }}
                transition={{ duration: 1.1, delay: 0.25, ease: ease.out }} />
              {/* Ponto final: linha de comprimento zero com ponta redonda = círculo perfeito
                  mesmo com o SVG esticado (preserveAspectRatio="none"). */}
              <motion.line x1={sparkEnd[0]} y1={sparkEnd[1]} x2={sparkEnd[0]} y2={sparkEnd[1]} stroke="currentColor" strokeWidth={7}
                strokeLinecap="round" vectorEffect="non-scaling-stroke" initial={animate ? { opacity: 0 } : false}
                animate={{ opacity: 1 }} transition={{ duration: 0.3, delay: animate ? 1.15 : 0 }} />
            </svg>
          )}
          <div className="sum-k">{t("inicio.metric.count")}</div>
          <div className="sum-v">{Math.round(countUp)}</div>
          <small>{refinos > 0 ? t("inicio.count.each", { cost: fmtCost(custoMedio, localeTag) }) : t("inicio.count.none")}</small>
        </div>
      </div>
    </div>
  );
}
