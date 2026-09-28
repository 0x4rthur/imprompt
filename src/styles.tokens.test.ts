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

// Lightness OKLCH de uma propriedade `prop:oklch(L ...)` na regra de topo do
// seletor (começo de linha — não a de uma media query que o repete).
function lightness(selector: string, prop: string): number {
  const start = css.indexOf("\n" + selector + "{") + 1;
  expect(start, `regra ${selector} não encontrada`).toBeGreaterThan(0);
  const body = css.slice(start + selector.length + 1, css.indexOf("}", start));
  const m = body.match(new RegExp(`(?:^|[;\\s])${prop}:\\s*oklch\\(([\\d.]+)`));
  return m ? Number(m[1]) : NaN;
}

describe("menu lateral", () => {
  it("o bloco claro do provedor pinta de escuro os logos que herdam a cor", () => {
    // xAI, OpenRouter e o ícone genérico usam currentColor; sem cor própria, o
    // bloco herdaria o rótulo claro do menu e o logo sumiria no fundo branco.
    expect(lightness(".conn-ico", "background")).toBeGreaterThan(0.9);
    expect(lightness(".conn-ico", "color")).toBeLessThan(0.45);
  });
});

describe("tokens de tema", () => {
  it("todo token de cor do claro existe no escuro", () => {
    const light = tokens(":root");
    const dark = new Set(tokens(':root[data-theme="dark"]'));
    const missing = light.filter((t) => !THEME_FREE.includes(t) && !dark.has(t));
    expect(missing).toEqual([]);
  });
});

type Color = { L: number; C: number; H: number; alpha: number };

// Tokens `--x:oklch(L C H[ / a])` de um bloco.
function colors(selector: string): Map<string, Color> {
  const start = css.indexOf(selector + "{");
  const body = css.slice(start + selector.length + 1, css.indexOf("\n}", start));
  const out = new Map<string, Color>();
  for (const m of body.matchAll(/(--[a-z0-9-]+)\s*:\s*oklch\(([\d.]+)\s+([\d.]+)\s+([\d.]+)(?:\s*\/\s*([\d.]+))?\)/g)) {
    out.set(m[1], { L: Number(m[2]), C: Number(m[3]), H: Number(m[4]), alpha: m[5] ? Number(m[5]) : 1 });
  }
  return out;
}

// OKLCH → sRGB codificado (0–1), como o navegador compõe as camadas.
function srgb({ L, C, H }: Color): number[] {
  const a = C * Math.cos((H * Math.PI) / 180);
  const b = C * Math.sin((H * Math.PI) / 180);
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  const linear = [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ];
  return linear.map((v) => Math.min(1, Math.max(0, v))).map((v) => (v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055));
}

// Luminância relativa (WCAG) de uma pilha de camadas, do fundo pro topo.
function luminance(...layers: Color[]): number {
  const rgb = layers.slice(1).reduce((under, c) => srgb(c).map((v, i) => v * c.alpha + under[i] * (1 - c.alpha)), srgb(layers[0]));
  const [r, g, b] = rgb.map((v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function ratio(text: number, surface: number): number {
  return (Math.max(text, surface) + 0.05) / (Math.min(text, surface) + 0.05);
}

describe("contraste", () => {
  // Texto sobre o fundo da janela e sobre os cards (WCAG AA: 4.5:1)…
  const TEXT = ["--ink", "--body", "--dim", "--stone", "--faint", "--mint-fg", "--amber-fg", "--danger"];
  const SURFACES = ["--canvas", "--card"];
  // …e os sinais sobre as próprias faixas tingidas (banner de erro, avisos, "ok").
  const TINTED = [
    ["--danger", "--danger-soft", "--canvas"],
    ["--amber-fg", "--amber-soft", "--card"],
    ["--mint-fg", "--mint-soft", "--card"],
  ];
  it.each([
    ["claro", ":root"],
    ["escuro", ':root[data-theme="dark"]'],
  ])("todo texto fica legível no tema %s", (_, selector) => {
    const theme = new Map([...colors(":root"), ...colors(selector)]);
    const get = (token: string) => theme.get(token)!;
    const low: string[] = [];
    for (const fg of TEXT) {
      for (const bg of SURFACES) {
        const r = ratio(luminance(get(fg)), luminance(get(bg)));
        if (!(r >= 4.5)) low.push(`${fg} em ${bg}: ${r.toFixed(2)}`);
      }
    }
    for (const [fg, tint, base] of TINTED) {
      const r = ratio(luminance(get(fg)), luminance(get(base), get(tint)));
      if (!(r >= 4.5)) low.push(`${fg} em ${tint}/${base}: ${r.toFixed(2)}`);
    }
    expect(low).toEqual([]);
  });
});
