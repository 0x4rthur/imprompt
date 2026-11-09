// @vitest-environment jsdom
// O popup precisa guardar a INTENÇÃO do usuário mesmo quando as teclas chegam
// mais rápido que a API: Enter durante o carregamento, troca de preset depois
// (ou durante) um refino, Esc, e a janela sendo reusada com outro texto.
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { invoke } from "@tauri-apps/api/core";

const hide = vi.fn(() => Promise.resolve());
const show = vi.fn(() => Promise.resolve());
const events = vi.hoisted(() => new Map<string, (e: { payload: string }) => void>());
vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));
vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn((name: string, cb: (e: { payload: string }) => void) => {
    events.set(name, cb);
    return Promise.resolve(() => {});
  }),
}));
vi.mock("@tauri-apps/api/window", () => ({ getCurrentWindow: () => ({ hide, show }) }));
vi.mock("./autoscroll", () => ({ initAutoScrollbars: () => () => {} }));
import Palette from "./Palette";

const presets = Array.from({ length: 4 }, (_, i) => ({
  id: "p" + i, label: "Preset " + i, instruction: "", example_input: "", example_output: "", builtin: true, edited: false,
}));
const SETTINGS = { default_preset: "p0", output: "replace", api_model: "gpt-x", locale: "en", theme: "system" };

// Cada refine_text fica pendente até o teste resolver: simula a espera da API.
type Pending = { presetId: string; text: string; resolve: (out: string) => void; reject: (e: unknown) => void };
let pending: Pending[] = [];
let settings: () => Promise<typeof SETTINGS>;

const calls = (cmd: string) => vi.mocked(invoke).mock.calls.filter(([c]) => c === cmd);
const flush = () => act(() => new Promise((resolve) => setTimeout(resolve, 0)));

beforeEach(() => {
  hide.mockClear();
  show.mockClear();
  pending = [];
  settings = async () => SETTINGS;
  vi.mocked(invoke).mockReset();
  vi.mocked(invoke).mockImplementation(async (cmd: string, args?: unknown) => {
    switch (cmd) {
      case "list_presets": return presets;
      case "get_captured_text": return "make this better";
      case "get_settings": return settings();
      case "refine_text": {
        const a = args as { text: string; presetId: string };
        return new Promise<string>((resolve, reject) => pending.push({ ...a, resolve, reject }));
      }
      default: return null;
    }
  });
});
afterEach(cleanup);

async function open() {
  render(<Palette />);
  await screen.findByText("make this better");
  await screen.findByText("Preset 3");
  await flush();
}

it("Enter pressed again while loading applies the result as soon as it arrives", async () => {
  await open();
  fireEvent.keyDown(window, { key: "Enter" });
  fireEvent.keyDown(window, { key: "Enter" });
  expect(calls("refine_text")).toHaveLength(1);
  expect(screen.getByText(/applies when ready/)).toBeTruthy();
  await act(async () => { pending[0].resolve("Better text"); });
  await waitFor(() => expect(invoke).toHaveBeenCalledWith("deliver_result", { text: "Better text", presetId: "p0" }));
  expect(calls("deliver_result")).toHaveLength(1);
});

it("a queued apply never applies an error", async () => {
  await open();
  fireEvent.keyDown(window, { key: "Enter" });
  fireEvent.keyDown(window, { key: "Enter" });
  await act(async () => { pending[0].reject("Invalid key"); });
  expect((await screen.findByRole("alert")).textContent).toBe("Invalid key");
  expect(calls("deliver_result")).toHaveLength(0);
});

it("picking another preset after a result refines again with it; Enter applies the new result", async () => {
  await open();
  fireEvent.keyDown(window, { key: "Enter" });
  await act(async () => { pending[0].resolve("Result of p0"); });
  await screen.findByText("Result of p0");
  fireEvent.keyDown(window, { key: "3" });
  expect(screen.queryByText("Result of p0")).toBeNull();
  expect(pending[1]).toMatchObject({ presetId: "p2", text: "make this better" });
  await act(async () => { pending[1].resolve("Result of p2"); });
  await screen.findByText("Result of p2");
  fireEvent.keyDown(window, { key: "Enter" });
  await waitFor(() => expect(invoke).toHaveBeenCalledWith("deliver_result", { text: "Result of p2", presetId: "p2" }));
  expect(calls("deliver_result")).toHaveLength(1);
});

it("picking another preset while loading restarts the refine and drops the old answer", async () => {
  await open();
  fireEvent.keyDown(window, { key: "Enter" });
  fireEvent.click(screen.getByRole("button", { name: "Preset 1" }));
  expect(pending).toHaveLength(2);
  expect(pending[1].presetId).toBe("p1");
  await act(async () => { pending[0].resolve("Old answer"); });
  expect(screen.queryByText("Old answer")).toBeNull();
  await act(async () => { pending[1].resolve("New answer"); });
  expect(await screen.findByText("New answer")).toBeTruthy();
});

it("picking a preset before the first Enter only selects it", async () => {
  await open();
  fireEvent.keyDown(window, { key: "2" });
  expect(calls("refine_text")).toHaveLength(0);
  fireEvent.keyDown(window, { key: "Enter" });
  expect(pending[0].presetId).toBe("p1");
});

it("Esc while loading cancels: the late answer is neither shown nor applied", async () => {
  await open();
  fireEvent.keyDown(window, { key: "Enter" });
  fireEvent.keyDown(window, { key: "Enter" }); // aplicar ao chegar…
  fireEvent.keyDown(window, { key: "Escape" }); // …mas o usuário desistiu
  expect(hide).toHaveBeenCalled();
  await act(async () => { pending[0].resolve("Too late"); });
  await flush();
  expect(calls("deliver_result")).toHaveLength(0);
  expect(screen.queryByText("Too late")).toBeNull();
});

it("an answer for the previous capture never lands on a reused popup", async () => {
  await open();
  fireEvent.keyDown(window, { key: "Enter" });
  act(() => events.get("captured-text")!({ payload: "second text" }));
  await act(async () => { pending[0].resolve("Answer for the first text"); });
  await flush();
  expect(screen.getByText("second text")).toBeTruthy();
  expect(screen.queryByText("Answer for the first text")).toBeNull();
  // E o popup segue utilizável pro texto novo.
  fireEvent.keyDown(window, { key: "Enter" });
  expect(pending[1]).toMatchObject({ text: "second text" });
});

it("a preset picked before the settings arrive is not overridden by the default", async () => {
  let release!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  settings = async () => { await gate; return { ...SETTINGS, default_preset: "p3" }; };
  render(<Palette />);
  await screen.findByText("Preset 3");
  fireEvent.keyDown(window, { key: "2" });
  await act(async () => { release(); });
  await flush();
  expect(screen.getByRole("button", { name: "Preset 1" }).getAttribute("aria-pressed")).toBe("true");
});
