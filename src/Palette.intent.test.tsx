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

it("the preset list is refreshed every time the popup is reused", async () => {
  // A janela nasce na inicialização do app: presets criados/excluídos depois
  // precisam aparecer na próxima abertura, sem reiniciar.
  await open();
  fireEvent.keyDown(window, { key: "4" }); // escolhe o Preset 3…
  const fresh = [presets[0], presets[1], { ...presets[0], id: "novo", label: "Brand new" }];
  const original = vi.mocked(invoke).getMockImplementation()!;
  vi.mocked(invoke).mockImplementation((cmd: string, args?: unknown) =>
    cmd === "list_presets" ? Promise.resolve(fresh) : (original as (c: string, a?: unknown) => Promise<unknown>)(cmd, args));
  act(() => events.get("captured-text")!({ payload: "second text" }));
  expect(await screen.findByRole("button", { name: "Brand new" })).toBeTruthy();
  expect(screen.queryByRole("button", { name: "Preset 3" })).toBeNull(); // …que foi excluído
  // A seleção cai num preset que existe (o padrão), e é com ele que refina.
  fireEvent.keyDown(window, { key: "Enter" });
  expect(pending[0].presetId).toBe("p0");
});

it("clicking into another window cancels the queued apply", async () => {
  await open();
  fireEvent.keyDown(window, { key: "Enter" });
  fireEvent.keyDown(window, { key: "Enter" }); // aplica ao chegar…
  fireEvent.blur(window); // …mas o usuário foi pra outra janela
  await act(async () => { pending[0].resolve("Better text"); });
  expect(await screen.findByText("Better text")).toBeTruthy(); // fica esperando o Enter
  expect(calls("deliver_result")).toHaveLength(0);
});

it("Enter right after Esc does not apply the result being dismissed", async () => {
  // Movimento ligado: o Esc toca 130 ms de saída antes de esconder a janela.
  vi.stubGlobal("matchMedia", () => ({
    matches: false, media: "", onchange: null,
    addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {},
    dispatchEvent: () => false,
  }));
  try {
    await open();
    fireEvent.keyDown(window, { key: "Enter" });
    await act(async () => { pending[0].resolve("Better text"); });
    await screen.findByText("Better text");
    fireEvent.keyDown(window, { key: "Escape" });
    fireEvent.keyDown(window, { key: "Enter" });
    fireEvent.keyDown(window, { key: "2" });
    await act(() => new Promise((resolve) => setTimeout(resolve, 400)));
    expect(calls("deliver_result")).toHaveLength(0);
    expect(calls("refine_text")).toHaveLength(1);
  } finally {
    vi.unstubAllGlobals();
  }
});

it("Enter still applies after a mouse click on Copy", async () => {
  Object.assign(navigator, { clipboard: { writeText: vi.fn(() => Promise.resolve()) } });
  await open();
  fireEvent.keyDown(window, { key: "Enter" });
  await act(async () => { pending[0].resolve("Better text"); });
  const copy = await screen.findByRole("button", { name: "Copy" });
  copy.focus();
  await act(async () => { fireEvent.click(copy, { detail: 1 }); }); // clique de mouse
  fireEvent.keyDown(document.activeElement ?? window, { key: "Enter" });
  await waitFor(() => expect(calls("deliver_result")).toHaveLength(1));
});

it("Enter on a focused preset chip refines with that preset", async () => {
  await open();
  const chip = screen.getByRole("button", { name: "Preset 2" });
  chip.focus();
  fireEvent.keyDown(chip, { key: "Enter" });
  expect(pending[0].presetId).toBe("p2");
});

it("Enter in the same instant the answer lands applies it instead of refining again", async () => {
  await open();
  fireEvent.keyDown(window, { key: "Enter" });
  await act(async () => {
    pending[0].resolve("Better text");
    await new Promise((resolve) => setTimeout(resolve, 0)); // resposta processada, tela ainda não
    fireEvent.keyDown(window, { key: "Enter" });
  });
  await waitFor(() => expect(calls("deliver_result")).toHaveLength(1));
  expect(calls("refine_text")).toHaveLength(1);
});

it("a copy of the Reply preset is also announced as copy-only", async () => {
  const withReply = [...presets, { ...presets[0], id: "reply-copy", label: "My reply", reply: true }];
  const original = vi.mocked(invoke).getMockImplementation()!;
  vi.mocked(invoke).mockImplementation((cmd: string, args?: unknown) =>
    cmd === "list_presets" ? Promise.resolve(withReply) : (original as (c: string, a?: unknown) => Promise<unknown>)(cmd, args));
  render(<Palette />);
  await screen.findByText("make this better");
  fireEvent.click(await screen.findByRole("button", { name: "My reply" }));
  expect(screen.getByText("will copy the reply — paste it with Ctrl+V")).toBeTruthy();
});
