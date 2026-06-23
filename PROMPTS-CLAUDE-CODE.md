# 🤖 Prompts prontos pro Claude Code — Imprompt

Aqui estão os prompts **completos e fechados**. Cada um já tem todo o contexto e
os detalhes embutidos — **é só copiar e colar, sem precisar acrescentar nada.**

## Como usar

1. Abra o Claude Code **dentro da pasta do projeto** (`imprompt/`).
2. No começo de cada sessão, cole o **Prompt 0** uma vez (dá o contexto inteiro).
3. Depois, cole os prompts **na ordem** (1, 2, 3…). Entre cada um, rode a
   verificação que o próprio prompt manda.
4. Travou? Use o **Prompt SOS** lá no fim.

> Estes prompts substituem (e expandem) os blocos resumidos do
> `GUIA-DE-CONSTRUCAO.md`. O guia continua sendo o mapa com as travas de
> verificação; este arquivo é o que você cola no Claude Code em cada passo.

---

## 🧭 PROMPT 0 — Contexto mestre (cole no início de cada sessão)

```
Você vai me ajudar a construir um app chamado Imprompt. Antes de qualquer código,
leia estes arquivos do repositório para entender tudo:
- README.md
- GUIA-DE-CONSTRUCAO.md
- reference/prototype.html  (o protótipo visual interativo — a referência de UI)
- todos os arquivos em src-tauri/src/ e em src/

Contexto do produto:
Imprompt é um utilitário de desktop que melhora prompts de IA. O usuário seleciona
um texto em qualquer programa, dá um duplo Ctrl+C, e o app reescreve/aprimora o
texto na hora — substituindo no lugar ou deixando no clipboard. É inspirado no
Handy (github.com/cjpais/Handy), trocando o modelo de transcrição por um LLM
acessado via API externa.

Arquitetura:
- Casca: Tauri 2 (Rust no backend, React+TS no frontend).
- Motor: ApiEngine (src-tauri/src/api_engine.rs) — ÚNICO motor. Ele fala com um
  endpoint externo no formato OpenAI (/v1/chat/completions). O app é API-only:
  não há modelo embutido. O usuário configura Base URL + modelo + chave de API.
- O engine.rs contém só a `trait Engine` e a função `clean_output` (saneamento da
  saída), compartilhadas pelo ApiEngine.
- A chave de API fica no cofre do SO (keyring, via secrets.rs), nunca em texto
  puro nas settings. Base URL e modelo ficam nas settings.
- Há um contador de uso/custo do mês (usage.rs), exibido na aba Motor.
- Gatilho: Ctrl+C×2 com debounce (1º Ctrl+C é copy normal; 2º rápido ativa).
- Presets: cada um é um system prompt (em presets.rs) — padrão + custom.
- Dois modos: Instantâneo (sem popup) e Popup (escolhe preset a cada vez).
- Saída: substituir no lugar OU jogar no clipboard.

Convenções:
- Não invente dependências novas sem me avisar.
- Toda mudança em Rust precisa passar `cargo check` antes de você dizer "pronto".
- Não reintroduza modelo local, llama.cpp, GGUF, download de modelo nem GPU/CUDA.
  O projeto é deliberadamente API-only.

NÃO escreva código agora. Depois de ler tudo, me dê:
1. Um resumo de 6 linhas confirmando que entendeu a arquitetura.
2. Uma lista (TodoWrite) das tarefas que faltam, na ordem em que devem ser feitas.
Aí eu te passo a primeira tarefa.
```

---

## ⚙️ PROMPT 1 — Configuração da API + teste de conexão

```
Tarefa: garantir o fluxo completo de configuração do motor na aba "Motor" da UI
(src/App.tsx) e no backend, já que o Imprompt é API-only e o ApiEngine
(src-tauri/src/api_engine.rs) é o único motor.

O que precisa existir e funcionar:
1. Campos na aba Motor: Base URL (ex.: https://api.openai.com/v1), Modelo
   (ex.: gpt-4o-mini) e Chave de API.
2. Persistência:
   - Base URL e Modelo são salvos nas settings (settings.rs / a persistência
     normal de settings já usada no projeto).
   - A Chave de API é gravada no COFRE DO SO via secrets.rs (keyring), NUNCA no
     arquivo de settings. Ao reabrir o app, a UI deve indicar se já existe uma
     chave salva (sem exibir o valor).
3. Botão "Testar conexão": um comando Tauri que monta o ApiEngine com a Base URL,
   o modelo e a chave atuais, faz UMA chamada curta ao endpoint
   (/v1/chat/completions, formato OpenAI) e retorna sucesso ou a mensagem de erro
   do provedor (auth, modelo inexistente, etc.).
4. Uso/custo: mantenha intacto o contador de uso/custo do mês (usage.rs) exibido
   na aba Motor — não quebre essa parte.

Restrições:
- Não reintroduza modelo local, llama.cpp, GGUF, download de modelo nem CUDA/GPU.
- Não mexa em clean_output nem na `trait Engine` (engine.rs) além do necessário.

Verificação: rode `cd src-tauri && cargo check`, depois `npm run tauri dev`.
Na aba Motor, preencha Base URL/modelo/chave e clique "Testar conexão" — deve
retornar sucesso. Confirme que a chave foi pro cofre (não está no settings.json).
Reporte o que mudou.
```

