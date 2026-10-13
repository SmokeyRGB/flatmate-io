import { describe, expect, it } from "vitest";
import { buildStatusHeader } from "@/app/(org)/organization/status-sentence";
import { de, tables } from "@/ui/strings";

const en = tables.en;

// organisation-task-list D4 points 2-3 (tasks.md 5.1): the status sentence and the progress caption
// as one pure mapping. Only facts the caller may see: stateCounts is null for a session without a
// resident profile (G-D15), and the sentence then carries no number.

const round = { title: "Herbstrunde" };

describe("buildStatusHeader: a round is running", () => {
  it("a profile caller sees the distribution and the voting step", () => {
    const h = buildStatusHeader({ activeRound: round, stateCounts: { new: 5, screened: 2, invited: 1 }, taskKinds: [], hasAnyRound: true }, de);
    // fix round F1: new + screened are both "in Abstimmung" (7), invited is "eingeladen" (1); the furthest
    // state is invited, but seven applications still await votes, so voting is named as running.
    expect(h.sentence).toBe("Herbstrunde läuft.");
    expect(h.detail).toBe("8 Bewerbungen, davon 1 eingeladen.");
    expect(h.caption).toBe("Schritt 4 von 4 · Einladungen verschicken · Abstimmen läuft noch");
    expect(h.steps.map((x) => x.state)).toEqual(["done", "done", "running", "current"]);
  });

  it("one application reads in the singular", () => {
    const h = buildStatusHeader({ activeRound: round, stateCounts: { new: 1 }, taskKinds: [], hasAnyRound: true }, de);
    expect(h.detail).toBe("1 Bewerbung.");
  });

  it("voting while only new/screened applications exist", () => {
    const h = buildStatusHeader({ activeRound: round, stateCounts: { new: 3 }, taskKinds: [], hasAnyRound: true }, de);
    expect(h.sentence).toBe("Herbstrunde läuft.");
    expect(h.detail).toBe("3 Bewerbungen.");
    expect(h.caption).toBe("Schritt 3 von 4 · Abstimmen");
    expect(h.steps.map((x) => x.state)).toEqual(["done", "done", "current", "next"]);
  });

  it("no application yet: says so, and the step is collecting applications", () => {
    const h = buildStatusHeader({ activeRound: round, stateCounts: {}, taskKinds: [], hasAnyRound: true }, de);
    expect(h.sentence).toBe("Herbstrunde läuft.");
    expect(h.detail).toBe("Noch keine Bewerbung da.");
    expect(h.caption).toBe("Schritt 2 von 4 · Bewerbungen sammeln");
  });

  it("only side states count as no application", () => {
    const h = buildStatusHeader({ activeRound: round, stateCounts: { rejected_by_household: 4 }, taskKinds: [], hasAnyRound: true }, de);
    expect(h.sentence).toBe("Herbstrunde läuft.");
    expect(h.detail).toBe("Noch keine Bewerbung da.");
  });

  it("clamps a later phase to the invited step, with no later step shown", () => {
    const h = buildStatusHeader({ activeRound: round, stateCounts: { interviewed: 1 }, taskKinds: [], hasAnyRound: true }, de);
    expect(h.steps).toHaveLength(4);
    expect(h.caption).toBe("Schritt 4 von 4 · Einladungen verschicken");
    expect(h.steps.map((x) => x.state)).toEqual(["done", "done", "done", "current"]);
  });

  it("one invited and six new: voting is running, not done (fix round F1)", () => {
    const h = buildStatusHeader({ activeRound: round, stateCounts: { invited: 1, new: 6 }, taskKinds: [], hasAnyRound: true }, de);
    expect(h.steps[2].state).toBe("running");
    expect(h.steps[3].state).toBe("current");
    expect(h.caption).toContain("Abstimmen läuft noch");
  });

  it("all decided: voting is done (fix round F1)", () => {
    const h = buildStatusHeader({ activeRound: round, stateCounts: { invited: 2, rejected_by_household: 3 }, taskKinds: [], hasAnyRound: true }, de);
    expect(h.steps.map((x) => x.state)).toEqual(["done", "done", "done", "current"]);
    expect(h.caption).not.toContain("läuft noch");
  });

  it("the household account (no counts) gets a number-free sentence at the first step", () => {
    const h = buildStatusHeader({ activeRound: round, stateCounts: null, taskKinds: [], hasAnyRound: true }, de);
    // review fix R-1: no counts, so no current step is claimed and no caption is shown.
    expect(h.steps.map((x) => x.state)).toEqual(["done", "next", "next", "next"]);
    expect(h.sentence).toBe("Herbstrunde läuft.");
    expect(h.sentence).not.toMatch(/\d/);
    expect(h.detail).toBeNull();
    expect(h.caption).toBeNull();
  });
});

describe("buildStatusHeader: no round", () => {
  it("setup still open: almost ready, with the setup steps at the first open task", () => {
    const h = buildStatusHeader(
      { activeRound: null, stateCounts: null, taskKinds: ["invite_flatmates", "appoint_search_lead"], hasAnyRound: true },
      de,
    );
    expect(h.sentence).toBe("Eure WG ist fast startklar.");
    expect(h.steps.map((x) => x.label)).toEqual(["Zimmer", "Mitbewohnende", "Suchleitung", "Suche starten"]);
    expect(h.caption).toBe("Schritt 2 von 4 · Mitbewohnende");
    expect(h.steps.map((x) => x.state)).toEqual(["done", "current", "next", "next"]);
  });

  it("only the first-round task open: the last setup step is current", () => {
    const h = buildStatusHeader({ activeRound: null, stateCounts: null, taskKinds: ["open_first_round"], hasAnyRound: true }, de);
    expect(h.caption).toBe("Schritt 4 von 4 · Suche starten");
  });

  it("nothing open: no round is running, no bar, no caption", () => {
    const h = buildStatusHeader({ activeRound: null, stateCounts: null, taskKinds: [], hasAnyRound: true }, de);
    expect(h).toEqual({ sentence: "Gerade läuft keine Runde.", detail: null, steps: [], caption: null });
  });

  it("setup done but no round has ever existed: the last setup step is current (review fix R-5)", () => {
    const h = buildStatusHeader({ activeRound: null, stateCounts: null, taskKinds: [], hasAnyRound: false }, de);
    expect(h.sentence).toBe("Eure WG ist fast startklar.");
    expect(h.steps.map((x) => x.state)).toEqual(["done", "done", "done", "current"]);
    expect(h.caption).toBe("Schritt 4 von 4 · Suche starten");
  });

  it("a room task alone does not count as setup", () => {
    const h = buildStatusHeader(
      { activeRound: null, stateCounts: null, taskKinds: ["open_round_for_room"], hasAnyRound: true },
      de,
    );
    expect(h.sentence).toBe("Gerade läuft keine Runde.");
  });

  it("speaks English with the English strings", () => {
    const h = buildStatusHeader({ activeRound: round, stateCounts: { new: 2 }, taskKinds: [], hasAnyRound: true }, en);
    expect(h.sentence).toBe("Herbstrunde is running.");
    expect(h.detail).toBe("2 applications.");
    expect(h.caption).toBe("Step 3 of 4 · Vote");
  });
});
