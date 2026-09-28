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
