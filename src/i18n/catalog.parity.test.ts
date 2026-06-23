// catalog.parity.test.ts — rede de segurança do catálogo TS.
//
// Garante que EN e pt-BR têm EXATAMENTE as mesmas chaves e que nenhuma string é
// vazia. O tipo `Record<keyof typeof en, string>` já força a paridade em
// compile-time; este teste a verifica em runtime (e pega strings vazias, que o
// tipo não pega).

import { describe, it, expect } from "vitest";
import { CATALOG } from "./catalog";

describe("catálogo i18n", () => {
  it("EN e pt-BR têm exatamente as mesmas chaves", () => {
    const en = Object.keys(CATALOG.en).sort();
    const pt = Object.keys(CATALOG["pt-BR"]).sort();
    expect(pt).toEqual(en);
  });

  it("nenhuma string vazia", () => {
    for (const loc of ["en", "pt-BR"] as const) {
      for (const [k, v] of Object.entries(CATALOG[loc])) {
        expect(v, `${loc}/${k}`).not.toBe("");
      }
    }
  });
});
