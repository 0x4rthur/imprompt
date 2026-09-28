// dev/tauri-mock/autostart.ts — "iniciar com o sistema" em memória.
let on = false;

export async function enable(): Promise<void> {
  on = true;
}

export async function disable(): Promise<void> {
  on = false;
}

export async function isEnabled(): Promise<boolean> {
  return on;
}
