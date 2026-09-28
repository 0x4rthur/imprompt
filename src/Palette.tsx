// Palette.tsx — o popup de refino (Ctrl+C×2 no modo "Mostrar popup").
//
// Fluxo: texto capturado → preset (1–9/clique) → Imprompt (Enter) → resultado →
// Aplicar (Enter) / Copiar / Refazer (R). Esc fecha. Soft UI: fundo --canvas,
// texto num bloco afundado, presets num trilho com a peça clara DESLIZANTE
// (layoutId), resultado num card elevado que cresce até o texto, rodapé
// flutuante. O movimento (entrada, cascata, revelação, tremida no erro) é CSS;
// com movimento reduzido (ou em testes) as trocas são diretas.
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import type { CSSProperties } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { motion } from "motion/react";
import BrandMark from "./BrandMark";
import { initAutoScrollbars } from "./autoscroll";
import { blockContextMenu } from "./noContextMenu";
import type { Preset, Settings } from "./types";
import { presetHue } from "./presetColor";
import { setLocale, t } from "./i18n";
import { applyTheme } from "./theme";
import { useT } from "./i18n/useT";
import { reducedMotion, spring } from "./motion";
import { CheckIcon } from "./ui/icons";
import Swap from "./ui/Swap";

// Preset usado enquanto get_settings/list_presets não respondem (e se o
// default_preset vier vazio). Mantido como constante pra não vazar literal solto.
const FALLBACK_PRESET = "estruturar";
// Saída do "Aplicar": o popup encolhe e some antes de colar (casa com o CSS).
const LEAVE_MS = 190;

const wait = (ms: number) => new Promise((resolve) => window.setTimeout(resolve, ms));

