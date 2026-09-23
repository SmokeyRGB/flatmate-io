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
    // triple. Teardown runs in afterEach, outside this budget, so a hung test can no longer take
    // its household's cleanup down with it.
    testTimeout: 60000,
    // Vitest 5 defaults hookTimeout to 10000ms
    // (node_modules/vitest/dist/chunks/index.DzobfTyw.js:14671). Teardown moved into afterEach on
    // 2026-09-18 and so silently fell from the 60s test budget above to that 10s default — a
    // single household's cleanup (one DB round trip plus one Supabase Auth deleteUser) can exceed
    // that on its own against eu-west-1, where CI operations legitimately run 12-19s. Match
    // testTimeout so teardown has the same budget it had before the move.
    hookTimeout: 60000,
    // The suite is network-bound: 98% of CI time is waiting on round trips from a US GitHub
    // runner to eu-west-1, not CPU. Vitest's default (availableParallelism() - 1) gives a 4-vCPU
    // runner 3 workers, most of them idle on I/O. CI raises it via VITEST_MAX_WORKERS
    // (.github/workflows/ci.yml); unset, the default stands, so local runs are unchanged. The
    // ceiling is Supabase's, not the runner's: each worker holds up to 10 pooler connections, and
    // Auth rate-limits sign-ins per IP, which every worker shares — lower the number if CI starts
    // failing on 429s or connection limits rather than on assertions.
    maxWorkers: Number(process.env.VITEST_MAX_WORKERS) || undefined,
  },
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "./src"),
    },
  },
});
