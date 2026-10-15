# Atualização automática (Tauri Updater)

O Imprompt usa o **`tauri-plugin-updater`** oficial. Em resumo:

1. O app consulta um **endpoint** (`plugins.updater.endpoints` no `tauri.conf.json`)
   que devolve um **`latest.json`**.
2. Compara a versão de lá com a versão atual do app.
3. Se for mais nova, **baixa o instalador assinado**, **verifica a assinatura**
   com a **chave pública** do `tauri.conf.json`, instala e reinicia.

Comportamento no app:
- **Startup e a cada seis horas:** checagem silenciosa. Se houver versão nova, aparece uma notificação
  e o banner "Atualização disponível" na janela de Preferências.
- **Bandeja → "Verificar atualizações":** checa sob demanda (avisa achando ou não)
  e abre as Preferências, onde o banner oferece **Baixar e reiniciar**.
- **Sobre → Atualizações:** mostra a versão instalada, permite verificar sob demanda,
  baixar e instalar. O progresso e os erros aparecem no painel; falhas permitem
  tentar novamente. A assinatura é validada antes da instalação.

---

## 1. Chaves de assinatura (você é o dono)

Já foram geradas:

- **Privada:** `C:\Users\arthu\.tauri\imprompt-updater.key` (gerada **sem senha**; cópia de segurança no Google Drive pessoal — ver `docs/SETUP.md`).
- **Pública:** `C:\Users\arthu\.tauri\imprompt-updater.key.pub` → já está no
  `tauri.conf.json` em `plugins.updater.pubkey`.

> ⚠️ **A chave privada é o segredo do updater.** Faça backup dela. **Nunca**
> comite no repositório. Se perdê-la, você **não consegue mais assinar updates**
> que os apps já instalados aceitem — teria que redistribuir o app com uma chave
> nova. (Para produção, considere regenerar **com senha**:
> `npm run tauri signer generate -w <caminho>` e guarde a senha.)

---

## 2. O que VOCÊ precisa hospedar

### a) O `latest.json` (no endpoint configurado)

O endpoint no `tauri.conf.json` aponta pro seu repositório (`0x4rthur/imprompt`):

```
https://github.com/0x4rthur/imprompt/releases/latest/download/latest.json
```

Os releases assinados ficam nesse repo (ou aponte para o seu servidor). O `latest.json` tem este formato:

```json
{
  "version": "0.2.0",
  "notes": "Correções e melhorias.",
  "pub_date": "2026-06-17T12:00:00Z",
  "platforms": {
    "windows-x86_64": {
      "signature": "<conteúdo do arquivo .sig do instalador>",
      "url": "https://github.com/0x4rthur/imprompt/releases/download/v0.2.0/Imprompt_0.2.0_x64-setup.exe"
    }
  }
}
```

- `version` deve ser **maior** que a versão instalada para disparar o update.
- `signature` = **o conteúdo** do arquivo `.sig` gerado no build (não o caminho).
- `url` = onde o instalador está hospedado (acessível sem login).
- Outras plataformas, se for distribuir: `darwin-x86_64`, `darwin-aarch64`,
  `linux-x86_64` (cada uma com seu artefato + `.sig`).
- O endpoint também aceita variáveis: `{{target}}`, `{{arch}}`, `{{current_version}}`
  (úteis se você servir um JSON dinâmico por plataforma).

### b) Os artefatos assinados

O instalador (no Windows, o `...-setup.exe` do NSIS) **e** o `.sig` correspondente,
no mesmo lugar apontado pela `url` (ex.: anexos do release do GitHub).

---

## 3. Publicar uma versão (passo a passo)

É o fluxo usado em todas as releases desde a 0.1.6. Rode os comandos no
**Git Bash** (no PowerShell, `$env:TAURI_SIGNING_PRIVATE_KEY_PASSWORD = ""` *apaga* a
variável e o build trava pedindo senha depois de gerar o instalador).

