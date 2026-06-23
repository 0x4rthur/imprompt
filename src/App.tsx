import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
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
import { setLocale } from "./i18n";
import { useT } from "./i18n/useT";

type Tab = "inicio" | "historico" | "motor" | "presets" | "gatilho" | "geral";
const TABS: Tab[] = ["inicio", "historico", "presets", "motor", "gatilho", "geral"];

// Rótulo visível de cada aba (glossário canônico num lugar só): o id interno
// "motor"/"gatilho" diverge do que o usuário lê ("API"/"Atalho").
const TAB_LABEL: Record<Tab, string> = {
  inicio: "Início",
  historico: "Histórico",
  presets: "Presets",
  motor: "API",
  gatilho: "Atalho",
  geral: "Sobre",
};

// Rótulo do modificador do atalho, pra interpolar em mensagens.
const MOD: Record<Settings["trigger_modifier"], string> = { ctrl: "Ctrl", alt: "Alt", shift: "Shift" };

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
      // Link externo; a seta "sai" e a janela encolhe no hover (itshover → CSS).
      return (
        <svg {...base} strokeLinejoin="round" className="ico-extlink">
          <path className="external-box" d="M12 6h-6a2 2 0 0 0 -2 2v10a2 2 0 0 0 2 2h10a2 2 0 0 0 2 -2v-6" />
          <g className="external-arrow">
            <path d="M11 13l9 -9" />
            <path d="M15 4h5v5" />
          </g>
        </svg>
      );
    case "geral":
      // Info (círculo + "i"); o "i" se desenha no hover (itshover → CSS).
      return (
        <svg {...base} className="ico-info">
          <path d="M3 12a9 9 0 1 0 18 0a9 9 0 0 0 -18 0" />
          <path className="info-dot" pathLength={1} d="M12 9h.01" />
          <path className="info-line" pathLength={1} d="M11 12h1v4h1" />
        </svg>
      );
  }
}

// Controles de janela (minimizar / fechar). A janela roda SEM decoração nativa
// (tauri.conf.json → decorations:false), então desenhamos os botões aqui. Fechar
// esconde pra bandeja (lib.rs intercepta CloseRequested).
function WindowControls() {
  const win = getCurrentWindow();
  return (
    <div className="tb-controls">
      <button className="tb-btn" aria-label="Minimizar" title="Minimizar" onClick={() => win.minimize().catch(console.error)}>
        <svg viewBox="0 0 12 12" aria-hidden="true"><rect x="2.5" y="6" width="7" height="1" fill="currentColor" /></svg>
      </button>
      <button className="tb-btn close" aria-label="Fechar" title="Fechar" onClick={() => win.close().catch(console.error)}>
        <svg viewBox="0 0 12 12" aria-hidden="true"><path d="M3 3 9 9 M9 3 3 9" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" /></svg>
      </button>
    </div>
  );
}

