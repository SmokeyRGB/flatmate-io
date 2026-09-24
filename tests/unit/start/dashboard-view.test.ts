import { describe, expect, it } from "vitest";
import { buildDashboardView, pendingVoteCount, shouldOpenScreening } from "@/app/(resident)/dashboard/dashboard-view";
import type { StartOpenRound, StartOverview } from "@/modules/casting/repository";

const NOW = new Date("2026-10-01T12:00:00Z");

function round(overrides: Partial<StartOpenRound>): StartOpenRound {
  return {
    roundId: "r1",
    title: "Round",
    phaseDeadlineAt: null,
    canVote: true,
    voteCount: 3,
    ...overrides,
  };
}

function overview(overrides: Partial<StartOverview>): StartOverview {
  return { anyOpenRound: false, openRounds: [], standing: null, ...overrides };
}

describe("buildDashboardView (start-screen design.md Decision 10, tasks.md 7.4)", () => {
  it("one T-5 -> primary, no rows", () => {
    const view = buildDashboardView(overview({ openRounds: [round({})], anyOpenRound: true }), 0, { organisation: false }, NOW);
    expect(view.primary).not.toBeNull();
    expect(view.rows).toEqual([]);
    expect(view.folded).toBe(0);
  });

  it("five tasks -> 1 primary + 3 rows + folded 1", () => {
    const rounds = Array.from({ length: 5 }, (_, i) =>
      round({ roundId: `r${i}`, title: `Round ${i}`, phaseDeadlineAt: new Date(`2026-10-${10 + i}T00:00:00Z`) }),
    );
    const view = buildDashboardView(overview({ openRounds: rounds, anyOpenRound: true }), 0, { organisation: false }, NOW);
    expect(view.primary).not.toBeNull();
    expect(view.rows).toHaveLength(3);
    expect(view.folded).toBe(1);
    // Review finding: the folded task must be listed, not just counted (rahmenwerk.md §2.3).
    expect(view.foldedTasks).toHaveLength(1);
    expect(view.foldedTasks[0].reason).toContain("14. Oktober 2026");
  });

  // Review finding: a deadline just after midnight in Berlin is the previous day in UTC. The
  // reason must name the household's day, whatever time zone the server runs in.
  it("the dated reason names the Berlin calendar day, not the server's", () => {
    const view = buildDashboardView(
      overview({ openRounds: [round({ phaseDeadlineAt: new Date("2026-10-01T22:30:00Z") })], anyOpenRound: true }),
      0,
      { organisation: false },
      new Date("2026-09-30T12:00:00Z"),
    );
    expect(view.primary?.reason).toBe("Stimme ab bis 2. Oktober 2026.");
  });

  it("pendingVoteCount sums voting rounds only", () => {
    expect(pendingVoteCount(null)).toBe(0);
    expect(
      pendingVoteCount(
        overview({ openRounds: [round({ voteCount: 2 }), round({ roundId: "r2", canVote: false, voteCount: 0 }), round({ roundId: "r3", voteCount: 1 })] }),
      ),
    ).toBe(3);
  });

  it("no open round -> standing.noRound", () => {
    const view = buildDashboardView(overview({ anyOpenRound: false }), 0, { organisation: false }, NOW);
    expect(view.primary).toBeNull();
    expect(view.standing).toEqual({ kind: "noRound" });
  });

  it("anyOpenRound but no participation -> standing.runningWithoutYou, no numbers", () => {
    const view = buildDashboardView(overview({ anyOpenRound: true, standing: null }), 0, { organisation: false }, NOW);
    expect(view.primary).toBeNull();
    expect(view.standing).toEqual({ kind: "runningWithoutYou" });
  });

  it("can_vote = false -> no primary, standing present", () => {
    const view = buildDashboardView(
      overview({
        anyOpenRound: true,
        openRounds: [round({ canVote: false })],
        standing: { roundId: "r1", stateCounts: { new: 2 } },
      }),
      0,
      { organisation: false },
      NOW,
    );
    expect(view.primary).toBeNull();
    expect(view.standing).toEqual({
      kind: "phase",
      phaseLabel: "Abstimmung Runde 1",
      distribution: [{ label: "2 in Sichtung", count: 2 }],
    });
  });

  it("bridge absent without access; 0 -> all-done; 2 -> plural", () => {
    const noAccess = buildDashboardView(overview({}), 3, { organisation: false }, NOW);
    expect(noAccess.bridge).toBeNull();

    const zero = buildDashboardView(overview({}), 0, { organisation: true }, NOW);
    expect(zero.bridge?.heading).toBe("Alles erledigt – gut gemacht");

    const two = buildDashboardView(overview({}), 2, { organisation: true }, NOW);
    expect(two.bridge?.heading).toBe("2 Sachen warten auf dich");
  });

  it("an overdue deadline -> the overdue reason", () => {
    const view = buildDashboardView(
      overview({
        anyOpenRound: true,
        openRounds: [round({ phaseDeadlineAt: new Date("2020-01-01T00:00:00Z") })],
      }),
      0,
      { organisation: false },
      NOW,
    );
    expect(view.primary?.reason).toBe("Die Frist ist abgelaufen — deine Stimme zählt trotzdem noch.");
  });

  it("no view state yields both a primary and an empty surface", () => {
    const withPrimary = buildDashboardView(overview({ openRounds: [round({})], anyOpenRound: true }), 0, { organisation: false }, NOW);
    expect(withPrimary.primary && withPrimary.standing).toBeFalsy();

    const withoutPrimary = buildDashboardView(overview({ anyOpenRound: false }), 0, { organisation: false }, NOW);
    expect(withoutPrimary.primary === null && withoutPrimary.standing !== null).toBe(true);
  });
});

describe("shouldOpenScreening (tasks.md 8.3)", () => {
  it("true with a positive count", () => {
    expect(shouldOpenScreening(overview({ openRounds: [round({})] }))).toBe(true);
  });

  it("false with none", () => {
    expect(shouldOpenScreening(overview({ openRounds: [round({ voteCount: 0 })] }))).toBe(false);
  });

  it("false for null", () => {
    expect(shouldOpenScreening(null)).toBe(false);
  });
});
