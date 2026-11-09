// @vitest-environment jsdom
// O que a janela de Preferências recarrega (e quando): saúde da conexão, presets
// no idioma novo, saldo do provedor, e a rolagem ao trocar de aba.
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { invoke } from "@tauri-apps/api/core";
import type { Settings } from "./types";

// Guarda o callback de foco da janela pra simular "voltei pro app".
const focus = vi.hoisted(() => ({ fire: (_focused: boolean) => {} }));
vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));
vi.mock("@tauri-apps/api/event", () => ({ listen: vi.fn().mockResolvedValue(() => {}) }));
vi.mock("@tauri-apps/api/window", () => ({
  getCurrentWindow: () => ({
    onFocusChanged: vi.fn((cb: (e: { payload: boolean }) => void) => {
      focus.fire = (focused) => cb({ payload: focused });
      return Promise.resolve(() => {});
    }),
    minimize: vi.fn(),
    close: vi.fn(),
  }),
}));
vi.mock("@tauri-apps/api/app", () => ({ getVersion: vi.fn().mockResolvedValue("test") }));
vi.mock("@tauri-apps/plugin-autostart", () => ({ enable: vi.fn(), disable: vi.fn(), isEnabled: vi.fn().mockResolvedValue(false) }));
vi.mock("./autoscroll", () => ({ initAutoScrollbars: () => () => {} }));
vi.mock("./connection", async (importOriginal) => {
  const original = await importOriginal<typeof import("./connection")>();
  return { ...original, connection: original.createConnectionService(invoke) };
});
import App from "./App";

const initial: Settings = {
  default_preset: "estruturar", mode: "instant", output: "replace", autostart: false,
  api_base_url: "https://api.deepseek.com/v1", api_model: "deepseek-chat", api_format: "auto", api_custom: false,
  use_examples: true, trigger_modifier: "ctrl", trigger_key: "c", debounce_ms: 400, locale: "en", theme: "system",
};

let probe: () => Promise<string>;
let current: Settings;
let run = 0;
const calls = (cmd: string) => vi.mocked(invoke).mock.calls.filter(([c]) => c === cmd);

beforeEach(() => {
  localStorage.clear();
  localStorage.setItem("imprompt.tab", "geral");
  probe = async () => "OK";
  // O serviço de conexão guarda o resultado por configuração e é um só no
  // arquivo: cada teste usa um modelo próprio pra começar sem resultado.
  current = { ...initial, api_model: "model-" + ++run };
  vi.mocked(invoke).mockReset();
  vi.mocked(invoke).mockImplementation(async (command) => {
    switch (command) {
      case "get_settings": return { ...current };
      case "get_api_key_status": return { saved: true, masked: "sk-…TEST" };
      case "test_api_connection": return probe();
      case "check_accessibility": return true;
      case "get_api_balance": return { kind: "remaining", amount: 4.2, currency: "USD" };
      case "list_presets": case "get_history": case "get_usage_history": return [];
      default: return null;
    }
  });
});
afterEach(cleanup);

async function openApp() {
  render(<App />);
  await screen.findByRole("button", { name: "Check for updates" });
}

it("probes a failed connection again when the window gets focus back", async () => {
  // A 1ª checagem roda no login, às vezes antes da rede subir: o erro não pode
  // ficar grudado até o usuário clicar.
  probe = () => Promise.reject("offline");
  await openApp();
  await screen.findAllByText("No connection");
  probe = async () => "OK";
  act(() => focus.fire(true));
  await waitFor(() => expect(screen.getAllByText("Connected").length).toBeGreaterThan(0));
  expect(calls("test_api_connection")).toHaveLength(2);
});

it("does not probe again on focus while the connection is fine", async () => {
  await openApp();
  await screen.findAllByText("Connected");
  act(() => focus.fire(true));
  act(() => focus.fire(true));
  await act(() => new Promise((resolve) => setTimeout(resolve, 0)));
  expect(calls("test_api_connection")).toHaveLength(1);
});

it("reloads the presets after a language switch", async () => {
  await openApp();
  expect(calls("list_presets")).toHaveLength(1);
  fireEvent.click(screen.getByRole("button", { name: "Português" }));
  await waitFor(() => expect(calls("list_presets")).toHaveLength(2));
  const order = vi.mocked(invoke).mock.calls.map(([c]) => c);
  expect(order.lastIndexOf("list_presets")).toBeGreaterThan(order.indexOf("set_settings"));
});

it("asks the provider for the balance once per burst of focus events", async () => {
  await openApp();
  await waitFor(() => expect(calls("get_api_balance")).toHaveLength(1));
  for (let i = 0; i < 5; i++) act(() => focus.fire(true));
  await act(() => new Promise((resolve) => setTimeout(resolve, 0)));
  expect(calls("get_api_balance")).toHaveLength(1);
});

it("a tab switch starts at the top of the new tab", async () => {
  await openApp();
  const main = document.querySelector("main")!;
  main.scrollTop = 300;
  fireEvent.click(screen.getByRole("button", { name: "Presets" }));
  expect(main.scrollTop).toBe(0);
});
