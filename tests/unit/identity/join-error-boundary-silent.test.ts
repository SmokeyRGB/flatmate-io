import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// G-A5: this route's unexpected-failure text is exactly where a code could leak into a log or a
// screen (design.md Decision 5). A guard in the style of scripts/lint/ — reading the file as text,
// like scripts/lint/definer-coverage.ts does for its own "no bare name(" rule, rather than
// rendering it (this suite has no DOM, design.md constraint 2).
//
// Review fix: matching `.message`/`.digest` alone missed `String(error)`, a template literal,
// `JSON.stringify(error)` and a destructured `{ error: { message } }`. The stronger rule is that the
// component never BINDS the error at all: it destructures only `retry`, and no other parameter
// name, `arguments` or `props` gives it a second way in.
const ERROR_BOUNDARY_PATH = join(__dirname, "..", "..", "..", "src", "app", "(auth)", "join", "error.tsx");

function withoutComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
}

describe("src/app/(auth)/join/error.tsx logs nothing and shows nothing of the failure itself", () => {
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
