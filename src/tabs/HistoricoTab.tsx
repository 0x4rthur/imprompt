// HistoricoTab.tsx — aba "Histórico": timeline dos imprompts da SESSÃO (não persiste
// em disco — preserva a privacidade do app). Cada entrada é um ACORDEON: colapsada
// mostra hora + preset + prévia do original; expande pra ver original e resultado
// completos (com "Copiar resultado"). Recebe history/presets do App.
import { useEffect, useRef, useState } from "react";
import type { CSSProperties } from "react";
import type { Preset, RefineRecord } from "../types";
import { presetHue } from "../presetColor";
import { useT } from "../i18n/useT";
import { t as translate } from "../i18n";

type Props = { history: RefineRecord[]; presets: Preset[] };

// "Hoje" / "Ontem" / data curta (conforme o locale), a partir do timestamp.
function dayLabel(ts: number, localeTag: string): string {
  const startToday = new Date(); startToday.setHours(0, 0, 0, 0);
  const t0 = startToday.getTime();
  if (ts >= t0) return translate("historico.today");
  if (ts >= t0 - 86400000) return translate("historico.yesterday");
  return new Date(ts).toLocaleDateString(localeTag);
}
function timeLabel(ts: number, localeTag: string): string {
  return new Date(ts).toLocaleTimeString(localeTag, { hour: "2-digit", minute: "2-digit" });
}

export default function HistoricoTab({ history, presets }: Props) {
  const { t, locale } = useT();
  const localeTag = locale === "pt-BR" ? "pt-BR" : "en-US";
  // Quais entradas estão expandidas (por timestamp). Default: todas colapsadas.
  const [open, setOpen] = useState<Set<number>>(new Set());
  // Entrada cujo resultado acabou de ser copiado (feedback "Copiado" por ~1,5s).
  const [copied, setCopied] = useState<number | null>(null);
  const copiedTimer = useRef(0);
  useEffect(() => () => window.clearTimeout(copiedTimer.current), []);
  const toggle = (ts: number) =>
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(ts)) next.delete(ts); else next.add(ts);
      return next;
    });
  async function copyResult(h: RefineRecord) {
    try {
      await navigator.clipboard.writeText(h.result);
      setCopied(h.timestamp);
      window.clearTimeout(copiedTimer.current);
      copiedTimer.current = window.setTimeout(() => setCopied(null), 1500);
    } catch (e) {
      console.error(e);
    }
  }

  // Agrupa preservando a ordem (history vem do mais recente pro mais antigo).
  const groups: { date: string; items: RefineRecord[] }[] = [];
  for (const h of history) {
    const label = dayLabel(h.timestamp, localeTag);
    const last = groups[groups.length - 1];
    if (last && last.date === label) last.items.push(h);
    else groups.push({ date: label, items: [h] });
  }
  const presetLabel = (id: string) => presets.find((p) => p.id === id)?.label ?? id;

  return (
    <div className="inicio">
      {history.length === 0 ? (
        <p className="tl-empty">{t("historico.empty")}</p>
      ) : (
        <div className="timeline">
          {groups.map((g, gi) => (
            <section key={g.date + "-" + gi}>
              <h2 className="tl-group-date">{g.date}</h2>
              <div className="tl-list">
                {g.items.map((h, i) => {
                  const isOpen = open.has(h.timestamp);
                  return (
                    <div className={"acc" + (isOpen ? " open" : "")} key={h.timestamp + "-" + i}>
                      <button className="acc-head" onClick={() => toggle(h.timestamp)} aria-expanded={isOpen}>
                        <span className="tl-time">{timeLabel(h.timestamp, localeTag)}</span>
                        <span className="tl-preset" style={{ "--pc-h": presetHue(h.preset) } as CSSProperties}>{presetLabel(h.preset)}</span>
                        <span className="acc-prev">{h.original}</span>
                        <svg className="acc-chev" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
                          <path d="M4 6l4 4 4-4" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      </button>
                      <div className="acc-body">
                        <div className="acc-inner">
                          <div className="acc-pad">
                            <div className="tl-block">
                              <span className="tl-label">{t("historico.aria.original")}</span>
                              <p className="tl-line orig">{h.original}</p>
                            </div>
                            <div className="tl-block">
                              <span className="tl-label ok">{t("historico.aria.result")}</span>
                              <p className="tl-line res">{h.result}</p>
                            </div>
                            <div className="tl-actions">
                              <button className="btn-dl" tabIndex={isOpen ? 0 : -1} onClick={() => copyResult(h)} aria-live="polite">
                                {copied === h.timestamp ? t("historico.copied") : t("historico.copy")}
                              </button>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
