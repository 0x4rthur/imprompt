// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { invoke } from "@tauri-apps/api/core";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn(() => Promise.resolve()) }));
import BalanceLine, { isLowBalance } from "./BalanceLine";

afterEach(cleanup);

it("shows the remaining balance in the account's currency", () => {
  render(<BalanceLine balance={{ kind: "remaining", amount: 4.2, currency: "USD" }} />);
  expect(screen.getByText(/Balance:/).textContent).toContain("$4.20");
  expect(screen.queryByText("low")).toBeNull();
});

it("flags a low balance", () => {
  render(<BalanceLine balance={{ kind: "remaining", amount: 0.42, currency: "USD" }} />);
  expect(screen.getByText("low")).toBeTruthy();
});

it("shows what a key without a spending limit has spent", () => {
  render(<BalanceLine balance={{ kind: "used", amount: 1.5, currency: "USD" }} />);
  expect(screen.getByText(/Spent with this key/).textContent).toContain("$1.50");
});

it("links to the provider's billing page when the balance can't be read", () => {
  render(<BalanceLine balance={{ kind: "unsupported", billing_url: "https://console.anthropic.com/settings/billing" }} />);
  fireEvent.click(screen.getByRole("button", { name: /balance on the provider's site/ }));
  expect(invoke).toHaveBeenCalledWith("open_url", { url: "https://console.anthropic.com/settings/billing" });
});

it("renders nothing for a custom endpoint or while loading", () => {
  const { container, rerender } = render(<BalanceLine balance={{ kind: "unsupported", billing_url: null }} />);
  expect(container.textContent).toBe("");
  rerender(<BalanceLine balance={null} />);
  expect(container.textContent).toBe("");
});

it("low means under about one dollar, per currency", () => {
  expect(isLowBalance({ kind: "remaining", amount: 0.99, currency: "USD" })).toBe(true);
  expect(isLowBalance({ kind: "remaining", amount: 1.5, currency: "USD" })).toBe(false);
  expect(isLowBalance({ kind: "remaining", amount: 5, currency: "CNY" })).toBe(true);
  expect(isLowBalance({ kind: "used", amount: 0.1, currency: "USD" })).toBe(false);
  expect(isLowBalance(null)).toBe(false);
});
