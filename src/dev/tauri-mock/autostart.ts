// dev/tauri-mock/autostart.ts — "iniciar com o sistema" em memória.
// `?blocked=1` simula o Windows bloqueando a inicialização: o plugin diz "ligado"
// e o backend (comando is_autostart_blocked, em core.ts) diz "bloqueado".
let blocked = new URLSearchParams(location.search).has("blocked");
let on = blocked;

export async function enable(): Promise<void> {
  on = true;
  blocked = false; // religar regrava a entrada como aprovada
}

export async function disable(): Promise<void> {
  on = false;
  blocked = false; // sem entrada, não há o que bloquear
}

export async function isEnabled(): Promise<boolean> {
  return on;
}

/** Usado pelo mock do backend (core.ts). */
export function isBlocked(): boolean {
  return blocked;
}
