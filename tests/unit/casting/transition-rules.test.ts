import { describe, expect, it } from "vitest";
import { MODERATOR_PERMISSIONS } from "@/modules/identity/schema";
import {
  InvalidTransitionError,
  isBackwardTransition,
  PENDING_STEPS,
  ruleFor,
  TRANSITION_RULES,
  TRANSITIONS,
  type TransitionRule,
} from "@/modules/casting/transitions";

// F3 change 3, design D6a. The rule table is a second column of TRANSITIONS. This test pins the
// WHOLE table as a literal, so widening the executable set or changing a row's rights is always a
// deliberate, visible diff here, never a side effect of editing TRANSITIONS.
const EXPECTED: ReadonlyArray<readonly [string, TransitionRule]> = [
  ["new->screened", { kind: "state_only", requires: ["change_application_state"] }],
  ["screened->invited", { kind: "state_only", requires: ["change_application_state"] }],
  ["invited->scheduled", { kind: "pending", step: "appointment" }],
  ["scheduled->interviewed", { kind: "pending", step: "interview" }],
  ["interviewed->offer_made", { kind: "pending", step: "offer" }],
  ["offer_made->moved_in", { kind: "pending", step: "move_in" }],
  ["new->rejected_by_household", { kind: "state_only", requires: ["change_application_state"] }],
  ["screened->rejected_by_household", { kind: "state_only", requires: ["change_application_state"] }],
  ["invited->rejected_by_household", { kind: "state_only", requires: ["change_application_state"] }],
  ["scheduled->rejected_by_household", { kind: "pending", step: "appointment" }],
  ["interviewed->rejected_by_household", { kind: "pending", step: "interview" }],
  ["offer_made->rejected_by_household", { kind: "pending", step: "offer" }],
  ["invited->declined_by_applicant", { kind: "state_only", requires: ["change_application_state"] }],
  ["scheduled->declined_by_applicant", { kind: "pending", step: "appointment" }],
  ["interviewed->declined_by_applicant", { kind: "pending", step: "interview" }],
  ["offer_made->declined_by_applicant", { kind: "pending", step: "offer" }],
  ["moved_in->declined_by_applicant", { kind: "pending", step: "move_in_reversal" }],
  ["new->withdrawn", { kind: "state_only", requires: ["change_application_state"] }],
  ["screened->withdrawn", { kind: "state_only", requires: ["change_application_state"] }],
  ["invited->withdrawn", { kind: "state_only", requires: ["change_application_state"] }],
  ["scheduled->withdrawn", { kind: "pending", step: "appointment" }],
  ["interviewed->withdrawn", { kind: "pending", step: "interview" }],
  ["offer_made->withdrawn", { kind: "pending", step: "offer" }],
  ["rejected_by_household->archived", { kind: "pending", step: "retention" }],
  ["declined_by_applicant->archived", { kind: "pending", step: "retention" }],
  ["withdrawn->archived", { kind: "pending", step: "retention" }],
  ["moved_in->archived", { kind: "pending", step: "retention" }],
  ["screened->new", { kind: "state_only", requires: ["change_application_state", "reverse_application_state"] }],
  ["invited->screened", { kind: "state_only", requires: ["change_application_state", "reverse_application_state"] }],
  ["scheduled->invited", { kind: "pending", step: "appointment" }],
  ["interviewed->scheduled", { kind: "pending", step: "interview" }],
  ["offer_made->interviewed", { kind: "pending", step: "offer" }],
  ["moved_in->offer_made", { kind: "pending", step: "move_in_reversal" }],
  ["rejected_by_household->new", { kind: "state_only", requires: ["change_application_state", "reverse_application_state"] }],
  ["rejected_by_household->screened", { kind: "state_only", requires: ["change_application_state", "reverse_application_state"] }],
  ["rejected_by_household->invited", { kind: "state_only", requires: ["change_application_state", "reverse_application_state"] }],
  ["rejected_by_household->scheduled", { kind: "pending", step: "appointment" }],
  ["rejected_by_household->interviewed", { kind: "pending", step: "interview" }],
  ["rejected_by_household->offer_made", { kind: "pending", step: "offer" }],
  ["withdrawn->new", { kind: "state_only", requires: ["change_application_state", "reverse_application_state"] }],
  ["withdrawn->screened", { kind: "state_only", requires: ["change_application_state", "reverse_application_state"] }],
  ["withdrawn->invited", { kind: "state_only", requires: ["change_application_state", "reverse_application_state"] }],
  ["withdrawn->scheduled", { kind: "pending", step: "appointment" }],
  ["withdrawn->interviewed", { kind: "pending", step: "interview" }],
  ["withdrawn->offer_made", { kind: "pending", step: "offer" }],
  ["declined_by_applicant->invited", { kind: "state_only", requires: ["change_application_state", "reverse_application_state"] }],
  ["declined_by_applicant->scheduled", { kind: "pending", step: "appointment" }],
  ["declined_by_applicant->interviewed", { kind: "pending", step: "interview" }],
  ["declined_by_applicant->offer_made", { kind: "pending", step: "offer" }],
  ["declined_by_applicant->moved_in", { kind: "pending", step: "move_in" }],
  ["archived->rejected_by_household", { kind: "pending", step: "retention" }],
  ["archived->declined_by_applicant", { kind: "pending", step: "retention" }],
  ["archived->withdrawn", { kind: "pending", step: "retention" }],
  ["archived->moved_in", { kind: "pending", step: "retention" }],
];

