// PresetsTab.tsx — aba "Presets": preset padrão (blocos com um contorno que
// DESLIZA até o escolhido), a lista de presets (editar/duplicar/excluir, com o
// formulário abrindo como acordeon DENTRO do card) e a chave de few-shot. O
// rascunho (draft) e o erro são locais.
import { useEffect, useRef, useState } from "react";
import type { CSSProperties } from "react";
import { invoke } from "@tauri-apps/api/core";
import { motion } from "motion/react";
import type { Preset, PresetDraft, Settings } from "../types";
import { presetHue } from "../presetColor";
import { useT } from "../i18n/useT";
import { TrashIcon } from "../ui/icons";
import { spring } from "../motion";

type Props = {
  settings: Settings;
  update: (patch: Partial<Settings>) => Promise<void>;
  presets: Preset[];
  loadPresets: () => void;
};

// Âncora especial: form de "novo preset" abre embaixo da lista (não num preset).
const NEW = "__new__";
// Duração do fechamento do acordeon (casa com a transition do CSS).
const ANIM_MS = 300;

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
  // durante o `closing`, pra animar o colapso com o conteúdo visível. O nome já
  // abre com o foco, pronto pra digitar.
  const formNode = draft && (
    <div className="pl-form">
      <input
        className="input"
        autoFocus
        aria-label={t("presets.form.name.aria")}
        placeholder={t("presets.form.name.placeholder")}
        value={draft.label}
        onChange={(e) => setDraft({ ...draft, label: e.target.value })}
      />
      <textarea
        className="input"
        aria-label={t("presets.form.instruction.aria")}
        rows={3}
        placeholder={t("presets.form.instruction.placeholder")}
        value={draft.instruction}
        onChange={(e) => setDraft({ ...draft, instruction: e.target.value })}
      />
      <input
        className="input"
        aria-label={t("presets.form.exampleInput.aria")}
        placeholder={t("presets.form.exampleInput.placeholder")}
        value={draft.example_input}
        onChange={(e) => setDraft({ ...draft, example_input: e.target.value })}
      />
      <input
        className="input"
        aria-label={t("presets.form.exampleOutput.aria")}
        placeholder={t("presets.form.exampleOutput.placeholder")}
        value={draft.example_output}
        onChange={(e) => setDraft({ ...draft, example_output: e.target.value })}
      />
      <div className="pl-form-actions">
        <button className="btn-dl primary sm" onClick={savePreset}>{draft.id ? t("presets.save") : t("presets.create")}</button>
        <button className="btn-ghost" onClick={closeForm}>{t("presets.cancel")}</button>
        {presetErr && <span className="field-err">{presetErr}</span>}
      </div>
    </div>
  );

  return (
    <div className="page-stack">
      {/* Preset padrão: blocos; o contorno (layoutId) desliza até o escolhido. */}
      <section className="card" data-enter>
        <div className="card-head">
          <h2 className="card-title" id="default-preset-title">{t("presets.default")}</h2>
          <p className="help">{t("presets.default.help")}</p>
        </div>
        <div className="ptiles" role="group" aria-labelledby="default-preset-title">
          {presets.map((p) => {
            const on = settings.default_preset === p.id;
            return (
              <button
                key={p.id}
                className={"ptile" + (on ? " active" : "")}
                style={{ "--pc-h": presetHue(p.id) } as CSSProperties}
                aria-pressed={on}
                title={p.label}
                onClick={() => update({ default_preset: p.id })}
              >
                {on && <motion.span className="preset-ring" layoutId="preset-ring" transition={spring.snappy} aria-hidden="true" />}
                <span className="ptile-sq" aria-hidden="true"><span className="p-dot lg" /></span>
                <span className="ptile-label">{p.label}</span>
              </button>
            );
          })}
        </div>
      </section>

      {/* Presets (criar/editar/duplicar/excluir) — edição em acordeon dentro do card */}
      <section className="card" data-enter>
        <div className="card-head">
          <h2 className="card-title">{t("presets.list")}</h2>
          <p className="help">{t("presets.list.help")}</p>
        </div>
        <div className="plist">
          {presets.map((p) => {
            const open = anchor === p.id && !closing;
            const armed = confirmId === p.id;
            return (
              <div className={"pl-item" + (open ? " open" : "")} key={p.id}>
                <div className="pl-row">
                  <span className="p-dot" style={{ "--pc-h": presetHue(p.id) } as CSSProperties} aria-hidden="true" />
                  <span className="pl-name" title={p.label}>{p.label}</span>
                  {settings.default_preset === p.id && <span className="badge ink">{t("presets.badge.default")}</span>}
                  {p.edited && <span className="badge">{t("presets.badge.edited")}</span>}
                  <button className="btn-dl sm" aria-expanded={anchor === p.id} onClick={() => toggleEdit(p)}>{t("presets.edit")}</button>
                  <button className="btn-ghost" onClick={() => startDuplicatePreset(p)}>{t("presets.duplicate")}</button>
                  <button
                    ref={armed ? armedRef : undefined}
                    className={"trash-btn" + (armed ? " armed" : "")}
                    onClick={() => (armed ? removePreset(p) : setConfirmId(p.id))}
                    title={armed ? t("presets.delete.confirm") : t("presets.delete")}
                    aria-label={armed ? t("presets.delete.confirm") : t("presets.delete")}
                  >
                    <TrashIcon size={15} />
                    <span className="trash-label">{t("presets.delete")}</span>
                  </button>
                </div>
                <div className={"pl-acc" + (open ? " open" : "")}>
                  <div className="pl-acc-inner">{anchor === p.id && formNode}</div>
                </div>
              </div>
            );
          })}
        </div>

        <div className="pl-actions">
          <button className="btn-dl" aria-expanded={anchor === NEW} onClick={toggleNew}>{t("presets.new")}</button>
          {confirmId === "__restore__" ? (
            <button ref={armedRef} className="btn-dl danger" onClick={restoreDefaults} title={t("presets.restore.confirm.title")}>{t("presets.restore.confirm")}</button>
          ) : (
            <button className="btn-ghost" onClick={() => setConfirmId("__restore__")} title={t("presets.restore.title")}>{t("presets.restore")}</button>
          )}
        </div>
        <div className={"pl-acc" + (anchor === NEW && !closing ? " open" : "")}>
          <div className="pl-acc-inner">{anchor === NEW && <div className="pl-new">{formNode}</div>}</div>
        </div>
      </section>

      {/* Exemplos few-shot */}
      <section className="card" data-enter>
        <label className="switch-row">
          <span className="card-title">{t("presets.fewShot")}</span>
          <input type="checkbox" className="switch" checked={settings.use_examples} onChange={(e) => update({ use_examples: e.target.checked })} />
        </label>
        <p className="help">
          {settings.use_examples
            ? t("presets.fewShot.on.help")
            : t("presets.fewShot.off.help")}
        </p>
      </section>
    </div>
  );
}
