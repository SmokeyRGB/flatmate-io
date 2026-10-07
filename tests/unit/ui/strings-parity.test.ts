import { describe, expect, it } from "vitest";
import { de } from "@/ui/strings/de";
import { en } from "@/ui/strings/en";

// language-switch D1/D10: `en.ts` satisfies `Strings` at build time; this walk is the belt and
// braces that survives someone loosening that type. A path maps to "string" or, for a function
// entry, to its declared parameter count.
function shape(node: unknown, prefix = "", out: Record<string, string> = {}): Record<string, string> {
  for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (typeof value === "function") out[path] = `function/${value.length}`;
    else if (value !== null && typeof value === "object") shape(value, path, out);
    else out[path] = typeof value;
  }
  return out;
}

describe("string tables", () => {
  it("define the same key paths in both languages", () => {
    expect(Object.keys(shape(en)).sort()).toEqual(Object.keys(shape(de)).sort());
  });

  it("agree on which entries are functions and how many parameters they declare", () => {
    expect(shape(en)).toEqual(shape(de));
  });
});
