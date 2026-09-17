import { describe, expect, it } from "vitest";
import { roomStatusEnum } from "@/modules/casting/schema";
import {
  assertRoomTransitionAllowed,
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
