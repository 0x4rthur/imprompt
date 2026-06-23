# Atualização automática (Tauri Updater)

O Imprompt usa o **`tauri-plugin-updater`** oficial. Em resumo:

1. O app consulta um **endpoint** (`plugins.updater.endpoints` no `tauri.conf.json`)
   que devolve um **`latest.json`**.
2. Compara a versão de lá com a versão atual do app.
3. Se for mais nova, **baixa o instalador assinado**, **verifica a assinatura**
   com a **chave pública** do `tauri.conf.json`, instala e reinicia.

Comportamento no app:
- **Startup:** checagem silenciosa. Se houver versão nova, aparece uma notificação
  e o banner "Atualização disponível" na janela de Preferências.
- **Bandeja → "Verificar atualizações":** checa sob demanda (avisa achando ou não)
  e abre as Preferências, onde o banner oferece **Baixar e reiniciar**.

---

## 1. Chaves de assinatura (você é o dono)

Já foram geradas:

- **Privada:** `C:\Users\arthu\.tauri\imprompt-updater.key` (gerada **sem senha**).
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

## 3. Fluxo de release (passa a existir)

1. **Bump da versão** em `src-tauri/tauri.conf.json` (`version`), e
   idealmente em `package.json` e `src-tauri/Cargo.toml`.
2. **Exporte a chave de assinatura** (PowerShell):
   ```powershell
   $env:TAURI_SIGNING_PRIVATE_KEY = Get-Content "C:\Users\arthu\.tauri\imprompt-updater.key" -Raw
   $env:TAURI_SIGNING_PRIVATE_KEY_PASSWORD = ""   # sem senha
   ```
   (`.env` NÃO funciona pra isso — tem que ser variável de ambiente do processo.)
3. **Build:**
   ```powershell
   npm run tauri build
   ```
   Como `bundle.createUpdaterArtifacts = true`, isso gera o instalador **e** o
   `.sig` em `src-tauri/target/release/bundle/` (ex.: `nsis/Imprompt_<v>_x64-setup.exe`
   e `..._setup.exe.sig`).
4. **Monte o `latest.json`** com a nova `version`, a `url` do instalador e a
   `signature` = conteúdo do `.sig`.
5. **Publique** o instalador + o `latest.json` no host do endpoint (ex.: crie um
   release `v0.2.0` no GitHub e anexe os dois; a URL `releases/latest/download/latest.json`
   passa a servir o novo arquivo).

Os apps instalados detectam a nova versão na próxima checagem (startup ou bandeja).

---

## 4. Testar em DEV (mock local)

Em dev não há release real, mas dá pra exercitar o **fluxo de checagem/oferta**:

1. Crie um `latest.json` local com uma versão **maior** que a atual (a do
   `tauri.conf.json`, hoje `0.1.0`):
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
