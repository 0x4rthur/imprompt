# Preparar um computador novo

Tudo o que é preciso para voltar a desenvolver, testar e publicar o Imprompt num
Windows limpo (por exemplo, depois de formatar). O código vem deste repositório;
o que **não** está no Git (chave de assinatura, dados do app) vem do backup
pessoal no Google Drive.

## 1. Ferramentas

| Ferramenta | Versão usada | Como instalar |
|---|---|---|
| Git | 2.53+ | <https://git-scm.com/download/win> (inclui o Git Bash, usado no build de release) |
| GitHub CLI | 2.9x | `winget install GitHub.cli`, depois `gh auth login` |
| Node.js | 24 (ver `.nvmrc`) | <https://nodejs.org> ou `winget install OpenJS.NodeJS` |
| Rust | stable (ver `rust-toolchain.toml`) | <https://rustup.rs> |
| Visual Studio Build Tools 2022 | workload **"Desenvolvimento para desktop com C++"** (MSVC + Windows SDK) | <https://visualstudio.microsoft.com/visual-cpp-build-tools/> — exigido pelo Tauri no Windows |
| WebView2 | já vem no Windows 11 | — |
| Python 3 + `cryptography` | 3.13 | <https://python.org>, depois `pip install cryptography` (só para o script de release) |

Opcional, para o site (repositório privado `0x4rthur/imprompt-site`): `pnpm` e a CLI
da Vercel (`npm i -g pnpm vercel`).

## 2. Código

```bash
git clone https://github.com/0x4rthur/imprompt C:/dev/imprompt
cd C:/dev/imprompt
npm ci
```

Clone em `C:\dev\imprompt`: as anotações do Claude Code sobre o projeto ficam
numa pasta cujo nome deriva desse caminho (`~\.claude\projects\C--dev-imprompt\`).

## 3. O que vem do backup (Google Drive)

| Do backup | Para |
|---|---|
| `1-chave-de-assinatura/imprompt-updater.key` e `.key.pub` | `C:\Users\<você>\.tauri\` |
| `2-memoria-do-claude/*.md` | `C:\Users\<você>\.claude\projects\C--dev-imprompt\memory\` |
| `3-dados-do-app/*.json` (presets, configurações, uso) | `%APPDATA%\imprompt\` — com o Imprompt **fechado** |

A chave privada é o que permite publicar atualizações que o app instalado aceita
(ver `docs/UPDATER.md`). Nunca a coloque no repositório.

As chaves de API **não** estão no backup: o app as guarda no Gerenciador de
Credenciais do Windows. Depois de instalar o Imprompt, cole a chave de novo na aba
API (pegue-a no painel do provedor).

## 4. Conferir que tudo funciona

```bash
npm run typecheck
npm test
npm run build
cd src-tauri && cargo fmt --all --check && cargo clippy --all-targets -- -D warnings && cargo test
```

Para ver a interface sem o backend Rust: `npm run dev:mock` (abre em
<http://localhost:5174>; aceita `?lang=en`, `?empty=1`, `?err=1`, `?lowbal=1`).
Para o app de verdade: `npm run tauri dev`.

## 5. Publicar uma versão

Ver `docs/UPDATER.md` → **"Publicar uma versão (passo a passo)"**. O script
`scripts/release-assets.py` confere a assinatura e gera o `latest.json` e o
`SHA256SUMS.txt`.

## 6. Site (opcional)

```bash
git clone https://github.com/0x4rthur/imprompt-site C:/dev/imprompt_site
cd C:/dev/imprompt_site
pnpm install
vercel link   # escolha o projeto imprompt_site
```