describe("TRANSITION_RULES (D6a)", () => {
  it("has exactly one rule per declared pair (54)", () => {
    const declared = new Set(TRANSITIONS.map(([from, to]) => `${from}->${to}`));
    expect(declared.size).toBe(54);
    expect(new Set(TRANSITION_RULES.keys())).toEqual(declared);
    expect(TRANSITION_RULES.size).toBe(54);
  });

  it("equals the literal table: every pair with its kind and its exact requires or step", () => {
    expect(EXPECTED).toHaveLength(54);
    expect(Object.fromEntries(TRANSITION_RULES)).toEqual(Object.fromEntries(EXPECTED));
  });

  it("every state_only row requires change_application_state, and reverse_application_state exactly when the move is backward", () => {
    for (const [key, rule] of TRANSITION_RULES) {
      if (rule.kind !== "state_only") continue;
      const [from, to] = key.split("->") as [never, never];
      expect(rule.requires, key).toContain("change_application_state");
      expect(rule.requires.includes("reverse_application_state"), key).toBe(isBackwardTransition(from, to));
    }
  });

  it("every permission a state_only row requires is in MODERATOR_PERMISSIONS", () => {
    for (const [key, rule] of TRANSITION_RULES) {
      if (rule.kind !== "state_only") continue;
      for (const p of rule.requires) expect(MODERATOR_PERMISSIONS as readonly string[], key).toContain(p);
    }
  });

  it("every pending row names a step in PENDING_STEPS", () => {
    for (const [key, rule] of TRANSITION_RULES) {
      if (rule.kind !== "pending") continue;
      expect(PENDING_STEPS as readonly string[], key).toContain(rule.step);
    }
  });

  it("has 18 state_only rows and 36 pending rows", () => {
    const kinds = [...TRANSITION_RULES.values()].map((r) => r.kind);
    expect(kinds.filter((k) => k === "state_only")).toHaveLength(18);
    expect(kinds.filter((k) => k === "pending")).toHaveLength(36);
  });

  it("ruleFor returns the row's rule and throws InvalidTransitionError for an undeclared pair", () => {
    expect(ruleFor("new", "screened")).toEqual({ kind: "state_only", requires: ["change_application_state"] });
    expect(() => ruleFor("new", "invited")).toThrow(InvalidTransitionError);
    expect(() => ruleFor("new", "new")).toThrow(InvalidTransitionError);
  });
});
