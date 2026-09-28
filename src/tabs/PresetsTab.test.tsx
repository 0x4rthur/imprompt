// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import type { Preset, Settings } from "../types";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn(() => Promise.resolve(null)) }));
import PresetsTab from "./PresetsTab";

const settings = { default_preset: "a", use_examples: true } as Settings;
const presets: Preset[] = [
  { id: "a", label: "Structure", instruction: "x", example_input: "", example_output: "", builtin: true, edited: false },
  { id: "b", label: "Code prompt", instruction: "y", example_input: "", example_output: "", builtin: true, edited: true },
];

afterEach(cleanup);

it("picks the default preset from the tiles and the ring follows it", () => {
  const update = vi.fn(() => Promise.resolve());
  const { container, rerender } = render(<PresetsTab settings={settings} update={update} presets={presets} loadPresets={() => {}} />);
  const group = screen.getByRole("group", { name: "Default preset" });
  const tiles = within(group).getAllByRole("button");
  expect(tiles[0].getAttribute("aria-pressed")).toBe("true");
  expect(container.querySelectorAll(".preset-ring")).toHaveLength(1);
  expect(tiles[0].querySelector(".preset-ring")).toBeTruthy();
  fireEvent.click(tiles[1]);
  expect(update).toHaveBeenCalledWith({ default_preset: "b" });
  rerender(<PresetsTab settings={{ ...settings, default_preset: "b" }} update={update} presets={presets} loadPresets={() => {}} />);
  expect(within(group).getAllByRole("button")[1].querySelector(".preset-ring")).toBeTruthy();
  expect(container.querySelectorAll(".preset-ring")).toHaveLength(1);
});

it("opens the editor inside the list with the name ready to type", () => {
  render(<PresetsTab settings={settings} update={vi.fn(() => Promise.resolve())} presets={presets} loadPresets={() => {}} />);
  fireEvent.click(screen.getAllByRole("button", { name: "Edit" })[0]);
  const name = screen.getByRole("textbox", { name: "Preset name" }) as HTMLInputElement;
  expect(name.value).toBe("Structure");
  expect(document.activeElement).toBe(name);
});
