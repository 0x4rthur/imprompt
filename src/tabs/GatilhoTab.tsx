// GatilhoTab.tsx — aba "Atalho": grava o atalho de ativação direto pelo teclado
// (key-recorder, sem dropdowns), janela entre os toques, modo de ativação e destino
// do resultado.
import { useEffect, useState } from "react";
import type { Settings } from "../types";

type Props = {
  settings: Settings;
  update: (patch: Partial<Settings>) => Promise<void>;
};

const MOD_LABEL: Record<Settings["trigger_modifier"], string> = { ctrl: "Ctrl", alt: "Alt", shift: "Shift" };

// Grava o atalho ao pressionar: um modificador (Ctrl/Alt/Shift) + uma letra (A–Z).
// Usa e.code (tecla física → casa com o rdev do backend) e os flags de modificador.
// Salva via update() — o backend re-registra o hotkey quando as settings mudam.
function TriggerRecorder({ settings, update }: Props) {
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
      if (!mod) { setHint("Segure Ctrl, Alt ou Shift + uma letra."); return; }
      setHint("Use uma letra de A a Z.");               // modificador + tecla que não é letra
    };
    const onBlur = () => { setRecording(false); setHint(""); };
    window.addEventListener("keydown", onKey, true);
    window.addEventListener("blur", onBlur);
    return () => {
      window.removeEventListener("keydown", onKey, true);
      window.removeEventListener("blur", onBlur);
    };
  }, [recording, update]);

  const mod = MOD_LABEL[settings.trigger_modifier] ?? "Ctrl";
  const key = (settings.trigger_key || "c").toUpperCase();

  return (
    <div className="trigger-rec-wrap">
      <button
        type="button"
        className={"trigger-rec" + (recording ? " rec" : "")}
        onClick={() => { setRecording((r) => !r); setHint(""); }}
        aria-label="Gravar atalho de ativação"
        aria-pressed={recording}
      >
        {recording ? (
          <span className="trigger-rec-prompt">Pressione o atalho<span className="rec-caret" /></span>
        ) : (
          <span className="trigger-combo">
            <kbd>{mod}</kbd><span className="trigger-plus">+</span><kbd>{key}</kbd>
            <span className="trigger-x2" title="pressionado duas vezes">× 2</span>
          </span>
        )}
      </button>
      <span className="trigger-rec-edit">{recording ? "Esc cancela" : "clique e pressione as teclas"}</span>
      {hint && <span className="trigger-rec-hint" role="status">{hint}</span>}
    </div>
  );
}

export default function GatilhoTab({ settings, update }: Props) {
  return (
    <section className="card">
      {/* Atalho de ativação — gravado direto pelo teclado */}
      <div className="field">
        <label>Atalho</label>
        <TriggerRecorder settings={settings} update={update} />
        <div className="debounce-row">
          <span id="debounce-label" className="debounce-label">Janela entre os 2 toques: <strong>{settings.debounce_ms} ms</strong></span>
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
          O 1º toque copia a seleção; o 2º (dentro da janela) ativa o Imprompt.
          <strong> Ctrl+C é o recomendado</strong> — é ele que copia o texto; outros
          atalhos exigem que você já tenha copiado o texto antes.
        </p>
      </div>

      {/* Modo de ativação */}
      <div className="field">
        <label>Quando ativar</label>
        <div className="seg" role="group" aria-label="Quando ativar">
          <button aria-pressed={settings.mode === "instant"} className={settings.mode === "instant" ? "active" : ""} onClick={() => update({ mode: "instant" })}>Instantâneo</button>
          <button aria-pressed={settings.mode === "popup"} className={settings.mode === "popup" ? "active" : ""} onClick={() => update({ mode: "popup" })}>Mostrar popup</button>
        </div>
        <p className="help">
          {settings.mode === "instant"
            ? "Usa seu preset padrão na hora, sem mostrar nada. Mais rápido."
            : "Abre o popup pra você escolher o preset a cada ativação."}
        </p>
      </div>

      {/* Saída */}
      <div className="field">
        <label>O que fazer com o resultado</label>
        <div className="seg" role="group" aria-label="O que fazer com o resultado">
          <button aria-pressed={settings.output === "replace"} className={settings.output === "replace" ? "active" : ""} onClick={() => update({ output: "replace" })}>Substituir</button>
          <button aria-pressed={settings.output === "clipboard"} className={settings.output === "clipboard" ? "active" : ""} onClick={() => update({ output: "clipboard" })}>Copiar</button>
        </div>
        <p className="help">
          {settings.output === "replace"
            ? "Troca o texto selecionado pelo resultado, automaticamente."
            : "Coloca o resultado na área de transferência. Você dá Ctrl+V onde quiser."}
        </p>
      </div>
    </section>
  );
}
