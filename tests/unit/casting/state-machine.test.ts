import { describe, expect, it } from "vitest";
import { applicationStateEnum } from "@/modules/casting/schema";
import {
  assertTransitionAllowed,
  InvalidTransitionError,
  TRANSITIONS,
} from "@/modules/casting/transitions";
import type { ApplicationState } from "@/modules/casting/transitions";

const ALL_STATES = applicationStateEnum.enumValues;

// FR-0.9: all eleven states exist from the first migration, even though v0.1's application code
// only reaches `invited`.
describe("Application state enum (FR-0.9)", () => {
  it("declares all eleven states from docs/03-PRD.md §4.2.1", () => {
    expect(ALL_STATES).toHaveLength(11);
    expect(new Set(ALL_STATES)).toEqual(
      new Set([
        "new",
        "screened",
        "invited",
        "scheduled",
        "interviewed",
        "offer_made",
        "moved_in",
        "rejected_by_household",
        "declined_by_applicant",
        "withdrawn",
        "archived",
      ]),
    );
  });
});

// FR-0.10: only declared transitions succeed; every other (from, to) pair throws.
describe("Application transitions (FR-0.10, EC-0.7)", () => {
  const declaredPairs = new Set(TRANSITIONS.map(([from, to]) => `${from}->${to}`));

  it("accepts every declared transition", () => {
    for (const [from, to] of TRANSITIONS) {
      expect(() => assertTransitionAllowed(from, to)).not.toThrow();
    }
  });

  it("throws for every (from, to) pair not in the transition table — no silent fallthrough", () => {
    let checked = 0;
    for (const from of ALL_STATES) {
      for (const to of ALL_STATES) {
        if (declaredPairs.has(`${from}->${to}`)) continue;
        checked++;
        expect(() =>
          assertTransitionAllowed(from as ApplicationState, to as ApplicationState),
        ).toThrow(InvalidTransitionError);
      }
    }
    // Sanity check that this test actually exercised undeclared pairs, not zero of them.
    expect(checked).toBeGreaterThan(0);
  });
});
