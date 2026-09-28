// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { MonthUsage, Preset, RefineRecord, Settings, UsageSummary } from "../types";

// Saúde da conexão controlada pelo teste (o Início só LÊ o estado que o menu testa).
// Snapshots estáveis por estado, como o serviço real (useSyncExternalStore exige).
let health: "checking" | "connected" | "error" = "connected";
const SNAPS = {
  checking: { health: "checking", detail: "" },
  connected: { health: "connected", detail: "" },
  error: { health: "error", detail: "" },
} as const;
vi.mock("../connection", () => ({
  apiConfig: () => ({ baseUrl: "https://api.openai.com/v1", model: "gpt-5.6-luna", format: "auto" }),
  connection: { subscribe: () => () => {}, snapshot: () => SNAPS[health] },
}));

import InicioTab from "./InicioTab";

const settings: Settings = {
  default_preset: "estruturar", mode: "instant", output: "replace", autostart: false,
  api_base_url: "https://api.openai.com/v1", api_model: "gpt-5.6-luna", api_format: "auto", api_custom: false,
  use_examples: true, trigger_modifier: "ctrl", trigger_key: "c", debounce_ms: 400, locale: "en", theme: "system",
};
const presets: Preset[] = [{ id: "estruturar", label: "Structure", instruction: "", example_input: "", example_output: "", builtin: true, edited: false }];
const usage: UsageSummary = { month: "2026-09", refinements: 3, cost_usd: 0.0123, approximate: true };
const months: MonthUsage[] = [
  { month: "2026-08", refinements: 5, cost_usd: 0.02, prompt_tokens: 900, completion_tokens: 100, approximate: true },
  { month: "2026-09", refinements: 3, cost_usd: 0.0123, prompt_tokens: 3000, completion_tokens: 1000, approximate: true },
];
const history: RefineRecord[] = [{ original: "fix my email", result: "Task: rewrite the email", preset: "estruturar", timestamp: Date.now() - 120_000 }];

afterEach(() => { cleanup(); health = "connected"; });

describe("Home", () => {
  it("shows the last imprompt and jumps to History", () => {
    const onNavigate = vi.fn();
    render(<InicioTab settings={settings} usage={usage} usageHistory={months} presets={presets} history={history} onNavigate={onNavigate} />);
    expect(screen.getByText("fix my email")).toBeTruthy();
    expect(screen.getByText("Task: rewrite the email")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "View in History" }));
    expect(onNavigate).toHaveBeenCalledWith("historico");
  });

  it("switches the monthly chart between cost and imprompts", () => {
    render(<InicioTab settings={settings} usage={usage} usageHistory={months} presets={presets} history={[]} onNavigate={() => {}} />);
    expect(screen.getByText("Spending by month")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Imprompts" }));
    expect(screen.getByText("Imprompts by month")).toBeTruthy();
    expect(screen.queryByText("Spending by month")).toBeNull();
  });

  it("renders empty data without NaN and explains how to start", () => {
    const { container } = render(<InicioTab settings={settings} usage={null} usageHistory={[]} presets={[]} history={[]} onNavigate={() => {}} />);
    expect(container.textContent).not.toMatch(/NaN|Infinity/);
    expect(screen.getByText(/Nothing in this session yet/)).toBeTruthy();
  });

  it("headline follows the connection and offers setup when it fails", () => {
    const onNavigate = vi.fn();
    const { rerender } = render(<InicioTab settings={settings} usage={usage} usageHistory={months} presets={presets} history={history} onNavigate={onNavigate} />);
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("All set.");
    health = "error";
    rerender(<InicioTab settings={{ ...settings }} usage={usage} usageHistory={months} presets={presets} history={history} onNavigate={onNavigate} />);
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Connect your API.");
    fireEvent.click(screen.getByRole("button", { name: "Set up the API" }));
    expect(onNavigate).toHaveBeenCalledWith("motor");
  });

  it("config tiles open their tabs and keep long values readable", () => {
    const onNavigate = vi.fn();
    const long = { ...settings, api_model: "a-very-long-model-identifier-that-does-not-fit-anywhere" };
    render(<InicioTab settings={long} usage={usage} usageHistory={months} history={history} onNavigate={onNavigate}
      presets={[{ ...presets[0], label: "A preset with a surprisingly long descriptive name" }]} />);
    const presetTile = screen.getByRole("button", { name: /Preset/ });
    expect(presetTile.getAttribute("title")).toContain("A preset with a surprisingly long descriptive name");
    fireEvent.click(presetTile);
    expect(onNavigate).toHaveBeenCalledWith("presets");
  });
});
