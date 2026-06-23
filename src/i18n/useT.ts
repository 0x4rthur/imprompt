// useT.ts — hook React que assina o locale e devolve o tradutor.
//
// useSyncExternalStore re-renderiza o componente sempre que `setLocale` muda o
// locale (troca de idioma ao vivo, sem reiniciar a janela).

import { useSyncExternalStore } from "react";
import { getLocale, subscribe, t } from "./index";

export function useT() {
  const locale = useSyncExternalStore(subscribe, getLocale, getLocale);
  return { t, locale };
}
