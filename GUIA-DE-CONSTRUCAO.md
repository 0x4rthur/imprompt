# 🛠️ Guia de Construção do Imprompt — passo a passo (Claude Code)

Este é o **roteiro mestre**. Rode os passos **na ordem**, de cima pra baixo.
Cada fase termina com uma **✅ Verificação** — só avance pra próxima quando ela
passar. É assim que a gente garante que nada conflita: o erro aparece cedo e
isolado, nunca tudo de uma vez.

## Como ler este guia

- 🖥️ **Bloco de terminal** = comando que VOCÊ roda no terminal.
- 🤖 **"Peça ao Claude Code"** = prompt que você cola no Claude Code pra ele
  escrever/ajustar código.
- ✅ **Verificação** = como confirmar que a fase deu certo antes de seguir.
- ⚠️ **Se der erro** = o que fazer quando algo falha (não force, resolva ali).

## 🔑 As 3 regras de ouro (contra conflito)

1. **Compile depois de CADA fase.** Nunca acumule mudanças sem testar.
2. **Trabalhe numa branch**, nunca direto na `main`.
3. **Configure um endpoint só** (uma Base URL + um modelo) pra validar rápido; troca depois.

---

# FASE 0 — Pré-requisitos

Instale e confirme tudo isto ANTES de começar. É o que evita 90% dos perrengues.
A boa notícia: o Imprompt é **API-only**, então o build é enxuto — sem toolchains
de C++, sem CMake, sem nada de compilar inferência nativa.

🖥️ Verifique o que você já tem:
```bash
rustc --version     # precisa de Rust (rustup.rs)
node --version      # precisa de Node 18+
git --version
```

Se faltar algo:
- **Rust:** https://rustup.rs
- **Node:** https://nodejs.org (versão LTS)
- **Deps de sistema do Tauri:** siga https://tauri.app/start/prerequisites/
  (no Linux são uns pacotes `libwebkit2gtk`, `libgtk`, etc.)

✅ **Verificação:** os 3 comandos acima respondem com uma versão. Sem isso, não
adianta seguir.

---

# FASE 1 — Fundação do projeto

Você já tem o scaffold pronto (o `imprompt-scaffold.zip` que eu te passei). Vamos
partir dele em vez de gerar do zero — é mais rápido e já está estruturado.

🖥️ Descompacte e inicialize o git:
```bash
# extraia o zip onde você quer o projeto, depois:
cd imprompt
git init
git add -A
git commit -m "scaffold inicial do Imprompt"
git checkout -b dev
```

🤖 **Peça ao Claude Code** (pra ele entender o projeto inteiro antes de tudo):
```
Leia o README.md e todos os arquivos em src-tauri/src/ e src/ deste projeto.
É um app Tauri (Rust + React) que melhora prompts via API externa (formato
OpenAI), inspirado no Handy. Me dê um resumo de 5 linhas confirmando que você
entendeu a arquitetura: o gatilho Ctrl+C×2, o ApiEngine (motor único, via API),
os presets, e o que está marcado como TODO. NÃO escreva código ainda — só
confirme que entendeu.
```

✅ **Verificação:** o Claude Code descreve corretamente o fluxo (Ctrl+C×2 →
captura → refina via API → entrega) e identifica que o motor é o `ApiEngine`
(em `api_engine.rs`), com a `trait Engine` e o `clean_output` morando em
`engine.rs`. Se ele entendeu, pode seguir.

---

# FASE 2 — Primeira compilação do backend

Aqui a gente valida a árvore de dependências Rust **isolada**, antes de mexer em
mais nada. Como o motor é via API (sem nada de C++ embutido), essa fase é rápida.

🖥️ Compile só o backend, sem rodar nada ainda:
```bash
cd src-tauri
cargo check
```

> ⏳ A **primeira** vez baixa e compila as crates do Tauri e do cliente HTTP —
> alguns minutos. Bem mais leve que antes. Vá tomar um café (curto).

⚠️ **Se der erro:**
- Erro de versão de alguma crate (reqwest, rdev, arboard, enigo) → geralmente é
  versão. **Peça ao Claude Code:**
  ```
  O `cargo check` falhou com este erro: [cole o erro]. Busque na docs.rs a versão
  estável mais recente da crate envolvida e ajuste a versão no Cargo.toml. Só mexa
  na linha da dependência.
  ```

✅ **Verificação:** `cargo check` termina **sem erros** (warnings tudo bem).
Esse é o checkpoint que prova que o backend compila na sua máquina. **Não
avance sem isso.**

---

# FASE 3 — Subir o frontend e ver a janela

