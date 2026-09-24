import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// Mirrors tests/unit/identity/join-error-boundary-silent.test.ts exactly (tasks.md 7.3): the
// shared `(resident)/error.tsx` must log nothing and show nothing of the failure itself.
const ERROR_BOUNDARY_PATH = join(__dirname, "..", "..", "..", "src", "app", "(resident)", "error.tsx");

function withoutComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
}

describe("src/app/(resident)/error.tsx logs nothing and shows nothing of the failure itself", () => {
  const source = withoutComments(readFileSync(ERROR_BOUNDARY_PATH, "utf8"));

  it("destructures only `retry` from its props, so the error is never bound", () => {
    expect(source).toMatch(/export default function \w+\(\{\s*retry\s*,?\s*\}\s*:/);
    expect(source).not.toMatch(/\barguments\b/);
    expect(source).not.toMatch(/\bprops\b/);
  });

  it("makes no console call of any spelling", () => {
    expect(source).not.toMatch(/\bconsole\b/);
  });

  it("never reads a message or digest", () => {
    expect(source).not.toMatch(/\bmessage\b/);
    expect(source).not.toMatch(/\bdigest\b(?!\?: string)/);
  });
});
