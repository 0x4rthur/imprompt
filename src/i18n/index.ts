// index.ts — store do locale atual (nível de módulo) + tradutor `t()`.
//
// Mantém o locale num módulo (compartilhado pelas duas janelas React, cada uma
// com seu próprio root) e um set de listeners; `useT` (useT.ts) assina via
// useSyncExternalStore, então `setLocale` re-renderiza quem consome o hook.

import { CATALOG, type Key, type Locale } from "./catalog";

let current: Locale = "en";
const listeners = new Set<() => void>();

export function getLocale(): Locale {
  return current;
}

export function setLocale(l: Locale): void {
  if (l !== current && l in CATALOG) {
    current = l;
    listeners.forEach((fn) => fn());
  }
}

export function subscribe(fn: () => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

// Busca uma chave num locale, com fallback EN e, por fim, a própria chave.
export function lookup(l: Locale, key: Key): string {
  const table = CATALOG[l] as Record<string, string>;
  return table[key] ?? (CATALOG.en as Record<string, string>)[key] ?? key;
}

// Traduz `key` no locale atual, interpolando `{nome}` com `params`.
export function t(key: Key, params?: Record<string, string | number>): string {
  let s = lookup(current, key);
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      s = s.split(`{${k}}`).join(String(v));
    }
  }
  return s;
}
