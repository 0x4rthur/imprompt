// @vitest-environment jsdom
// "Iniciar com o sistema" pode estar ligado no app e DESATIVADO pelo Windows
// (Gerenciador de Tarefas / Configurações → Inicialização). O plugin de autostart
// não percebe um dos formatos desse bloqueio e diz "ligado"; o app precisa
// avisar e oferecer o conserto.
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { invoke } from "@tauri-apps/api/core";
import type { Settings } from "./types";

const focus = vi.hoisted(() => ({ fire: (_focused: boolean) => {} }));
// Estado do "sistema": o que o plugin diz e o que o Windows faz de verdade.
const os = vi.hoisted(() => ({ pluginEnabled: true, blocked: true, enable: vi.fn(), disable: vi.fn() }));
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
vi.mock("@tauri-apps/plugin-autostart", () => ({
  enable: () => os.enable(),
  disable: () => os.disable(),
  isEnabled: () => Promise.resolve(os.pluginEnabled),
}));
vi.mock("./autoscroll", () => ({ initAutoScrollbars: () => () => {} }));
import App from "./App";

const initial: Settings = {
  default_preset: "estruturar", mode: "instant", output: "replace", autostart: true,
  api_base_url: "https://api.openai.com/v1", api_model: "gpt-5.6-luna", api_format: "auto", api_custom: false,
  use_examples: true, trigger_modifier: "ctrl", trigger_key: "c", debounce_ms: 400, locale: "en", theme: "system",
};
const TITLE = "Windows turned off Imprompt's startup";
const startupSwitch = () => screen.getByRole("checkbox", { name: "Start with the system" }) as HTMLInputElement;

beforeEach(() => {
  localStorage.clear();
  localStorage.setItem("imprompt.tab", "geral");
  os.pluginEnabled = true;
  os.blocked = true;
  // Religar pelo plugin grava o valor "aprovado" no Windows; desligar remove a entrada.
  os.enable.mockReset().mockImplementation(async () => { os.pluginEnabled = true; os.blocked = false; });
  os.disable.mockReset().mockImplementation(async () => { os.pluginEnabled = false; os.blocked = false; });
  vi.mocked(invoke).mockReset();
  vi.mocked(invoke).mockImplementation(async (command) => {
    switch (command) {
      case "get_settings": return { ...initial };
      case "is_autostart_blocked": return os.blocked;
      case "get_api_key_status": return { saved: true, masked: "sk-…TEST" };
      case "test_api_connection": return "OK";
      case "check_accessibility": return true;
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

it("warns that Windows turned the startup off, and turns it back on", async () => {
  await openApp();
  expect(await screen.findByText(TITLE)).toBeTruthy();
  // O plugin diz "ligado", mas o app não está abrindo com o sistema: a chave mostra a verdade.
  expect(startupSwitch().checked).toBe(false);
  fireEvent.click(screen.getByRole("button", { name: "Turn back on" }));
  await waitFor(() => expect(screen.queryByText(TITLE)).toBeNull());
  expect(os.enable).toHaveBeenCalledTimes(1);
  expect(startupSwitch().checked).toBe(true);
  expect(invoke).toHaveBeenCalledWith("set_settings", { newSettings: expect.objectContaining({ autostart: true }) });
});

it("'Keep it off' removes the startup entry and the warning", async () => {
  await openApp();
  await screen.findByText(TITLE);
  fireEvent.click(screen.getByRole("button", { name: "Keep it off" }));
  await waitFor(() => expect(screen.queryByText(TITLE)).toBeNull());
  expect(os.disable).toHaveBeenCalledTimes(1);
  expect(os.enable).not.toHaveBeenCalled();
  expect(startupSwitch().checked).toBe(false);
  expect(invoke).toHaveBeenCalledWith("set_settings", { newSettings: expect.objectContaining({ autostart: false }) });
});

it("turning the switch on also clears the block", async () => {
  await openApp();
  await screen.findByText(TITLE);
  fireEvent.click(startupSwitch());
  await waitFor(() => expect(screen.queryByText(TITLE)).toBeNull());
  expect(os.enable).toHaveBeenCalledTimes(1);
  expect(startupSwitch().checked).toBe(true);
});

it("shows no warning when the startup works", async () => {
  os.blocked = false;
  await openApp();
  await waitFor(() => expect(startupSwitch().checked).toBe(true));
  expect(screen.queryByText(TITLE)).toBeNull();
});

it("notices on window focus when the startup was fixed in Windows itself", async () => {
  await openApp();
  await screen.findByText(TITLE);
  os.blocked = false; // o usuário reativou no Gerenciador de Tarefas e voltou pro app
  act(() => focus.fire(true));
  await waitFor(() => expect(screen.queryByText(TITLE)).toBeNull());
  expect(startupSwitch().checked).toBe(true);
});
