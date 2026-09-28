import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";

// Multi-página: a janela principal (Preferências), o loader e o popup.
// `vite --mode mock` (npm run dev:mock) troca os módulos do Tauri por mocks em
// src/dev/tauri-mock pra ver as janelas no navegador com dados de exemplo. Só
// vale no modo mock: o build de produção não muda.
const mock = (file: string) => fileURLToPath(new URL(`./src/dev/tauri-mock/${file}.ts`, import.meta.url));

export default defineConfig(({ mode }) => ({
  plugins: [react()],
  clearScreen: false,
  // O Tauri espera o dev server na 5173; o modo mock usa a porta que o ambiente der.
  server: mode === "mock" ? { port: Number(process.env.PORT) || 5174 } : { port: 5173, strictPort: true },
  resolve: mode === "mock" ? {
    alias: {
      "@tauri-apps/api/core": mock("core"),
      "@tauri-apps/api/event": mock("event"),
      "@tauri-apps/api/window": mock("window"),
      "@tauri-apps/api/app": mock("app"),
      "@tauri-apps/plugin-autostart": mock("autostart"),
    },
  } : undefined,
  build: {
    rollupOptions: {
      input: {
        main: "index.html",
        loader: "loader.html",
        popup: "popup.html",
      },
    },
  },
}));
