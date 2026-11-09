// GatilhoTab.tsx — aba "Atalho": grava o atalho de ativação direto pelo teclado
// (key-recorder, sem dropdowns), janela entre os toques, modo de ativação e destino
// do resultado. Soft UI: o gravador fica numa área afundada com as teclas
// elevadas (elas "caem" no lugar quando um atalho novo é gravado).
import { useEffect, useState } from "react";
import type { CSSProperties } from "react";
import type { Settings } from "../types";
import { useT } from "../i18n/useT";
import { Trans } from "../i18n/Trans";
import type { Key } from "../i18n/catalog";
import Segmented from "../ui/Segmented";

type Props = {
  settings: Settings;
  update: (patch: Partial<Settings>) => Promise<void>;
};

// Reusa as chaves canônicas mod.* (Ctrl/Alt/Shift); traduzidas no render.
const MOD_LABEL: Record<Settings["trigger_modifier"], Key> = { ctrl: "mod.ctrl", alt: "mod.alt", shift: "mod.shift" };

// Grava o atalho ao pressionar: um modificador (Ctrl/Alt/Shift) + uma letra (A–Z).
// Grava a LETRA da tecla (e.key, layout do usuário): é o que o backend ouve no
// Windows/Linux — num AZERTY, a tecla "A" tem code KeyQ. Cai na posição física
// (e.code) quando a tecla não dá uma letra (Alt/AltGr) e no macOS (posicional).
// Salva via update() — o backend re-registra o hotkey quando as settings mudam.
function TriggerRecorder({ settings, update }: Props) {
  const { t } = useT();
  const [recording, setRecording] = useState(false);
  const [hint, setHint] = useState("");

  useEffect(() => {
    if (!recording) return;
    const onKey = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (e.key === "Escape") { setRecording(false); setHint(""); return; }
      const byCode = e.code.match(/^Key([A-Z])$/);
      const positional = byCode ? byCode[1].toLowerCase() : null;
      const mac = /mac/i.test(navigator.platform);
      const key = !mac && /^[a-z]$/i.test(e.key) ? e.key.toLowerCase() : positional;
      const mod: Settings["trigger_modifier"] | null = e.ctrlKey ? "ctrl" : e.altKey ? "alt" : e.shiftKey ? "shift" : null;
      const isModKey = e.key === "Control" || e.key === "Alt" || e.key === "Shift" || e.key === "Meta";
      if (mod && key) {
        update({ trigger_modifier: mod, trigger_key: key });
        setRecording(false);
        setHint("");
        return;
      }
      if (isModKey) { setHint(""); return; }            // segurando só o modificador, espera a letra
      if (!mod) { setHint(t("gatilho.hint.needMod")); return; }
      setHint(t("gatilho.hint.needLetter"));            // modificador + tecla que não é letra
    };
    const onBlur = () => { setRecording(false); setHint(""); };
    window.addEventListener("keydown", onKey, true);
    window.addEventListener("blur", onBlur);
    return () => {
      window.removeEventListener("keydown", onKey, true);
      window.removeEventListener("blur", onBlur);
    };
  }, [recording, update, t]);

  const mod = t(MOD_LABEL[settings.trigger_modifier] ?? "mod.ctrl");
  const key = (settings.trigger_key || "c").toUpperCase();

  return (
    <div className="rec-box">
      <button
        type="button"
        className={"rec-btn" + (recording ? " rec" : "")}
        onClick={() => { setRecording((r) => !r); setHint(""); }}
        aria-label={t("gatilho.record.aria")}
        aria-pressed={recording}
      >
        {recording ? (
          <span className="rec-prompt">{t("gatilho.record.prompt")}<span className="rec-caret" /></span>
        ) : (
          // key = combinação: remonta ao gravar um atalho novo e as teclas "caem".
          <span className="rec-combo" key={mod + key}>
            <kbd>{mod}</kbd><span className="plus">+</span><kbd>{key}</kbd>
            <span className="x2" title={t("gatilho.record.x2.title")}>{t("gatilho.record.x2")}</span>
          </span>
        )}
      </button>
      <span className="rec-edit">{recording ? t("gatilho.record.cancel") : t("gatilho.record.edit")}</span>
      {hint && <span className="rec-hint" role="status">{hint}</span>}
    </div>
  );
}

export default function GatilhoTab({ settings, update }: Props) {
  const { t } = useT();
  // Intervalo do duplo-toque: o controle acompanha o arrasto em estado local e
  // só GRAVA ao soltar (cada passo gravado era uma escrita de arquivo no backend).
  const [draftMs, setDraftMs] = useState<number | null>(null);
  const ms = draftMs ?? settings.debounce_ms;
  const commitMs = () => {
    if (draftMs != null && draftMs !== settings.debounce_ms) update({ debounce_ms: draftMs }).catch(() => setDraftMs(null));
  };
  // O valor salvo chegou (ou mudou por fora): o rascunho já não é necessário.
  useEffect(() => { setDraftMs(null); }, [settings.debounce_ms]);
  return (
    <div className="page-stack page-fill">
      {/* Atalho de ativação — gravado direto pelo teclado */}
      <section className="card" data-enter>
        <div className="card-head"><h2 className="card-title">{t("gatilho.label")}</h2></div>
        <TriggerRecorder settings={settings} update={update} />
        <div className="debounce">
          <span id="debounce-label" className="debounce-label"><Trans k="gatilho.debounce" slots={{ ms: <strong>{ms} ms</strong> }} /></span>
          <input
            type="range"
            className="range"
            aria-labelledby="debounce-label"
            aria-valuetext={`${ms} ms`}
            min={250}
            max={600}
            step={10}
            value={ms}
            style={{ "--fill": `${((ms - 250) / 350) * 100}%` } as CSSProperties}
            onChange={(e) => setDraftMs(Number(e.target.value))}
            onPointerUp={commitMs}
            onKeyUp={commitMs}
            onBlur={commitMs}
          />
          <span className="debounce-scale" aria-hidden="true"><span>250 ms</span><span>600 ms</span></span>
        </div>
        <p className="help">
          <Trans k="gatilho.help" slots={{ strong: <strong>{t("gatilho.help.strong")}</strong> }} />
        </p>
      </section>

      {/* Modo de ativação e saída, lado a lado */}
      <div className="grid-2">
        <section className="card" data-enter>
          <h2 className="card-title card-label">{t("gatilho.when")}</h2>
          <Segmented
            ariaLabel={t("gatilho.when")}
            value={settings.mode}
            onChange={(mode) => update({ mode })}
            options={[{ value: "instant", label: t("gatilho.when.instant") }, { value: "popup", label: t("gatilho.when.popup") }]}
          />
          <p className="help">
            {settings.mode === "instant"
              ? t("gatilho.when.instant.help")
              : t("gatilho.when.popup.help")}
          </p>
        </section>

        <section className="card" data-enter>
          <h2 className="card-title card-label">{t("gatilho.output")}</h2>
          <Segmented
            ariaLabel={t("gatilho.output")}
            value={settings.output}
            onChange={(output) => update({ output })}
            options={[{ value: "replace", label: t("gatilho.output.replace") }, { value: "clipboard", label: t("gatilho.output.clipboard") }]}
          />
          <p className="help">
            {settings.output === "replace"
              ? t("gatilho.output.replace.help")
              : t("gatilho.output.clipboard.help")}
          </p>
        </section>
      </div>
    </div>
  );
}
