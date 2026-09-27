import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // prototype/ is a separate Bun/Vite app (its own eslint.config.js, its own `bun run lint`)
    // outside the handover boundary (CLAUDE.md) — not part of this Next.js project's source.
    "prototype/**",
    "drizzle/**",
    // .claude/ holds tool state and worktree copies of the repository, never source.
    // Human approval 2026-09-26 under G-G3 (openspec/changes/ci-local-database).
    ".claude/**",
  ]),
]);

export default eslintConfig;
