import { useEffect, useState, useRef, useCallback } from "react";
import ReactDOM from "react-dom/client";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import BrandMark from "./BrandMark";
import { initAutoScrollbars } from "./autoscroll";
import { blockContextMenu } from "./noContextMenu";
import type { CSSProperties } from "react";
import type { Preset, Settings } from "./types";
import { presetHue } from "./presetColor";
import { setLocale, t } from "./i18n";
import { useT } from "./i18n/useT";
import "./fonts";
import "./styles.css";

// Preset usado enquanto get_settings/list_presets não respondem (e se o
// default_preset vier vazio). Mantido como constante pra não vazar literal solto.
const FALLBACK_PRESET = "estruturar";

const appWindow = getCurrentWindow();

function Palette() {
  // Assina o locale: re-renderiza o popup ao trocar de idioma (applySettings →
  // setLocale), pra os t() do JSX reavaliarem no novo idioma. Usamos o `t`
  // importado direto (lê o locale corrente na hora da chamada).
  useT();
  const [presets, setPresets] = useState<Preset[]>([]);
  const [captured, setCaptured] = useState("");
  const [presetId, setPresetId] = useState(FALLBACK_PRESET);
  const [refined, setRefined] = useState<string | null>(null);
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(false);
  const [outNote, setOutNote] = useState("");
  const [badge, setBadge] = useState("");
  const [expanded, setExpanded] = useState(false); // citação expandida (texto longo)
  const [closing, setClosing] = useState(false);    // tocando a animação de saída
  const [animSeq, setAnimSeq] = useState(0);         // bump → replay da entrada quando a janela é reusada
  const firstCapture = useRef(true);                 // 1ª captura não re-anima (o mount já animou)
  const resultRef = useRef<HTMLDivElement>(null);
  const paletteRef = useRef<HTMLDivElement>(null);

  // refs com os valores atuais (pro handler de teclado e o refine não pegarem
  // closures velhas).
  const presetIdRef = useRef(presetId); presetIdRef.current = presetId;
  const capturedRef = useRef(captured); capturedRef.current = captured;
  const loadingRef = useRef(loading); loadingRef.current = loading;
  const presetsRef = useRef(presets); presetsRef.current = presets;

  // Menu de contexto desativado + barra de rolagem custom — igual à janela principal.
  useEffect(() => {
    const offCtx = blockContextMenu();
    const offScroll = initAutoScrollbars();
    return () => { offCtx(); offScroll(); };
  }, []);

  // Lê do backend os campos que o popup EXIBE (modo de saída + modelo) e atualiza
  // os rótulos. Chamado no mount E a cada reuso da janela (evento captured-text):
  // a janela é reaproveitada e não remonta, então sem isto outNote/badge ficariam
  // presos no valor da 1ª abertura mesmo após o usuário mudar nas Preferências
  // (ver auditoria BUG-4). NÃO re-semeia presetId (preserva a escolha da sessão).
  const applySettings = useCallback(async () => {
    try {
      const s = await invoke<Pick<Settings, "output" | "api_model" | "locale">>("get_settings");
      // Aplica o idioma ANTES dos rótulos: a janela do popup é reusada entre
      // gatilhos (não remonta), então sem reaplicar aqui o popup ficaria preso
      // no idioma da 1ª abertura mesmo após o usuário trocar nas Preferências.
      setLocale(s.locale);
      setOutNote(t(s.output === "replace" ? "popup.output.replace" : "popup.output.clipboard"));
      setBadge(t("popup.badge.api", { model: s.api_model || t("popup.badge.noModel") }));
    } catch (e) {
      console.error(e);
    }
  }, []);

  // Joga o foco pra dentro do diálogo (botão Refinar, ou a própria palette).
  const focusPalette = useCallback(() => {
    const pal = paletteRef.current;
    if (!pal) return;
    const refineBtn = pal.querySelector<HTMLButtonElement>("button.refine");
    (refineBtn && !refineBtn.disabled ? refineBtn : pal).focus();
  }, []);

  useEffect(() => {
    invoke<Preset[]>("list_presets")
      .then((ps) => {
        setPresets(ps);
        // Se o preset atual (seedado do default_preset, que pode estar obsoleto)
        // não existe na lista, cai no primeiro disponível.
        if (ps.length && !ps.some((p) => p.id === presetIdRef.current)) {
          setPresetId(ps[0].id);
        }
      })
      .catch(console.error);
    // PUXA o texto capturado: cobre o 1º open, quando o listener abaixo ainda
    // não está montado pra receber o evento.
    invoke<string>("get_captured_text").then((t) => { if (t) setCaptured(t); }).catch(console.error);
    // Semeia o preset escolhido nas Preferências (default_preset). Se a lista já
    // chegou e o default não está nela (obsoleto), ignora — assim o fallback pra
    // presets[0] vale independente da ordem de resolução.
    invoke<Pick<Settings, "default_preset">>("get_settings")
      .then((s) => {
        if (s.default_preset) {
          const list = presetsRef.current;
          if (!list.length || list.some((p) => p.id === s.default_preset)) {
            setPresetId(s.default_preset);
          }
        }
      })
      .catch(console.error);
    applySettings(); // rótulos de saída/modelo (fonte única, reusada no listener)

    // Janela reusada num novo gatilho → texto novo: reseta o estado E refaz os
    // rótulos (settings podem ter mudado — BUG-4) e o foco do diálogo (ROB-5).
    const un = listen<string>("captured-text", (e) => {
      setCaptured(e.payload);
      setRefined(null);
      setError(false);
      setLoading(false);
      setExpanded(false);
      setClosing(false);
      // Replay da animação de entrada a cada reuso (a 1ª captura não, pois o mount já animou).
      if (firstCapture.current) firstCapture.current = false;
      else setAnimSeq((s) => s + 1);
      applySettings();
      requestAnimationFrame(focusPalette);
    });
    return () => { un.then((f) => f()); };
  }, []);

  // Fecha com animação de saída: marca closing (toca o pop-out) e esconde após ela.
  // O reset de closing fica no listener captured-text (no reuso), evitando flash.
  const close = useCallback(() => {
    setClosing(true);
    window.setTimeout(() => { appWindow.hide(); }, 130);
  }, []);

  // Encolhe a janela pra ABRAÇAR o card — sem área transparente sobrando atrás
  // (o "fundo/vidro" que aparecia). Re-mede quando o card muda de tamanho
  // (resultado, citação expandida) e a cada reuso (animSeq). MARGIN = folga pro shadow.
  const refine = useCallback(async () => {
    const text = capturedRef.current.trim();
    if (!text || loadingRef.current) return;
    setLoading(true); setRefined(null); setError(false);
    try {
      const out = await invoke<string>("refine_text", { text, presetId: presetIdRef.current });
      setError(false);
      setRefined(out);
    } catch (e) {
      console.error(e);
      setError(true);
      // Mostra a mensagem REAL do backend (ex.: "Chave de API inválida ou sem
      // permissão.", "Limite de uso atingido. Tente em instantes.", "Sem resposta
      // da API (rede?). Verifique a conexão."). Cai num texto genérico só se o
      // erro não vier como string.
      setRefined(
        typeof e === "string" && e.trim()
          ? e
          : t("popup.error.fallback")
      );
    } finally {
      setLoading(false);
    }
  }, []);

  // rola o resultado pra vista quando ele aparece
  useEffect(() => {
    if (refined != null) resultRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [refined]);

  const apply = useCallback(async () => {
    if (refined == null || error) return;
    await appWindow.hide();                 // devolve o foco pro app de origem antes de colar
    try {
      await invoke("deliver_result", { text: refined });
    } catch (e) {
      // A entrega falhou (clipboard/paste rejeitado pelo SO). O popup já sumiu —
      // reexibe pra o usuário não perder o resultado e poder copiar manualmente
      // (botão Copiar), em vez de tudo sumir silenciosamente (ver auditoria ROB-6).
      console.error(e);
      await appWindow.show().catch(() => {});
    }
  }, [refined, error]);

  const copy = useCallback(async () => {
    if (refined == null) return;
    try { await navigator.clipboard.writeText(refined); } catch (e) { console.error(e); }
  }, [refined]);

  // teclado: Esc fecha, Enter refina, 1–9 escolhe preset (atalho cobre só os 9
  // primeiros presets — uma tecla por dígito). Lê presets/refine/close de refs
  // e callbacks estáveis, então o listener monta uma vez só ([] como dep).
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") { e.preventDefault(); close(); }
      else if (e.key === "Enter") { e.preventDefault(); refine(); }
      else if (/^[1-9]$/.test(e.key)) {
        const p = presetsRef.current[parseInt(e.key, 10) - 1];
        if (p) setPresetId(p.id);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // a11y: ao abrir, joga o foco pra dentro do diálogo (botão Refinar, ou a própria
  // palette) — leitores de tela passam a ler o conteúdo do popup. No reuso da
  // janela, o listener captured-text também rechama focusPalette (ver ROB-5).
  useEffect(() => {
    focusPalette();
  }, [focusPalette]);

  // a11y: focus trap — Tab/Shift+Tab ciclam só entre os focáveis da palette,
  // dando a volta nas pontas (modal não vaza foco pro resto da página).
  useEffect(() => {
    function onTrap(e: KeyboardEvent) {
      if (e.key !== "Tab") return;
      const pal = paletteRef.current;
      if (!pal) return;
      const focusables = Array.from(
        pal.querySelectorAll<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        )
      ).filter((el) => !el.hasAttribute("disabled") && el.offsetParent !== null);
      if (!focusables.length) { e.preventDefault(); return; }
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      const active = document.activeElement as HTMLElement | null;
      if (e.shiftKey) {
        if (active === first || !pal.contains(active)) { e.preventDefault(); last.focus(); }
      } else {
        if (active === last || !pal.contains(active)) { e.preventDefault(); first.focus(); }
      }
    }
    window.addEventListener("keydown", onTrap);
    return () => window.removeEventListener("keydown", onTrap);
  }, []);

  return (
    <div className="overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) close(); }}>
      <div
        key={animSeq}
        className={"palette" + (closing ? " closing" : "")}
        role="dialog"
        aria-modal="true"
        aria-label={t("popup.dialog.aria")}
        ref={paletteRef}
        tabIndex={-1}
      >
        <div className="palette-head" data-tauri-drag-region onDoubleClick={(e) => e.preventDefault()}>
          <span className="ph-mark" aria-hidden="true"><BrandMark size={19} /></span>
          <span className="ph-title">Imprompt</span>
          <span className="ph-esc"><kbd>Esc</kbd></span>
        </div>

        <div
          className={"capture" + (expanded ? " exp" : "")}
          onClick={() => { if (captured.length > 180) setExpanded((v) => !v); }}
          title={captured.length > 180 ? (expanded ? t("popup.capture.collapse") : t("popup.capture.expand")) : undefined}
        >
          {captured || t("popup.capture.empty")}
        </div>

        <div className="presets" role="group" aria-label={t("popup.presets.label")}>
          {presets.map((p, i) => (
            <button
              key={p.id}
              className={"chip" + (presetId === p.id ? " active" : "")}
              style={{ "--pc-h": presetHue(p.id) } as CSSProperties}
              aria-pressed={presetId === p.id}
              onClick={() => setPresetId(p.id)}
            >
              <span className="num">{i + 1}</span>
              {p.label}
            </button>
          ))}
        </div>

        <div className="actions">
          <button className="refine" disabled={loading || !captured.trim()} aria-busy={loading} onClick={refine}>
            <span className="refine-label">{loading ? "Imprompting…" : "Imprompt"}</span>
            <kbd className="enter">Enter</kbd>
          </button>
          <span className="loc-note">{captured.trim() ? outNote : t("popup.note.selectAgain")}</span>
        </div>

        {refined != null && (
          <div className="result" ref={resultRef} aria-live="polite">
            <div className="result-head">
              <span className="result-title">{error ? t("popup.result.error") : t("popup.result.title")}</span>
              {!error && badge && <span className="result-badge">{badge}</span>}
            </div>
            <div className={"result-body" + (error ? " err" : "")} {...(error ? { role: "alert" } : {})}>{refined}</div>
            <div className="result-actions">
              {!error && <button className="replace" title={outNote} onClick={apply}>{t("popup.action.apply")}</button>}
              {!error && <button className="copy" title={t("popup.action.copy.title")} onClick={copy}>{t("popup.action.copy")}</button>}
              <button className="redo" title={t("popup.action.redo.title")} onClick={refine}>{t("popup.action.redo")}</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("root")!).render(<Palette />);