1. **Branch e versão.** Numa branch nova a partir do `main`, suba a versão em
   `package.json`, `package-lock.json` (2 lugares), `src-tauri/Cargo.toml`,
   `src-tauri/Cargo.lock` (pacote `imprompt`) e `src-tauri/tauri.conf.json`, e
   escreva as notas em `docs/releases/vX.Y.Z.md` (viram o texto da atualização).
2. **Conferir:** `npm run typecheck && npm test && npm run build` e, em
   `src-tauri/`, `cargo fmt --all --check && cargo clippy --all-targets -- -D warnings && cargo test`.
3. **PR:** commit, `git push -u origin <branch>` e `gh pr create --base main`.
   O CI (`.github/workflows/ci.yml`, ~7 min) roda as mesmas verificações.
4. **Build assinado** (Git Bash, na raiz do repositório):
   ```bash
   export TAURI_SIGNING_PRIVATE_KEY="$(cat ~/.tauri/imprompt-updater.key)"
   export TAURI_SIGNING_PRIVATE_KEY_PASSWORD=""
   npm run tauri build -- --config src-tauri/tauri.release.conf.json < /dev/null
   ```
   Gera `src-tauri/target/release/bundle/nsis/Imprompt_X.Y.Z_x64-setup.exe` e o
   `.sig`. (Se ainda assim pedir senha: `npx tauri signer sign -f ~/.tauri/imprompt-updater.key -p "" <instalador>`.)
5. **Arquivos da release:** `python scripts/release-assets.py` — confere a
   assinatura contra a `pubkey` do `tauri.conf.json` (para se não bater), escreve
   `latest.json` e `SHA256SUMS.txt` ao lado do instalador e imprime o comando abaixo.
6. **Rascunho:** `gh release create vX.Y.Z --draft --target main --title "Imprompt vX.Y.Z" --notes-file docs/releases/vX.Y.Z.md`
   com os 4 arquivos (instalador, `.sig`, `latest.json`, `SHA256SUMS.txt`).
   Confira baixando de volta: `gh release download vX.Y.Z --dir conferir && (cd conferir && sha256sum -c SHA256SUMS.txt)`.
7. **Com o CI verde:** `gh pr merge <n> --rebase`, depois
   `gh release edit vX.Y.Z --draft=false --latest`.
8. **Verificar:** `https://github.com/0x4rthur/imprompt/releases/latest/download/latest.json`
   deve responder a versão nova. Os apps instalados a oferecem na próxima checagem.

Regras: não troque a chave pública entre releases; o build de desenvolvimento
(`tauri.conf.json` sem o arquivo de release) não assina, de propósito.

---

## 4. Testar em DEV (mock local)

Em dev não há release real, mas dá pra exercitar o **fluxo de checagem/oferta**:

1. Crie um `latest.json` local com uma versão **maior** que a atual (a do
   `tauri.conf.json`):
   ```json
   {
     "version": "9.9.9",
     "notes": "mock de teste",
     "pub_date": "2026-06-17T00:00:00Z",
     "platforms": {
       "windows-x86_64": { "signature": "mock", "url": "http://localhost:8787/fake-setup.exe" }
     }
   }
   ```
2. Sirva a pasta: `python -m http.server 8787` (ou `npx http-server -p 8787`).
3. **Temporariamente** troque o endpoint no `tauri.conf.json` para
   `http://localhost:8787/latest.json` e rode `npm run tauri dev`.
4. No startup (e via bandeja → "Verificar atualizações") o app vê a `9.9.9` →
   notificação + banner **"Atualização disponível — v9.9.9"**.

> O **download/instalação completo** NÃO conclui com o mock: o instalador é falso
> e a assinatura não bate com a `pubkey`. O que o mock valida é a **checagem + a
> oferta** (banner). O install de verdade só funciona com um artefato real
> assinado (seção 3). Lembre de **reverter o endpoint** depois do teste.
