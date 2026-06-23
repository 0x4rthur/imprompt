// PresetsTab.tsx — aba "Presets": preset padrão, CRUD dos presets do usuário e o
// toggle de few-shot. O rascunho do form (draft) e o erro de validação são locais.
import { useEffect, useRef, useState } from "react";
import type { CSSProperties } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { Preset, PresetDraft, Settings } from "../types";
import { presetHue } from "../presetColor";

type Props = {
  settings: Settings;
  update: (patch: Partial<Settings>) => Promise<void>;
  presets: Preset[];
  loadPresets: () => void;
};

// Ícone de lixeira (linha, herda a cor via currentColor).
function TrashIcon() {
  return (
    <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4 7h16" />
      <path d="M10 11v6" />
      <path d="M14 11v6" />
      <path d="M5 7l1 12a2 2 0 0 0 2 2h8a2 2 0 0 0 2 -2l1 -12" />
      <path d="M9 7v-3a1 1 0 0 1 1 -1h4a1 1 0 0 1 1 1v3" />
    </svg>
  );
}

export default function PresetsTab({ settings, update, presets, loadPresets }: Props) {
  // Presets: rascunho do form (null = form fechado) + erro de validação.
  const [draft, setDraft] = useState<PresetDraft | null>(null);
  const [presetErr, setPresetErr] = useState("");
  // Exclusão em dois cliques: id do preset aguardando confirmação inline.
  const [confirmId, setConfirmId] = useState<string | null>(null);
  // Ref do form de edição, pra fechar ao clicar fora dele.
  const formRef = useRef<HTMLDivElement>(null);
  // Ref do botão atualmente "armado" (lixeira vermelha / confirmar restauração),
  // pra cancelar a confirmação ao clicar fora dele.
  const armedRef = useRef<HTMLButtonElement>(null);

  // ── Presets (criar / editar / duplicar / excluir) ──
  function startNewPreset() {
    setPresetErr("");
    setConfirmId(null);
    setDraft({ id: null, label: "", instruction: "", example_input: "", example_output: "" });
  }
  function startEditPreset(p: Preset) {
    setPresetErr("");
    setConfirmId(null);
    setDraft({ id: p.id, label: p.label, instruction: p.instruction, example_input: p.example_input, example_output: p.example_output });
  }
  function startDuplicatePreset(p: Preset) {
    setPresetErr("");
    setConfirmId(null);
    setDraft({ id: null, label: p.label + " (cópia)", instruction: p.instruction, example_input: p.example_input, example_output: p.example_output });
  }
  async function savePreset() {
    if (!draft) return;
    setPresetErr("");
    const body = {
      id: draft.id ?? "",
      label: draft.label,
      instruction: draft.instruction,
      example_input: draft.example_input,
      example_output: draft.example_output,
    };
    try {
      if (draft.id) await invoke("update_preset", { preset: body });
      else await invoke<Preset>("create_preset", { preset: body });
      setDraft(null);
      loadPresets();
    } catch (e) {
      setPresetErr(String(e));
    }
  }
  async function removePreset(p: Preset) {
    try {
      await invoke("delete_preset", { id: p.id });
      // Se era o preset padrão, volta pro primeiro disponível.
      if (settings.default_preset === p.id) {
        const fallback = presets.find((x) => x.id !== p.id)?.id;
        if (fallback) await update({ default_preset: fallback });
      }
      setConfirmId(null);
      loadPresets();
    } catch (e) {
      console.error(e);
    }
  }

  // "Restaurar padrões": desfaz edições/exclusões dos embutidos (não mexe nos seus).
  async function restoreDefaults() {
    try {
      await invoke("restore_default_presets");
      setConfirmId(null);
      loadPresets();
    } catch (e) {
      console.error(e);
    }
  }

  // Fecha o form ao clicar FORA dele (descarta o rascunho, igual ao "Cancelar").
  // Só ativo com o form aberto. mousedown pega o clique antes de qualquer botão.
  useEffect(() => {
    if (draft === null) return;
    function onDown(e: MouseEvent) {
      if (formRef.current && !formRef.current.contains(e.target as Node)) {
        setDraft(null);
        setPresetErr("");
      }
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [draft]);

  // Cancela a confirmação (exclusão ou restauração) ao clicar FORA do botão
  // armado — pra um clique errado não ficar preso no vermelho.
  useEffect(() => {
    if (confirmId === null) return;
    function onArmedOutside(e: MouseEvent) {
      // Clique no PRÓPRIO botão armado → deixa o onClick (confirmar) agir.
      if (armedRef.current && armedRef.current.contains(e.target as Node)) return;
      setConfirmId(null);
    }
    document.addEventListener("mousedown", onArmedOutside);
    return () => document.removeEventListener("mousedown", onArmedOutside);
  }, [confirmId]);

  return (
    <section className="card">
      {/* Preset padrão */}
      <div className="field">
        <label>Preset padrão</label>
        <div className="chips">
          {presets.map((p) => (
            <button
              key={p.id}
              className={"chip" + (settings.default_preset === p.id ? " active" : "")}
              style={{ "--pc-h": presetHue(p.id) } as CSSProperties}
              onClick={() => update({ default_preset: p.id })}
            >
              {p.label}
            </button>
          ))}
        </div>
        <p className="help">Usado no modo instantâneo, sem perguntar nada.</p>
      </div>

      {/* Presets (criar/editar/excluir) */}
      <div className="field">
        <label>Presets</label>
        <p className="help">Edite, duplique ou exclua qualquer preset. "Restaurar padrões" traz os originais de volta.</p>
        <div className="mypresets">
          {presets.map((p) => (
            <div className="mp-item" key={p.id}>
              <span className="mp-label">{p.label}</span>
              {p.edited && <span className="mp-badge">editado</span>}
              <button className="btn-dl" onClick={() => startEditPreset(p)}>Editar</button>
              <button className="btn-dl" onClick={() => startDuplicatePreset(p)}>Duplicar</button>
              <button
                ref={confirmId === p.id ? armedRef : undefined}
                className={"trash-btn" + (confirmId === p.id ? " armed" : "")}
                onClick={() => (confirmId === p.id ? removePreset(p) : setConfirmId(p.id))}
                title={confirmId === p.id ? "Confirmar exclusão" : "Excluir"}
                aria-label={confirmId === p.id ? "Confirmar exclusão" : "Excluir"}
              >
                <TrashIcon />
                <span className="trash-label">Excluir</span>
              </button>
            </div>
          ))}
        </div>

        {draft === null ? (
          <div className="mp-actions">
            <button className="btn-dl" onClick={startNewPreset}>+ Novo preset</button>
            {confirmId === "__restore__" ? (
              <button ref={armedRef} className="btn-dl danger" onClick={restoreDefaults} title="Desfaz suas edições e exclusões dos presets padrão">Confirmar restauração</button>
            ) : (
              <button className="btn-dl" onClick={() => setConfirmId("__restore__")} title="Traz os presets originais de volta (não mexe nos seus)">Restaurar padrões</button>
            )}
          </div>
        ) : (
          <div className="mp-form" ref={formRef}>
            <input
              className="mp-input"
              aria-label="Nome do preset"
              placeholder="Nome (ex.: Resumir em tópicos)"
              value={draft.label}
              onChange={(e) => setDraft({ ...draft, label: e.target.value })}
            />
            <textarea
              className="mp-input"
              aria-label="Instrução"
              rows={3}
              placeholder="Instrução: o que esse preset deve fazer com o texto"
              value={draft.instruction}
              onChange={(e) => setDraft({ ...draft, instruction: e.target.value })}
            />
            <input
              className="mp-input"
              aria-label="Exemplo de entrada"
              placeholder="Exemplo de entrada (opcional)"
              value={draft.example_input}
              onChange={(e) => setDraft({ ...draft, example_input: e.target.value })}
            />
            <input
              className="mp-input"
              aria-label="Exemplo de saída"
              placeholder="Exemplo de saída (opcional)"
              value={draft.example_output}
              onChange={(e) => setDraft({ ...draft, example_output: e.target.value })}
            />
            <div className="mp-form-actions">
              <button className="btn-dl primary" onClick={savePreset}>{draft.id ? "Salvar" : "Criar"}</button>
              <button className="btn-dl" onClick={() => { setDraft(null); setPresetErr(""); }}>Cancelar</button>
              {presetErr && <span className="field-err">{presetErr}</span>}
            </div>
          </div>
        )}
      </div>

      {/* Exemplos few-shot */}
      <div className="field">
        <label>Usar exemplos (few-shot)</label>
        <div className="seg" role="group" aria-label="Usar exemplos">
          <button aria-pressed={settings.use_examples} className={settings.use_examples ? "active" : ""} onClick={() => update({ use_examples: true })}>Sim</button>
          <button aria-pressed={!settings.use_examples} className={!settings.use_examples ? "active" : ""} onClick={() => update({ use_examples: false })}>Não</button>
        </div>
        <p className="help">
          {settings.use_examples
            ? "Cada preset manda um exemplo (entrada → saída) como turnos de conversa antes do seu texto. Costuma melhorar a qualidade da resposta da API."
            : "Zero-shot: só a instrução do preset, sem exemplo. Útil pra comparar (A/B)."}
        </p>
      </div>
    </section>
  );
}
