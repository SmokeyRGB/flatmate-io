import { describe, expect, it } from "vitest";
import { roomStatusEnum } from "@/modules/casting/schema";
import {
  assertF1RoomTransitionAllowed,
  assertRoomTransitionAllowed,
  f1TargetStatusesFor,
  F1_REACHABLE_TRANSITIONS,
  InvalidRoomTransitionError,
  TRANSITIONS,
} from "@/modules/casting/room-transitions";

describe("Room state enum (FR-1.10)", () => {
  it("declares all six states", () => {
    expect(new Set(roomStatusEnum.enumValues)).toEqual(
      new Set(["planned", "open", "promised", "occupied", "on_hold", "not_available"]),
    );
  });
});

describe("Room transitions", () => {
  it("accepts every declared transition", () => {
    for (const [from, to] of TRANSITIONS) {
      expect(() => assertRoomTransitionAllowed(from, to)).not.toThrow();
    }
  });

  it("throws for an undeclared pair", () => {
    expect(() => assertRoomTransitionAllowed("planned", "occupied")).toThrow(
      InvalidRoomTransitionError,
    );
  });

  // F1's repository only exposes the moderator-driven subset; promised/occupied and their
  // reverses are declared for completeness but driven by Application.state changes (F3+).
  it("declares promised/occupied transitions but marks them unreachable by F1's repository", () => {
    const declaredPairs = new Set(TRANSITIONS.map(([from, to]) => `${from}->${to}`));
    expect(declaredPairs.has("open->promised")).toBe(true);
    expect(F1_REACHABLE_TRANSITIONS.has("open->promised")).toBe(false);
    expect(F1_REACHABLE_TRANSITIONS.has("planned->open")).toBe(true);
  });
});

describe("assertF1RoomTransitionAllowed (F1 repository gate)", () => {
  it("accepts every F1-reachable pair", () => {
    for (const pair of F1_REACHABLE_TRANSITIONS) {
      const [from, to] = pair.split("->") as [
        Parameters<typeof assertF1RoomTransitionAllowed>[0],
        Parameters<typeof assertF1RoomTransitionAllowed>[1],
      ];
      expect(() => assertF1RoomTransitionAllowed(from, to)).not.toThrow();
    }
  });

  it("rejects promised/occupied transitions and their reverses even though TRANSITIONS declares them", () => {
    const declaredButUnreachable: Array<[string, string]> = [
      ["open", "promised"],
      ["promised", "occupied"],
      ["promised", "open"],
      ["occupied", "promised"],
      ["occupied", "open"],
    ];
    for (const [from, to] of declaredButUnreachable) {
      expect(() =>
        assertF1RoomTransitionAllowed(
          from as Parameters<typeof assertF1RoomTransitionAllowed>[0],
          to as Parameters<typeof assertF1RoomTransitionAllowed>[1],
        ),
      ).toThrow(InvalidRoomTransitionError);
    }
  });

  it("still rejects pairs undeclared by the full TRANSITIONS table", () => {
    expect(() => assertF1RoomTransitionAllowed("planned", "occupied")).toThrow(
      InvalidRoomTransitionError,
    );
  });
});

// Rooms page bug: the select must offer only THIS room's legal targets, not every F1-reachable
// target flattened across all rooms (planned would wrongly offer on_hold/not_available).
describe("f1TargetStatusesFor (rooms page select options)", () => {
  it("offers only the current status's own declared F1 targets, plus itself", () => {
    expect(new Set(f1TargetStatusesFor("planned"))).toEqual(new Set(["planned", "open"]));
    expect(new Set(f1TargetStatusesFor("open"))).toEqual(
      new Set(["open", "on_hold", "not_available"]),
    );
    expect(new Set(f1TargetStatusesFor("on_hold"))).toEqual(
      new Set(["on_hold", "open", "not_available"]),
    );
  });

  it("falls back to just the current status when it has no outgoing F1 transition", () => {
    expect(f1TargetStatusesFor("not_available")).toEqual(["not_available"]);
    expect(f1TargetStatusesFor("promised")).toEqual(["promised"]);
    expect(f1TargetStatusesFor("occupied")).toEqual(["occupied"]);
  });

  it("every option it returns for a status is actually accepted by assertF1RoomTransitionAllowed", () => {
    for (const from of ["planned", "open", "on_hold", "not_available"] as const) {
      for (const to of f1TargetStatusesFor(from)) {
        if (to === from) continue;
        expect(() => assertF1RoomTransitionAllowed(from, to)).not.toThrow();
      }
    }
  });
});
