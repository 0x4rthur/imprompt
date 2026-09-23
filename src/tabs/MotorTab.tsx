// MotorTab.tsx — aba "API": provedor, modelo, chave,
// teste de conexão e uso/custo do mês. Estado da API (api*) é local desta aba.
import { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { ApiFormat, ApiKeyStatus, Settings } from "../types";
import type { ApiConfig } from "../connection";
import { ApiProviderIcon } from "../ApiProviderIcon";
import { t as translate } from "../i18n";
import { useT } from "../i18n/useT";
import { Trans } from "../i18n/Trans";
import { CATALOG_CHECKED_AT, CATEGORY_KEYS, PROVIDERS, exampleRefinementCost, formatModelPrice, formatRefinementCost, modelPrice } from "../modelCatalog";
import type { Provider } from "../modelCatalog";
import ModelBenchmark from "../ModelBenchmark";

const CUSTOM = "custom";
const MODEL_CUSTOM = "__custom__";

// Host de uma Base URL (ex.: "https://api.openai.com/v1" → "api.openai.com").
function hostOf(url: string): string {
  try {
    return new URL(url).host || url;
  } catch {
    return url || translate("motor.invalidProvider");
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
function ModelInfo({ provider, modelId }: { provider?: Provider; modelId: string }) {
  const { t, locale } = useT();
  const model = provider?.models.find((entry) => entry.id === modelId);
  const [sourceError, setSourceError] = useState(false);
  useEffect(() => setSourceError(false), [provider?.id]);
  if (!model || !provider) return <><ModelBenchmark key={modelId} modelId={modelId.trim()} /><p className="api-hint">{t("motor.models.customHint")}</p></>;
  const price = modelPrice(model);
  const checkedDate = new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeZone: "UTC" }).format(new Date(CATALOG_CHECKED_AT + "T00:00:00Z"));
  return (
    <div className="model-info">
      <div className="model-info-heading">
        <strong>{model.name}</strong>
        <span className="model-tag">{model.id === provider.model ? t("motor.models.recommended") : t(CATEGORY_KEYS[model.category])}</span>
      </div>
      <p>{model.description[locale]}</p>
      <ModelBenchmark key={model.id} model={model} />
      <dl className="model-prices">
        <div><dt>{t("motor.models.input")}</dt><dd>{formatModelPrice(price.input_per_1m, locale)}</dd></div>
        <div><dt>{t("motor.models.output")}</dt><dd>{formatModelPrice(price.output_per_1m, locale)}</dd></div>
        <span>{t("motor.models.unit")}</span>
      </dl>
      <details className="model-price-details">
        <summary>{t("motor.models.pricingDetails")}</summary>
        <p>{t("motor.models.priceBasis")}</p>
        {provider.note && <p>{provider.note[locale]}</p>}
        <p>{t("motor.models.checked", { date: checkedDate })}</p>
        <a href={provider.pricingUrl} onClick={(event) => {
          event.preventDefault();
          void invoke("open_url", { url: provider.pricingUrl }).then(() => setSourceError(false)).catch(() => setSourceError(true));
        }}>{t("motor.models.source")} ↗</a>
        {sourceError && <p role="alert">{t("motor.models.sourceError", { url: provider.pricingUrl })}</p>}
      </details>
    </div>
  );
}

// Dropdown estilizado (não usa <select> nativo, que não casa com o tema mono/cream
// e renderiza o popup pelo SO). Acessível: aria-haspopup/expanded, role listbox/option,
// teclado (setas/Enter/Esc) e fecha ao clicar fora.
type Opt = { value: string; label: string; detail?: string; badge?: string };
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
              <span className="model-option-title">{o.label}{o.badge && <span className="model-tag">{o.badge}</span>}</span>
              {o.detail && <span className="model-option-detail">{o.detail}</span>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

type Props = {
  settings: Settings;
  apply: (config: ApiConfig, key: string) => Promise<void>;
};

export default function MotorTab({ settings, apply }: Props) {
  const { t, locale } = useT();
  // Config da API em estado local (evita gravar settings.json a cada tecla); só
  // persiste no "Aplicar e testar".
  // Inicializa já das settings (lazy) — evita um frame com apiBase vazio que
  // ativaria "Personalizado" por engano (flash na entrada da aba). settings é
  // garantido não-nulo aqui (App mostra "Carregando…" enquanto não chega).
  const [apiBase, setApiBase] = useState(() => settings.api_base_url || "https://api.openai.com/v1");
  const [apiModel, setApiModel] = useState(() => settings.api_model || PROVIDERS[0].model);
  const [apiFormat, setApiFormat] = useState<ApiFormat>(() => settings.api_format ?? "auto");
  const [fastMode, setFastMode] = useState(() => settings.api_fast_mode ?? true);
  const [apiKey, setApiKey] = useState("");
  const [apiBusy, setApiBusy] = useState(false);
  // Resultado do teste: null (nada ainda), {ok:true} (conectado) ou {ok:false,msg}.
  const [result, setResult] = useState<{ ok: boolean; msg: string } | null>(null);
  // Estado da chave no cofre: existe? e a forma mascarada pra exibir.
  const [keySaved, setKeySaved] = useState(false);
  const [keyMasked, setKeyMasked] = useState("");
  // "Endpoint próprio" forçado pelo usuário (libera a Base URL mesmo que o host
  // ainda case com um provedor conhecido).
  const [customMode, setCustomMode] = useState(() => settings.api_custom ?? false);
  // Modelo em modo "digitar id próprio" (em vez de escolher da lista).
  const [modelCustom, setModelCustom] = useState(false);
  const baseRef = useRef<HTMLInputElement>(null);
  const modelRef = useRef<HTMLInputElement>(null);
  const keyGeneration = useRef(0);
  const drafts = useRef(new Map<string, { base: string; model: string; format: ApiFormat; modelCustom: boolean }>());

  // Lê do backend se há uma chave salva no cofre (e a versão mascarada).
  async function refreshKeyStatus() {
    const generation = ++keyGeneration.current;
    setKeySaved(false);
    setKeyMasked("");
    try {
      const status = await invoke<ApiKeyStatus>("get_api_key_status", { baseUrl: apiBase.trim() });
      if (generation === keyGeneration.current) { setKeySaved(status.saved); setKeyMasked(status.masked); }
    } catch {
      // The connection test reports vault/URL errors; never show an old key.
    }
  }

  useEffect(() => {
    setApiKey("");
    void refreshKeyStatus();
    return () => { keyGeneration.current += 1; };
  }, [apiBase]);

  // Re-sincroniza os campos quando as settings mudam POR FORA (ex.: "Aplicar"
  // reverteu por falha de save, ou outra origem alterou a config). NÃO recria o
  // "flash" do Personalizado: o estado já nasce certo do init lazy, então na 1ª
  // montagem este efeito roda com os mesmos valores → no-op. E durante a edição
  // local (digitar/escolher pílula) settings não muda, então não atropela o usuário.
  useEffect(() => {
    setApiBase(settings.api_base_url || "https://api.openai.com/v1");
    setApiModel(settings.api_model || PROVIDERS[0].model);
    setApiFormat(settings.api_format ?? "auto");
    setCustomMode(settings.api_custom ?? false);
    setFastMode(settings.api_fast_mode ?? true);
  }, [settings.api_base_url, settings.api_model, settings.api_format, settings.api_custom, settings.api_fast_mode]);

  // Provedor ativo: "custom" se o usuário forçou OU o host não casa com nenhum
  // conhecido; senão, o provedor cujo host bate com a Base URL.
  const matched = PROVIDERS.find((p) => apiBase.trim().replace(/\/+$/, "") === p.base);
  const activeProvider = customMode || !matched ? CUSTOM : matched.id;
  const isCustom = activeProvider === CUSTOM;
  const provider = PROVIDERS.find((p) => p.id === activeProvider);
  const recModels = provider?.models ?? [];
  const modelInList = recModels.some((m) => m.id === apiModel);
  // Mostra o input de id de modelo: provedor custom (sem lista), modo "Personalizado…",
  // ou modelo salvo que não está entre os recomendados.
  const showModelInput = isCustom || modelCustom || (recModels.length > 0 && !modelInList);

  const modelOptions: Opt[] = [
    ...recModels.map((m) => {
      const price = modelPrice(m);
      return {
        value: m.id, label: m.id,
        badge: m.id === provider?.model ? t("motor.models.recommended") : t(CATEGORY_KEYS[m.category]),
        detail: t("motor.models.optionPrice", { input: formatModelPrice(price.input_per_1m, locale), output: formatModelPrice(price.output_per_1m, locale) }),
      };
    }),
    { value: MODEL_CUSTOM, label: t("motor.model.customOption") },
  ];
  const modelDropValue = modelCustom || !modelInList ? MODEL_CUSTOM : apiModel;

  // Seleciona um provedor conhecido: pré-preenche tudo e sai dos modos custom.
  function onProviderSelect(v: string) {
    if (v === activeProvider || apiBusy) return;
    drafts.current.set(activeProvider, { base: apiBase, model: apiModel, format: apiFormat, modelCustom });
    const draft = drafts.current.get(v);
    const provider = PROVIDERS.find((p) => p.id === v);
    setApiKey("");
    setResult(null);
    setModelCustom(draft?.modelCustom ?? false);
    setApiFormat(draft?.format ?? "auto");
    setCustomMode(v === CUSTOM);
    setApiBase(draft?.base ?? provider?.base ?? apiBase);
    setApiModel(draft?.model ?? provider?.model ?? apiModel);
    if (v === CUSTOM) {
      requestAnimationFrame(() => baseRef.current?.focus()); // foca a Base URL pra digitar
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

  // Salva a config (settings), guarda a chave no COFRE e testa a conexão de verdade.
  async function applyApi() {
    if (apiBusy) return;
    setApiBusy(true);
    setResult(null);
    try {
      await apply({ baseUrl: apiBase.trim(), model: apiModel.trim(), format: apiFormat, custom: isCustom, fastMode }, apiKey);
      setResult({ ok: true, msg: "" });
      await refreshKeyStatus();
      setApiKey(""); // não mantém a chave digitada na memória da UI
    } catch (e) {
      setResult({
        ok: false,
        msg: typeof e === "string" && e.trim() ? e : t("motor.connectError"),
      });
    } finally {
      setApiBusy(false);
    }
  }

  // Estimativa de custo do modelo selecionado (ou aviso de preço desconhecido).
  const costNote = (() => {
    const model = recModels.find((entry) => entry.id === apiModel);
    return model
      ? t("motor.cost.example", { model: model.name, cost: formatRefinementCost(exampleRefinementCost(model), locale) })
      : t("motor.cost.unknown", { model: apiModel || "—" });
  })();

  return (
    <section className="card">
      <fieldset className="api-cfg api-fields" disabled={apiBusy} aria-label={t("motor.connection")}>
        {/* Provedor: define o endpoint e, portanto, pra onde o texto vai. */}
        <div className="field">
          <h2 className="sec-title" id="api-provider-title">{t("motor.provider")}</h2>
          <div className="prov-grid" role="group" aria-labelledby="api-provider-title">
            {PROVIDERS.map((p) => (
              <button
                key={p.id}
                type="button"
                aria-label={p.label}
                aria-pressed={activeProvider === p.id}
                className={"prov-pill" + (activeProvider === p.id ? " on" : "")}
                onClick={() => onProviderSelect(p.id)}
              >
                <ApiProviderIcon host={hostOf(p.base)} size={17} />
                <span>{p.label}</span>
              </button>
            ))}
            <button
              type="button"
              aria-pressed={isCustom}
              className={"prov-pill" + (isCustom ? " on" : "")}
              onClick={() => onProviderSelect(CUSTOM)}
              title={t("motor.custom.title")}
            >
              <CustomGlyph />
              <span>{t("motor.custom")}</span>
            </button>
          </div>

          {/* Indicador de privacidade: segue o provedor que está sendo configurado. */}
          <p className="privacy warn">
            <ArrowOutIcon /> <span><Trans k="motor.privacy" slots={{ host: <strong>{hostOf(apiBase)}</strong> }} /></span>
          </p>

          {isCustom && (
            <div className="sub-field">
              <label className="api-label" htmlFor="api-format">{t("motor.format")}</label>
              <select id="api-format" value={apiFormat} onChange={(e) => { setApiFormat(e.target.value as ApiFormat); setResult(null); }}>
                <option value="auto">{t("motor.format.auto")}</option>
                <option value="chat_completions">OpenAI Chat Completions</option>
                <option value="responses">OpenAI Responses</option>
                <option value="anthropic">Anthropic Messages</option>
              </select>
            </div>
          )}

          <div className="sub-field">
            <label className="api-label" htmlFor="api-base">{t("motor.baseUrl")}</label>
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
            {!isCustom && <span className="api-hint">{t("motor.baseUrl.hint")}</span>}
          </div>
        </div>

        {/* Modelo: lista curada (ou id próprio) + ficha com benchmark e preços. */}
        <div className="field">
          <h2 className="sec-title">{t("motor.model")}</h2>
          {recModels.length > 0 && (
            <Dropdown ariaLabel={t("motor.model")} value={modelDropValue} options={modelOptions} onSelect={onModelSelect} />
          )}
          {showModelInput && (
            <input
              id="api-model"
              ref={modelRef}
              aria-label={t("motor.model.aria")}
              className={recModels.length > 0 ? "dd-extra-input" : ""}
              value={apiModel}
              onChange={(e) => { setApiModel(e.target.value); setResult(null); }}
              placeholder={t("motor.model.placeholder")}
              spellCheck={false}
              autoComplete="off"
            />
          )}
          <ModelInfo provider={provider} modelId={apiModel} />
          <p className="help" data-testid="model-cost-note">{costNote}</p>
        </div>

        {/* Chave: vai pro cofre do sistema, uma por endpoint. */}
        <div className="field">
          <label className="sec-title" htmlFor="api-key">{t("motor.apiKey")}</label>
          <input
            id="api-key"
            type="password"
            value={apiKey}
            onChange={(e) => { setApiKey(e.target.value); setResult(null); }}
            placeholder={keySaved ? t("motor.apiKey.placeholderChange") : "sk-…"}
            spellCheck={false}
            autoComplete="new-password"
          />
          <span className="api-hint">{t("motor.apiKey.scope")}</span>
          {keySaved && (
            <span className="api-saved">
              <LockIcon /> {keyMasked ? t("motor.apiKey.savedMasked", { masked: keyMasked }) : t("motor.apiKey.saved")}
            </span>
          )}
        </div>

        <div className="field">
          <label className="switch-row">
            <span className="sec-title">{t("motor.fastMode")}</span>
            <input type="checkbox" className="switch" checked={fastMode} onChange={(event) => { setFastMode(event.target.checked); setResult(null); }} />
          </label>
          <p className="help">{t("motor.fastMode.help")}</p>
        </div>
      </fieldset>

      <div className="field notes">
        <p className="help">{t("motor.help")}</p>
        <details className="help-more">
          <summary>{t("motor.more.summary")}</summary>
          <p>{t("motor.more.body")}</p>
        </details>
      </div>

      {/* Barra de ação presa ao rodapé da área rolável: o formulário é longo e a
          ação principal (e o resultado do teste) fica sempre à vista. */}
      <div className="apply-bar">
        {!apiBusy && result && !result.ok && (
          <div className="field-err" role="alert">{result.msg}</div>
        )}
        <div className="api-row">
          <button className="btn-dl primary" disabled={apiBusy} onClick={applyApi}>
            {apiBusy ? t("motor.testing") : t("motor.applyTest")}
          </button>
          {!apiBusy && result?.ok && (
            <span className="test-ok" role="status"><PlugIcon /> {t("motor.connected")}</span>
          )}
        </div>
      </div>
    </section>
  );
}
