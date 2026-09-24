import { describe, expect, it } from "vitest";
import { isWellFormedEmail, normalizeEmail } from "@/modules/identity/auth";

// resident-settings design.md Decision 2: one plain shape check (x@y.z, no whitespace), no
// library — exercised directly, without a database or Supabase Auth round trip (design.md
// constraint 2 / Non-Goals, same reasoning as identity/join-screen-state's own unit tests).
describe("normalizeEmail", () => {
  it("trims surrounding whitespace", () => {
    expect(normalizeEmail("  lea@example.test  ")).toBe("lea@example.test");
  });

  it("lower-cases the address", () => {
    expect(normalizeEmail("Lea@Example.Test")).toBe("lea@example.test");
  });

  it("trims and lower-cases together", () => {
    expect(normalizeEmail("  Lea@Example.Test  ")).toBe("lea@example.test");
  });

  it("an empty or whitespace-only input normalises to the empty string", () => {
    expect(normalizeEmail("")).toBe("");
    expect(normalizeEmail("   ")).toBe("");
  });
});

describe("isWellFormedEmail", () => {
  it("accepts an ordinary address", () => {
    expect(isWellFormedEmail("lea@example.test")).toBe(true);
  });

  it("refuses an address with no @", () => {
    expect(isWellFormedEmail("lea.example.test")).toBe(false);
  });

  it("refuses an address with no domain dot", () => {
    expect(isWellFormedEmail("lea@example")).toBe(false);
  });

  it("refuses an address containing whitespace", () => {
    expect(isWellFormedEmail("lea @example.test")).toBe(false);
    expect(isWellFormedEmail("lea@ example.test")).toBe(false);
  });

  it("refuses the empty string", () => {
    expect(isWellFormedEmail("")).toBe(false);
  });

  // Break (task 6.7): skipping the lower-casing step would let "Lea@Example.Test" and
  // "lea@example.test" be treated as two different addresses — this is the assertion that fails
  // if normalizeEmail is changed to skip `.toLowerCase()`.
  it("two addresses differing only by case normalise to the same value", () => {
    expect(normalizeEmail("Lea@Example.Test")).toBe(normalizeEmail("lea@example.test"));
  });
});