Agora a UI de Preferências. Os comandos `list_presets` e `get_settings` já
funcionam (não dependem da API), então a tela já carrega.

🖥️ Instale as deps do frontend e rode em dev:
```bash
cd ..          # volta pra raiz do projeto
npm install
npm run tauri dev
```

> A primeira vez também demora (compila o app Tauri inteiro). Depois é rápido.

✅ **Verificação:** abre a **janela de Preferências** do Imprompt, mostrando:
a aba **Motor** (campos de Base URL, modelo e chave de API), os presets, e os
toggles de Modo e Saída. Clicar nos toggles deve trocar o texto de ajuda embaixo.
(O refino ainda não funciona — falta configurar a API na próxima fase.)

⚠️ **Se a janela não abrir:** veja o terminal. Erro de frontend → peça ao Claude
Code pra revisar `src/App.tsx` e `src/main.tsx`. Erro de Rust → volte à Fase 2.

---

# FASE 4 — Configurar o motor (ApiEngine) e testar a conexão ⭐

O motor do Imprompt é o **ApiEngine** (em `api_engine.rs`): ele fala com um
endpoint externo no **formato OpenAI** (`/v1/chat/completions`). Não há modelo
embutido — você aponta pra uma API (OpenAI, ou qualquer compatível: OpenRouter,
Groq, Together, etc.).

🖥️ Rode o app e abra a aba **Motor**:
```bash
npm run tauri dev
```

Na aba **Motor**, preencha:
- **Base URL:** o endpoint do provedor (ex.: `https://api.openai.com/v1`).
- **Modelo:** o identificador do modelo (ex.: `gpt-4o-mini`).
- **Chave de API:** sua chave. Ela é guardada no **cofre do sistema operacional**
  (keyring), nunca em texto puro no arquivo de settings.

Depois clique em **Testar conexão**.

🤖 **Se faltar o botão "Testar conexão" ou o salvamento da chave, peça ao Claude
Code:**
```
Na aba Motor da UI (src/App.tsx) e no backend, garanta o fluxo de configuração da
API:
- Base URL e modelo são salvos nas settings (settings.rs / persistência normal).
- A chave de API é gravada no cofre do SO via secrets.rs (keyring), nunca no
  arquivo de settings.
- Um botão "Testar conexão" que chama um comando Tauri que faz uma chamada curta
  ao ApiEngine (api_engine.rs) com a Base URL/modelo/chave atuais e retorna
  sucesso ou a mensagem de erro do provedor.
Rode `cargo check` e `npm run tauri dev` e me diga como testar.
```

✅ **Verificação:** "Testar conexão" retorna sucesso. Se der erro de
autenticação, confira a chave; se der erro de modelo, confira o identificador na
Base URL escolhida. Quando passar, o cérebro do app está pronto.

---

# FASE 5 — Refino real, ponta a ponta

Hora da verdade: validar o refino real. Primeiro num teste isolado, depois no
fluxo completo do gatilho — pra você não debugar tudo de uma vez.

🤖 **Peça ao Claude Code** (teste isolado do motor — antes do gatilho):
```
Quero testar o motor isoladamente antes de depender do gatilho global. Adicione
um comando Tauri temporário `smoke_test` que: usa o ApiEngine com a configuração
atual (Base URL, modelo, chave do cofre), roda refine_text com o texto "faz um
email pro meu chefe pedindo aumento" e o preset "detalhar", e retorna o resultado.
Depois me diga como chamá-lo (posso adicionar um botão temporário na UI ou usar o
console do devtools). Quando funcionar, a gente remove esse comando.
```

✅ **Verificação 1 (motor):** o `smoke_test` devolve um prompt visivelmente
melhorado. Se sim, o cérebro funciona. 🎉

✅ **Verificação 2 (fluxo completo):** feche o devtools. Em **qualquer** app
(um bloco de notas), selecione um texto e dê **Ctrl+C Ctrl+C** rápido. Deve
aparecer a janelinha **"Refinando…"** e o texto ser substituído pelo refinado.

⚠️ **Se o gatilho não disparar:** no Linux/Wayland os atalhos globais precisam de
config extra (igual o Handy). **Peça ao Claude Code:**
```
O gatilho Ctrl+C×2 não dispara no meu sistema [diga: Windows / macOS / Linux-X11
/ Linux-Wayland]. Revise src-tauri/src/hotkey.rs e o setup em lib.rs. No macOS,
confirme as permissões de Acessibilidade. No Wayland, me explique como configurar
um atalho global do sistema apontando pro app (como o Handy faz com CLI flags).
```

