// theme.ts — ponte entre a preferência de tema (settings) e o <html data-theme>.
// O trabalho de verdade mora em public/theme.js (roda antes do paint); aqui só
// repassamos a escolha vinda do backend. Fallback defensivo se o script não carregou.
import type { Settings } from "./types";

type ThemeApi = { set: (pref: Settings["theme"]) => void };

export function applyTheme(pref: Settings["theme"] | undefined) {
  const theme = pref ?? "system";
  const api = (window as unknown as { __impromptTheme?: ThemeApi }).__impromptTheme;
  if (api) { api.set(theme); return; }
  const dark = theme === "dark" || (theme === "system" && !!window.matchMedia?.("(prefers-color-scheme: dark)").matches);
  document.documentElement.setAttribute("data-theme", dark ? "dark" : "light");
}
