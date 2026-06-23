# Imprompt

**Melhore qualquer prompt sem sair do lugar. Rápido, via API, sem trocar de janela.**

Selecione um texto em qualquer aplicativo, dê um **duplo Ctrl+C**, e o Imprompt
reescreve/aprimora o seu prompt na hora — substituindo no lugar ou deixando
pronto pra colar. O refino roda numa **API de LLM** no formato OpenAI (OpenAI,
OpenRouter, DeepSeek, Gemini e compatíveis): você escolhe o provedor e o modelo.

Inspirado na arquitetura do [Handy](https://github.com/cjpais/Handy) (o app
open-source de transcrição), trocando o modelo de fala-pra-texto por um **LLM**
dedicado a melhorar prompts.

---

## Como funciona (visão geral)

```
   Você seleciona texto  →  Ctrl+C (copia)  →  Ctrl+C (ativa, dentro de ~400ms)
                                                        │
                                                        ▼
                              ┌──────────────────────────────────────────┐
                              │  Imprompt (rodando em segundo plano)       │
                              │                                            │
                              │  1. lê o texto do clipboard                │
                              │  2. mostra a janelinha "Refinando…"      │
                              │  3. refina com o preset escolhido          │
                              │     (chamada à API do provedor)            │
                              │  4. entrega: substitui no lugar OU clipboard│
                              └──────────────────────────────────────────┘
```

Dois modos (configuráveis nas Preferências):

- **Instantâneo (padrão):** usa o seu preset padrão na hora, sem popup. Mais rápido.
- **Popup:** abre uma janelinha pra você escolher o preset a cada ativação.

E o resultado pode **substituir o texto** automaticamente ou ir **pro clipboard**
(você dá Ctrl+V onde quiser).

---

## Decisões de arquitetura

| Decisão | Escolha | Por quê |
|---|---|---|
| Casca do app | **Tauri 2** (Rust + React) | Leve, multiplataforma, mesma do Handy |
| Motor de IA | **API externa** (compatível com OpenAI) | Qualidade e velocidade muito melhores, sem o peso de um modelo na máquina |
| Provedores | OpenAI, OpenRouter, DeepSeek, Gemini… | Só trocar a **Base URL** e o **modelo** |
| Chave de API | **Cofre de credenciais do SO** | Windows Credential Manager / macOS Keychain / Linux Secret Service — nunca em texto puro no disco |
| Gatilho | **Ctrl+C×2 com debounce** | O 1º Ctrl+C é o copy normal; o 2º (rápido) ativa. Não quebra o copy do sistema |
| Presets | **System prompts** | Adicionar preset = adicionar texto. Sem retreino |

### Por que só API (e não um modelo local)?

A ideia original previa um modelo local embutido (llama.cpp). Mas, **pelos testes,
rodar um modelo local não compensava para este app**: a qualidade e a latência num
modelo pequeno o suficiente pra rodar na máquina do usuário ficavam aquém do que a
tarefa exige, e o app inchava (vários GB de modelo, build nativo pesado, GPU/CUDA).

A API entrega qualidade e velocidade muito superiores por **centavos por refino**.
O trade-off consciente é que o texto selecionado **sai da máquina** para o provedor
que você configurar — a UI deixa isso explícito. A chave de API fica no **cofre de
credenciais do sistema**, nunca em texto puro.

---

## Estrutura do projeto

