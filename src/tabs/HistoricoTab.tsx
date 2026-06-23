// HistoricoTab.tsx — aba "Histórico": timeline dos imprompts da SESSÃO (não persiste
// em disco — preserva a privacidade do app). Cada entrada é um ACORDEON: colapsada
// mostra hora + preset + prévia do original; expande pra ver original e resultado
// completos. Recebe history/presets do App.
import { useState } from "react";
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
  const toggle = (ts: number) =>
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(ts)) next.delete(ts); else next.add(ts);
      return next;
    });

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
      <div className="inicio-head" style={{ marginTop: 0 }}>
        <h2>{t("historico.title")}</h2>
      </div>

      {history.length === 0 ? (
        <div className="tl-empty">{t("historico.empty")}</div>
      ) : (
        <div className="timeline">
          {groups.map((g, gi) => (
            <div key={g.date + "-" + gi}>
              <div className="tl-group-date">{g.date}</div>
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
                            <div className="tl-line orig"><span className="tl-mk" aria-label={t("historico.aria.original")}>[-]</span><span>{h.original}</span></div>
                            <div className="tl-line res"><span className="tl-mk ok" aria-label={t("historico.aria.result")}>[+]</span><span>{h.result}</span></div>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
