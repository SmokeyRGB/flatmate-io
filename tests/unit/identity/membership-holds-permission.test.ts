import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const { membershipHoldsPermission } = await import("@/modules/identity/repository");

// assertAccountCanVoteTx's `!membershipHoldsPermission(row, "vote")` branch cannot be reached with
// legal data since drizzle/0037 (a live resident always stores `vote`, and every vote path refuses
// a null profile first). It stays as defence in depth; this pure case is the proof of the check.
describe("membershipHoldsPermission and vote", () => {
  it("is false for a live row that does not store vote, and for a revoked row that does", () => {
    expect(membershipHoldsPermission({ permissions: [], revokedAt: null }, "vote")).toBe(false);
    expect(membershipHoldsPermission({ permissions: ["manage_rooms"], revokedAt: null }, "vote")).toBe(false);
    expect(membershipHoldsPermission({ permissions: ["vote"], revokedAt: new Date() }, "vote")).toBe(false);
    expect(membershipHoldsPermission({ permissions: ["vote"], revokedAt: null }, "vote")).toBe(true);
  });
});
