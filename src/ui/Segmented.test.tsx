// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import Segmented from "./Segmented";

afterEach(cleanup);

it("marca a opção escolhida e avisa a troca", () => {
  const onChange = vi.fn();
  render(
    <Segmented
      ariaLabel="Mode"
      value="a"
      onChange={onChange}
      options={[{ value: "a", label: "Instant" }, { value: "b", label: "Popup" }]}
    />,
  );
  expect(screen.getByRole("group", { name: "Mode" })).toBeTruthy();
  expect(screen.getByRole("button", { name: "Instant" }).getAttribute("aria-pressed")).toBe("true");
  expect(screen.getByRole("button", { name: "Popup" }).getAttribute("aria-pressed")).toBe("false");
  fireEvent.click(screen.getByRole("button", { name: "Popup" }));
  expect(onChange).toHaveBeenCalledWith("b");
});

it("a peça deslizante fica só na opção ativa e fora do nome acessível", () => {
  const { container } = render(
    <Segmented ariaLabel="Theme" value="dark" onChange={() => {}}
      options={[{ value: "system", label: "System" }, { value: "light", label: "Light" }, { value: "dark", label: "Dark" }]} />,
  );
  const pills = container.querySelectorAll(".seg-pill");
  expect(pills).toHaveLength(1);
  expect(pills[0].closest("button")?.textContent).toBe("Dark");
  expect(pills[0].getAttribute("aria-hidden")).toBe("true");
});