export default function Palette() {
  // Assina o locale: re-renderiza o popup ao trocar de idioma (applySettings →
  // setLocale), pra os t() do JSX reavaliarem no novo idioma. Usamos o `t`
  // importado direto (lê o locale corrente na hora da chamada).
  useT();
  const appWindow = getCurrentWindow();
  const [presets, setPresets] = useState<Preset[]>([]);
  const [captured, setCaptured] = useState("");
  const [presetId, setPresetId] = useState(FALLBACK_PRESET);
  const [refined, setRefined] = useState<string | null>(null);
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(false);
  const [outNote, setOutNote] = useState("");
  const [badge, setBadge] = useState("");
  const [expanded, setExpanded] = useState(false); // citação expandida (texto longo)
  const [closing, setClosing] = useState(false);    // tocando a animação de saída (Esc)
  const [leaving, setLeaving] = useState(false);    // tocando a saída do "Aplicar"
  const [copied, setCopied] = useState(false);      // feedback "Copiado"
  const [animSeq, setAnimSeq] = useState(0);         // bump → replay da entrada quando a janela é reusada
  const firstCapture = useRef(true);                 // 1ª captura não re-anima (o mount já animou)
  const resultRef = useRef<HTMLDivElement>(null);
  const paletteRef = useRef<HTMLDivElement>(null);
  const copiedTimer = useRef(0);
  const lastHeight = useRef(0);
  // "Aplicar" em andamento (animação de saída → esconder → colar): um 2º Enter,
  // R ou clique nesse meio-tempo não pode colar de novo nem refazer escondido.
  const applying = useRef(false);

  // refs com os valores atuais (pro handler de teclado e o refine não pegarem
  // closures velhas).
  const presetIdRef = useRef(presetId); presetIdRef.current = presetId;
  const capturedRef = useRef(captured); capturedRef.current = captured;
  const loadingRef = useRef(loading); loadingRef.current = loading;
  const refinedRef = useRef(refined); refinedRef.current = refined;
  const errorRef = useRef(error); errorRef.current = error;
  const presetsRef = useRef(presets); presetsRef.current = presets;

  // Menu de contexto desativado + barra de rolagem custom — igual à janela principal.
  useEffect(() => {
    const offCtx = blockContextMenu();
    const offScroll = initAutoScrollbars();
    return () => { offCtx(); offScroll(); window.clearTimeout(copiedTimer.current); };
  }, []);

  // Lê do backend os campos que o popup EXIBE (modo de saída + modelo) e atualiza
  // os rótulos. Chamado no mount E a cada reuso da janela (evento captured-text):
  // a janela é reaproveitada e não remonta, então sem isto outNote/badge ficariam
  // presos no valor da 1ª abertura mesmo após o usuário mudar nas Preferências
  // (ver auditoria BUG-4). NÃO re-semeia presetId (preserva a escolha da sessão).
  const applySettings = useCallback(async () => {
    try {
      const s = await invoke<Pick<Settings, "output" | "api_model" | "locale" | "theme">>("get_settings");
      // Aplica o idioma ANTES dos rótulos: a janela do popup é reusada entre
      // gatilhos (não remonta), então sem reaplicar aqui o popup ficaria preso
      // no idioma da 1ª abertura mesmo após o usuário trocar nas Preferências.
      setLocale(s.locale);
      applyTheme(s.theme);
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
    invoke<string>("get_captured_text").then((text) => { if (text) setCaptured(text); }).catch(console.error);
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
      applying.current = false;
      setCaptured(e.payload);
      setRefined(null);
      setError(false);
      setLoading(false);
      setExpanded(false);
      setClosing(false);
      setLeaving(false);
      setCopied(false);
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
  // Com movimento reduzido não há saída animada: esconde na hora.
  const close = useCallback(() => {
    if (reducedMotion()) { appWindow.hide(); return; }
    setClosing(true);
    window.setTimeout(() => { appWindow.hide(); }, 130);
  }, []);

  const refine = useCallback(async () => {
    const text = capturedRef.current.trim();
    if (!text || loadingRef.current || applying.current) return;
    setLoading(true); setRefined(null); setError(false); setCopied(false);
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

  // O card de resultado CRESCE do tamanho do esqueleto até o do texto (em vez de
  // pular): mede antes/depois e anima a altura. Pulado com movimento reduzido.
  useLayoutEffect(() => {
    const el = resultRef.current;
    if (!el) { lastHeight.current = 0; return; }
    const next = el.offsetHeight;
    const prev = lastHeight.current;
    lastHeight.current = next;
    if (prev && prev !== next && !reducedMotion() && typeof el.animate === "function") {
      el.animate([{ height: prev + "px" }, { height: next + "px" }], { duration: 520, easing: "cubic-bezier(.16, 1, .3, 1)" });
    }
  }, [loading, refined, error]);

  // Preset escolhido pelo teclado (1–9) pode estar fora da vista numa janela
  // pequena ou com muitos presets: traz o chip ativo pra vista.
  useEffect(() => {
    paletteRef.current?.querySelector<HTMLElement>(".chip.active")?.scrollIntoView?.({ block: "nearest" });
  }, [presetId]);

  // rola o resultado pra vista quando ele aparece; o botão "Imprompt" (que tinha o
  // foco) sai do rodapé, então o foco volta pro diálogo (Enter passa a aplicar).
  useEffect(() => {
    if (refined == null) return;
    resultRef.current?.scrollIntoView?.({ behavior: "smooth", block: "nearest" });
    const active = document.activeElement;
    if (!active || active === document.body) paletteRef.current?.focus({ preventScroll: true });
  }, [refined]);

  const apply = useCallback(async () => {
    if (refined == null || error || applying.current) return;
    applying.current = true;
    // O popup encolhe e some antes de colar (o texto "vai" pro app de origem).
    if (!reducedMotion()) { setLeaving(true); await wait(LEAVE_MS); }
    await appWindow.hide();                 // devolve o foco pro app de origem antes de colar
    try {
      await invoke("deliver_result", { text: refined });
    } catch (e) {
      // A entrega falhou (clipboard/paste rejeitado pelo SO). O popup já sumiu —
      // reexibe pra o usuário não perder o resultado e poder copiar manualmente
      // (botão Copiar), em vez de tudo sumir silenciosamente (ver auditoria ROB-6).
      console.error(e);
      applying.current = false;
      setLeaving(false);
      await appWindow.show().catch(() => {});
    }
  }, [refined, error]);

  // O listener de teclado monta uma vez só; lê o apply mais recente por ref.
  const applyRef = useRef(apply);
  applyRef.current = apply;

  const copy = useCallback(async () => {
    if (refined == null) return;
    try {
      await navigator.clipboard.writeText(refined);
      setCopied(true);
      window.clearTimeout(copiedTimer.current);
      copiedTimer.current = window.setTimeout(() => setCopied(false), 1400);
    } catch (e) {
      console.error(e);
    }
  }, [refined]);

  // teclado: Esc fecha, Enter avança o fluxo (sem resultado: refina; com
  // resultado: aplica — Ctrl+C, Ctrl+C, Enter, Enter), R refaz, 1–9 escolhe preset
  // (atalho cobre só os 9 primeiros presets — uma tecla por dígito). Lê estado de
  // refs e callbacks estáveis, então o listener monta uma vez só ([] como dep).
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.ctrlKey || e.altKey || e.metaKey) return;
      // Já aplicando: o popup está saindo, nenhuma tecla (nem a ativação nativa
      // de um botão focado) muda o que vai ser colado.
      if (applying.current) { e.preventDefault(); return; }
      if (e.key === "Escape") { e.preventDefault(); close(); }
      else if (e.key === "Enter") {
        // Enter num botão de ação focado (Refazer/Copiar/Aplicar/Expandir) ativa o
        // próprio botão; em qualquer outro lugar, avança o fluxo.
        const el = document.activeElement;
        if (el instanceof HTMLElement && el.matches(".redo, .copy, .replace, .cap-toggle")) return;
        e.preventDefault();
        // Tecla segurada (auto-repeat) não aplica sozinha o resultado que acabou de chegar.
        if (e.repeat) return;
        // Erro não tem o que aplicar: Enter tenta de novo.
        if (refinedRef.current != null && !errorRef.current) applyRef.current();
        else refine();
      }
      else if ((e.key === "r" || e.key === "R") && refinedRef.current != null) {
        e.preventDefault(); refine();
      }
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

  const long = captured.length > 140; // citação longa: recolhida em 2 linhas, expansível
  const hasResult = refined != null;
  const showCard = loading || hasResult;

  return (
    <div className="overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) close(); }}>
      <div
        key={animSeq}
        className={"palette" + (closing ? " closing" : "") + (leaving ? " leaving" : "")}
        role="dialog"
        aria-modal="true"
        aria-label={t("popup.dialog.aria")}
        ref={paletteRef}
        tabIndex={-1}
      >
        <div className="palette-head" data-tauri-drag-region onDoubleClick={(e) => e.preventDefault()}>
          <span className="ph-mark" aria-hidden="true"><BrandMark size={16} /></span>
          <span className="ph-title">Imprompt</span>
          <span className="ph-esc"><kbd>Esc</kbd></span>
        </div>

        {/* Corpo rolável: texto capturado → presets → resultado. */}
        <div className="palette-body">
          <div className="cap-head">
            <span className="cap-label">{t("popup.head.sub")}</span>
            {long && (
              <button type="button" className="cap-toggle" aria-expanded={expanded} onClick={() => setExpanded((v) => !v)}>
                {expanded ? t("popup.capture.collapse") : t("popup.capture.expand")}
              </button>
            )}
          </div>
          <div
            className={"capture" + (expanded ? " exp" : "") + (captured ? "" : " empty") + (long ? " long" : "")}
            onClick={() => { if (long) setExpanded((v) => !v); }}
          >
            <span className="capture-t">{captured || t("popup.capture.empty")}</span>
          </div>

          <div className="presets" role="group" aria-label={t("popup.presets.label")}>
            {presets.map((p, i) => {
              const on = presetId === p.id;
              return (
                <button
                  key={p.id}
                  className={"chip" + (on ? " active" : "")}
                  style={{ "--pc-h": presetHue(p.id), "--i": i } as CSSProperties}
                  aria-pressed={on}
                  onClick={() => setPresetId(p.id)}
                >
                  {on && <motion.span className="chip-pill" layoutId="chip-pill" transition={spring.snappy} aria-hidden="true" />}
                  {i < 9 && <span className="num" aria-hidden="true">{i + 1}</span>}
                  <span className="p-dot" aria-hidden="true" />
                  <span className="chip-label">{p.label}</span>
                </button>
              );
            })}
          </div>

          {/* Região viva persistente: o leitor de tela anuncia o resultado/erro. */}
          <div className="result-live" aria-live="polite">
            {showCard && (
              <div className={"result" + (error ? " err" : "")} ref={resultRef}>
                {loading ? (
                  <div className="result-skel" aria-hidden="true"><span /><span /><span /></div>
                ) : (
                  <>
                    <div className="result-head">
                      <span className="result-title">{error ? t("popup.result.error") : t("popup.result.title")}</span>
                      {!error && badge && <span className="result-badge">{badge}</span>}
                    </div>
                    <div className={"result-body" + (error ? " err" : "")} {...(error ? { role: "alert" } : {})}>{refined}</div>
                  </>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Rodapé flutuante: destino da saída + ações. Antes do resultado,
            "Imprompt"; depois, Refazer (R) / Copiar / Aplicar (Enter). Com erro,
            Enter refaz. As ações entram em cascata a cada troca. */}
        <div className="palette-foot">
          <span className="loc-note"><i aria-hidden="true" />{captured.trim() ? outNote : t("popup.note.selectAgain")}</span>
          <div className="foot-actions" key={hasResult ? (error ? "err" : "res") : "idle"}>
            {hasResult ? (
              <>
                <button className={"redo" + (error ? " lead" : "")} title={t("popup.action.redo.title")} onClick={refine}>
                  {t("popup.action.redo")}<kbd className="enter">{error ? "Enter" : "R"}</kbd>
                </button>
                {!error && (
                  <button className="copy swap-btn" title={t("popup.action.copy.title")} onClick={copy}>
                    <Swap id={copied ? "done" : "copy"} className="swap">
                      {copied && <CheckIcon size={13} />}
                      {copied ? t("popup.action.copied") : t("popup.action.copy")}
                    </Swap>
                  </button>
                )}
                {!error && (
                  <button className="replace" title={outNote} onClick={apply}>
                    {t("popup.action.apply")}<kbd className="enter">Enter</kbd>
                  </button>
                )}
              </>
            ) : (
              <button className="refine" disabled={loading || !captured.trim()} aria-busy={loading} onClick={refine}>
                <span className="refine-label">{loading ? "Imprompting" : "Imprompt"}</span>
                {loading ? <span className="dots" aria-hidden="true"><i /><i /><i /></span> : <kbd className="enter">Enter</kbd>}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
