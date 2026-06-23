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
