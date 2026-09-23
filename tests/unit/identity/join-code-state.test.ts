import { describe, expect, it } from "vitest";
import { joinCodeState, removedJoinerCautionApplies, type JoinCodeLinkFacts } from "@/modules/identity/join-code-state";

const NOW = new Date("2026-09-23T12:00:00Z");

function facts(overrides: Partial<JoinCodeLinkFacts> = {}): JoinCodeLinkFacts {
  return {
    deletedAt: null,
    expiresAt: new Date(NOW.getTime() + 60_000),
    uses: 0,
    maxUses: 1,
    hasRemovedJoiner: false,
    ...overrides,
  };
}

// design.md Decision 9 (revised 2026-09-23): joinCodeState is the single source for the label,
// the live/dead split, and the caution. Order: deleted, then expired, then used up, else live.
describe("joinCodeState", () => {
  it("is live when not deleted, not expired, and uses left", () => {
    expect(joinCodeState(facts(), NOW)).toBe("live");
  });

  it("is deleted when deletedAt is set", () => {
    expect(joinCodeState(facts({ deletedAt: new Date(NOW.getTime() - 1000) }), NOW)).toBe("deleted");
  });

  it("is expired when expiresAt is in the past", () => {
    expect(joinCodeState(facts({ expiresAt: new Date(NOW.getTime() - 1000) }), NOW)).toBe("expired");
  });

  it("is expired at the exact boundary (expiresAt == now)", () => {
    expect(joinCodeState(facts({ expiresAt: new Date(NOW.getTime()) }), NOW)).toBe("expired");
  });

  it("is used up when uses reaches maxUses", () => {
    expect(joinCodeState(facts({ uses: 1, maxUses: 1 }), NOW)).toBe("used_up");
  });

  it("is used up at the exact boundary (uses == maxUses)", () => {
    expect(joinCodeState(facts({ uses: 2, maxUses: 2 }), NOW)).toBe("used_up");
  });

  it("is live just below the used-up boundary (uses == maxUses - 1)", () => {
    expect(joinCodeState(facts({ uses: 1, maxUses: 2 }), NOW)).toBe("live");
  });

  it("deleted wins over expired", () => {
    const state = joinCodeState(
      facts({ deletedAt: new Date(NOW.getTime() - 1000), expiresAt: new Date(NOW.getTime() - 2000) }),
      NOW,
    );
    expect(state).toBe("deleted");
  });

  it("deleted wins over used up", () => {
    const state = joinCodeState(facts({ deletedAt: new Date(NOW.getTime() - 1000), uses: 1, maxUses: 1 }), NOW);
    expect(state).toBe("deleted");
  });
});

// design.md Decision 9 (revised): the caution applies to LIVE links only — the first version
// (hasRemovedJoiner && !deletedAt) also flagged used-up and expired links, which the 8.3
// walkthrough caught (a used-up single-use link showed the caution).
describe("removedJoinerCautionApplies", () => {
  it("is true for a live link with a removed joiner", () => {
    expect(removedJoinerCautionApplies(facts({ hasRemovedJoiner: true }), NOW)).toBe(true);
  });

  it("is false for a live link with no removed joiner", () => {
    expect(removedJoinerCautionApplies(facts({ hasRemovedJoiner: false }), NOW)).toBe(false);
  });

  it("is false for a used-up link, even with a removed joiner", () => {
    const link = facts({ hasRemovedJoiner: true, uses: 1, maxUses: 1 });
    expect(removedJoinerCautionApplies(link, NOW)).toBe(false);
  });

  it("is false for an expired link with uses left, even with a removed joiner", () => {
    const link = facts({ hasRemovedJoiner: true, expiresAt: new Date(NOW.getTime() - 1000) });
    expect(removedJoinerCautionApplies(link, NOW)).toBe(false);
  });

  it("is false for a deleted link, even with a removed joiner", () => {
    const link = facts({ hasRemovedJoiner: true, deletedAt: new Date(NOW.getTime() - 1000) });
    expect(removedJoinerCautionApplies(link, NOW)).toBe(false);
  });

  it("is true again once an expired link is extended into the future", () => {
    const expired = facts({ hasRemovedJoiner: true, expiresAt: new Date(NOW.getTime() - 1000) });
    expect(removedJoinerCautionApplies(expired, NOW)).toBe(false);

    const extended: JoinCodeLinkFacts = { ...expired, expiresAt: new Date(NOW.getTime() + 7 * 86_400_000) };
    expect(removedJoinerCautionApplies(extended, NOW)).toBe(true);
  });
});
