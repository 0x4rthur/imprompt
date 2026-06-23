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

  // ── Aba API (MotorTab) ──
  // Mini-benchmark: rótulos de qualidade/velocidade (QS_CAP) e custo (COST_CAP).
  "motor.cap.low": "low",
  "motor.cap.medium": "medium",
  "motor.cap.high": "high",
  "motor.cap.expensive": "expensive",
  "motor.cap.cheap": "cheap",
  // Eixos do benchmark.
  "motor.bench.quality": "quality",
  "motor.bench.speed": "speed",
  "motor.bench.cost": "cost",
  // aria-labels do benchmark (interpolam o valor).
  "motor.bench.quality.aria": "quality: {value} of 3",
  "motor.bench.speed.aria": "speed: {value} of 3",
  "motor.bench.cost.aria": "cost: {value}",
  // Host inválido na Base URL.
  "motor.invalidProvider": "(invalid provider)",
  // Conexão.
  "motor.connection": "Connection",
  "motor.provider": "Provider",
  "motor.baseUrl": "Base URL",
  "motor.model": "Model",
  "motor.apiKey": "API key",
  // Provedor personalizado.
  "motor.custom": "Custom",
  "motor.custom.title": "Your own endpoint (OpenAI format)",
  "motor.baseUrl.hint": "Set by the provider — pick \"Custom\" to edit.",
  "motor.model.customOption": "Custom…",
  "motor.model.placeholder": "e.g. gpt-4o-mini",
  "motor.model.aria": "Model id",
  // Chave da API.
  "motor.apiKey.placeholderChange": "type to change the key",
  "motor.apiKey.saved": "Key saved in the system vault",
  "motor.apiKey.savedMasked": "Key saved in the system vault ({masked})",
  // Botões e resultado do teste.
  "motor.testing": "Testing…",
  "motor.applyTest": "Apply and test",
  "motor.connected": "Connected",
  "motor.connectError": "Couldn't connect. Check the Base URL, the model, and the key.",
  // Privacidade (com host inline via <Trans>).
  "motor.privacy": "On every imprompt, your text is sent to {host}.",
  // Ajuda (custo/cofre).
  "motor.help":
    "Costs cents (~US$0.0005 per imprompt on gpt-4o-mini). The key lives in the system credential vault, never in plain text on disk.",
  // Detalhes: provedores e segurança.
  "motor.more.summary": "Providers and security",
  "motor.more.body":
    "The provider is detected from your key (e.g. sk-ant-… → Claude, sk-or-… → OpenRouter, AIza… → Gemini, xai-… → xAI). You can also pick it from the buttons or use \"Custom\" for your own OpenAI-format endpoint. The key goes to the system vault (Windows Credential Manager / macOS Keychain / Linux Secret Service) — one key at a time.",

  // ── Aba Atalho (GatilhoTab) ──
  // Hints do gravador.
  "gatilho.hint.needMod": "Hold Ctrl, Alt or Shift + a letter.",
  "gatilho.hint.needLetter": "Use a letter from A to Z.",
  // Gravador.
  "gatilho.record.aria": "Record activation shortcut",
  "gatilho.record.prompt": "Press the shortcut",
  "gatilho.record.x2": "× 2",
  "gatilho.record.x2.title": "pressed twice",
  "gatilho.record.cancel": "Esc cancels",
  "gatilho.record.edit": "click and press the keys",
  // Atalho + janela de debounce.
  "gatilho.label": "Shortcut",
  "gatilho.debounce": "Window between the 2 taps: {ms}",
  "gatilho.help":
    "The 1st tap copies the selection; the 2nd (within the window) activates Imprompt. {strong} — it's what copies the text; other shortcuts require you to have copied the text beforehand.",
  "gatilho.help.strong": "Ctrl+C is recommended",
  // Modo de ativação.
  "gatilho.when": "When to activate",
  "gatilho.when.instant": "Instant",
  "gatilho.when.popup": "Show popup",
  "gatilho.when.instant.help": "Uses your default preset right away, showing nothing. Faster.",
  "gatilho.when.popup.help": "Opens the popup so you can pick the preset on each activation.",
  // Saída.
  "gatilho.output": "What to do with the result",
  "gatilho.output.replace": "Replace",
  "gatilho.output.clipboard": "Copy",
  "gatilho.output.replace.help": "Replaces the selected text with the result, automatically.",
  "gatilho.output.clipboard.help": "Puts the result on the clipboard. You press Ctrl+V wherever you want.",
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

  // ── Aba API (MotorTab) ──
  "motor.cap.low": "baixo",
  "motor.cap.medium": "médio",
  "motor.cap.high": "alto",
  "motor.cap.expensive": "caro",
  "motor.cap.cheap": "barato",
  "motor.bench.quality": "qualidade",
  "motor.bench.speed": "velocidade",
  "motor.bench.cost": "custo",
  "motor.bench.quality.aria": "qualidade: {value} de 3",
  "motor.bench.speed.aria": "velocidade: {value} de 3",
  "motor.bench.cost.aria": "custo: {value}",
  "motor.invalidProvider": "(provedor inválido)",
  "motor.connection": "Conexão",
  "motor.provider": "Provedor",
  "motor.baseUrl": "Base URL",
  "motor.model": "Modelo",
  "motor.apiKey": "Chave da API",
  "motor.custom": "Personalizado",
  "motor.custom.title": "Endpoint próprio (formato OpenAI)",
  "motor.baseUrl.hint": "Definido pelo provedor — escolha \"Personalizado\" para editar.",
  "motor.model.customOption": "Personalizado…",
  "motor.model.placeholder": "ex.: gpt-4o-mini",
  "motor.model.aria": "Id do modelo",
  "motor.apiKey.placeholderChange": "digite para trocar a chave",
  "motor.apiKey.saved": "Chave salva no cofre do sistema",
  "motor.apiKey.savedMasked": "Chave salva no cofre do sistema ({masked})",
  "motor.testing": "Testando…",
  "motor.applyTest": "Aplicar e testar",
  "motor.connected": "Conectado",
  "motor.connectError": "Não consegui conectar. Confira a Base URL, o modelo e a chave.",
  "motor.privacy": "A cada imprompt, seu texto é enviado para {host}.",
  "motor.help":
    "Custa centavos (~US$0,0005 por imprompt no gpt-4o-mini). A chave fica no cofre de credenciais do sistema, nunca em texto puro no disco.",
  "motor.more.summary": "Provedores e segurança",
  "motor.more.body":
    "O provedor é detectado pela sua chave (ex.: sk-ant-… → Claude, sk-or-… → OpenRouter, AIza… → Gemini, xai-… → xAI). Você também pode escolhê-lo nos botões ou usar \"Personalizado\" para um endpoint próprio no formato OpenAI. A chave vai pro cofre do sistema (Windows Credential Manager / macOS Keychain / Linux Secret Service) — uma chave por vez.",

  // ── Aba Atalho (GatilhoTab) ──
  "gatilho.hint.needMod": "Segure Ctrl, Alt ou Shift + uma letra.",
  "gatilho.hint.needLetter": "Use uma letra de A a Z.",
  "gatilho.record.aria": "Gravar atalho de ativação",
  "gatilho.record.prompt": "Pressione o atalho",
  "gatilho.record.x2": "× 2",
  "gatilho.record.x2.title": "pressionado duas vezes",
  "gatilho.record.cancel": "Esc cancela",
  "gatilho.record.edit": "clique e pressione as teclas",
  "gatilho.label": "Atalho",
  "gatilho.debounce": "Janela entre os 2 toques: {ms}",
  "gatilho.help":
    "O 1º toque copia a seleção; o 2º (dentro da janela) ativa o Imprompt. {strong} — é ele que copia o texto; outros atalhos exigem que você já tenha copiado o texto antes.",
  "gatilho.help.strong": "Ctrl+C é o recomendado",
  "gatilho.when": "Quando ativar",
  "gatilho.when.instant": "Instantâneo",
  "gatilho.when.popup": "Mostrar popup",
  "gatilho.when.instant.help": "Usa seu preset padrão na hora, sem mostrar nada. Mais rápido.",
  "gatilho.when.popup.help": "Abre o popup pra você escolher o preset a cada ativação.",
  "gatilho.output": "O que fazer com o resultado",
  "gatilho.output.replace": "Substituir",
  "gatilho.output.clipboard": "Copiar",
  "gatilho.output.replace.help": "Troca o texto selecionado pelo resultado, automaticamente.",
  "gatilho.output.clipboard.help": "Coloca o resultado na área de transferência. Você dá Ctrl+V onde quiser.",
};

export const CATALOG = { en, "pt-BR": ptBR } as const;
export type Key = keyof typeof en;
