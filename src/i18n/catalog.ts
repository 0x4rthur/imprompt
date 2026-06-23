// catalog.ts — dicionário de strings da UI (EN canônico + pt-BR).
//
// EN é a FONTE da verdade das chaves: o tipo `Key` deriva dele, então uma chave
// usada no código que não exista no catálogo vira erro de compilação no TS. O
// objeto pt-BR é tipado como `Record<keyof typeof en, string>`, forçando (em
// tempo de compilação) que toda chave EN tenha também uma tradução PT. Chaves
// novas SEMPRE entram nos dois objetos.
//
// Marca (OpenAI, Anthropic, Gemini, xAI, DeepSeek…) NUNCA entra aqui.
// Interpolação de valores: `{nome}` (ex.: "{mod}+{key} ×2").

export type Locale = "en" | "pt-BR";

const en = {
  // Rótulos de aba (glossário canônico; reusado por App e pelas abas).
  "tab.inicio": "Home",
  "tab.historico": "History",
  "tab.presets": "Presets",
  "tab.api": "API",
  "tab.gatilho": "Shortcut",
  "tab.sobre": "About",

  // Modificadores de teclado (canônicos; reusados onde o atalho é exibido).
  "mod.ctrl": "Ctrl",
  "mod.alt": "Alt",
  "mod.shift": "Shift",

  // App shell.
  "app.title": "Imprompt — Preferences",
  "app.loading": "Loading…",
  "app.nav": "Navigation",
  "app.window.minimize": "Minimize",
  "app.window.close": "Close",
  "app.autostartError": "Couldn't start with the system. Please try again.",
  // Banner de Acessibilidade (macOS).
  "app.access.title": "Permission required (macOS)",
  "app.access.body":
    "Imprompt needs Accessibility access to detect your shortcut ({mod}+{key}×2) and paste the result. Enable Imprompt in Settings > Privacy & Security > Accessibility.",
  "app.access.open": "Open Settings",
  // Banner de atualização.
  "app.update.title": "Update available: v{version}",
  "app.update.installing": "Downloading and restarting…",
  "app.update.error": "Failed: {error}",
  "app.update.body": "Downloads the new version and restarts the app when done.",
  "app.update.btn.installing": "Downloading…",
  "app.update.btn": "Download and restart",

  // Indicador de conexão (rodapé do rail).
  "conn.checking": "Checking…",
  "conn.connected": "Connected",
  "conn.disconnected": "No connection",
  "conn.noKey": "no saved key",
  "conn.title.error": "{name}: {detail}",
  "conn.title.test": "{name} ({host}) — click to test the connection",
  // Fallback genérico quando o host não casa com nenhuma marca conhecida.
  "conn.providerFallback": "API",
  // Host exibido quando a base URL configurada é vazia/ilegível.
  "conn.invalidProvider": "(invalid provider)",
} as const;

const ptBR: Record<keyof typeof en, string> = {
  "tab.inicio": "Início",
  "tab.historico": "Histórico",
  "tab.presets": "Presets",
  "tab.api": "API",
  "tab.gatilho": "Atalho",
  "tab.sobre": "Sobre",

  "mod.ctrl": "Ctrl",
  "mod.alt": "Alt",
  "mod.shift": "Shift",

  "app.title": "Imprompt — Preferências",
  "app.loading": "Carregando…",
  "app.nav": "Navegação",
  "app.window.minimize": "Minimizar",
  "app.window.close": "Fechar",
  "app.autostartError": "Não foi possível iniciar com o sistema. Tente de novo.",
  "app.access.title": "Permissão necessária (macOS)",
  "app.access.body":
    "O Imprompt precisa de Acessibilidade pra detectar o seu atalho ({mod}+{key}×2) e colar o resultado. Ative o Imprompt em Ajustes > Privacidade e Segurança > Acessibilidade.",
  "app.access.open": "Abrir Ajustes",
  "app.update.title": "Atualização disponível: v{version}",
  "app.update.installing": "Baixando e reiniciando…",
  "app.update.error": "Falha: {error}",
  "app.update.body": "Baixa a versão nova e reinicia o app ao concluir.",
  "app.update.btn.installing": "Baixando…",
  "app.update.btn": "Baixar e reiniciar",

  "conn.checking": "Verificando…",
  "conn.connected": "Conectado",
  "conn.disconnected": "Sem conexão",
  "conn.noKey": "sem chave salva",
  "conn.title.error": "{name}: {detail}",
  "conn.title.test": "{name} ({host}) — clique para testar a conexão",
  "conn.providerFallback": "API",
  "conn.invalidProvider": "(provedor inválido)",
};

export const CATALOG = { en, "pt-BR": ptBR } as const;
export type Key = keyof typeof en;