export default function App() {
  // Assina o locale: re-renderiza a janela inteira quando o idioma troca (toggle
  // na aba Geral). Ainda não traduzimos as strings de App aqui — isso vem nas
  // tasks de extração; por ora só precisamos da reatividade da subscription.
  useT();
  const [presets, setPresets] = useState<Preset[]>([]);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [autostart, setAutostart] = useState(false);
  const [autostartErr, setAutostartErr] = useState("");
  const [needsAccess, setNeedsAccess] = useState(false);
  const [tab, setTab] = useState<Tab>(initialTab);
  const [history, setHistory] = useState<RefineRecord[]>([]);
  // Atualização: versão disponível (null = nenhuma) + estado de instalação/erro.
  const [updateVersion, setUpdateVersion] = useState<string | null>(null);
  const [installing, setInstalling] = useState(false);
  const [updateErr, setUpdateErr] = useState("");
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

  // Baixa e instala a atualização — em sucesso o app reinicia (a chamada não retorna).
  async function installUpdate() {
    setInstalling(true);
    setUpdateErr("");
    try {
      await invoke("install_update");
    } catch (e) {
      setInstalling(false);
      setUpdateErr(String(e));
    }
  }

  // Menu de contexto do WebView2 desativado + barra de rolagem custom (overlay).
  useEffect(() => {
    const offCtx = blockContextMenu();
    const offScroll = initAutoScrollbars();
    return () => { offCtx(); offScroll(); };
  }, []);

  // Carrega tudo do backend ao abrir.
  useEffect(() => {
    loadPresets();
    invoke<Settings>("get_settings")
      .then((s) => { setLocale(s.locale); setSettings(s); })
      .catch(console.error);
    // Estado real do autostart vem do plugin (fonte da verdade), não das settings.
    isEnabled().then(setAutostart).catch(console.error);
    // macOS: avisa se faltar permissão de Acessibilidade (sempre true fora do macOS).
    invoke<boolean>("check_accessibility").then((ok) => setNeedsAccess(!ok)).catch(console.error);
    // Histórico de refinos da sessão (pra timeline da tela Início).
    loadHistory();
    // Atualização pendente? (puxa caso o evento tenha sido emitido antes de montar)
    invoke<string | null>("get_pending_update").then((v) => { if (v) setUpdateVersion(v); }).catch(console.error);
    // Uso da API no mês.
    loadUsage();
    loadUsageHistory();

    // Updater: aparece versão nova / confirma que está atualizado.
    const unUpd = listen<string>("update-available", (e) => setUpdateVersion(e.payload));
    const unNone = listen("update-none", () => setUpdateVersion(null));
    // Ao voltar o foco pra janela (ex.: depois de um refino via Ctrl+C×2),
    // recarrega o contador de uso e o histórico pra refletir o que foi feito.
    const unFocus = getCurrentWindow().onFocusChanged(({ payload: focused }) => { if (focused) { loadUsage(); loadUsageHistory(); loadHistory(); } });
    return () => {
      unUpd.then((f) => f()); unNone.then((f) => f()); unFocus.then((f) => f());
    };
  }, []);

  // Salva no backend sempre que algo muda. Retorna a Promise pra quem precisa
  // ESPERAR o salvamento antes do próximo passo (ex.: trocar e recarregar o modelo).
  // Em falha, REVERTE o estado otimista pra UI não mentir sobre o que foi salvo.
  function update(patch: Partial<Settings>): Promise<void> {
    if (!settings) return Promise.resolve();
    const prev = settings;
    const next = { ...settings, ...patch };
    setSettings(next);
    return invoke("set_settings", { newSettings: next })
      .then(() => {})
      .catch((e) => {
        setSettings(prev); // reverte o otimismo
        throw e;
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
      setAutostartErr("Não foi possível iniciar com o sistema. Tente de novo.");
    }
  }

  if (!settings) {
    return (
      <div className="app">
        <header className="titlebar" data-tauri-drag-region onDoubleClick={(e) => e.preventDefault()}>
          <span className="tb-title"></span>
          <div className="tb-right">
            <WindowControls />
          </div>
        </header>
        <div className="loading-brand" data-tauri-drag-region>
          <BrandMark size={28} />
          <div className="lb-text">Carregando…</div>
        </div>
      </div>
    );
  }

  return (
    <div className="app">
      {/* Barra de título CUSTOM: a janela roda sem decoração nativa (decorations:false).
          A marca foi pro rail à esquerda; aqui ficam só o título e os controles de janela.
          A barra inteira é a região de arrasto (data-tauri-drag-region). */}
      <header className="titlebar" data-tauri-drag-region onDoubleClick={(e) => e.preventDefault()}>
        <span className="tb-title"></span>
        <div className="tb-right">
          <WindowControls />
        </div>
      </header>

      <div className="shell">
        {/* ── Rail: logo + navegação de ícones; Geral fixo no rodapé ── */}
        <nav className="rail" aria-label="Navegação">
          <div className="rail-brand">
            <BrandMark size={22} />
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
                <span>{TAB_LABEL[id]}</span>
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
              <span>Sobre</span>
            </button>
            <ConnectionStatus settings={settings} />
          </div>
        </nav>

        {/* ── Conteúdo ── */}
        <main className="main">
          <div className="main-inner">

            {needsAccess && (
              <div className="banner">
                <div className="banner-text">
                  <strong>Permissão necessária (macOS)</strong>
                  <p>
                    O Imprompt precisa de Acessibilidade pra detectar o seu atalho ({MOD[settings.trigger_modifier] ?? "Ctrl"}+{(settings.trigger_key || "c").toUpperCase()}×2) e colar o
                    resultado. Ative o Imprompt em Ajustes &gt; Privacidade e Segurança &gt; Acessibilidade.
                  </p>
                </div>
                <button className="btn-dl" onClick={() => invoke("open_accessibility_settings").catch(console.error)}>
                  Abrir Ajustes
                </button>
              </div>
            )}

            {updateVersion && (
              <div className="banner update">
                <div className="banner-text">
                  <strong>Atualização disponível: v{updateVersion}</strong>
                  <p>
                    {installing
                      ? "Baixando e reiniciando…"
                      : updateErr
                      ? "Falha: " + updateErr
                      : "Baixa a versão nova e reinicia o app ao concluir."}
                  </p>
                </div>
                <button className="btn-dl primary" disabled={installing} onClick={installUpdate}>
                  {installing ? "Baixando…" : "Baixar e reiniciar"}
                </button>
              </div>
            )}

            {tab === "inicio" && (
              <InicioTab settings={settings} usage={usage} usageHistory={usageHistory} presets={presets} onNavigate={selectTab} />
            )}

            {tab === "historico" && (
              <HistoricoTab history={history} presets={presets} />
            )}

            {tab === "motor" && (
              <MotorTab
                settings={settings}
                update={update}
              />
            )}

            {tab === "presets" && (
              <PresetsTab settings={settings} update={update} presets={presets} loadPresets={loadPresets} />
            )}

            {tab === "gatilho" && <GatilhoTab settings={settings} update={update} />}

            {tab === "geral" && (
              <GeralTab autostart={autostart} toggleAutostart={toggleAutostart} autostartErr={autostartErr} />
            )}

          </div>
        </main>
      </div>
    </div>
  );
}
