// GatilhoTab.tsx — aba "Atalho": grava o atalho de ativação direto pelo teclado
// (key-recorder, sem dropdowns), janela entre os toques, modo de ativação e destino
// do resultado.
import { useEffect, useState } from "react";
import type { Settings } from "../types";
import { useT } from "../i18n/useT";
import { Trans } from "../i18n/Trans";
import type { Key } from "../i18n/catalog";

type Props = {
  settings: Settings;
  update: (patch: Partial<Settings>) => Promise<void>;
};

// Reusa as chaves canônicas mod.* (Ctrl/Alt/Shift); traduzidas no render.
const MOD_LABEL: Record<Settings["trigger_modifier"], Key> = { ctrl: "mod.ctrl", alt: "mod.alt", shift: "mod.shift" };

// Grava o atalho ao pressionar: um modificador (Ctrl/Alt/Shift) + uma letra (A–Z).
// Usa e.code (tecla física → casa com o rdev do backend) e os flags de modificador.
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
      const m = e.code.match(/^Key([A-Z])$/);
      const key = m ? m[1].toLowerCase() : null;
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
    <div className="trigger-rec-wrap">
      <button
        type="button"
        className={"trigger-rec" + (recording ? " rec" : "")}
        onClick={() => { setRecording((r) => !r); setHint(""); }}
        aria-label={t("gatilho.record.aria")}
        aria-pressed={recording}
      >
        {recording ? (
          <span className="trigger-rec-prompt">{t("gatilho.record.prompt")}<span className="rec-caret" /></span>
        ) : (
          <span className="trigger-combo">
            <kbd>{mod}</kbd><span className="trigger-plus">+</span><kbd>{key}</kbd>
            <span className="trigger-x2" title={t("gatilho.record.x2.title")}>{t("gatilho.record.x2")}</span>
          </span>
        )}
      </button>
      <span className="trigger-rec-edit">{recording ? t("gatilho.record.cancel") : t("gatilho.record.edit")}</span>
      {hint && <span className="trigger-rec-hint" role="status">{hint}</span>}
    </div>
  );
}

export default function GatilhoTab({ settings, update }: Props) {
  const { t } = useT();
  return (
    <section className="card">
      {/* Atalho de ativação — gravado direto pelo teclado */}
      <div className="field">
        <label>{t("gatilho.label")}</label>
        <TriggerRecorder settings={settings} update={update} />
        <div className="debounce-row">
          <span id="debounce-label" className="debounce-label"><Trans k="gatilho.debounce" slots={{ ms: <strong>{settings.debounce_ms} ms</strong> }} /></span>
          <input
            type="range"
            aria-labelledby="debounce-label"
            aria-valuetext={`${settings.debounce_ms} ms`}
            min={250}
            max={600}
            step={10}
            value={settings.debounce_ms}
            onChange={(e) => update({ debounce_ms: Number(e.target.value) })}
          />
        </div>
        <p className="help">
          <Trans k="gatilho.help" slots={{ strong: <strong>{t("gatilho.help.strong")}</strong> }} />
        </p>
      </div>

      {/* Modo de ativação */}
      <div className="field">
        <label>{t("gatilho.when")}</label>
        <div className="seg" role="group" aria-label={t("gatilho.when")}>
          <button aria-pressed={settings.mode === "instant"} className={settings.mode === "instant" ? "active" : ""} onClick={() => update({ mode: "instant" })}>{t("gatilho.when.instant")}</button>
          <button aria-pressed={settings.mode === "popup"} className={settings.mode === "popup" ? "active" : ""} onClick={() => update({ mode: "popup" })}>{t("gatilho.when.popup")}</button>
        </div>
        <p className="help">
          {settings.mode === "instant"
            ? t("gatilho.when.instant.help")
            : t("gatilho.when.popup.help")}
        </p>
      </div>

      {/* Saída */}
      <div className="field">
        <label>{t("gatilho.output")}</label>
        <div className="seg" role="group" aria-label={t("gatilho.output")}>
          <button aria-pressed={settings.output === "replace"} className={settings.output === "replace" ? "active" : ""} onClick={() => update({ output: "replace" })}>{t("gatilho.output.replace")}</button>
          <button aria-pressed={settings.output === "clipboard"} className={settings.output === "clipboard" ? "active" : ""} onClick={() => update({ output: "clipboard" })}>{t("gatilho.output.clipboard")}</button>
        </div>
        <p className="help">
          {settings.output === "replace"
            ? t("gatilho.output.replace.help")
            : t("gatilho.output.clipboard.help")}
        </p>
      </div>
    </section>
  );
}
