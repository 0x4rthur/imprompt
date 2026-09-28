// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { ApiProviderIcon } from "./ApiProviderIcon";

afterEach(cleanup);

// Marcas monocromáticas não têm cor própria: herdam a do texto em volta, então
// ficam legíveis no bloco claro do menu, no card claro e no card escuro.
it.each([
  ["https://openrouter.ai/api/v1", "OpenRouter"],
  ["https://api.x.ai/v1", "xAI"],
])("the %s logo takes the surrounding text color", (host, name) => {
  render(<ApiProviderIcon host={host} />);
  expect(screen.getByRole("img", { name }).getAttribute("fill")).toBe("currentColor");
});