---

# FASE 6 — A janela do popup (modo "Mostrar popup")

Até aqui só o modo Instantâneo funciona. Agora o popup de escolher preset.

🤖 **Peça ao Claude Code:**
```
Implemente a janela do popup (modo de ativação "popup"). Use como base visual e
de lógica o protótipo HTML que eu tenho (imprompt-prototype.html — vou colar o
conteúdo dele / ou descreva o <div class="palette">). Crie src/popup.tsx que:
1. Recebe o texto capturado vindo do backend (via evento Tauri — ajuste
   open_popup_window em lib.rs pra emitir o texto pra janela "popup").
2. Mostra o texto capturado e os presets (invoke("list_presets")).
3. Ao confirmar um preset: chama invoke("refine_text", { text, presetId }).
4. Ao "Aplicar": entrega o resultado. Pra isso, exponha um novo comando Tauri
   `deliver_result(text)` que chama clipboard::deliver com o modo das settings.
5. Esc fecha, Enter refina, teclas 1–6 escolhem preset.
Mantenha o mesmo tema visual (tokens em src/styles.css). Rode cargo check e
npm run tauri dev e teste trocando a preferência de Modo pra "popup".
```

✅ **Verificação:** com Modo = "popup", o Ctrl+C×2 abre a janelinha central,
você escolhe um preset, vê o resultado e aplica. Esc fecha.

---

# FASE 7 — Polimento

Agora os detalhes que fazem parecer produto de verdade.

🤖 **Peça ao Claude Code** (ícones):
```
Crie os ícones do app a partir do glifo do Imprompt (o "caret" com gradiente
warm→cool que está no loader.html). Gere os tamanhos que o Tauri precisa em
src-tauri/icons/ (32x32.png, 128x128.png, icon.icns, icon.ico, tray.png) e
confirme que o tauri.conf.json aponta pra eles.
```

🤖 **Peça ao Claude Code** (bandeja + autostart):
```
1. Adicione um menu na bandeja (tray) com: abrir Preferências, e Sair.
2. Adicione a opção de iniciar com o sistema e iniciar escondido (como o Handy
   com --start-hidden). Use o plugin tauri-plugin-autostart se ajudar.
3. Garanta que fechar a janela de Preferências NÃO fecha o app (ele continua na
   bandeja, escutando o gatilho).
Teste cada item.
```

🤖 **Peça ao Claude Code** (robustez — Linux):
```
No Linux, ajuste o padrão de saída pra "clipboard" (Ctrl+V manual) em vez de
"substituir", já que o colar simulado é problemático no Wayland (mesmo motivo do
Handy). Faça isso de forma condicional por plataforma nas settings padrão.
```

✅ **Verificação:** ícone aparece na bandeja, app continua rodando com a janela
fechada, e o gatilho funciona mesmo com a janela de Preferências fechada.

---

# FASE 8 — Build de release

🖥️ Gere o instalável:
```bash
npm run tauri build
```

✅ **Verificação:** o instalador é gerado em `src-tauri/target/release/bundle/`.
Instale numa máquina limpa (ou outra pasta), abra, configure a API na aba Motor,
e teste o Ctrl+C×2. Esse é o teste final: **um app leve que refina via API, com a
chave guardada no cofre do SO.**

🖥️ Commit final:
```bash
git add -A
git commit -m "Imprompt v0.1 funcional"
```

---

# 🗺️ Resumo do caminho

| Fase | O quê | Verificação |
|---|---|---|
| 0 | Pré-requisitos | rustc/node/git respondem |
| 1 | Fundação + git | Claude Code entendeu o projeto |
| 2 | Compilar backend | `cargo check` passa |
| 3 | Subir frontend | janela de Preferências abre |
| 4 | Configurar a API (ApiEngine) | "Testar conexão" retorna sucesso |
| 5 | Refino ponta a ponta | Ctrl+C×2 refina de verdade 🎉 |
| 6 | Popup | modo popup funciona |
| 7 | Polimento | tray + autostart + Linux ok |
| 8 | Release | instalável funciona em máquina limpa |

## Se travar em qualquer ponto

Não force. Pare na fase, e peça ao Claude Code: *"Estou na Fase X do guia de
construção, no passo [tal], e aconteceu [erro]. Me ajude a resolver só isso antes
de eu seguir."* Resolver isolado é o que mantém tudo orquestrado.

**Ordem de prioridade se você tiver pouco tempo:** Fases 0→5 já te dão o app
funcionando no modo Instantâneo (o principal). Popup e polimento (6→8) são
incrementos.
