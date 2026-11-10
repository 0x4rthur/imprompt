// @vitest-environment jsdom
// O que a pessoa lê enquanto a atualização baixa. Numa conexão instável o
// download é tentado de novo sozinho, e a tela precisa dizer isso — senão parece
// que travou.
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import UpdateStatus from "./UpdateStatus";
import type { AppUpdater } from "./useAppUpdater";

afterEach(cleanup);

const updater = (over: Partial<AppUpdater>): AppUpdater => ({
  version: "0.1.3", checking: false, checked: true, installing: true, error: "", progress: null,
  check: async () => {}, install: async () => {}, ...over,
});

it("a first attempt shows only the progress", () => {
  render(<UpdateStatus updater={updater({ progress: { phase: "downloading", downloaded: 50, total: 100, attempt: 1 } })} />);
  expect(screen.getByText("Downloading… 50%")).toBeTruthy();
  expect(screen.queryByText(/attempt/)).toBeNull();
});

it("says when it is trying the download again", () => {
  render(<UpdateStatus updater={updater({ progress: { phase: "downloading", downloaded: 0, total: null, attempt: 2 } })} />);
  expect(screen.getByText(/attempt 2/)).toBeTruthy();
});

it("keeps the percentage next to the attempt", () => {
  render(<UpdateStatus updater={updater({ progress: { phase: "downloading", downloaded: 30, total: 100, attempt: 3 } })} />);
  expect(screen.getByText(/30%.*attempt 3/)).toBeTruthy();
});
