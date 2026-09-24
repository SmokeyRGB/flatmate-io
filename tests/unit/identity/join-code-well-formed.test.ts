import { describe, expect, it } from "vitest";
import { isWellFormedJoinCode, normalizeJoinCode } from "@/modules/identity/repository";

// join-screen design.md Decision 3 (FR-2.27/EC-2.15/AC-2.24): the one definition of "a string that
// could be a code at all" — used to refuse a malformed manual entry BEFORE any lookup (I2), and to
// make the redirects it feeds safe (the alphabet excludes every URL-meaningful character).
describe("isWellFormedJoinCode", () => {
  it("accepts a valid code", () => {
    expect(isWellFormedJoinCode("UAMPN-QACVZ")).toBe(true);
  });

  it("accepts messy input once normalised (lower case, a space, no hyphen)", () => {
    const normalised = normalizeJoinCode("uampn qacvz");
    expect(normalised).toBe("UAMPN-QACVZ");
    expect(isWellFormedJoinCode(normalised)).toBe(true);
  });

  it("refuses the wrong length", () => {
    expect(isWellFormedJoinCode("UAMPN-QACV")).toBe(false);
    expect(isWellFormedJoinCode("UAMPN-QACVZZ")).toBe(false);
    expect(isWellFormedJoinCode("UAMPNQ-ACVZ")).toBe(false);
  });

  // JOIN_CODE_ALPHABET (repository.ts) deliberately excludes I, O, 0, 1 — no confusable pair.
  it.each(["I", "O", "0", "1"])("refuses the excluded character %s", (excluded) => {
    const code = `UAMP${excluded}-QACVZ`;
    expect(isWellFormedJoinCode(code)).toBe(false);
  });

  it("refuses path-traversal- and URL-meaningful-shaped input", () => {
    expect(isWellFormedJoinCode("../X-QACVZ")).toBe(false);
    expect(isWellFormedJoinCode("UAMPN-%2F123")).toBe(false);
    expect(isWellFormedJoinCode("UAMPN-QACV?")).toBe(false);
    expect(isWellFormedJoinCode("UAMPN-QACV#")).toBe(false);
  });

  it("refuses the empty string", () => {
    expect(isWellFormedJoinCode("")).toBe(false);
  });
});
