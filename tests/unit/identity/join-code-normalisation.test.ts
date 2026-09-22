import { describe, expect, it } from "vitest";
import { normalizeJoinCode } from "@/modules/identity/repository";

// design.md Decision 4 (EC-2.15/AC-2.24): normalizeJoinCode upper-cases, strips whitespace and
// hyphens, then re-inserts the separator between the two groups of five — so a code typed off a
// note in any of these shapes resolves to the same link as the one in the invitation URL.
const JOIN_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

describe("normalizeJoinCode", () => {
  it("folds a spaced, lower-case, no-separator code to the canonical stored shape", () => {
    const canonical = normalizeJoinCode("UAMPN-QACVZ");
    expect(normalizeJoinCode(" uampn qacvz ")).toBe(canonical);
    expect(normalizeJoinCode("uampnqacvz")).toBe(canonical);
    expect(normalizeJoinCode("UAMPN-QACVZ")).toBe(canonical);
    expect(canonical).toBe("UAMPN-QACVZ");
  });

  it("never throws on a wrong-length input — it normalises and simply matches nothing later", () => {
    expect(() => normalizeJoinCode("too-short")).not.toThrow();
    expect(() => normalizeJoinCode("")).not.toThrow();
    expect(() => normalizeJoinCode("way-too-long-for-a-join-code")).not.toThrow();
  });

  it("is injective over the issued alphabet — no two distinct codes normalise to the same string", () => {
    // The alphabet already excludes I/O/0/1 (no confusable pair to fold), and normalisation only
    // upper-cases + strips separators/whitespace — neither can map two distinct 10-character
    // strings drawn from this alphabet onto the same normalised output.
    const a = "ABCDE-FGHJK";
    const b = "ABCDE-FGHJL"; // differs in the last character only
    expect(normalizeJoinCode(a)).not.toBe(normalizeJoinCode(b));

    // Sanity: every alphabet character round-trips through normalisation unchanged (already
    // upper-case, already in the alphabet — nothing to fold).
    for (const ch of JOIN_CODE_ALPHABET) {
      expect(normalizeJoinCode(ch.repeat(10))).toBe(`${ch.repeat(5)}-${ch.repeat(5)}`);
    }
  });

  it("strips internal whitespace of any kind, not only spaces", () => {
    expect(normalizeJoinCode("uampn\tqacvz")).toBe("UAMPN-QACVZ");
    expect(normalizeJoinCode("uampn\nqacvz")).toBe("UAMPN-QACVZ");
  });
});
