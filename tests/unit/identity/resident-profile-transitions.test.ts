import { describe, expect, it } from "vitest";
import { residentProfileStatusEnum } from "@/modules/identity/schema";
import {
  assertResidentProfileTransitionAllowed,
  InvalidResidentProfileTransitionError,
  TRANSITIONS,
} from "@/modules/identity/transitions";
import type { ResidentProfileStatus } from "@/modules/identity/transitions";

const ALL_STATUSES = residentProfileStatusEnum.enumValues;

describe("ResidentProfile status enum", () => {
  it("declares exactly the three states from data-model.md", () => {
    expect(new Set(ALL_STATUSES)).toEqual(new Set(["prepared", "active", "moved_out"]));
  });
});

// Same "declared table, no silent fallthrough" discipline as F0's Application machine (ADR-002).
describe("ResidentProfile transitions", () => {
  const declaredPairs = new Set(TRANSITIONS.map(([from, to]) => `${from}->${to}`));

  it("accepts every declared transition (prepared->active, prepared->moved_out, active->moved_out, moved_out->active)", () => {
    for (const [from, to] of TRANSITIONS) {
      expect(() => assertResidentProfileTransitionAllowed(from, to)).not.toThrow();
    }
    expect(TRANSITIONS).toHaveLength(4);
  });

  it("throws for every (from, to) pair not in the transition table — e.g. prepared->prepared", () => {
    let checked = 0;
    for (const from of ALL_STATUSES) {
      for (const to of ALL_STATUSES) {
        if (declaredPairs.has(`${from}->${to}`)) continue;
        checked++;
        expect(() =>
          assertResidentProfileTransitionAllowed(
            from as ResidentProfileStatus,
            to as ResidentProfileStatus,
          ),
        ).toThrow(InvalidResidentProfileTransitionError);
      }
    }
    expect(checked).toBeGreaterThan(0);
  });
});
