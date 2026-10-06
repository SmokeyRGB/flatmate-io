import { describe, expect, it } from "vitest";
import { buildDashboardView, pendingVoteCount, shouldOpenScreening, standingHeadingOf } from "@/app/(resident)/dashboard/dashboard-view";
import { de } from "@/ui/strings";
import type { StartOpenRound, StartOverview } from "@/modules/casting/repository";

const NOW = new Date("2026-10-01T12:00:00Z");

function round(overrides: Partial<StartOpenRound>): StartOpenRound {
  return {
    roundId: "r1",
    title: "Round",
    phaseDeadlineAt: null,
    canVote: true,
    ...overrides,
  };
}

function overview(overrides: Partial<StartOverview>): StartOverview {
  return { anyOpenRound: false, openRounds: [], standing: null, ...overrides };
}

// The awaiting-vote counts are deliberation's (F4 change 1, D3); the view only reads the map.
// Every round of the overview awaits 3 unless `counts` says otherwise.
function awaiting(o: StartOverview, counts: Record<string, number> = {}): Map<string, number> {
  return new Map(o.openRounds.map((r) => [r.roundId, counts[r.roundId] ?? 3]));
}

function build(o: StartOverview, organisationTaskCount = 0, organisation = false, now = NOW, counts = {}) {
  return buildDashboardView(o, awaiting(o, counts), organisationTaskCount, { organisation }, now);
}

// A map WITHOUT the round's entry: what getAwaitingVoteCounts returns to a caller it refused.
function buildWithoutEntry(o: StartOverview) {
  return buildDashboardView(o, new Map(), 0, { organisation: false }, NOW);
}

