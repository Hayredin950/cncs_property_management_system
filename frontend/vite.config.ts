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
      // `import.meta.dirname`, not `__dirname`: Vite's future default config
      // loader ("native") doesn't provide CommonJS globals, and warns about
      // `__dirname` today. Node 20.11+/22 supplies `import.meta.dirname`.
      "@": path.resolve(import.meta.dirname, "./src"),
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
    // jsdom environment creation dominates the runtime here (the whole suite
    // is ~30s with most of it in `environment`), and Vitest's 5s default is
    // wall-clock, not logic — a slow CI box would flake the longest flow tests
    // that pass comfortably in isolation. 20s is a real hang, not a slow test.
    testTimeout: 20_000,
    hookTimeout: 20_000,
  },
});
