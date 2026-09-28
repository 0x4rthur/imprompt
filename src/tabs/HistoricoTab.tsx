// HistoricoTab.tsx — aba "Histórico": os imprompts da SESSÃO (não persiste em
// disco — preserva a privacidade do app). Cada imprompt é um CARD que abre:
// fechado mostra hora + preset + prévia do original; aberto mostra original e
// resultado completos (com "Copiar resultado"). Fechado, o corpo sai da árvore
// de acessibilidade (aria-hidden) e do Tab. Recebe history/presets do App.
import { useEffect, useRef, useState } from "react";
import type { CSSProperties } from "react";
import type { Preset, RefineRecord } from "../types";
import { presetHue } from "../presetColor";
import { useT } from "../i18n/useT";
import { t as translate } from "../i18n";
import { CheckIcon, ChevronDownIcon } from "../ui/icons";
import Swap from "../ui/Swap";

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
  // Quais entradas estão abertas (por timestamp). Default: todas fechadas.
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

  if (history.length === 0) {
    return (
      <div className="history">
        <div className="card h-empty" data-enter>
          <p>{t("historico.empty")}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="history">
      {groups.map((g, gi) => (
        <section className="h-group" key={g.date + "-" + gi} data-enter>
          <h2 className="h-date">{g.date}</h2>
          <div className="h-list">
            {g.items.map((h, i) => {
              const isOpen = open.has(h.timestamp);
              const isCopied = copied === h.timestamp;
              return (
                <div className={"h-item" + (isOpen ? " open" : "")} key={h.timestamp + "-" + i}>
                  <button className="h-head" onClick={() => toggle(h.timestamp)} aria-expanded={isOpen}>
                    <span className="h-time">{timeLabel(h.timestamp, localeTag)}</span>
                    <span className="tag" style={{ "--pc-h": presetHue(h.preset) } as CSSProperties}>{presetLabel(h.preset)}</span>
                    <span className="h-prev">{h.original}</span>
                    <span className="h-chev" aria-hidden="true"><ChevronDownIcon size={14} /></span>
                  </button>
                  <div className="h-body" aria-hidden={!isOpen}>
                    <div className="h-inner">
                      <div className="h-pad">
                        <div className="h-block">
                          <span className="h-lbl">{t("historico.aria.original")}</span>
                          <p className="h-text">{h.original}</p>
                        </div>
                        <div className="h-block res">
                          <span className="h-lbl ok">{t("historico.aria.result")}</span>
                          <p className="h-text">{h.result}</p>
                        </div>
                        <div className="h-actions">
                          <button className="btn-dl sm swap-btn" tabIndex={isOpen ? 0 : -1} onClick={() => copyResult(h)} aria-live="polite">
                            <Swap id={isCopied ? "done" : "copy"} className="swap">
                              {isCopied && <CheckIcon size={13} />}
                              {isCopied ? t("historico.copied") : t("historico.copy")}
                            </Swap>
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
  );
}