```
imprompt/
├── README.md                    ← você está aqui
├── package.json                 ← deps do frontend (React + Vite + Tauri CLI)
├── vite.config.ts               ← multi-página: main / loader / popup
├── index.html                   ← janela de Preferências
├── loader.html                  ← micro-janela "Refinando…" (sem bordas)
├── popup.html                   ← janela do modo popup
├── src/
│   ├── main.tsx                 ← entry React
│   ├── App.tsx                  ← UI de Preferências (abas, presets, modos)
│   ├── popup.tsx                ← janela do modo popup
│   ├── ConnectionStatus.tsx     ← saúde da conexão com o provedor de API
│   ├── tabs/                    ← abas: Início, Motor (API), Presets, Gatilho, Geral
│   └── styles.css               ← design tokens (tema ink + warm/cool)
└── src-tauri/
    ├── Cargo.toml               ← deps Rust (tauri, reqwest, rdev, arboard, enigo, keyring…)
    ├── tauri.conf.json          ← config das janelas, tray, bundle
    ├── build.rs
    └── src/
        ├── main.rs              ← ponto de entrada do binário
        ├── lib.rs               ← cola tudo: sobe o gatilho, roda o FLUXO
        ├── api_engine.rs        ← ★ o motor: chama a API (formato OpenAI) e refina
        ├── engine.rs            ← ★ trait Engine + clean_output (saneamento da saída)
        ├── presets.rs           ← ★ os presets + montagem do system prompt
        ├── hotkey.rs            ← ★ detector de Ctrl+C×2 com debounce
        ├── clipboard.rs         ← captura a seleção + cola de volta
        ├── secrets.rs           ← chave de API no cofre de credenciais do SO
        ├── usage.rs             ← contador de uso/custo da API (por mês)
        ├── settings.rs          ← preferências + persistência em JSON
        └── commands.rs          ← comandos Tauri (ponte com a UI)
```

★ = os módulos com a lógica de verdade, que valem a leitura primeiro.

---

## O que já está pronto

- Motor de API (formato OpenAI) com timeout/deadline e mensagens de erro claras (`api_engine.rs`)
- Saneamento da saída do modelo, com testes (`engine.rs`)
- Detector de Ctrl+C×2 com debounce, com testes (`hotkey.rs`)
- Os presets e a montagem do system prompt (`presets.rs`)
- Captura de clipboard + colagem multiplataforma (`clipboard.rs`)
- Chave de API no cofre do SO + teste de conexão (`secrets.rs`, `commands.rs`)
- Contador de uso/custo do mês (`usage.rs`)
- Persistência de preferências (`settings.rs`)
- O FLUXO completo do gatilho à entrega, com histórico e "desfazer" (`lib.rs`)
- UI de Preferências funcional (abas Início/Motor/Presets/Gatilho/Geral), ligada ao backend
- Bandeja (tray), auto-start no boot e atualização automática assinada (ver `UPDATER.md`)

---

## Como rodar

Pré-requisitos: [Rust](https://rustup.rs), [Node.js](https://nodejs.org) e as
[dependências de sistema do Tauri](https://tauri.app/start/prerequisites/).
(Não é mais necessário clang/CMake/CUDA — o app não compila nada em C++.)

```bash
# 1. instalar deps do frontend
npm install

# 2. rodar em modo dev (abre a janela de Preferências, recompila ao salvar)
npm run tauri dev

# 3. gerar o app instalável
npm run tauri build
```

### Configurar a API

Abra as **Preferências → aba Motor**, informe a **Base URL** (ex.:
`https://api.openai.com/v1`), o **modelo** (ex.: `gpt-4o-mini`) e a **chave de API**,
e clique em **"Aplicar e testar"**. A chave é guardada no cofre de credenciais do
sistema; a Base URL e o modelo ficam no `settings.json`.

---

## Próximos passos sugeridos

1. Presets customizáveis pelo usuário (já dá: é só persistir uma lista de `Preset`).
2. Atalho configurável (hoje o Ctrl+C×2 e a janela de ~400ms estão fixos).
3. Auto-start no boot com opção de iniciar escondido (igual o Handy: `--start-hidden`).
4. Streaming da resposta da API no popup (mostrar o texto chegando token a token).

---

## Licença

Defina a sua.

---

*Construído usando o Handy como referência de arquitetura. Obrigado ao
[@cjpais](https://github.com/cjpais) pelo trabalho open-source.*
