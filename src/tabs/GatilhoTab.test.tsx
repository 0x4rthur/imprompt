// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import type { Settings } from "../types";
import GatilhoTab from "./GatilhoTab";

const settings = { trigger_modifier: "ctrl", trigger_key: "c", debounce_ms: 400, mode: "instant", output: "replace" } as Settings;

afterEach(cleanup);

it("records a new shortcut from the keyboard", () => {
  const update = vi.fn(() => Promise.resolve());
  render(<GatilhoTab settings={settings} update={update} />);
  const rec = screen.getByRole("button", { name: "Record activation shortcut" });
  fireEvent.click(rec);
  expect(rec.getAttribute("aria-pressed")).toBe("true");
  expect(screen.getByText("Press the shortcut")).toBeTruthy();
  fireEvent.keyDown(window, { key: "k", code: "KeyK", altKey: true });
  expect(update).toHaveBeenCalledWith({ trigger_modifier: "alt", trigger_key: "k" });
  expect(rec.getAttribute("aria-pressed")).toBe("false");
});

it("keeps the gap slider accessible", () => {
  render(<GatilhoTab settings={settings} update={vi.fn(() => Promise.resolve())} />);
  const slider = screen.getByRole("slider");
  expect(slider.getAttribute("aria-valuetext")).toBe("400 ms");
});

it("records the letter printed on the key, not its physical position", () => {
  // AZERTY: a tecla "A" fica onde o QWERTY tem o Q (code KeyQ). O backend ouve
  // a LETRA, então é ela que tem de ser gravada.
  const update = vi.fn(() => Promise.resolve());
  render(<GatilhoTab settings={settings} update={update} />);
  fireEvent.click(screen.getByRole("button", { name: "Record activation shortcut" }));
  fireEvent.keyDown(window, { key: "a", code: "KeyQ", ctrlKey: true });
  expect(update).toHaveBeenCalledWith({ trigger_modifier: "ctrl", trigger_key: "a" });
});

it("dragging the gap slider saves once, on release", () => {
  const update = vi.fn(() => Promise.resolve());
  render(<GatilhoTab settings={settings} update={update} />);
  const slider = screen.getByRole("slider") as HTMLInputElement;
  for (const v of [410, 430, 470, 500]) fireEvent.change(slider, { target: { value: String(v) } });
  expect(update).not.toHaveBeenCalled();
  expect(slider.value).toBe("500"); // o controle acompanha o arrasto
  expect(slider.getAttribute("aria-valuetext")).toBe("500 ms");
  fireEvent.pointerUp(slider);
  expect(update).toHaveBeenCalledTimes(1);
  expect(update).toHaveBeenCalledWith({ debounce_ms: 500 });
});
