// dev/tauri-mock/window.ts — janela falsa: minimizar/fechar/esconder viram no-op.
const win = {
  minimize: async () => {},
  close: async () => {},
  hide: async () => {},
  show: async () => {},
  setFocus: async () => {},
  onFocusChanged: async (_handler: (event: { payload: boolean }) => void) => () => {},
};

export function getCurrentWindow() {
  return win;
}
