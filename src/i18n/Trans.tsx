// Trans.tsx — strings com markup inline (<strong>/<kbd>) sem dangerouslySetInnerHTML.
//
// O template no catálogo usa placeholders nomeados `{nome}`; `slots` mapeia cada
// nome para um nó React, interpolado na posição. Ex.:
//   <Trans k="gatilho.help" slots={{ kbd: <kbd>Ctrl+C</kbd> }} />
//
// Lê getLocale() direto; o ancestral que renderiza deve consumir useT() para
// re-renderizar na troca de idioma (App e cada Tab já chamam useT).

import { Fragment, type ReactNode } from "react";
import { getLocale, lookup } from "./index";
import type { Key } from "./catalog";

export function Trans({ k, slots }: { k: Key; slots: Record<string, ReactNode> }) {
  const s = lookup(getLocale(), k);
  const parts = s.split(/(\{[a-zA-Z0-9_]+\})/g);
  return (
    <>
      {parts.map((p, i) => {
        const m = p.match(/^\{([a-zA-Z0-9_]+)\}$/);
        return <Fragment key={i}>{m ? (slots[m[1]] ?? p) : p}</Fragment>;
      })}
    </>
  );
}
