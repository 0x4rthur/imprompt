// styles.tokens.test.ts — todo token de tema do claro precisa existir no escuro.
//
// O tema escuro sobrescreve os tokens em :root[data-theme="dark"]; um token que
// só existe no claro vaza a cor clara pro escuro (texto ilegível, card branco).
/// <reference types="vite/client" />
import { describe, expect, it } from "vitest";
import raw from "./styles.css?raw";

const css = raw.replace(/\r\n/g, "\n");

function tokens(selector: string): string[] {
  const start = css.indexOf(selector + "{");
  expect(start, `bloco ${selector} não encontrado`).toBeGreaterThanOrEqual(0);
  const body = css.slice(start + selector.length + 1, css.indexOf("\n}", start));
  return [...body.matchAll(/(--[a-z0-9-]+)\s*:/g)].map((m) => m[1]);
}

// Tokens que não dependem do tema (forma, fonte, curvas) só moram no :root.
const THEME_FREE = ["--sans", "--mono", "--r-card", "--r-tile", "--r-ctl", "--r-chip", "--r-kbd", "--r-rail", "--spring", "--out", "--ease-out", "--ease-out-expo"];

describe("tokens de tema", () => {
  it("todo token de cor do claro existe no escuro", () => {
    const light = tokens(":root");
    const dark = new Set(tokens(':root[data-theme="dark"]'));
    const missing = light.filter((t) => !THEME_FREE.includes(t) && !dark.has(t));
    expect(missing).toEqual([]);
  });
});
