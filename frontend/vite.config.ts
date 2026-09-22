import path from "node:path";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { loadEnv, type Plugin } from "vite";
/// <reference types="vitest/config" />
import { defineConfig } from "vitest/config";

const DEV_PORT = 5173;

/**
 * The token `index.html` carries wherever it needs the app's own origin.
 *
 * Social preview tags are the only reason it exists: `og:image` and `og:url`
 * must be absolute URLs — WhatsApp, Telegram, Facebook and X discard a relative
 * one rather than resolving it — and `index.html` is static, so the origin has
 * to be substituted at build time by the plugin below.
 *
 * Deliberately not Vite's own `%VITE_*%` syntax. That mechanism is real and
 * would work, but it warns noisily and leaves the literal placeholder in the
 * output when the variable is unset, which is precisely the case that must not
 * happen silently. A distinct token that only this plugin knows about cannot be
 * half-replaced: either the build substitutes it, or it is visible in the built
 * HTML for anyone to notice.
 */
const SITE_ORIGIN_PLACEHOLDER = "__SITE_ORIGIN__";

/**
 * The origin the deployed app is served from.
 *
 * Resolution order, and why:
 *
 *  1. `VITE_SITE_ORIGIN` — an explicit override, and the only one needed behind
 *     a custom domain.
 *  2. `VERCEL_PROJECT_PRODUCTION_URL`, which Vercel injects into every build and
 *     sets to the project's *production* domain. Not `VERCEL_URL`: that is the
 *     per-deployment hostname, so a preview deployment would bake an ephemeral
 *     URL into its own share card and the card would rot the moment the
 *     deployment was pruned.
 *  3. localhost, so `pnpm dev` and `pnpm build` work on a fresh clone with no
 *     environment at all.
 */
function resolveSiteOrigin(configured: string | undefined, environment: NodeJS.ProcessEnv): string {
  const explicit = configured?.trim();
  if (explicit) return withProtocol(explicit);

  const vercelProductionDomain = environment.VERCEL_PROJECT_PRODUCTION_URL?.trim();
  if (vercelProductionDomain) return `https://${vercelProductionDomain}`;

  return `http://localhost:${DEV_PORT}`;
}

/** Tolerate a bare host like `property.aau.edu.et`, which is what people paste. */
function withProtocol(value: string): string {
  const trimmed = value.replace(/\/+$/, "");
  return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
}

/**
 * Substitute `SITE_ORIGIN_PLACEHOLDER` in `index.html`.
 *
 * `order: "pre"` runs this before Vite's own HTML handling, so the tags are
 * already complete when the rest of the pipeline looks at them.
 */
function siteOriginPlugin(origin: string): Plugin {
  return {
    name: "cncs:site-origin",
    transformIndexHtml: {
      order: "pre",
      handler: (html) => html.replaceAll(SITE_ORIGIN_PLACEHOLDER, origin),
    },
  };
}

// See docs/frontend-design-system.md §3.5 for why Tailwind is wired through
// `@tailwindcss/vite` (CSS-first `@theme`, no separate postcss.config.js) and
// docs/frontend-phase-1.md for why Vitest config lives here instead of a
// second file: one config, one source of truth for path aliases.
export default defineConfig(({ mode }) => {
  // `loadEnv` reads `frontend/.env*`; Vercel's own variables are injected into
  // the build's `process.env` instead, so both are consulted, with the real
  // process environment taking precedence over a checked-out dot file.
  const fromDotEnv = loadEnv(mode, import.meta.dirname, "VITE_");
  const siteOrigin = resolveSiteOrigin(
    fromDotEnv.VITE_SITE_ORIGIN ?? process.env.VITE_SITE_ORIGIN,
    process.env,
  );

  if (mode === "production") {
    // Printed once per build on purpose. A wrong origin here produces share
    // cards whose images point at nothing, and that failure is invisible until
    // somebody pastes a link into a group chat — where it is far too late.
    console.log(`[cncs:site-origin] social preview URLs will point at ${siteOrigin}`);
  }

  return {
    plugins: [react(), tailwindcss(), siteOriginPlugin(siteOrigin)],
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
      port: DEV_PORT,
    },
    test: {
      environment: "jsdom",
      globals: true,
      setupFiles: ["./src/test/setup.ts"],
      css: true,
      // jsdom environment creation dominates the runtime here, and Vitest's 5s
      // default is wall-clock, not logic — a slow CI box would flake the longest
      // flow tests that pass comfortably in isolation. The Phase 3 cross-phase
      // walkthroughs render the real route tree and click through a dozen screens,
      // so the budget has to cover a fully loaded parallel run, not one file alone.
      // 30s is still a real hang, not a slow test.
      testTimeout: 30_000,
      hookTimeout: 30_000,
    },
  };
});
