import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Multi-página: a janela principal (Preferências), o loader e o popup.
export default defineConfig({
  plugins: [react()],
  clearScreen: false,
  server: { port: 5173, strictPort: true },
  build: {
    rollupOptions: {
      input: {
        main: "index.html",
        loader: "loader.html",
        popup: "popup.html",
      },
    },
  },
});
