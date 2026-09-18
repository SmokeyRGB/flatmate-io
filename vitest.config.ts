import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    setupFiles: ["./tests/setup.ts"],
    // F1's identity tests make real Supabase Auth admin API calls (registerHousehold,
    // claimResidentProfile) — genuine HTTPS round-trips, not something to mock (this project
    // tests against the live database/services throughout, per F0's own precedent). A test that
    // registers a household plus several residents makes several such calls in sequence.
    //
    // Raised from 20s on 2026-09-18. 20s was never actually enough on a GitHub runner: the whole
    // suite takes ~47s locally but 260-350s in CI, where individual tests legitimately run
    // 12-19s against the eu-west-1 project. That left under a second of headroom, so run 35333603454
    // (the 003 merge on main, against production, before any of this branch's changes) already
    // failed with four "timed out in 20000ms" — a threshold that fails on variance rather than on
    // a defect is not a gate, it is a coin flip.
    //
    // 60s keeps a genuinely hung test bounded while leaving room for the slowest real test to
    // triple. Teardown counts toward this budget too: these tests call hh.cleanup() in a finally
    // inside the it() body, so the timeout covers setup, assertions and cleanup together.
    testTimeout: 60000,
  },
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "./src"),
    },
  },
});
