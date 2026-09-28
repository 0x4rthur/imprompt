// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import type { Settings } from "../types";
import type { AppUpdater } from "../useAppUpdater";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn(() => Promise.resolve(null)) }));
vi.mock("@tauri-apps/api/app", () => ({ getVersion: vi.fn(() => Promise.resolve("0.1.7")) }));
import GeralTab from "./GeralTab";

const settings = { locale: "en", theme: "system" } as Settings;
const updater: AppUpdater = { version: null, checking: false, checked: false, installing: false, error: "", progress: null, check: vi.fn(), install: vi.fn() };

afterEach(cleanup);

it("shows the installed version up front and switches the theme", async () => {
  const update = vi.fn(() => Promise.resolve());
  render(<GeralTab autostart={false} toggleAutostart={vi.fn()} autostartErr="" settings={settings} update={update} updater={updater} />);
  expect(await screen.findByText("v0.1.7")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Dark" }));
  expect(update).toHaveBeenCalledWith({ theme: "dark" });
});
