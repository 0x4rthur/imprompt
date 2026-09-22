// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { invoke } from "@tauri-apps/api/core";
import App from "./App";
import type { Settings } from "./types";
import { PROVIDERS } from "./modelCatalog";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));
vi.mock("@tauri-apps/api/event", () => ({ listen: vi.fn().mockResolvedValue(() => {}) }));
vi.mock("@tauri-apps/api/window", () => ({ getCurrentWindow: () => ({ onFocusChanged: vi.fn().mockResolvedValue(() => {}), minimize: vi.fn(), close: vi.fn() }) }));
vi.mock("@tauri-apps/api/app", () => ({ getVersion: vi.fn().mockResolvedValue("test") }));
vi.mock("@tauri-apps/plugin-autostart", () => ({ enable: vi.fn(), disable: vi.fn(), isEnabled: vi.fn().mockResolvedValue(false) }));
vi.mock("./autoscroll", () => ({ initAutoScrollbars: () => () => {} }));
vi.mock("./connection", async (importOriginal) => {
  const original = await importOriginal<typeof import("./connection")>();
  return { ...original, connection: original.createConnectionService(invoke) };
});

const initial: Settings = {
  default_preset: "estruturar", mode: "instant", output: "replace", autostart: false,
  api_base_url: "https://api.openai.com/v1", api_model: "gpt-5.6-luna", api_format: "auto", api_custom: false,
  use_examples: true, trigger_modifier: "ctrl", trigger_key: "c", debounce_ms: 400, locale: "en",
};

