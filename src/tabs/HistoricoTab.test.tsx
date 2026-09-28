// @vitest-environment jsdom
/// <reference types="vite/client" />
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import raw from "../styles.css?raw";
import { setLocale } from "../i18n";
import type { Locale } from "../i18n/catalog";
import HistoricoTab from "./HistoricoTab";

const entry = { original: "orig text", result: "result text", preset: "estruturar", timestamp: Date.now() };

beforeEach(() => {
  Object.assign(navigator, { clipboard: { writeText: vi.fn(() => Promise.resolve()) } });
});
afterEach(cleanup);

it("hides a collapsed entry from assistive tech and reveals it on expand", () => {
  render(<HistoricoTab presets={[]} history={[entry]} />);
  expect(screen.queryByRole("button", { name: "Copy result" })).toBeNull();
  const head = screen.getByRole("button", { expanded: false });
  fireEvent.click(head);
  expect(head.getAttribute("aria-expanded")).toBe("true");
  expect(screen.getByText("result text")).toBeTruthy();
  expect(screen.getByRole("button", { name: "Copy result" })).toBeTruthy();
});

it("copies the result and confirms", async () => {
  render(<HistoricoTab presets={[]} history={[entry]} />);
  fireEvent.click(screen.getByRole("button", { expanded: false }));
  await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Copy result" })); });
  expect(navigator.clipboard.writeText).toHaveBeenCalledWith("result text");
  expect(screen.getByRole("button", { name: "Copied" })).toBeTruthy();
});

it("explains how to start when the session is empty", () => {
  render(<HistoricoTab presets={[]} history={[]} />);
  expect(screen.getByText(/No imprompts in this session yet/)).toBeTruthy();
});

// A hora fica numa coluna fixa (o corpo aberto alinha depois dela). A coluna
// precisa caber a hora mais longa de cada idioma ("11:59 PM" no inglês).
const css = raw.replace(/\r\n/g, "\n");
const MONO_ADVANCE = 0.6; // JetBrains Mono: todo caractere tem 600/1000 em
function rule(selector: string): string {
  const i = css.indexOf(selector + "{");
  return i < 0 ? "" : css.slice(i + selector.length + 1, css.indexOf("}", i));
}
function timeColumnPx(locale: Locale): number {
  const width = rule(".h-time").match(/width:\s*([^;]+)/)![1].trim();
  if (width !== "var(--h-time)") return parseFloat(width);
  const read = (sel: string) => rule(sel).match(/--h-time:\s*([\d.]+)px/)?.[1];
  return Number(read(`:root[lang="${locale}"] .history`) ?? read(".history"));
}

it.each<Locale>(["en", "pt-BR"])("the time column fits the longest %s time and the body lines up after it", (locale) => {
  setLocale(locale);
  try {
    const late = new Date(2026, 8, 20, 23, 59).getTime();
    render(<HistoricoTab presets={[]} history={[{ ...entry, timestamp: late }]} />);
    const label = document.querySelector(".h-time")!.textContent!;
    const fontPx = Number(rule(".h-time").match(/font:\s*\d+\s+([\d.]+)px/)![1]);
    expect(timeColumnPx(locale)).toBeGreaterThanOrEqual(label.length * MONO_ADVANCE * fontPx);
    expect(rule(".h-pad")).toContain("calc(var(--h-time) + 26px)");
  } finally {
    setLocale("en");
  }
});
