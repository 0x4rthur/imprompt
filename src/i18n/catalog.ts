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
  "app.update.section": "Updates",
  "app.update.installed": "Installed version: {version}",
  "app.update.check": "Check for updates",
  "app.update.checking": "Checking for a new version…",
  "app.update.current": "You are up to date.",
  "app.update.auto": "Checks automatically at startup and every 6 hours.",
  "app.update.progress": "Downloading… {percent}%",
  "app.update.applying": "Installing the verified update and restarting…",
  "app.update.downloadProgress": "Download progress",
  "motor.cost.example": "Example for {model}: ~{cost} per refinement with 1,000 input + 500 output tokens at reference rates. Actual text length and reasoning change the cost.",
  "motor.cost.unknown": "No verified price for {model} at this endpoint. Check the provider’s rates before estimating a refinement.",
  "motor.benchmark.title": "Model benchmark",
  "motor.benchmark.quality": "quality",
  "motor.benchmark.speed": "speed",
  "motor.benchmark.cost": "cost",
  "motor.benchmark.unknown": "unverified",
  "motor.benchmark.low": "low",
  "motor.benchmark.medium": "medium",
  "motor.benchmark.costMedium": "medium",
  "motor.benchmark.high": "high",
  "motor.benchmark.cheap": "low",
  "motor.benchmark.expensive": "high",
  "motor.benchmark.details": "Benchmark sources and method",
  "motor.benchmark.reference": "Reference: {variant} · AA Intelligence Index {version} · checked {date}.",
  "motor.benchmark.unverified": "No validated comparable quality/speed data for this exact model. Empty indicators mean unknown, not a zero score.",
  "motor.benchmark.method": "Three-step scale: quality AA <15 / 15–29 / ≥30; output speed <60 / 60–149 / ≥150 tokens/s. Cost: ≤US$0.001 / ≤US$0.003 / >US$0.003 for 1,000 input + 500 output tokens. Thresholds are Imprompt’s comparison scale.",
  "motor.benchmark.limits": "Published reference scores may include estimates by the source. These are not local measurements. Reasoning settings, model snapshots and routing can differ from your request. Output speed excludes time spent waiting and thinking; the app uses provider defaults.",
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
  // Host inválido na Base URL.
  "motor.invalidProvider": "(invalid provider)",
  // Conexão.
  "motor.connection": "Connection",
  "motor.provider": "Provider",
  "motor.baseUrl": "Base URL",
  "motor.model": "Model",
  "motor.models.recommended": "Suggested for Imprompt",
  "motor.models.economy": "Economy",
  "motor.models.balanced": "Balanced",
  "motor.models.advanced": "Demanding tasks",
  "motor.models.fast": "Quick edits",
  "motor.models.code": "Code",
  "motor.models.input": "Input",
  "motor.models.output": "Output",
  "motor.models.unit": "USD / 1M tokens",
  "motor.models.optionPrice": "{input} input · {output} output / 1M tokens",
  "motor.models.pricingDetails": "Prices and sources",
  "motor.models.priceBasis": "Standard text rates, without caching, batch discounts or taxes. Reasoning tokens can increase output cost. Suggestions are curated for text editing, not measured performance scores.",
  "motor.models.checked": "Catalog checked on {date}. Rates and access may change.",
  "motor.models.source": "Provider pricing",
  "motor.models.sourceError": "Could not open the browser. Address: {url}",
  "motor.models.customHint": "Custom or previously saved model. Availability and pricing depend on your endpoint; enter the exact model ID.",
  "motor.apiKey": "API key",
  "motor.format": "API format",
  "motor.format.auto": "Automatic",
  "motor.apiKey.scope": "Saved separately for this endpoint. Optional for localhost.",
  // Provedor personalizado.
  "motor.custom": "Custom",
  "motor.custom.title": "Your own API endpoint",
  "motor.baseUrl.hint": "Set by the provider — pick \"Custom\" to edit.",
  "motor.model.customOption": "Custom…",
  "motor.model.placeholder": "e.g. gpt-5.6-luna",
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
    "Cost depends on the model and text length. The key lives in the system credential vault, never in plain text on disk.",
  // Detalhes: provedores e segurança.
  "motor.more.summary": "Providers and security",
  "motor.more.body":
    "Choose your provider or use \"Custom\" for a Chat Completions, Responses or Anthropic Messages endpoint. Enter any model ID available to your account. Each endpoint keeps its own key in the system vault. Apply and test activates the new setup only after a successful test; the provider may charge for this test.",

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

  // ── Aba Presets (PresetsTab) ──
  // Preset padrão.
  "presets.default": "Default preset",
  "presets.default.help": "Used in instant mode, without asking anything.",
  // Lista de presets (CRUD).
  "presets.list": "Presets",
  "presets.list.help": "Edit, duplicate or delete any preset. \"Restore defaults\" brings the originals back.",
  // Sufixo de duplicação (interpolado no label).
  "presets.copySuffix": " (copy)",
  // Form de edição: placeholders e aria-labels.
  "presets.form.name.placeholder": "Name (e.g. Summarize as bullet points)",
  "presets.form.name.aria": "Preset name",
  "presets.form.instruction.placeholder": "Instruction: what this preset should do with the text",
  "presets.form.instruction.aria": "Instruction",
  "presets.form.exampleInput.placeholder": "Example input (optional)",
  "presets.form.exampleInput.aria": "Example input",
  "presets.form.exampleOutput.placeholder": "Example output (optional)",
  "presets.form.exampleOutput.aria": "Example output",
  // Ações do form.
  "presets.save": "Save",
  "presets.create": "Create",
  "presets.cancel": "Cancel",
  // Item da lista.
  "presets.badge.edited": "edited",
  "presets.edit": "Edit",
  "presets.duplicate": "Duplicate",
  "presets.delete": "Delete",
  "presets.delete.confirm": "Confirm deletion",
  // Novo preset / restauração.
  "presets.new": "+ New preset",
  "presets.restore": "Restore defaults",
  "presets.restore.title": "Brings the original presets back (doesn't touch yours)",
  "presets.restore.confirm": "Confirm restore",
  "presets.restore.confirm.title": "Undoes your edits and deletions of the default presets",
  // Few-shot.
  "presets.fewShot": "Use examples (few-shot)",
  "presets.fewShot.aria": "Use examples",
  "presets.fewShot.yes": "Yes",
  "presets.fewShot.no": "No",
  "presets.fewShot.on.help":
    "Each preset sends one example (input → output) as conversation turns before your text. Usually improves the quality of the API's answer.",
  "presets.fewShot.off.help":
    "Zero-shot: just the preset's instruction, no example. Useful for comparing (A/B).",

  // ── Aba Início (InicioTab) ──
  // Faixa fina do atalho (com markup inline via <Trans>).
  "inicio.strip.mode": "mode {mode} · via API",
  "inicio.strip.mode.popup": "Show popup",
  "inicio.strip.mode.instant": "Instant",
  "inicio.strip.hint": "Select and press {mod} + {key} ×2",
  // Este mês.
  "inicio.month": "This month",
  "inicio.month.cost": "cost",
  "inicio.month.imprompts": "imprompts",
  "inicio.month.perImprompt": "per imprompt",
  // Tokens.
  "inicio.tokens": "Tokens",
  "inicio.tokens.month": "· {n} this month",
  "inicio.tokens.aria": "Tokens: input {in} ({inPct}%), output {out} ({outPct}%)",
  "inicio.tokens.in": "input",
  "inicio.tokens.out": "output",
  "inicio.tokens.empty": "No tokens this month yet — they show up after the first imprompt.",
  // Gastos por mês.
  "inicio.spend": "Spending by month",
  "inicio.spend.empty": "No data yet. Your monthly spending shows up here as you use it.",
  "inicio.spend.aria": "Spending by month: {list}",
  "inicio.spend.rowTitle": "{month}: {n} imprompt(s) · ~US$ {cost}",
  "inicio.spend.hint": "Previous months' bars fill in here as you use it.",
  // Atalhos (short-cards).
  "inicio.shortcuts": "Shortcuts",
  "inicio.short.presets.default": "default: {label}",
  "inicio.short.gatilho.sub": "{mod}+{key} ×2 · {action}",
  "inicio.short.gatilho.replace": "replace",
  "inicio.short.gatilho.copy": "copy",
  "inicio.short.sobre.sub": "autostart · version",

  // ── Aba Histórico (HistoricoTab) ──
  "historico.title": "Imprompt history",
  "historico.today": "Today",
  "historico.yesterday": "Yesterday",
  "historico.empty": "No imprompts in this session. Your imprompts show up here — and aren't saved to disk.",
  "historico.aria.original": "original",
  "historico.aria.result": "result",

  // ── Popup (palette) ──
  // Modo de saída (rótulo da loc-note + title do botão Aplicar).
  "popup.output.replace": "will replace the text",
  "popup.output.clipboard": "will copy to the clipboard",
  // Badge da API (modelo).
  "popup.badge.api": "API · {model}",
  "popup.badge.noModel": "(no model set)",
  // Erro genérico de fallback (quando o backend não manda mensagem própria).
  "popup.error.fallback": "Couldn't finish the imprompt. Check the API setup in Preferences.",
  // Cabeçalho do popup (a marca "Imprompt" fica fora do catálogo).
  "popup.head.sub": "Captured text",
  // Citação capturada (vazia / recolher / expandir).
  "popup.capture.empty": "(nothing captured — select some text)",
  "popup.capture.collapse": "Collapse",
  "popup.capture.expand": "Expand",
  // Presets (label + aria do grupo).
  "popup.presets.label": "Preset",
  // aria-label do diálogo.
  "popup.dialog.aria": "Make an imprompt",
  // Nota da ação quando não há nada capturado.
  "popup.note.selectAgain": "Select some text and fire the shortcut again",
  // Resultado.
  "popup.result.error": "Error",
  "popup.result.title": "Result",
  // Botões do resultado (+ titles).
  "popup.action.apply": "Apply",
  "popup.action.copy": "Copy",
  "popup.action.copy.title": "Copy to the clipboard",
  "popup.action.redo": "Redo",
  "popup.action.redo.title": "Do it again",

  // ── Aba Geral (GeralTab) ──
  // Iniciar com o sistema (label + aria + botões).
  "geral.autostart": "Start with the system",
  "geral.autostart.no": "No",
  "geral.autostart.yes": "Yes",
  "geral.autostart.on.help":
    "Imprompt opens with the system, already hidden in the tray, ready for Ctrl+C×2.",
  "geral.autostart.off.help": "Open Imprompt manually whenever you want to use it.",
  // Toggle de idioma.
  "geral.language": "Language",
  "geral.language.help": "Choose the interface language.",
  "geral.support.title": "Support Imprompt",
  "geral.support.desc": "Open-source and free. If it helps you, you can support the project.",
  "geral.support.button": "Donate",
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
  "app.update.section": "Atualizações",
  "app.update.installed": "Versão instalada: {version}",
  "app.update.check": "Verificar atualizações",
  "app.update.checking": "Verificando se há uma nova versão…",
  "app.update.current": "Você está usando a versão mais recente.",
  "app.update.auto": "Verifica automaticamente ao iniciar e a cada 6 horas.",
  "app.update.progress": "Baixando… {percent}%",
  "app.update.applying": "Instalando a atualização verificada e reiniciando…",
  "app.update.downloadProgress": "Progresso do download",
  "motor.cost.example": "Exemplo para {model}: ~{cost} por refino com 1.000 tokens de entrada + 500 de saída, nas tarifas de referência. O tamanho do texto e o raciocínio alteram o custo.",
  "motor.cost.unknown": "Sem preço validado para {model} neste endpoint. Consulte as tarifas do provedor para estimar um refino.",
  "motor.benchmark.title": "Benchmark do modelo",
  "motor.benchmark.quality": "qualidade",
  "motor.benchmark.speed": "velocidade",
  "motor.benchmark.cost": "custo",
  "motor.benchmark.unknown": "não verificado",
  "motor.benchmark.low": "baixa",
  "motor.benchmark.medium": "média",
  "motor.benchmark.costMedium": "médio",
  "motor.benchmark.high": "alta",
  "motor.benchmark.cheap": "baixo",
  "motor.benchmark.expensive": "alto",
  "motor.benchmark.details": "Fontes e método do benchmark",
  "motor.benchmark.reference": "Referência: {variant} · Índice de Inteligência AA {version} · consulta em {date}.",
  "motor.benchmark.unverified": "Sem dados comparáveis de qualidade/velocidade validados para este modelo exato. Indicadores vazios significam desconhecido, não nota zero.",
  "motor.benchmark.method": "Escala de três níveis: qualidade AA <15 / 15–29 / ≥30; velocidade de saída <60 / 60–149 / ≥150 tokens/s. Custo: ≤US$0,001 / ≤US$0,003 / >US$0,003 para 1.000 tokens de entrada + 500 de saída. Os limites são a escala comparativa do Imprompt.",
  "motor.benchmark.limits": "As notas publicadas podem incluir estimativas da fonte. Não são medições locais. Configuração de raciocínio, versão e roteamento podem diferir da sua chamada. A velocidade de saída exclui espera e raciocínio; o app usa os padrões do provedor.",
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
  "motor.invalidProvider": "(provedor inválido)",
  "motor.connection": "Conexão",
  "motor.provider": "Provedor",
  "motor.baseUrl": "Base URL",
  "motor.model": "Modelo",
  "motor.models.recommended": "Sugestão para o Imprompt",
  "motor.models.economy": "Economia",
  "motor.models.balanced": "Equilíbrio",
  "motor.models.advanced": "Tarefas exigentes",
  "motor.models.fast": "Edições rápidas",
  "motor.models.code": "Código",
  "motor.models.input": "Entrada",
  "motor.models.output": "Saída",
  "motor.models.unit": "USD / 1 milhão de tokens",
  "motor.models.optionPrice": "{input} entrada · {output} saída / 1M tokens",
  "motor.models.pricingDetails": "Preços e fontes",
  "motor.models.priceBasis": "Preços padrão de texto, sem cache, descontos de lote ou impostos. Tokens de raciocínio podem aumentar o custo de saída. Sugestões selecionadas para edição de texto, sem notas de desempenho medido.",
  "motor.models.checked": "Catálogo consultado em {date}. Preços e acesso podem mudar.",
  "motor.models.source": "Preços do provedor",
  "motor.models.sourceError": "Não foi possível abrir o navegador. Endereço: {url}",
  "motor.models.customHint": "Modelo personalizado ou salvo anteriormente. Disponibilidade e preço dependem do endpoint; informe o ID exato do modelo.",
  "motor.apiKey": "Chave da API",
  "motor.format": "Formato da API",
  "motor.format.auto": "Automático",
  "motor.apiKey.scope": "Salva separadamente para este endpoint. Opcional em localhost.",
  "motor.custom": "Personalizado",
  "motor.custom.title": "Seu próprio endpoint de API",
  "motor.baseUrl.hint": "Definido pelo provedor — escolha \"Personalizado\" para editar.",
  "motor.model.customOption": "Personalizado…",
  "motor.model.placeholder": "ex.: gpt-5.6-luna",
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
    "O custo depende do modelo e do tamanho do texto. A chave fica no cofre de credenciais do sistema, nunca em texto puro no disco.",
  "motor.more.summary": "Provedores e segurança",
  "motor.more.body":
    "Escolha o provedor ou use \"Personalizado\" para um endpoint Chat Completions, Responses ou Anthropic Messages. Digite qualquer ID de modelo disponível na sua conta. Cada endpoint guarda sua própria chave no cofre do sistema. Aplicar e testar ativa a nova configuração somente após um teste bem-sucedido; o provedor pode cobrar por esse teste.",

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

  // ── Aba Presets (PresetsTab) ──
  "presets.default": "Preset padrão",
  "presets.default.help": "Usado no modo instantâneo, sem perguntar nada.",
  "presets.list": "Presets",
  "presets.list.help": "Edite, duplique ou exclua qualquer preset. \"Restaurar padrões\" traz os originais de volta.",
  "presets.copySuffix": " (cópia)",
  "presets.form.name.placeholder": "Nome (ex.: Resumir em tópicos)",
  "presets.form.name.aria": "Nome do preset",
  "presets.form.instruction.placeholder": "Instrução: o que esse preset deve fazer com o texto",
  "presets.form.instruction.aria": "Instrução",
  "presets.form.exampleInput.placeholder": "Exemplo de entrada (opcional)",
  "presets.form.exampleInput.aria": "Exemplo de entrada",
  "presets.form.exampleOutput.placeholder": "Exemplo de saída (opcional)",
  "presets.form.exampleOutput.aria": "Exemplo de saída",
  "presets.save": "Salvar",
  "presets.create": "Criar",
  "presets.cancel": "Cancelar",
  "presets.badge.edited": "editado",
  "presets.edit": "Editar",
  "presets.duplicate": "Duplicar",
  "presets.delete": "Excluir",
  "presets.delete.confirm": "Confirmar exclusão",
  "presets.new": "+ Novo preset",
  "presets.restore": "Restaurar padrões",
  "presets.restore.title": "Traz os presets originais de volta (não mexe nos seus)",
  "presets.restore.confirm": "Confirmar restauração",
  "presets.restore.confirm.title": "Desfaz suas edições e exclusões dos presets padrão",
  "presets.fewShot": "Usar exemplos (few-shot)",
  "presets.fewShot.aria": "Usar exemplos",
  "presets.fewShot.yes": "Sim",
  "presets.fewShot.no": "Não",
  "presets.fewShot.on.help":
    "Cada preset manda um exemplo (entrada → saída) como turnos de conversa antes do seu texto. Costuma melhorar a qualidade da resposta da API.",
  "presets.fewShot.off.help":
    "Zero-shot: só a instrução do preset, sem exemplo. Útil pra comparar (A/B).",

  // ── Aba Início (InicioTab) ──
  "inicio.strip.mode": "modo {mode} · via API",
  "inicio.strip.mode.popup": "Mostrar popup",
  "inicio.strip.mode.instant": "Instantâneo",
  "inicio.strip.hint": "Selecione e aperte {mod} + {key} ×2",
  "inicio.month": "Este mês",
  "inicio.month.cost": "custo",
  "inicio.month.imprompts": "imprompts",
  "inicio.month.perImprompt": "por imprompt",
  "inicio.tokens": "Tokens",
  "inicio.tokens.month": "· {n} no mês",
  "inicio.tokens.aria": "Tokens: entrada {in} ({inPct}%), saída {out} ({outPct}%)",
  "inicio.tokens.in": "entrada",
  "inicio.tokens.out": "saída",
  "inicio.tokens.empty": "Sem tokens neste mês ainda — aparecem após o primeiro imprompt.",
  "inicio.spend": "Gastos por mês",
  "inicio.spend.empty": "Sem dados ainda. Seus gastos por mês aparecem aqui conforme você usa.",
  "inicio.spend.aria": "Gastos por mês: {list}",
  "inicio.spend.rowTitle": "{month}: {n} imprompt(s) · ~US$ {cost}",
  "inicio.spend.hint": "As barras dos meses anteriores entram aqui conforme você usa.",
  "inicio.shortcuts": "Atalhos",
  "inicio.short.presets.default": "padrão: {label}",
  "inicio.short.gatilho.sub": "{mod}+{key} ×2 · {action}",
  "inicio.short.gatilho.replace": "substitui",
  "inicio.short.gatilho.copy": "copia",
  "inicio.short.sobre.sub": "autostart · versão",

  // ── Aba Histórico (HistoricoTab) ──
  "historico.title": "Histórico de imprompts",
  "historico.today": "Hoje",
  "historico.yesterday": "Ontem",
  "historico.empty": "Nenhum imprompt nesta sessão. Seus imprompts aparecem aqui — e não são salvos no disco.",
  "historico.aria.original": "original",
  "historico.aria.result": "resultado",

  // ── Popup (palette) ──
  "popup.output.replace": "vai substituir o texto",
  "popup.output.clipboard": "vai copiar pra área de transferência",
  "popup.badge.api": "API · {model}",
  "popup.badge.noModel": "(modelo não definido)",
  "popup.error.fallback": "Não consegui concluir o imprompt. Verifique a configuração da API nas Preferências.",
  "popup.head.sub": "Texto capturado",
  "popup.capture.empty": "(nada capturado — selecione um texto)",
  "popup.capture.collapse": "Recolher",
  "popup.capture.expand": "Expandir",
  "popup.presets.label": "Preset",
  "popup.dialog.aria": "Fazer um imprompt",
  "popup.note.selectAgain": "Selecione um texto e dispare o atalho de novo",
  "popup.result.error": "Erro",
  "popup.result.title": "Resultado",
  "popup.action.apply": "Aplicar",
  "popup.action.copy": "Copiar",
  "popup.action.copy.title": "Copiar para a área de transferência",
  "popup.action.redo": "Refazer",
  "popup.action.redo.title": "Fazer de novo",

  // ── Aba Geral (GeralTab) ──
  "geral.autostart": "Iniciar com o sistema",
  "geral.autostart.no": "Não",
  "geral.autostart.yes": "Sim",
  "geral.autostart.on.help":
    "O Imprompt abre junto com o sistema, já escondido na bandeja, pronto pro Ctrl+C×2.",
  "geral.autostart.off.help": "Abra o Imprompt manualmente quando quiser usá-lo.",
  "geral.language": "Idioma",
  "geral.language.help": "Escolha o idioma da interface.",
  "geral.support.title": "Apoiar o Imprompt",
  "geral.support.desc": "Open-source e gratuito. Se ele te ajuda, você pode apoiar o projeto.",
  "geral.support.button": "Doar",
};

export const CATALOG = { en, "pt-BR": ptBR } as const;
export type Key = keyof typeof en;
