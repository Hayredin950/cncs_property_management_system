import path from "node:path";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
/// <reference types="vitest/config" />
import { defineConfig } from "vitest/config";

// See docs/frontend-design-system.md §3.5 for why Tailwind is wired through
// `@tailwindcss/vite` (CSS-first `@theme`, no separate postcss.config.js) and
// docs/frontend-phase-1.md for why Vitest config lives here instead of a
// second file: one config, one source of truth for path aliases.
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  server: {
    host: true,
    port: 5173,
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test/setup.ts"],
    css: true,
  },
});
