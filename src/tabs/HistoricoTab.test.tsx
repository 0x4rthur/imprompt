// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import HistoricoTab from "./HistoricoTab";

const entry = { original: "orig text", result: "result text", preset: "estruturar", timestamp: Date.now() };

beforeEach(() => {
  Object.assign(navigator, { clipboard: { writeText: vi.fn(() => Promise.resolve()) } });
});
afterEach(cleanup);

it("hides a collapsed entry from assistive tech and reveals it on expand", () => {
  render(<HistoricoTab presets={[]} history={[entry]} />);
  expect(screen.queryByRole("button", { name: "Copy result" })).toBeNull();
  const head = screen.getByRole("button", { expanded: false });
  fireEvent.click(head);
  expect(head.getAttribute("aria-expanded")).toBe("true");
  expect(screen.getByText("result text")).toBeTruthy();
  expect(screen.getByRole("button", { name: "Copy result" })).toBeTruthy();
});

it("copies the result and confirms", async () => {
  render(<HistoricoTab presets={[]} history={[entry]} />);
  fireEvent.click(screen.getByRole("button", { expanded: false }));
  await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Copy result" })); });
  expect(navigator.clipboard.writeText).toHaveBeenCalledWith("result text");
  expect(screen.getByRole("button", { name: "Copied" })).toBeTruthy();
});

it("explains how to start when the session is empty", () => {
  render(<HistoricoTab presets={[]} history={[]} />);
  expect(screen.getByText(/No imprompts in this session yet/)).toBeTruthy();
});
