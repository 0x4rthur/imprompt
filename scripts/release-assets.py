"""Prepara os arquivos de uma release do Imprompt e confere a assinatura.

Uso (depois do build assinado, ver docs/UPDATER.md):

    python scripts/release-assets.py            # versão do tauri.conf.json
    python scripts/release-assets.py 0.1.12     # ou explícita (precisa bater)

Na pasta do instalador (src-tauri/target/release/bundle/nsis/) ele:
1. confere a assinatura minisign do .exe contra a chave pública do updater
   (`plugins.updater.pubkey` no tauri.conf.json) — se não bater, o app instalado
   recusaria a atualização, então o script para;
2. escreve o latest.json (notas = docs/releases/vX.Y.Z.md);
3. escreve o SHA256SUMS.txt (exe, .sig e latest.json);
4. imprime o comando `gh release create` com os 4 arquivos.

Precisa do pacote `cryptography` (pip install cryptography).
"""
import base64
import datetime
import hashlib
import json
import pathlib
import sys

try:
    from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PublicKey
except ImportError:
    sys.exit("Falta o pacote 'cryptography': pip install cryptography")

ROOT = pathlib.Path(__file__).resolve().parent.parent
CONF = json.loads((ROOT / "src-tauri" / "tauri.conf.json").read_text(encoding="utf-8"))
REPO = "0x4rthur/imprompt"

version = sys.argv[1] if len(sys.argv) > 1 else CONF["version"]
if version != CONF["version"]:
    sys.exit(f"Versão {version} não bate com a do tauri.conf.json ({CONF['version']}).")

bundle = ROOT / "src-tauri" / "target" / "release" / "bundle" / "nsis"
exe = bundle / f"Imprompt_{version}_x64-setup.exe"
sig = bundle / (exe.name + ".sig")
notes_file = ROOT / "docs" / "releases" / f"v{version}.md"
for needed in (exe, sig, notes_file):
    if not needed.exists():
        sys.exit(f"Não encontrei {needed}. Rode o build assinado e escreva as notas antes.")

# ---- 1. Assinatura: minisign "ED" = Ed25519 sobre o BLAKE2b-512 do arquivo ----
exe_bytes = exe.read_bytes()
sig_b64 = sig.read_text(encoding="utf-8").strip()
pub_text = base64.b64decode(CONF["plugins"]["updater"]["pubkey"]).decode()
pub_raw = base64.b64decode(pub_text.strip().splitlines()[-1])
pub_id, pub_key = pub_raw[2:10], pub_raw[10:42]

sig_lines = base64.b64decode(sig_b64).decode().strip().splitlines()
sig_raw = base64.b64decode(sig_lines[1])
alg, sig_id, signature = sig_raw[:2], sig_raw[2:10], sig_raw[10:74]
trusted = sig_lines[2].split("trusted comment: ", 1)[1].encode()
global_sig = base64.b64decode(sig_lines[3])
if sig_id != pub_id:
    sys.exit("A assinatura foi feita com OUTRA chave — o app instalado recusaria. Use a imprompt-updater.key.")
key = Ed25519PublicKey.from_public_bytes(pub_key)
message = hashlib.blake2b(exe_bytes, digest_size=64).digest() if alg == b"ED" else exe_bytes
key.verify(signature, message)  # InvalidSignature se não bater
key.verify(global_sig, signature + trusted)
print(f"Assinatura OK (chave {pub_id[::-1].hex().upper()}).")

# ---- 2. latest.json ----
latest = {
    "version": version,
    "notes": notes_file.read_text(encoding="utf-8").replace("\r\n", "\n").strip(),
    "pub_date": datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
    "platforms": {
        "windows-x86_64": {
            "signature": sig_b64,
            "url": f"https://github.com/{REPO}/releases/download/v{version}/{exe.name}",
        }
    },
}
latest_file = bundle / "latest.json"
latest_file.write_text(json.dumps(latest, indent=2, ensure_ascii=False) + "\n", encoding="utf-8", newline="\n")

# ---- 3. SHA256SUMS.txt ----
sums = [f"{hashlib.sha256(p.read_bytes()).hexdigest()}  {p.name}" for p in (exe, sig, latest_file)]
sums_file = bundle / "SHA256SUMS.txt"
sums_file.write_text("\n".join(sums) + "\n", encoding="utf-8", newline="\n")
print("\n".join(sums))

# ---- 4. Próximo passo ----
files = " ".join(f'"{p}"' for p in (exe, sig, latest_file, sums_file))
print(
    "\nRascunho da release (publique só depois do merge do PR com o CI verde):\n"
    f'gh release create v{version} --repo {REPO} --draft --target main --title "Imprompt v{version}" '
    f"--notes-file docs/releases/v{version}.md {files}"
)