---

## 🔬 PROMPT 2 — Teste de fumaça do motor (isolado)

```
Tarefa: validar o ApiEngine sozinho, antes de depender do gatilho global.

Adicione um comando Tauri TEMPORÁRIO em src-tauri/src/commands.rs chamado
`smoke_test` que:
- monta o ApiEngine com a configuração atual (Base URL e modelo das settings,
  chave de API lida do cofre via secrets.rs),
- roda a lógica de refine com o texto "faz um email pro meu chefe pedindo
  aumento" e o preset "detalhar",
- retorna o resultado como String.
Registre o comando no invoke_handler em lib.rs. Depois me diga exatamente como
chamá-lo — pode ser adicionando um botão temporário "Testar motor" na UI
(src/App.tsx) que faz invoke("smoke_test") e mostra o retorno num alert/console.

Verificação: rode `npm run tauri dev`, garanta que a API está configurada (aba
Motor) e acione o smoke_test. O retorno deve ser um prompt visivelmente
melhorado. Quando funcionar, me lembre de remover o smoke_test e o botão
temporário depois.
```

---

## 🪟 PROMPT 3 — Construir a janela do popup (modo "Mostrar popup")

```
Tarefa: implementar a janela do popup, usada quando a preferência de Modo é
"popup". A referência visual e de comportamento já está no repositório, em
reference/prototype.html — leia o <div class="palette"> e o <script> dele.

O que fazer:
1. Crie src/popup.tsx (já existe um stub) com um componente React que reproduz a
   paleta do protótipo: o texto capturado (borda quente), a fileira de presets, o
   botão "Refinar", e o painel de resultado (borda fria) com os botões Aplicar e
   Copiar. Use o MESMO visual/tema.
2. Copie do reference/prototype.html para src/styles.css as regras de CSS que
   faltam para essa janela: .overlay, .backdrop, .palette, .palette-head,
   .capture, .presets-label, .actions, .refine, .result e afins. (As regras de
   .chip e os tokens :root já existem no styles.css — reaproveite.)
3. Lógica:
   - Carregue os presets com invoke("list_presets").
   - Receba o TEXTO CAPTURADO vindo do backend (ver passo 4).
   - Ao escolher um preset e confirmar (botão Refinar ou Enter):
       const refined = await invoke<string>("refine_text", { text, presetId });
     e mostre no painel de resultado.
   - Botão "Aplicar": chame um novo comando invoke("deliver_result", { text:
     refined }) — ver passo 5 — e feche a janela.
   - Botão "Copiar": copie o texto pro clipboard.
   - Teclado: Esc fecha a janela, Enter refina, teclas 1–6 escolhem preset.
4. No backend (src-tauri/src/lib.rs), ajuste `open_popup_window` para, depois de
   abrir/focar a janela "popup", EMITIR o texto capturado para ela via evento
   Tauri (ex: window.emit("captured-text", texto)). No popup.tsx, escute esse
   evento com listen() e preencha a captura. (Tem um TODO exatamente nesse ponto
   do lib.rs.)
5. Adicione em src-tauri/src/commands.rs um comando `deliver_result(text: String)`
   que lê o modo de saída das settings e chama clipboard::deliver(&text, modo).
   Registre-o no invoke_handler.

Verificação: rode `cd src-tauri && cargo check`, depois `npm run tauri dev`.
Na UI de Preferências, troque o Modo para "popup". Selecione um texto em outro
app, dê Ctrl+C×2: a janelinha central deve abrir já com o texto, deixar você
escolher um preset, mostrar o resultado, e aplicar/colar. Esc fecha. Reporte.
```

---

## 🎨 PROMPT 4 — Gerar os ícones do app

```
Tarefa: criar os ícones do Imprompt a partir do glifo da marca — um "caret"
(símbolo ^ estilizado, como uma ponta de lápis afiada) com gradiente que vai do
quente (#D58E63) ao frio (#5BD9B4). Esse glifo está no reference/prototype.html e
no loader.html; o SVG é:

    <svg viewBox="0 0 32 32">
      <rect x="1" y="1" width="30" height="30" rx="9" fill="#1B1D26"/>
      <path d="M9 21 L16 8 L23 21" fill="none" stroke="url(#grad)" stroke-width="2.4"
            stroke-linecap="round" stroke-linejoin="round"/>
      <path d="M12.5 17 L19.5 17" fill="none" stroke="url(#grad)" stroke-width="2.4"
            stroke-linecap="round"/>
    </svg>
    (grad = linearGradient de #D58E63 para #5BD9B4)

Gere os arquivos que o Tauri precisa, na pasta src-tauri/icons/:
- 32x32.png
- 128x128.png
- 128x128@2x.png (256x256)
- icon.icns (macOS)
- icon.ico (Windows)
- tray.png (ícone de bandeja, ~32x32, monocromático/legível em fundo claro e escuro)

Você pode usar o comando do Tauri (`npm run tauri icon caminho/para/fonte.png`)
gerando antes um PNG fonte 1024x1024 a partir do SVG acima. Depois confirme que o
tauri.conf.json (bundle.icon e trayIcon.iconPath) aponta pros arquivos certos.
Verificação: rode `npm run tauri dev` e confirme que o ícone aparece (janela e
bandeja). Reporte.
```

