// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { invoke } from "@tauri-apps/api/core";

const hide = vi.fn(() => Promise.resolve());
const show = vi.fn(() => Promise.resolve());
// Guarda o listener de cada evento, pra simular a janela sendo reusada (captured-text).
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

const presets = Array.from({ length: 11 }, (_, i) => ({
  id: "p" + i, label: "Preset " + i, instruction: "", example_input: "", example_output: "", builtin: true, edited: false,
}));
const SETTINGS = { default_preset: "p0", output: "replace", api_model: "gpt-x", locale: "en", theme: "system" };

function backend(refine: () => Promise<string>, deliver: () => Promise<unknown> = async () => null) {
  vi.mocked(invoke).mockImplementation(async (cmd: string) => {
    switch (cmd) {
      case "list_presets": return presets;
      case "get_captured_text": return "make this better";
      case "get_settings": return SETTINGS;
      case "refine_text": return refine();
      case "deliver_result": return deliver();
      default: return null;
    }
  });
}

beforeEach(() => {
  hide.mockClear();
  show.mockClear();
  vi.mocked(invoke).mockReset();
  backend(async () => "Better text");
});
afterEach(cleanup);

it("Enter refines, then Enter applies the result", async () => {
  render(<Palette />);
  await screen.findByText("make this better");
  fireEvent.keyDown(window, { key: "Enter" });
  await screen.findByText("Better text");
  expect(invoke).toHaveBeenCalledWith("refine_text", { text: "make this better", presetId: "p0" });
  fireEvent.keyDown(window, { key: "Enter" });
  await waitFor(() => expect(invoke).toHaveBeenCalledWith("deliver_result", { text: "Better text", presetId: "p0" }));
  expect(hide).toHaveBeenCalled();
});

it("a second Enter while the popup is leaving does not deliver twice", async () => {
  // Movimento ligado: o "Aplicar" espera a animação de saída antes de colar.
  vi.stubGlobal("matchMedia", () => ({
    matches: false, media: "", onchange: null,
    addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {},
    dispatchEvent: () => false,
  }));
  try {
    render(<Palette />);
    await screen.findByText("make this better");
    fireEvent.keyDown(window, { key: "Enter" });
    await screen.findByText("Better text");
    fireEvent.keyDown(window, { key: "Enter" });
    fireEvent.keyDown(window, { key: "Enter" });
    fireEvent.keyDown(window, { key: "r" });
    await waitFor(() => expect(invoke).toHaveBeenCalledWith("deliver_result", { text: "Better text", presetId: "p0" }));
    await act(() => new Promise((resolve) => setTimeout(resolve, 300)));
    const calls = vi.mocked(invoke).mock.calls.map(([c]) => c);
    expect(calls.filter((c) => c === "deliver_result")).toHaveLength(1);
    expect(calls.filter((c) => c === "refine_text")).toHaveLength(1);
  } finally {
    vi.unstubAllGlobals();
  }
});

it("a popup reused after an Apply starts fresh and Enter works again", async () => {
  render(<Palette />);
  await screen.findByText("make this better");
  fireEvent.keyDown(window, { key: "Enter" });
  await screen.findByText("Better text");
  fireEvent.keyDown(window, { key: "Enter" });
  await waitFor(() => expect(hide).toHaveBeenCalled());
  // Novo Ctrl+C×2: o backend reusa a janela e manda o texto novo.
  act(() => events.get("captured-text")!({ payload: "second text" }));
  expect(screen.getByText("second text")).toBeTruthy();
  expect(screen.queryByText("Better text")).toBeNull();
  fireEvent.keyDown(window, { key: "Enter" });
  await screen.findByText("Better text");
  expect(invoke).toHaveBeenCalledWith("refine_text", { text: "second text", presetId: "p0" });
  fireEvent.keyDown(window, { key: "Enter" });
  await waitFor(() => expect(vi.mocked(invoke).mock.calls.filter(([c]) => c === "deliver_result")).toHaveLength(2));
});

it("a failed delivery brings the popup back and Enter applies again", async () => {
  let attempts = 0;
  backend(async () => "Better text", async () => {
    attempts++;
    if (attempts === 1) throw "paste blocked";
    return null;
  });
  const quiet = vi.spyOn(console, "error").mockImplementation(() => {});
  try {
    render(<Palette />);
    await screen.findByText("make this better");
    fireEvent.keyDown(window, { key: "Enter" });
    await screen.findByText("Better text");
    fireEvent.keyDown(window, { key: "Enter" });
    await waitFor(() => expect(show).toHaveBeenCalled());
    fireEvent.keyDown(window, { key: "Enter" });
    await waitFor(() => expect(attempts).toBe(2));
  } finally {
    quiet.mockRestore();
  }
});

