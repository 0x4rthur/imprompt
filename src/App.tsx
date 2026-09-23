import { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { enable, disable, isEnabled } from "@tauri-apps/plugin-autostart";
import BrandMark from "./BrandMark";
import { initAutoScrollbars } from "./autoscroll";
import { blockContextMenu } from "./noContextMenu";
import type { MonthUsage, Preset, RefineRecord, Settings, UsageSummary } from "./types";
import InicioTab from "./tabs/InicioTab";
import HistoricoTab from "./tabs/HistoricoTab";
import MotorTab from "./tabs/MotorTab";
import PresetsTab from "./tabs/PresetsTab";
import GatilhoTab from "./tabs/GatilhoTab";
import GeralTab from "./tabs/GeralTab";
import ConnectionStatus from "./ConnectionStatus";
import { connection, type ApiConfig } from "./connection";
import { setLocale } from "./i18n";
import type { Key } from "./i18n/catalog";
import { useT } from "./i18n/useT";
import { useAppUpdater } from "./useAppUpdater";
import UpdateStatus from "./UpdateStatus";

type Tab = "inicio" | "historico" | "motor" | "presets" | "gatilho" | "geral";
const TABS: Tab[] = ["inicio", "historico", "presets", "motor", "gatilho", "geral"];

// Chave de catálogo do rótulo de cada aba (glossário canônico num lugar só): o id
// interno "motor"/"gatilho" diverge do que o usuário lê ("API"/"Atalho").
const TAB_KEY: Record<Tab, Key> = {
  inicio: "tab.inicio",
  historico: "tab.historico",
  presets: "tab.presets",
  motor: "tab.api",
  gatilho: "tab.gatilho",
  geral: "tab.sobre",
};

// Subtítulo (uma linha) do cabeçalho de cada página.
const PAGE_KEY: Record<Tab, Key> = {
  inicio: "page.inicio",
  historico: "page.historico",
  presets: "page.presets",
  motor: "page.api",
  gatilho: "page.gatilho",
  geral: "page.sobre",
};

// Chave de catálogo do modificador do atalho, pra interpolar em mensagens.
const MOD_KEY: Record<Settings["trigger_modifier"], Key> = { ctrl: "mod.ctrl", alt: "mod.alt", shift: "mod.shift" };

// Lê a última aba salva no localStorage; "inicio" se ausente/inválida.
function initialTab(): Tab {
  const t = localStorage.getItem("imprompt.tab");
  return TABS.includes(t as Tab) ? (t as Tab) : "inicio";
}

// ── Ícones de linha da navegação (geométricos, herdam a cor via currentColor) ──
function NavIcon({ id }: { id: Tab }) {
  const base = {
    viewBox: "0 0 24 24",
    width: 18,
    height: 18,
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.6,
    strokeLinecap: "round" as const,
    style: { flex: "none" as const },
  };
  switch (id) {
    case "inicio":
      // Pizza que se "desenha" no hover (readaptado do itshover p/ CSS).
      return (
        <svg {...base} strokeLinejoin="round" className="ico-pie">
          <path className="pie-main" pathLength={1} d="M10 3.2a9 9 0 1 0 10.8 10.8a1 1 0 0 0 -1 -1h-6.8a2 2 0 0 1 -2 -2v-7a.9 .9 0 0 0 -1 -.8" />
          <path className="pie-slice" pathLength={1} d="M15 3.5a9 9 0 0 1 5.5 5.5h-4.5a1 1 0 0 1 -1 -1v-4.5" />
        </svg>
      );
    case "historico":
      // Relógio com seta de "voltar no tempo"; rebobina no hover.
      return (
        <svg {...base} strokeLinejoin="round" className="ico-hist">
          <path className="clock-hand" d="M12 8l0 4l2 2" />
          <path className="history-circle" d="M3.05 11a9 9 0 1 1 .5 4m-.5 5v-5h5" />
        </svg>
      );
    case "presets":
      // Estante de livros; os livros inclinam/levantam no hover (itshover → CSS).
      return (
        <svg {...base} className="ico-library">
          <path className="book-4" d="M4 4v16" />
          <path className="book-3" d="M8 8v12" />
          <path className="book-2" d="M12 6v14" />
          <path className="book-1" d="m16 6 4 14" />
        </svg>
      );
    case "motor":
      // Plug que "conecta" no hover (readaptado do itshover para CSS).
      return (
        <svg {...base} strokeLinejoin="round" className="ico-plug">
          <path className="plug-lower" d="M7 12l5 5l-1.5 1.5a3.536 3.536 0 1 1 -5 -5l1.5 -1.5z" />
          <path className="plug-upper" d="M17 12l-5 -5l1.5 -1.5a3.536 3.536 0 1 1 5 5l-1.5 1.5z" />
          <path className="plug-lower" d="M3 21l2.5 -2.5" />
          <path className="plug-upper" d="M18.5 5.5l2.5 -2.5" />
          <path className="plug-lower plug-leg" d="M10 11l-2 2" />
          <path className="plug-lower plug-leg" d="M13 14l-2 2" />
        </svg>
      );
    case "gatilho":
      // Teclado; a barra de espaço "afunda" no hover (o atalho é um gesto de teclado).
      return (
        <svg {...base} strokeLinejoin="round" className="ico-kbd">
          <rect x="2.5" y="6" width="19" height="12" rx="2" />
          <path d="M6.5 10h.01M10 10h.01M14 10h.01M17.5 10h.01" />
          <path className="kbd-space" d="M8 14.2h8" />
        </svg>
      );
    case "geral":
      // Engrenagem com giro curto no hover ou foco por teclado.
      return (
        <svg {...base} className="ico-settings" strokeLinejoin="round" aria-hidden="true">
          <polygon points="18.65,9.24 21.29,10.02 21.29,13.98 18.65,14.76 18.65,14.76 19.97,17.17 17.17,19.97 14.76,18.65 14.76,18.65 13.98,21.29 10.02,21.29 9.24,18.65 9.24,18.65 6.83,19.97 4.03,17.17 5.35,14.76 5.35,14.76 2.71,13.98 2.71,10.02 5.35,9.24 5.35,9.24 4.03,6.83 6.83,4.03 9.24,5.35 9.24,5.35 10.02,2.71 13.98,2.71 14.76,5.35 14.76,5.35 17.17,4.03 19.97,6.83 18.65,9.24" />
          <circle cx="12" cy="12" r="3" />
        </svg>
      );
  }
}

// Controles de janela (minimizar / fechar). A janela roda SEM decoração nativa
// (tauri.conf.json → decorations:false), então desenhamos os botões aqui. Fechar
// esconde pra bandeja (lib.rs intercepta CloseRequested).
function WindowControls() {
  const { t } = useT();
  const win = getCurrentWindow();
  return (
    <div className="tb-controls">
      <button className="tb-btn" aria-label={t("app.window.minimize")} title={t("app.window.minimize")} onClick={() => win.minimize().catch(console.error)}>
        <svg viewBox="0 0 12 12" aria-hidden="true"><rect x="2.5" y="6" width="7" height="1" fill="currentColor" /></svg>
      </button>
      <button className="tb-btn close" aria-label={t("app.window.close")} title={t("app.window.close")} onClick={() => win.close().catch(console.error)}>
        <svg viewBox="0 0 12 12" aria-hidden="true"><path d="M3 3 9 9 M9 3 3 9" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" /></svg>
      </button>
    </div>
  );
}

export default function App() {
  // Assina o locale: re-renderiza a janela inteira quando o idioma troca (toggle
  // na aba Geral) e devolve o tradutor `t`.
  const { t, locale } = useT();
  const [presets, setPresets] = useState<Preset[]>([]);
  const [settings, setSettings] = useState<Settings | null>(null);
  const settingsRef = useRef<Settings | null>(null);
  const settingsQueue = useRef<Promise<unknown>>(Promise.resolve());
  const [autostart, setAutostart] = useState(false);
  const [autostartErr, setAutostartErr] = useState("");
  const [needsAccess, setNeedsAccess] = useState(false);
  const [tab, setTab] = useState<Tab>(initialTab);
  const [history, setHistory] = useState<RefineRecord[]>([]);
  const updater = useAppUpdater();
  // Uso da API (mês corrente).
  const [usage, setUsage] = useState<UsageSummary | null>(null);
  // Histórico de uso por mês (pro gráfico de gastos do dashboard).
  const [usageHistory, setUsageHistory] = useState<MonthUsage[]>([]);

  // Carrega o histórico de refinos da sessão (mais recente primeiro).
  function loadHistory() {
    invoke<RefineRecord[]>("get_history").then(setHistory).catch(console.error);
  }

  // Recarrega a lista de presets (padrão + custom).
  function loadPresets() {
    invoke<Preset[]>("list_presets").then(setPresets).catch(console.error);
  }

  // Uso da API no mês (refinos + custo).
  function loadUsage() {
    invoke<UsageSummary>("get_usage").then(setUsage).catch(console.error);
  }
  // Histórico de uso por mês (pro gráfico de gastos do dashboard).
  function loadUsageHistory() {
    invoke<MonthUsage[]>("get_usage_history").then(setUsageHistory).catch(console.error);
  }

  // Persiste a aba escolhida e carrega o que ela precisa.
  function selectTab(t: Tab) {
    setTab(t);
    localStorage.setItem("imprompt.tab", t);
    if (t === "inicio") { loadUsage(); loadUsageHistory(); }
    if (t === "historico") loadHistory();
  }

  // Menu de contexto do WebView2 desativado + barra de rolagem custom (overlay).
  useEffect(() => {
    const offCtx = blockContextMenu();
    const offScroll = initAutoScrollbars();
    return () => { offCtx(); offScroll(); };
  }, []);

  // Título da janela (document.title) acompanha o idioma.
  useEffect(() => {
    document.title = t("app.title");
  }, [t, locale]);

  // Carrega tudo do backend ao abrir.
  useEffect(() => {
    loadPresets();
    invoke<Settings>("get_settings")
      .then((s) => { setLocale(s.locale); settingsRef.current = s; setSettings(s); })
      .catch(console.error);
    // Estado real do autostart vem do plugin (fonte da verdade), não das settings.
    isEnabled().then(setAutostart).catch(console.error);
    // macOS: avisa se faltar permissão de Acessibilidade (sempre true fora do macOS).
    invoke<boolean>("check_accessibility").then((ok) => setNeedsAccess(!ok)).catch(console.error);
    // Histórico de refinos da sessão (pra timeline da tela Início).
    loadHistory();
    // Uso da API no mês.
    loadUsage();
    loadUsageHistory();

    // Ao voltar o foco pra janela (ex.: depois de um refino via Ctrl+C×2),
    // recarrega o contador de uso e o histórico pra refletir o que foi feito.
    const unFocus = getCurrentWindow().onFocusChanged(({ payload: focused }) => { if (focused) { loadUsage(); loadUsageHistory(); loadHistory(); } });
    return () => {
      unFocus.then((f) => f());
    };
  }, []);

  // Serialize settings writes and merge against the last committed state so
  // navigation or unrelated changes cannot overwrite an API configuration.
  function update(patch: Partial<Settings>): Promise<void> {
    return queueSettings(async () => {
      if (!settingsRef.current) return;
      const next = { ...settingsRef.current, ...patch };
      await invoke("set_settings", { newSettings: next });
      settingsRef.current = next;
      setSettings(next);
    });
  }

  function queueSettings(operation: () => Promise<void>): Promise<void> {
    const pending = settingsQueue.current.catch(() => {}).then(operation);
    settingsQueue.current = pending;
    return pending;
  }

  function applyApi(config: ApiConfig, key: string): Promise<void> {
    return queueSettings(async () => {
      const next = await connection.apply(config, key);
      settingsRef.current = next;
      setSettings(next);
    });
  }

  // Liga/desliga o início com o sistema (autostart) e persiste nas settings.
  async function toggleAutostart(on: boolean) {
    setAutostartErr("");
    try {
      if (on) await enable();
      else await disable();
      setAutostart(on);
      await update({ autostart: on });
    } catch (e) {
      console.error(e);
      setAutostartErr(t("app.autostartError"));
    }
  }

  // Barra de título CUSTOM: a janela roda sem decoração nativa (decorations:false).
  // Fica só sobre a coluna de conteúdo (o rail sobe até o topo); a barra inteira é
  // região de arrasto (data-tauri-drag-region), só os controles recebem clique.
  const titlebar = (
    <header className="titlebar" data-tauri-drag-region onDoubleClick={(e) => e.preventDefault()}>
      <WindowControls />
    </header>
  );

  if (!settings) {
    return (
      <div className="app">
        <div className="content">
          {titlebar}
          <div className="loading-brand" data-tauri-drag-region>
            <BrandMark size={28} />
            <div className="lb-text">{t("app.loading")}</div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="app">
      <div className="shell">
        {/* ── Rail (altura total): marca + navegação; Configurações e conexão no rodapé ── */}
        <nav className="rail" aria-label={t("app.nav")}>
          <div className="rail-brand" data-tauri-drag-region onDoubleClick={(e) => e.preventDefault()}>
            <BrandMark size={18} />
            <span className="rb-name">imprompt</span>
          </div>

          <div className="rail-nav">
            {TABS.filter((t) => t !== "geral").map((id) => (
              <button
                key={id}
                className={"nav-item" + (tab === id ? " active" : "")}
                aria-current={tab === id ? "page" : undefined}
                onClick={() => selectTab(id)}
              >
                <NavIcon id={id} />
                <span>{t(TAB_KEY[id])}</span>
              </button>
            ))}
          </div>

          <div className="rail-foot">
            <button
              className={"nav-item" + (tab === "geral" ? " active" : "")}
              aria-current={tab === "geral" ? "page" : undefined}
              onClick={() => selectTab("geral")}
            >
              <NavIcon id="geral" />
              <span>{t("tab.sobre")}</span>
            </button>
            <ConnectionStatus settings={settings} />
          </div>
        </nav>

        {/* ── Conteúdo: barra de título + página rolável ── */}
        <div className="content">
          {titlebar}
          <main className="main">
            <div className="main-inner">

              {needsAccess && (
                <div className="banner" role="alert">
                  <div className="banner-text">
                    <strong>{t("app.access.title")}</strong>
                    <p>
                      {t("app.access.body", {
                        mod: t(MOD_KEY[settings.trigger_modifier] ?? "mod.ctrl"),
                        key: (settings.trigger_key || "c").toUpperCase(),
                      })}
                    </p>
                  </div>
                  <button className="btn-dl" onClick={() => invoke("open_accessibility_settings").catch(console.error)}>
                    {t("app.access.open")}
                  </button>
                </div>
              )}

              {updater.version && (
                <div className="banner update" role="status">
                  <div className="banner-text">
                    <strong>{t("app.update.title", { version: updater.version })}</strong>
                    {updater.installing || updater.error ? <UpdateStatus updater={updater} /> : <p>{t("app.update.body")}</p>}
                  </div>
                  <button className="btn-dl primary" disabled={updater.installing || updater.checking} onClick={updater.install}>
                    {updater.installing ? t("app.update.btn.installing") : t("app.update.btn")}
                  </button>
                </div>
              )}

              <header className="page-head">
                <h1>{t(TAB_KEY[tab])}</h1>
                <p>{t(PAGE_KEY[tab])}</p>
              </header>

              {tab === "inicio" && (
                <InicioTab settings={settings} usage={usage} usageHistory={usageHistory} presets={presets} onNavigate={selectTab} />
              )}

              {tab === "historico" && (
                <HistoricoTab history={history} presets={presets} />
              )}

              <div hidden={tab !== "motor"}>
                <MotorTab
                  settings={settings}
                  apply={applyApi}
                />
              </div>

              {tab === "presets" && (
                <PresetsTab settings={settings} update={update} presets={presets} loadPresets={loadPresets} />
              )}

              {tab === "gatilho" && <GatilhoTab settings={settings} update={update} />}

              {tab === "geral" && (
                <GeralTab autostart={autostart} toggleAutostart={toggleAutostart} autostartErr={autostartErr} settings={settings} update={update} updater={updater} />
              )}

            </div>
          </main>
        </div>
      </div>
    </div>
  );
}