---

## 🛎️ PROMPT 5 — Bandeja, autostart e janela persistente

```
Tarefa: deixar o app rodando em segundo plano como um utilitário de verdade.

1. Menu da bandeja (tray): adicione um menu com os itens "Preferências" (mostra a
   janela main) e "Sair" (encerra o app). Use a API de tray do Tauri 2.
2. Janela persistente: fechar a janela de Preferências NÃO deve encerrar o app —
   ele continua na bandeja escutando o gatilho. Intercepte o evento de fechar da
   janela "main" e apenas esconda-a (hide) em vez de sair.
3. Autostart: adicione a opção de iniciar com o sistema e de iniciar escondido
   (sem abrir a janela), como o Handy faz. Use o plugin tauri-plugin-autostart se
   facilitar; adicione um toggle "Iniciar com o sistema" na UI de Preferências
   (src/App.tsx) que liga/desliga isso e persista nas settings.

Verificação: rode `npm run tauri dev`. Confirme: (a) ícone na bandeja com os dois
itens funcionando; (b) ao fechar a janela de Preferências, o app continua vivo e
o Ctrl+C×2 ainda funciona; (c) o toggle de autostart registra/desregistra o
início automático. Reporte cada um.
```

---

## 🛡️ PROMPT 6 — Robustez por plataforma

```
Tarefa: tratar as diferenças de sistema operacional.

1. Linux: o "colar" simulado é problemático no Wayland. Em src-tauri/src/settings.rs,
   faça o padrão de `output` ser Clipboard (Ctrl+V manual) quando o sistema for
   Linux, e Replace nos outros. Faça isso de forma condicional por plataforma na
   implementação de Default (use cfg!(target_os = "linux")).
2. macOS: o gatilho global e o "colar" exigem permissão de Acessibilidade.
   Adicione, na primeira execução, uma checagem/aviso amigável explicando que o
   usuário precisa permitir o Imprompt em Ajustes > Privacidade > Acessibilidade,
   com um botão que abre essa tela.
3. Linux/Wayland (gatilho): caso o listener global do rdev não funcione no
   compositor, me explique como configurar um atalho global do sistema apontando
   pro app (o padrão que o Handy usa), e exponha uma flag de linha de comando para
   acionar o refino sem o listener interno.

Verificação: descreva o que mudou em cada plataforma e como testar. Rode
`cargo check` para garantir que a compilação condicional está correta. Reporte.
```

---

## 🆘 PROMPT SOS — quando travar (preencha os colchetes)

```
Estou seguindo o GUIA-DE-CONSTRUCAO.md do Imprompt e travei.
- Fase/passo: [ex: Fase 4 — configurar a API / testar conexão]
- O que eu rodei: [comando ou ação]
- O erro/comportamento: [cole a mensagem de erro completa ou descreva o que
  aconteceu vs o que eu esperava]
- Meu sistema: [Windows / macOS / Linux X11 / Linux Wayland]

Resolva SÓ este problema, sem mudar outras partes do projeto. Se precisar de
informação atual (versão de crate, API), busque na docs.rs antes. Depois de
corrigir, me diga exatamente o que mudou e como eu verifico que voltou a
funcionar — para eu seguir o guia a partir daqui.
```

---

## Ordem recomendada

| # | Prompt | Resultado |
|---|---|---|
| 0 | Contexto mestre | Claude Code entende tudo + lista de tarefas |
| 1 | Configuração da API + teste de conexão | ApiEngine configurado, "Testar conexão" ok |
| 2 | Teste de fumaça do motor | refine via API validado isolado |
| — | *(teste o Ctrl+C×2 — Fase 5 do guia)* | fluxo instantâneo ponta a ponta 🎉 |
| 3 | Popup | modo popup funcionando |
| 4 | Ícones | app com cara de produto |
| 5 | Bandeja + autostart | utilitário de segundo plano de verdade |
| 6 | Robustez por SO | funciona bem em cada plataforma |

Cola o 0, depois 1 e 2, **testa o gatilho** (já tens o app utilizável!), e segue
com 3→6 pra completar. Travou em qualquer ponto: Prompt SOS.
```
