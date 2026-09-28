import { defineConfig } from "vitest/config";

// Testes de unidade. Ambiente node por padrão; os que tocam o DOM declaram
// `// @vitest-environment jsdom`. O Vite multi-página (vite.config.ts) não
// interfere aqui. `css.include` deixa o teste de tokens ler o styles.css de
// verdade (via `?raw`); os demais imports de CSS seguem vazios nos testes.
export default defineConfig({
  test: { environment: "node", css: { include: [/styles\.css/] } },
});