beforeEach(() => {
  localStorage.clear();
  localStorage.setItem("imprompt.tab", "motor");
  vi.mocked(invoke).mockReset();
  vi.mocked(invoke).mockImplementation(async (command) => {
    switch (command) {
      case "get_settings": return { ...initial };
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
  await screen.findByLabelText("API key");
  await waitFor(() => expect(screen.getByText("Key saved in the system vault (sk-…TEST)")).toBeTruthy());
}

describe("API settings navigation", () => {
  it("updates the footer estimate and benchmark when selecting a model", async () => {
    await openApp();
    expect(screen.getByTestId("model-cost-note").textContent).toContain("GPT-5.6 Luna: ~$0.0008");
    expect(screen.getByText("AA 25")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Model" }));
    fireEvent.click(screen.getByRole("option", { name: /gpt-5-nano/ }));
    expect(screen.getByTestId("model-cost-note").textContent).toContain("GPT-5 Nano: ~$0.00025");
    expect(screen.getByText("AA 12")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Custom" }));
    expect(screen.getByTestId("model-cost-note").textContent).toContain("No verified price");
    expect(screen.getByText("AA 12")).toBeTruthy();
    fireEvent.change(screen.getByDisplayValue("gpt-5-nano"), { target: { value: "my-unknown-model" } });
    expect(screen.queryByText("AA 12")).toBeNull();
    expect(screen.getByLabelText("Model benchmark")).toBeTruthy();
  });

  it("checks for a new version inside About and offers installation", async () => {
    await openApp();
    const original = vi.mocked(invoke).getMockImplementation()!;
    vi.mocked(invoke).mockImplementation((command, args) => command === "check_for_updates"
      ? Promise.resolve("0.1.3") as ReturnType<typeof invoke>
      : original(command, args));
    fireEvent.click(screen.getByRole("button", { name: "About" }));
    fireEvent.click(screen.getByRole("button", { name: "Check for updates" }));
    await screen.findAllByText("Update available: v0.1.3");
    expect(screen.getAllByRole("button", { name: "Download and restart" })).toHaveLength(2);
    fireEvent.click(screen.getAllByRole("button", { name: "Download and restart" })[1]);
    await waitFor(() => expect(invoke).toHaveBeenCalledWith("install_update"));
    await screen.findByText("You are up to date.");
  });

  it("offers each provider's current suggestions and prices without applying a selection", async () => {
    await openApp();
    for (const provider of PROVIDERS) {
      fireEvent.click(screen.getByRole("button", { name: provider.label }));
      expect(screen.getByRole("button", { name: "Model" }).textContent).toContain(provider.model);
      fireEvent.click(screen.getByRole("button", { name: "Model" }));
      for (const model of provider.models) {
        const option = screen.getByRole("option", { name: new RegExp(model.id.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")) });
        expect(option.textContent).toContain("/ 1M tokens");
      }
      const last = provider.models[provider.models.length - 1];
      fireEvent.click(screen.getByRole("option", { name: new RegExp(last.id.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")) }));
      expect(screen.getByText(last.description.en)).toBeTruthy();
      expect(screen.getByRole("link", { name: "Provider pricing ↗", hidden: true }).getAttribute("href")).toBe(provider.pricingUrl);
    }
    expect(vi.mocked(invoke).mock.calls.some(([command]) => command === "apply_api_configuration")).toBe(false);
  });

  it("keeps a saved model outside the curated list editable and does not show unrelated prices", async () => {
    const original = vi.mocked(invoke).getMockImplementation()!;
    vi.mocked(invoke).mockImplementation((command, args) => command === "get_settings"
      ? Promise.resolve({ ...initial, api_model: "gpt-4o-mini" }) as ReturnType<typeof invoke>
      : original(command, args));
    await openApp();
    expect((screen.getByRole("textbox", { name: "Model id" }) as HTMLInputElement).value).toBe("gpt-4o-mini");
    expect(screen.queryByText("USD / 1M tokens")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "DeepSeek" }));
    fireEvent.click(screen.getByRole("button", { name: "OpenAI" }));
    expect((screen.getByRole("textbox", { name: "Model id" }) as HTMLInputElement).value).toBe("gpt-4o-mini");
  });

  it("does not quote public provider prices for a custom endpoint using the same model ID", async () => {
    await openApp();
    expect(screen.getByText("USD / 1M tokens")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Custom" }));
    expect((screen.getByRole("textbox", { name: "Model id" }) as HTMLInputElement).value).toBe("gpt-5.6-luna");
    expect(screen.queryByText("USD / 1M tokens")).toBeNull();
  });

  it("preserves a custom model draft when leaving and returning to the API tab", async () => {
    await openApp();
    fireEvent.click(screen.getByRole("button", { name: "Model" }));
    fireEvent.click(screen.getByRole("option", { name: "Custom…" }));
    const model = screen.getByRole("textbox", { name: "Model id" });
    fireEvent.change(model, { target: { value: "my-new-model" } });
    fireEvent.click(screen.getByRole("button", { name: "About" }));
    fireEvent.click(screen.getByRole("button", { name: "API" }));
    expect((screen.getByRole("textbox", { name: "Model id" }) as HTMLInputElement).value).toBe("my-new-model");
  });

  it("restores the model after switching providers and never guesses the provider from the key", async () => {
    await openApp();
    fireEvent.click(screen.getByRole("button", { name: "DeepSeek" }));
    await waitFor(() => expect((screen.getByLabelText("Base URL") as HTMLInputElement).value).toContain("deepseek"));
    fireEvent.change(screen.getByLabelText("API key"), { target: { value: "sk-or-test" } });
    expect(screen.getByRole("button", { name: "DeepSeek" }).getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(screen.getByRole("button", { name: "OpenAI" }));
    expect(screen.getByRole("button", { name: "Model" }).textContent).toContain("gpt-5.6-luna");
    fireEvent.click(screen.getByRole("button", { name: "OpenAI" }));
    expect(screen.getByRole("button", { name: "Model" }).textContent).toContain("gpt-5.6-luna");
    expect((screen.getByLabelText("API key") as HTMLInputElement).value).toBe("");
  });

  it("does not save invalid candidates and keeps the form locked across tab navigation during a test", async () => {
    await openApp();
    let reject!: (error: unknown) => void;
    const pending = new Promise<Settings>((_, no) => { reject = no; });
    const original = vi.mocked(invoke).getMockImplementation()!;
    vi.mocked(invoke).mockImplementation((command, args) => command === "apply_api_configuration" ? pending as ReturnType<typeof invoke> : original(command, args));
    fireEvent.click(screen.getByRole("button", { name: "Apply and test" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Testing…" })).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "About" }));
    fireEvent.click(screen.getByRole("button", { name: "API" }));
    expect((screen.getByRole("button", { name: "Testing…" }) as HTMLButtonElement).disabled).toBe(true);
    await act(async () => { reject("Model unavailable"); });
    expect(await screen.findByText("Model unavailable")).toBeTruthy();
    expect(vi.mocked(invoke).mock.calls.some(([command]) => command === "set_settings" || command === "set_api_key")).toBe(false);
  });

  it("exposes protocol selection for a custom endpoint on a known host", async () => {
    await openApp();
    fireEvent.click(screen.getByRole("button", { name: "Custom" }));
    fireEvent.change(screen.getByLabelText("API format"), { target: { value: "responses" } });
    fireEvent.click(screen.getByRole("button", { name: "About" }));
    fireEvent.click(screen.getByRole("button", { name: "API" }));
    expect((screen.getByLabelText("API format") as HTMLSelectElement).value).toBe("responses");
    expect((screen.getByLabelText("Base URL") as HTMLInputElement).readOnly).toBe(false);
  });

  it("ignores a late saved-key lookup from a previously selected provider", async () => {
    await openApp();
    let resolveOld!: (value: unknown) => void;
    const oldStatus = new Promise((resolve) => { resolveOld = resolve; });
    const original = vi.mocked(invoke).getMockImplementation()!;
    vi.mocked(invoke).mockImplementation((command, args) => {
      if (command === "get_api_key_status") {
        const base = (args as { baseUrl: string }).baseUrl;
        return (base.includes("deepseek") ? oldStatus : Promise.resolve({ saved: false, masked: "" })) as ReturnType<typeof invoke>;
      }
      return original(command, args);
    });
    fireEvent.click(screen.getByRole("button", { name: "DeepSeek" }));
    fireEvent.click(screen.getByRole("button", { name: "Anthropic" }));
    await act(async () => { resolveOld({ saved: true, masked: "sk-…OLD1" }); });
    expect(screen.queryByText(/Key saved in the system vault/)).toBeNull();
  });

  it("activates a successful candidate once and shares its result with the rail", async () => {
    await openApp();
    const original = vi.mocked(invoke).getMockImplementation()!;
    vi.mocked(invoke).mockImplementation((command, args) => {
      if (command === "apply_api_configuration") {
        const config = args as { baseUrl: string; model: string; format: Settings["api_format"]; custom: boolean };
        return Promise.resolve({ ...initial, api_base_url: config.baseUrl, api_model: config.model, api_format: config.format, api_custom: config.custom }) as ReturnType<typeof invoke>;
      }
      return original(command, args);
    });
    fireEvent.click(screen.getByRole("button", { name: "Custom" }));
    fireEvent.change(screen.getByLabelText("Base URL"), { target: { value: "http://localhost:1234/v1/responses" } });
    fireEvent.change(screen.getByRole("textbox", { name: "Model id" }), { target: { value: "local/custom" } });
    const probesBefore = vi.mocked(invoke).mock.calls.filter(([command]) => command === "test_api_connection").length;
    fireEvent.click(screen.getByRole("button", { name: "Apply and test" }));
    await waitFor(() => expect(screen.getAllByText("Connected").length).toBe(2));
    expect(vi.mocked(invoke).mock.calls.filter(([command]) => command === "test_api_connection").length).toBe(probesBefore);
    expect(vi.mocked(invoke).mock.calls.filter(([command]) => command === "apply_api_configuration")).toHaveLength(1);
    expect((screen.getByLabelText("API key") as HTMLInputElement).value).toBe("");
  });
});
