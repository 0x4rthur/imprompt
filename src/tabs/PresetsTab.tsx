// PresetsTab.tsx — aba "Presets": preset padrão, CRUD dos presets do usuário e o
// toggle de few-shot. O form de edição abre como ACORDEON inline embaixo do preset
// clicado (expande/colapsa suave). O rascunho (draft) e o erro são locais.
import { useEffect, useRef, useState } from "react";
import type { CSSProperties } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { Preset, PresetDraft, Settings } from "../types";
import { presetHue } from "../presetColor";
import { useT } from "../i18n/useT";

type Props = {
  settings: Settings;
  update: (patch: Partial<Settings>) => Promise<void>;
  presets: Preset[];
  loadPresets: () => void;
};

// Âncora especial: form de "novo preset" abre embaixo da lista (não num preset).
const NEW = "__new__";
// Duração do colapso do acordeon (precisa casar com a transition do CSS).
const ANIM_MS = 240;

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
  const { t } = useT();
  // Form do acordeon: rascunho (null = fechado), âncora (preset id ou NEW) onde
  // ele aparece, e closing (tocando a animação de fechar) + erro de validação.
  const [draft, setDraft] = useState<PresetDraft | null>(null);
  const [anchor, setAnchor] = useState<string | null>(null);
  const [closing, setClosing] = useState(false);
  const [presetErr, setPresetErr] = useState("");
  // Exclusão/restauração em dois cliques: id aguardando confirmação inline.
  const [confirmId, setConfirmId] = useState<string | null>(null);
  // Ref do botão "armado" (lixeira vermelha / confirmar restauração), pra cancelar
  // a confirmação ao clicar fora dele.
  const armedRef = useRef<HTMLButtonElement>(null);

  // ── Abrir/fechar o acordeon ──
  function openFor(a: string, d: PresetDraft) {
    setPresetErr("");
    setConfirmId(null);
    setClosing(false);
    setAnchor(a);
    setDraft(d);
  }
  function startNewPreset() {
    openFor(NEW, { id: null, label: "", instruction: "", example_input: "", example_output: "" });
  }
  function startEditPreset(p: Preset) {
    openFor(p.id, { id: p.id, label: p.label, instruction: p.instruction, example_input: p.example_input, example_output: p.example_output });
  }
  function startDuplicatePreset(p: Preset) {
    openFor(p.id, { id: null, label: p.label + t("presets.copySuffix"), instruction: p.instruction, example_input: p.example_input, example_output: p.example_output });
  }
  // Fecha com animação: tira o "open" (colapsa) MAS mantém o form montado até o fim
  // da transição, pra o conteúdo ser visível durante o fecho (sem flicker).
  function closeForm() {
    if (closing) return;
    setClosing(true);
    window.setTimeout(() => {
      setDraft(null);
      setAnchor(null);
      setClosing(false);
      setPresetErr("");
    }, ANIM_MS);
  }
  // Clicar "Editar" no preset já aberto → fecha (toggle). Em outro → troca.
  function toggleEdit(p: Preset) {
    if (closing) return;
    if (anchor === p.id) closeForm(); else startEditPreset(p);
  }
  function toggleNew() {
    if (closing) return;
    if (anchor === NEW) closeForm(); else startNewPreset();
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
      loadPresets();
      closeForm();
    } catch (e) {
      setPresetErr(String(e));
    }
  }
  async function removePreset(p: Preset) {
    try {
      await invoke("delete_preset", { id: p.id });
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
  async function restoreDefaults() {
    try {
      await invoke("restore_default_presets");
      setConfirmId(null);
      loadPresets();
    } catch (e) {
      console.error(e);
    }
  }

  // Cancela a confirmação (exclusão/restauração) ao clicar FORA do botão armado.
  useEffect(() => {
    if (confirmId === null) return;
    function onArmedOutside(e: MouseEvent) {
      if (armedRef.current && armedRef.current.contains(e.target as Node)) return;
      setConfirmId(null);
    }
    document.addEventListener("mousedown", onArmedOutside);
    return () => document.removeEventListener("mousedown", onArmedOutside);
  }, [confirmId]);

  // O form do acordeon (renderizado dentro da âncora ativa). Fica montado também
  // durante o `closing`, pra animar o colapso com o conteúdo visível.
  const formNode = draft && (
    <div className="mp-form">
      <input
        className="mp-input"
        aria-label={t("presets.form.name.aria")}
        placeholder={t("presets.form.name.placeholder")}
        value={draft.label}
        onChange={(e) => setDraft({ ...draft, label: e.target.value })}
      />
      <textarea
        className="mp-input"
        aria-label={t("presets.form.instruction.aria")}
        rows={3}
        placeholder={t("presets.form.instruction.placeholder")}
        value={draft.instruction}
        onChange={(e) => setDraft({ ...draft, instruction: e.target.value })}
      />
      <input
        className="mp-input"
        aria-label={t("presets.form.exampleInput.aria")}
        placeholder={t("presets.form.exampleInput.placeholder")}
        value={draft.example_input}
        onChange={(e) => setDraft({ ...draft, example_input: e.target.value })}
      />
      <input
        className="mp-input"
        aria-label={t("presets.form.exampleOutput.aria")}
        placeholder={t("presets.form.exampleOutput.placeholder")}
        value={draft.example_output}
        onChange={(e) => setDraft({ ...draft, example_output: e.target.value })}
      />
      <div className="mp-form-actions">
        <button className="btn-dl primary" onClick={savePreset}>{draft.id ? t("presets.save") : t("presets.create")}</button>
        <button className="btn-dl" onClick={closeForm}>{t("presets.cancel")}</button>
        {presetErr && <span className="field-err">{presetErr}</span>}
      </div>
    </div>
  );

  return (
    <section className="card">
      {/* Preset padrão */}
      <div className="field">
        <label>{t("presets.default")}</label>
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
        <p className="help">{t("presets.default.help")}</p>
      </div>

      {/* Presets (criar/editar/duplicar/excluir) — edição em acordeon inline */}
      <div className="field">
        <label>{t("presets.list")}</label>
        <p className="help">{t("presets.list.help")}</p>
        <div className="mypresets">
          {presets.map((p) => {
            const open = anchor === p.id && !closing;
            return (
              <div className="mp-item" key={p.id}>
                <div className="mp-row">
                  <span className="mp-label">{p.label}</span>
                  {p.edited && <span className="mp-badge">{t("presets.badge.edited")}</span>}
                  <button className="btn-dl" aria-expanded={anchor === p.id} onClick={() => toggleEdit(p)}>{t("presets.edit")}</button>
                  <button className="btn-dl" onClick={() => startDuplicatePreset(p)}>{t("presets.duplicate")}</button>
                  <button
                    ref={confirmId === p.id ? armedRef : undefined}
                    className={"trash-btn" + (confirmId === p.id ? " armed" : "")}
                    onClick={() => (confirmId === p.id ? removePreset(p) : setConfirmId(p.id))}
                    title={confirmId === p.id ? t("presets.delete.confirm") : t("presets.delete")}
                    aria-label={confirmId === p.id ? t("presets.delete.confirm") : t("presets.delete")}
                  >
                    <TrashIcon />
                    <span className="trash-label">{t("presets.delete")}</span>
                  </button>
                </div>
                <div className={"mp-acc" + (open ? " open" : "")}>
                  <div className="mp-acc-inner">{anchor === p.id && formNode}</div>
                </div>
              </div>
            );
          })}
        </div>

        <div className="mp-actions">
          <button className="btn-dl" aria-expanded={anchor === NEW} onClick={toggleNew}>{t("presets.new")}</button>
          {confirmId === "__restore__" ? (
            <button ref={armedRef} className="btn-dl danger" onClick={restoreDefaults} title={t("presets.restore.confirm.title")}>{t("presets.restore.confirm")}</button>
          ) : (
            <button className="btn-dl" onClick={() => setConfirmId("__restore__")} title={t("presets.restore.title")}>{t("presets.restore")}</button>
          )}
        </div>
        <div className={"mp-acc" + (anchor === NEW && !closing ? " open" : "")}>
          <div className="mp-acc-inner">{anchor === NEW && formNode}</div>
        </div>
      </div>

      {/* Exemplos few-shot */}
      <div className="field">
        <label>{t("presets.fewShot")}</label>
        <div className="seg" role="group" aria-label={t("presets.fewShot.aria")}>
          <button aria-pressed={settings.use_examples} className={settings.use_examples ? "active" : ""} onClick={() => update({ use_examples: true })}>{t("presets.fewShot.yes")}</button>
          <button aria-pressed={!settings.use_examples} className={!settings.use_examples ? "active" : ""} onClick={() => update({ use_examples: false })}>{t("presets.fewShot.no")}</button>
        </div>
        <p className="help">
          {settings.use_examples
            ? t("presets.fewShot.on.help")
            : t("presets.fewShot.off.help")}
        </p>
      </div>
    </section>
  );
}
