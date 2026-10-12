import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],

    /**
     * The default 5s timeout is too tight for the tests that rasterize a PNG
     * (`utils/qrGenerator.test.ts`, which renders the printable tag sticker).
     *
     * Alone, that file's seven tests take ~0.3s. Run with the other thirty files —
     * 32 workers' worth of files spread over 2 cores on a GitHub runner — it has
     * been observed to exceed 5s and fail as "Test timed out", twice in one run.
     * That is contention, not logic: the assertion it was about to make passes the
     * moment the CPU comes back.
     *
     * 20s is a wait budget, not a weaker assertion. A test that genuinely hangs
     * still fails, just 15s later — and the alternative (leaving a flake in place)
     * means a red pipeline that hides the next real regression.
     *
     * Same reasoning, same remedy as `frontend/src/test/setup.ts`'s
     * `asyncUtilTimeout` for the login → rehydrate → render chain.
     */
    testTimeout: 20_000,
  },
});
