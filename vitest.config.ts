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
    // registers a household plus several residents makes several such calls in sequence and
    // routinely exceeds vitest's 5s default; 20s gives real network latency room without letting
    // a truly hung test run forever.
    testTimeout: 20000,
  },
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "./src"),
    },
  },
});