describe("buildDashboardView (start-screen design.md Decision 10, tasks.md 7.4)", () => {
  it("one T-5 -> primary, no rows", () => {
    const view = build(overview({ openRounds: [round({})], anyOpenRound: true }));
    expect(view.primary).not.toBeNull();
    expect(view.rows).toEqual([]);
    expect(view.folded).toBe(0);
  });

  it("five tasks -> 1 primary + 3 rows + folded 1", () => {
    const rounds = Array.from({ length: 5 }, (_, i) =>
      round({ roundId: `r${i}`, title: `Round ${i}`, phaseDeadlineAt: new Date(`2026-10-${10 + i}T00:00:00Z`) }),
    );
    const view = build(overview({ openRounds: rounds, anyOpenRound: true }));
    expect(view.primary).not.toBeNull();
    expect(view.rows).toHaveLength(3);
    expect(view.folded).toBe(1);
    // Review finding: the folded task must be listed, not just counted (rahmenwerk.md §2.3).
    expect(view.foldedTasks).toHaveLength(1);
    expect(view.foldedTasks[0].reason).toContain("14. Oktober 2026");
  });

  // Start spec, "Two rounds": each round's task leads to that round's pass.
  it("each round's task links to its round", () => {
    const rounds = [
      round({ roundId: "round-a", phaseDeadlineAt: new Date("2026-10-10T00:00:00Z") }),
      round({ roundId: "round-b", phaseDeadlineAt: new Date("2026-10-20T00:00:00Z") }),
    ];
    const view = build(overview({ openRounds: rounds, anyOpenRound: true }));
    expect(view.primary?.href).toBe("/casting/screening?round=round-a");
    expect(view.rows.map((r) => r.href)).toEqual(["/casting/screening?round=round-b"]);
  });

  it("a round awaiting nothing creates no task", () => {
    const o = overview({ openRounds: [round({})], anyOpenRound: true });
    const view = build(o, 0, false, NOW, { r1: 0 });
    expect(view.primary).toBeNull();
  });

  // Review finding: a deadline just after midnight in Berlin is the previous day in UTC. The
  // reason must name the household's day, whatever time zone the server runs in.
  it("the dated reason names the Berlin calendar day, not the server's", () => {
    const view = build(
      overview({ openRounds: [round({ phaseDeadlineAt: new Date("2026-10-01T22:30:00Z") })], anyOpenRound: true }),
      0,
      false,
      new Date("2026-09-30T12:00:00Z"),
    );
    expect(view.primary?.reason).toBe("Stimme ab bis 2. Oktober 2026.");
  });

  it("pendingVoteCount sums voting rounds only", () => {
    expect(pendingVoteCount(null, new Map())).toBe(0);
    const o = overview({
      openRounds: [round({}), round({ roundId: "r2", canVote: false }), round({ roundId: "r3" })],
    });
    expect(pendingVoteCount(o, new Map([["r1", 2], ["r2", 5], ["r3", 1]]))).toBe(3);
  });

  it("no open round -> standing.noRound", () => {
    const view = build(overview({ anyOpenRound: false }));
    expect(view.primary).toBeNull();
    expect(view.standing).toEqual({ kind: "noRound" });
  });

  it("anyOpenRound but no participation -> standing.runningWithoutYou, no numbers", () => {
    const view = build(overview({ anyOpenRound: true, standing: null }));
    expect(view.primary).toBeNull();
    expect(view.standing).toEqual({ kind: "runningWithoutYou" });
  });

  it("can_vote = false -> no primary, standing present", () => {
    const view = build(
      overview({
        anyOpenRound: true,
        openRounds: [round({ canVote: false })],
        standing: { roundId: "r1", stateCounts: { new: 2 } },
      }),
    );
    expect(view.primary).toBeNull();
    expect(view.standing).toEqual({
      kind: "phase",
      waiting: false,
      allRated: false,
      distribution: [{ label: de.start.distribution.in_screening(2), count: 2 }],
    });
  });

  // Human decision 2026-10-06 (design D11): Start names no single phase, because each application
  // has its own standing.
  it("the standing names no phase, whatever the states are", () => {
    const o = overview({
      anyOpenRound: true,
      openRounds: [round({ canVote: false })],
      standing: { roundId: "r1", stateCounts: { new: 1, invited: 2 } },
    });
    const view = build(o);
    expect(view.standing).not.toHaveProperty("phaseLabel");
    for (const name of ["Abstimmung Runde 1", "Terminfindung", "Abstimmung Runde 2", "Zusage läuft"]) {
      expect(JSON.stringify(view)).not.toContain(name);
    }
  });

  it("a standing that is neither waiting nor all rated gets the neutral heading", () => {
    const view = build(
      overview({
        anyOpenRound: true,
        openRounds: [round({ canVote: false })],
        standing: { roundId: "r1", stateCounts: { new: 2 } },
      }),
    );
    expect(standingHeadingOf(view.standing!)).toBe(de.start.standingHeading);
    expect(standingHeadingOf({ kind: "phase", waiting: true, allRated: false, distribution: [] })).toBeNull();
    expect(standingHeadingOf({ kind: "phase", waiting: false, allRated: true, distribution: [] })).toBeNull();
    expect(standingHeadingOf({ kind: "noRound" })).toBeNull();
  });

  it("a round with no main-path application reads as waiting for applications", () => {
    const o = overview({
      anyOpenRound: true,
      openRounds: [round({ canVote: false })],
      standing: { roundId: "r1", stateCounts: {} },
    });
    expect(build(o).standing).toMatchObject({ kind: "phase", waiting: true, allRated: false });
  });

  describe("the acknowledgement (design D11)", () => {
    const standingOf = (stateCounts: Record<string, number>, canVote = true) =>
      overview({
        anyOpenRound: true,
        openRounds: [round({ canVote })],
        standing: { roundId: "r1", stateCounts },
      });

    it("last card rated: something is open for voting and nothing awaits the viewer", () => {
      const view = build(standingOf({ new: 2, screened: 1 }), 0, false, NOW, { r1: 0 });
      expect(view.primary).toBeNull();
      expect(view.standing).toMatchObject({ kind: "phase", allRated: true });
    });

    it("nothing to rate yet: no new/screened application, no acknowledgement", () => {
      const view = build(standingOf({ invited: 2 }), 0, false, NOW, { r1: 0 });
      expect(view.standing).toMatchObject({ kind: "phase", allRated: false });
    });

    it("something still waits: the vote task shows and there is no standing to acknowledge in", () => {
      const view = build(standingOf({ new: 2 }), 0, false, NOW, { r1: 2 });
      expect(view.primary).not.toBeNull();
      expect(view.standing).toBeNull();
    });

    it("no entry for the round (vote permission refused): unknown, not zero, so no acknowledgement", () => {
      const view = buildWithoutEntry(standingOf({ new: 2, screened: 1 }));
      expect(view.primary).toBeNull();
      expect(view.standing).toMatchObject({ kind: "phase", allRated: false });
    });

    it("a viewer who may not vote is not congratulated", () => {
      const view = build(standingOf({ new: 2 }, false), 0, false, NOW, { r1: 0 });
      expect(view.standing).toMatchObject({ kind: "phase", allRated: false });
    });
  });

  it("bridge absent without access; 0 -> all-done; 2 -> plural", () => {
    const noAccess = build(overview({}), 3, false);
    expect(noAccess.bridge).toBeNull();

    const zero = build(overview({}), 0, true);
    expect(zero.bridge?.heading).toBe("Alles erledigt – gut gemacht");

    const two = build(overview({}), 2, true);
    expect(two.bridge?.heading).toBe("2 Sachen warten auf dich");
  });

  it("an overdue deadline -> the overdue reason", () => {
    const view = build(
      overview({
        anyOpenRound: true,
        openRounds: [round({ phaseDeadlineAt: new Date("2020-01-01T00:00:00Z") })],
      }),
    );
    expect(view.primary?.reason).toBe("Die Frist ist abgelaufen — deine Stimme zählt trotzdem noch.");
  });

  it("no view state yields both a primary and an empty surface", () => {
    const withPrimary = build(overview({ openRounds: [round({})], anyOpenRound: true }));
    expect(withPrimary.primary && withPrimary.standing).toBeFalsy();

    const withoutPrimary = build(overview({ anyOpenRound: false }));
    expect(withoutPrimary.primary === null && withoutPrimary.standing !== null).toBe(true);
  });
});

describe("shouldOpenScreening (tasks.md 8.3)", () => {
  it("true with a positive count", () => {
    const o = overview({ openRounds: [round({})] });
    expect(shouldOpenScreening(o, awaiting(o))).toBe(true);
  });

  it("false with none", () => {
    const o = overview({ openRounds: [round({})] });
    expect(shouldOpenScreening(o, awaiting(o, { r1: 0 }))).toBe(false);
  });

  it("false for null", () => {
    expect(shouldOpenScreening(null, new Map())).toBe(false);
  });
});
