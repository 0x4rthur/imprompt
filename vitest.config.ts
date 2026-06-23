import { defineConfig } from "vitest/config";

// Testes de unidade (paridade do catálogo i18n). Ambiente node basta — os testes
// atuais não tocam o DOM. O Vite multi-página (vite.config.ts) não interfere aqui.
export default defineConfig({
  test: { environment: "node" },
});