it("a reply is copied, not pasted over the message, and the footer says so", async () => {
  vi.mocked(invoke).mockImplementation(async (cmd: string) => {
    switch (cmd) {
      case "list_presets": return [...presets.slice(0, 2), { ...presets[0], id: "responder", label: "Reply" }];
      case "get_captured_text": return "Can we move the call to Friday?";
      case "get_settings": return SETTINGS; // output: "replace"
      case "refine_text": return "Sure, Friday works. [time]?";
      default: return null;
    }
  });
  render(<Palette />);
  await screen.findByText("Can we move the call to Friday?");
  expect(screen.getByText("will replace the text")).toBeTruthy();
  fireEvent.keyDown(window, { key: "3" });
  expect(screen.getByText("will copy the reply — paste it with Ctrl+V")).toBeTruthy();
  fireEvent.keyDown(window, { key: "Enter" });
  await screen.findByText("Sure, Friday works. [time]?");
  fireEvent.keyDown(window, { key: "Enter" });
  await waitFor(() => expect(invoke).toHaveBeenCalledWith("deliver_result", { text: "Sure, Friday works. [time]?", presetId: "responder" }));
});

it("number keys pick presets and only the first nine get a number", async () => {
  render(<Palette />);
  await screen.findByText("Preset 10");
  fireEvent.keyDown(window, { key: "9" });
  expect(screen.getByRole("button", { name: "Preset 8" }).getAttribute("aria-pressed")).toBe("true");
  expect(document.querySelectorAll(".chip-pill")).toHaveLength(1);
  expect(screen.getByRole("button", { name: "Preset 8" }).querySelector(".chip-pill")).toBeTruthy();
  expect(screen.queryByText("10")).toBeNull();
});

it("brings a preset picked by number into view", async () => {
  const seen: string[] = [];
  const original = Element.prototype.scrollIntoView;
  Element.prototype.scrollIntoView = function (this: Element) { seen.push(this.textContent ?? ""); };
  try {
    render(<Palette />);
    await screen.findByText("Preset 10");
    fireEvent.keyDown(window, { key: "9" });
    expect(seen.some((text) => text.includes("Preset 8"))).toBe(true);
  } finally {
    Element.prototype.scrollIntoView = original;
  }
});

it("an error keeps Enter on retry instead of applying", async () => {
  backend(() => Promise.reject("Invalid key"));
  render(<Palette />);
  await screen.findByText("make this better");
  fireEvent.keyDown(window, { key: "Enter" });
  expect((await screen.findByRole("alert")).textContent).toBe("Invalid key");
  fireEvent.keyDown(window, { key: "Enter" });
  await waitFor(() => expect(vi.mocked(invoke).mock.calls.filter(([c]) => c === "refine_text")).toHaveLength(2));
  expect(vi.mocked(invoke).mock.calls.some(([c]) => c === "deliver_result")).toBe(false);
});

it("with reduced motion Esc hides the window at once", async () => {
  // Sem matchMedia (jsdom) conta como movimento reduzido: não há saída animada
  // pra esperar.
  render(<Palette />);
  await screen.findByText("make this better");
  fireEvent.keyDown(window, { key: "Escape" });
  expect(hide).toHaveBeenCalledTimes(1);
});

it("copy confirms and Esc hides the window", async () => {
  Object.assign(navigator, { clipboard: { writeText: vi.fn(() => Promise.resolve()) } });
  render(<Palette />);
  await screen.findByText("make this better");
  fireEvent.keyDown(window, { key: "Enter" });
  await screen.findByText("Better text");
  await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Copy" })); });
  expect(navigator.clipboard.writeText).toHaveBeenCalledWith("Better text");
  expect(screen.getByRole("button", { name: "Copied" })).toBeTruthy();
  vi.useFakeTimers();
  try {
    fireEvent.keyDown(window, { key: "Escape" });
    await act(async () => { vi.advanceTimersByTime(400); });
    expect(hide).toHaveBeenCalled();
  } finally {
    vi.useRealTimers();
  }
});
