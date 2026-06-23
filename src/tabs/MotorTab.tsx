// MotorTab.tsx — aba "API": provedor (auto-detectado pela chave), modelo, chave,
// teste de conexão e uso/custo do mês. Estado da API (api*) é local desta aba.
import { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { ApiKeyStatus, Settings } from "../types";
import { ApiProviderIcon } from "../ApiProviderIcon";

// Provedores conhecidos (formato OpenAI). Escolher um (ou ter a chave detectada)
// pré-preenche Base URL + modelo e oferece os modelos recomendados na lista.
// "Personalizado" libera a Base URL pra um endpoint próprio. A chave é UMA só.
type Provider = { id: string; label: string; base: string; model: string; host: string; models: string[] };
const PROVIDERS: Provider[] = [
  { id: "openai", label: "OpenAI", base: "https://api.openai.com/v1", model: "gpt-4o-mini", host: "api.openai.com", models: ["gpt-4o-mini", "gpt-4o", "gpt-4.1-mini", "o4-mini"] },
  { id: "anthropic", label: "Anthropic", base: "https://api.anthropic.com/v1", model: "claude-haiku-4-5", host: "api.anthropic.com", models: ["claude-haiku-4-5", "claude-sonnet-4-6", "claude-opus-4-8"] },
  { id: "openrouter", label: "OpenRouter", base: "https://openrouter.ai/api/v1", model: "openai/gpt-4o-mini", host: "openrouter.ai", models: ["openai/gpt-4o-mini", "anthropic/claude-sonnet-4.6", "google/gemini-2.5-flash", "deepseek/deepseek-chat"] },
  { id: "deepseek", label: "DeepSeek", base: "https://api.deepseek.com/v1", model: "deepseek-chat", host: "api.deepseek.com", models: ["deepseek-chat", "deepseek-reasoner"] },
  { id: "gemini", label: "Gemini", base: "https://generativelanguage.googleapis.com/v1beta/openai", model: "gemini-2.5-flash", host: "generativelanguage.googleapis.com", models: ["gemini-2.5-flash", "gemini-2.5-pro", "gemini-2.5-flash-lite"] },
  { id: "xai", label: "xAI", base: "https://api.x.ai/v1", model: "grok-4", host: "api.x.ai", models: ["grok-4", "grok-3", "grok-code-fast-1"] },
];
const CUSTOM = "custom";
const MODEL_CUSTOM = "__custom__";

// Mini-benchmark por modelo. Eixos 1-3; o CUSTO já vem normalizado "barato = 3"
// (mais pontos = melhor em todos). Scores relativos/qualitativos (curadoria, não
// medição padronizada); `conf` = confiança do dado (metadado interno, não exibido).
type ModelBench = { q: number; s: number; c: number; conf: "high" | "medium" | "low" };
const BENCH: Record<string, ModelBench> = {
  "gpt-4o-mini": { q: 2, s: 3, c: 3, conf: "high" },
  "gpt-4o": { q: 3, s: 2, c: 2, conf: "high" },
  "gpt-4.1-mini": { q: 2, s: 3, c: 3, conf: "medium" },
  "o4-mini": { q: 3, s: 1, c: 2, conf: "medium" },
  "claude-haiku-4-5": { q: 2, s: 3, c: 2, conf: "medium" },
  "claude-sonnet-4-6": { q: 3, s: 2, c: 1, conf: "medium" },
  "claude-opus-4-8": { q: 3, s: 1, c: 1, conf: "medium" },
  "deepseek-chat": { q: 2, s: 2, c: 3, conf: "medium" },
  "deepseek-reasoner": { q: 3, s: 1, c: 3, conf: "medium" },
  "gemini-2.5-flash": { q: 2, s: 3, c: 3, conf: "low" },
  "gemini-2.5-pro": { q: 3, s: 2, c: 2, conf: "low" },
  "gemini-2.5-flash-lite": { q: 1, s: 3, c: 3, conf: "low" },
  "grok-4": { q: 3, s: 2, c: 1, conf: "low" },
  "grok-3": { q: 2, s: 2, c: 2, conf: "low" },
  "grok-code-fast-1": { q: 2, s: 3, c: 2, conf: "low" },
  // OpenRouter (modelos namespaced) — espelham o modelo de origem.
  "openai/gpt-4o-mini": { q: 2, s: 3, c: 3, conf: "medium" },
  "anthropic/claude-sonnet-4.6": { q: 3, s: 2, c: 1, conf: "medium" },
  "google/gemini-2.5-flash": { q: 2, s: 3, c: 3, conf: "low" },
  "deepseek/deepseek-chat": { q: 2, s: 2, c: 3, conf: "medium" },
};
const QS_CAP: Record<number, string> = { 1: "baixo", 2: "médio", 3: "alto" };
const COST_CAP: Record<number, string> = { 1: "caro", 2: "médio", 3: "barato" };

// Host de uma Base URL (ex.: "https://api.openai.com/v1" → "api.openai.com").
function hostOf(url: string): string {
  try {
    return new URL(url).host || url;
  } catch {
    return url || "(provedor inválido)";
  }
}

// ── Ícones de linha, monocromáticos (herdam a cor via currentColor) ──
function LockIcon() {
  return (
    <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="5" y="11" width="14" height="10" rx="2" />
      <path d="M8 11V8a4 4 0 0 1 8 0v3" />
    </svg>
  );
}
function ArrowOutIcon() {
  return (
    <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M7 17 17 7" />
      <path d="M9 7h8v8" />
    </svg>
  );
}
function ChevronIcon() {
  return (
    <svg className="dd-chev" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M6 9l6 6 6-6" />
    </svg>
  );
}
// Glifo do provedor "Personalizado" (código { } ); os colchetes abrem no hover.
function CustomGlyph() {
  return (
    <svg className="ico ico-code" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path className="br-r" d="m16 18 6-6-6-6" />
      <path className="br-l" d="m8 6-6 6 6 6" />
    </svg>
  );
}
// Plug do estado "Conectado" — anima um "pop" ao aparecer (CSS, sem libs).
function PlugIcon() {
  return (
    <svg className="plug-ico" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M9 3v5M15 3v5" />
      <path d="M6 8h12v3a6 6 0 0 1-12 0z" />
      <path d="M12 17v4" />
    </svg>
  );
}
// Três quadradinhos: `fill` = quantos preenchidos; `level` (1-3) = a COR (1 vermelho,
// 2 amarelo, 3 verde). Separados porque no eixo CUSTO a quantidade (quão caro) é o
// inverso da cor (barato=verde): barato → 1 quadrado verde; caro → 3 vermelhos.
function Dots({ fill, level }: { fill: number; level: number }) {
  return (
    <span className={"bench-dots lvl-" + level} aria-hidden="true">
      {[1, 2, 3].map((i) => <span key={i} className={"bench-dot" + (i <= fill ? " on" : "")} />)}
    </span>
  );
}
// Mini-benchmark do modelo (qualidade/velocidade/custo). Sem dado → não renderiza.
// Qualidade/velocidade: mais quadrados = melhor (cor segue o valor). Custo: mais
// quadrados = mais caro (cor é o inverso — c é "barato=3", então level=c, fill=4-c).
function BenchView({ model }: { model: string }) {
  const b = BENCH[model];
  if (!b) return null;
  return (
    <div className="bench">
      <div className="bench-axis" aria-label={`qualidade: ${b.q} de 3`}><span>qualidade · {QS_CAP[b.q]}</span><Dots fill={b.q} level={b.q} /></div>
      <div className="bench-axis" aria-label={`velocidade: ${b.s} de 3`}><span>velocidade · {QS_CAP[b.s]}</span><Dots fill={b.s} level={b.s} /></div>
      <div className="bench-axis" aria-label={`custo: ${COST_CAP[b.c]}`}><span>custo · {COST_CAP[b.c]}</span><Dots fill={4 - b.c} level={b.c} /></div>
    </div>
  );
}

// Dropdown estilizado (não usa <select> nativo, que não casa com o tema mono/cream
// e renderiza o popup pelo SO). Acessível: aria-haspopup/expanded, role listbox/option,
// teclado (setas/Enter/Esc) e fecha ao clicar fora.
type Opt = { value: string; label: string };
function Dropdown({ value, options, onSelect, ariaLabel }: { value: string; options: Opt[]; onSelect: (v: string) => void; ariaLabel: string }) {
  const [open, setOpen] = useState(false);
  const [focusIdx, setFocusIdx] = useState(-1);
  const ref = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);

  // Fecha o popup; restaura o foco no botão de gatilho (padrão WAI-ARIA listbox),
  // exceto quando o usuário fecha clicando fora (aí o foco vai pra onde ele clicou).
  function close(restoreFocus: boolean) {
    setOpen(false);
    if (restoreFocus) requestAnimationFrame(() => btnRef.current?.focus());
  }

  // Fecha ao clicar fora.
  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  // Ao abrir, posiciona o foco no item selecionado.
  useEffect(() => {
    if (open) {
      const i = options.findIndex((o) => o.value === value);
      setFocusIdx(i >= 0 ? i : 0);
    }
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  // Move o foco real pro item ativo (navegação por teclado).
  useEffect(() => {
    if (open && focusIdx >= 0) {
      const el = listRef.current?.children[focusIdx] as HTMLElement | undefined;
      el?.focus();
    }
  }, [open, focusIdx]);

  const current = options.find((o) => o.value === value);
  return (
    <div className="dd" ref={ref}>
      <button
        type="button"
        ref={btnRef}
        className={"dd-btn" + (open ? " open" : "")}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={ariaLabel}
        onClick={() => setOpen((o) => !o)}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown" || e.key === "Enter" || e.key === " ") { e.preventDefault(); setOpen(true); }
        }}
      >
        <span className="dd-val">{current?.label ?? value}</span>
        <ChevronIcon />
      </button>
      {open && (
        <ul
          className="dd-list"
          role="listbox"
          aria-label={ariaLabel}
          ref={listRef}
          onKeyDown={(e) => {
            if (e.key === "Escape") { e.preventDefault(); close(true); }
            else if (e.key === "Tab") { close(false); } // fecha e deixa o foco seguir o Tab naturalmente
            else if (e.key === "ArrowDown") { e.preventDefault(); setFocusIdx((i) => Math.min(options.length - 1, i + 1)); }
            else if (e.key === "ArrowUp") { e.preventDefault(); setFocusIdx((i) => Math.max(0, i - 1)); }
            else if (e.key === "Enter" || e.key === " ") { e.preventDefault(); const o = options[focusIdx]; if (o) { onSelect(o.value); close(true); } }
          }}
        >
          {options.map((o) => (
            <li
              key={o.value}
              role="option"
              tabIndex={-1}
              aria-selected={o.value === value}
              className={"dd-opt" + (o.value === value ? " sel" : "")}
              onClick={() => { onSelect(o.value); close(true); }}
            >
              {o.label}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

type Props = {
  settings: Settings;
  update: (patch: Partial<Settings>) => Promise<void>;
};

export default function MotorTab({ settings, update }: Props) {
  // Config da API em estado local (evita gravar settings.json a cada tecla); só
  // persiste no "Aplicar e testar".
  // Inicializa já das settings (lazy) — evita um frame com apiBase vazio que
  // ativaria "Personalizado" por engano (flash na entrada da aba). settings é
  // garantido não-nulo aqui (App mostra "Carregando…" enquanto não chega).
  const [apiBase, setApiBase] = useState(() => settings.api_base_url || "https://api.openai.com/v1");
  const [apiModel, setApiModel] = useState(() => settings.api_model || "gpt-4o-mini");
  const [apiKey, setApiKey] = useState("");
  const [apiBusy, setApiBusy] = useState(false);
  // Resultado do teste: null (nada ainda), {ok:true} (conectado) ou {ok:false,msg}.
  const [result, setResult] = useState<{ ok: boolean; msg: string } | null>(null);
  // Estado da chave no cofre: existe? e a forma mascarada pra exibir.
  const [keySaved, setKeySaved] = useState(false);
  const [keyMasked, setKeyMasked] = useState("");
  // "Endpoint próprio" forçado pelo usuário (libera a Base URL mesmo que o host
  // ainda case com um provedor conhecido).
  const [customMode, setCustomMode] = useState(false);
  // Modelo em modo "digitar id próprio" (em vez de escolher da lista).
  const [modelCustom, setModelCustom] = useState(false);
  const baseRef = useRef<HTMLInputElement>(null);
  const modelRef = useRef<HTMLInputElement>(null);

  // Lê do backend se há uma chave salva no cofre (e a versão mascarada).
  function refreshKeyStatus() {
    return invoke<ApiKeyStatus>("get_api_key_status")
      .then((s) => { setKeySaved(s.saved); setKeyMasked(s.masked); })
      .catch(console.error);
  }

  useEffect(() => {
    refreshKeyStatus();
  }, []);

  // Re-sincroniza os campos quando as settings mudam POR FORA (ex.: "Aplicar"
  // reverteu por falha de save, ou outra origem alterou a config). NÃO recria o
  // "flash" do Personalizado: o estado já nasce certo do init lazy, então na 1ª
  // montagem este efeito roda com os mesmos valores → no-op. E durante a edição
  // local (digitar/escolher pílula) settings não muda, então não atropela o usuário.
  useEffect(() => {
    setApiBase(settings.api_base_url || "https://api.openai.com/v1");
    setApiModel(settings.api_model || "gpt-4o-mini");
  }, [settings.api_base_url, settings.api_model]);

  // Provedor ativo: "custom" se o usuário forçou OU o host não casa com nenhum
  // conhecido; senão, o provedor cujo host bate com a Base URL.
  const matched = PROVIDERS.find((p) => hostOf(apiBase) === p.host);
  const activeProvider = customMode || !matched ? CUSTOM : matched.id;
  const isCustom = activeProvider === CUSTOM;
  const recModels = PROVIDERS.find((p) => p.id === activeProvider)?.models ?? [];
  const modelInList = recModels.includes(apiModel);
  // Mostra o input de id de modelo: provedor custom (sem lista), modo "Personalizado…",
  // ou modelo salvo que não está entre os recomendados.
  const showModelInput = isCustom || modelCustom || (recModels.length > 0 && !modelInList);

  const modelOptions: Opt[] = [
    ...recModels.map((m) => ({ value: m, label: m })),
    { value: MODEL_CUSTOM, label: "Personalizado…" },
  ];
  const modelDropValue = modelCustom || !modelInList ? MODEL_CUSTOM : apiModel;

  // Seleciona um provedor conhecido: pré-preenche tudo e sai dos modos custom.
  function selectProvider(p: Provider) {
    setCustomMode(false);
    setModelCustom(false);
    setApiBase(p.base);
    setApiModel(p.model);
    setResult(null);
  }

  function onProviderSelect(v: string) {
    if (v === CUSTOM) {
      setCustomMode(true);
      setResult(null);
      requestAnimationFrame(() => baseRef.current?.focus()); // foca a Base URL pra digitar
    } else {
      const p = PROVIDERS.find((x) => x.id === v);
      if (p) selectProvider(p);
    }
  }

  function onModelSelect(v: string) {
    if (v === MODEL_CUSTOM) {
      setModelCustom(true);
      setResult(null);
      requestAnimationFrame(() => modelRef.current?.focus());
    } else {
      setModelCustom(false);
      setApiModel(v);
      setResult(null);
    }
  }

  // AUTO-SELEÇÃO pela chave: detecta o provedor pelo PREFIXO (colado/digitado) e
  // troca sozinho. Ordem do mais específico ao genérico (sk-ant-/sk-or- também
  // começam com "sk", então o "sk-" puro casa por último). Respeita "Personalizado"
  // e não tira o usuário do DeepSeek com "sk-" (ambíguo com OpenAI).
  function maybeAutoSelectProvider(key: string) {
    if (customMode) return; // escolha explícita de endpoint próprio tem prioridade
    const k = key.trim();
    let detected: string | null = null;
    if (k.startsWith("sk-or-")) detected = "openrouter";
    else if (k.startsWith("sk-ant-")) detected = "anthropic";
    else if (k.startsWith("xai-")) detected = "xai";
    else if (k.startsWith("AIza")) detected = "gemini";
    else if (k.startsWith("sk-")) detected = "openai";
    if (!detected || detected === activeProvider) return;
    if (detected === "openai" && activeProvider === "deepseek") return; // sk- ambíguo
    const prov = PROVIDERS.find((p) => p.id === detected);
    if (prov) selectProvider(prov);
  }

  // Salva a config (settings), guarda a chave no COFRE e testa a conexão de verdade.
  async function applyApi() {
    setApiBusy(true);
    setResult(null);
    try {
      await update({ api_base_url: apiBase, api_model: apiModel });
      // Só grava a chave se o usuário digitou uma (trimada) — nunca grava vazio/espaços.
      if (apiKey.trim()) {
        await invoke("set_api_key", { key: apiKey.trim() });
      }
      await invoke<string>("test_api_connection", { baseUrl: apiBase, model: apiModel });
      setResult({ ok: true, msg: "" });
      await refreshKeyStatus();
      setApiKey(""); // não mantém a chave digitada na memória da UI
    } catch (e) {
      setResult({
        ok: false,
        msg: typeof e === "string" && e.trim() ? e : "Não consegui conectar. Confira a Base URL, o modelo e a chave.",
      });
    } finally {
      setApiBusy(false);
    }
  }

  return (
    <section className="card">
      {/* Conexão (provedor + endpoint + modelo + chave) */}
      <div className="field">
        <label>Conexão</label>

        <div className="api-cfg">
          <div>
            <span className="api-label">Provedor</span>
            <div className="prov-grid" role="group" aria-label="Provedor">
              {PROVIDERS.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  aria-pressed={activeProvider === p.id}
                  className={"prov-pill" + (activeProvider === p.id ? " on" : "")}
                  onClick={() => onProviderSelect(p.id)}
                >
                  <ApiProviderIcon host={p.host} size={17} />
                  <span>{p.label}</span>
                </button>
              ))}
              <button
                type="button"
                aria-pressed={isCustom}
                className={"prov-pill" + (isCustom ? " on" : "")}
                onClick={() => onProviderSelect(CUSTOM)}
                title="Endpoint próprio (formato OpenAI)"
              >
                <CustomGlyph />
                <span>Personalizado</span>
              </button>
            </div>
          </div>

          <div>
            <label className="api-label" htmlFor="api-base">Base URL</label>
            <input
              id="api-base"
              ref={baseRef}
              value={apiBase}
              readOnly={!isCustom}
              onChange={(e) => { setApiBase(e.target.value); setResult(null); }}
              placeholder="https://api.openai.com/v1"
              spellCheck={false}
              autoComplete="off"
            />
            {!isCustom && <span className="api-hint">Definido pelo provedor — escolha "Personalizado" para editar.</span>}
          </div>

          <div>
            <span className="api-label">Modelo</span>
            {recModels.length > 0 && (
              <Dropdown ariaLabel="Modelo" value={modelDropValue} options={modelOptions} onSelect={onModelSelect} />
            )}
            {showModelInput && (
              <input
                id="api-model"
                ref={modelRef}
                aria-label="Id do modelo"
                className={recModels.length > 0 ? "dd-extra-input" : ""}
                value={apiModel}
                onChange={(e) => { setApiModel(e.target.value); setResult(null); }}
                placeholder="ex.: gpt-4o-mini"
                spellCheck={false}
                autoComplete="off"
              />
            )}
            <BenchView model={apiModel} />
          </div>

          <div>
            <label className="api-label" htmlFor="api-key">Chave da API</label>
            <input
              id="api-key"
              type="password"
              value={apiKey}
              onChange={(e) => { setApiKey(e.target.value); setResult(null); maybeAutoSelectProvider(e.target.value); }}
              placeholder={keySaved ? "digite para trocar a chave" : "sk-…"}
              spellCheck={false}
              autoComplete="off"
            />
            {keySaved && (
              <span className="api-saved">
                <LockIcon /> Chave salva no cofre do sistema{keyMasked ? ` (${keyMasked})` : ""}
              </span>
            )}
          </div>

          <div className="api-row">
            <button className="btn-dl primary" disabled={apiBusy} onClick={applyApi}>
              {apiBusy ? "Testando…" : "Aplicar e testar"}
            </button>
            {!apiBusy && result?.ok && (
              <span className="test-ok"><PlugIcon /> Conectado</span>
            )}
          </div>
          {!apiBusy && result && !result.ok && (
            <div className="field-err">{result.msg}</div>
          )}
        </div>

        {/* Indicador de privacidade: segue o provedor que está sendo configurado. */}
        <div className="privacy warn">
          <ArrowOutIcon /> A cada imprompt, seu texto é enviado para <strong>{hostOf(apiBase)}</strong>.
        </div>

        <p className="help">
          Custa centavos (~US$0,0005 por imprompt no gpt-4o-mini). A chave fica no cofre de
          credenciais do sistema, nunca em texto puro no disco.
        </p>
        <details className="help-more">
          <summary>Provedores e segurança</summary>
          <p>
            O provedor é detectado pela sua chave (ex.: sk-ant-… → Claude, sk-or-… → OpenRouter,
            AIza… → Gemini, xai-… → xAI). Você também pode escolhê-lo nos botões ou usar
            "Personalizado" para um endpoint próprio no formato OpenAI. A chave vai pro cofre do
            sistema (Windows Credential
            Manager / macOS Keychain / Linux Secret Service) — uma chave por vez.
          </p>
        </details>
      </div>

    </section>
  );
}
