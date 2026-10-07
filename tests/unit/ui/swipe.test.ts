import { describe, expect, it } from "vitest";
import {
  FLICK_MIN_PX,
  FLICK_MIN_SPEED,
  RELEASE_FRACTION,
  RELEASE_MAX_PX,
  releaseDecision,
} from "@/ui/swipe";

// The release rule the screening deck and the candidate detail sheet share (candidate-detail
// design D10). The deck had no swipe test of its own, so this pins the rule it used to hold inline.
const WIDTH = 400; // a phone-ish width: min(400 * 0.25, 80) = 80 px
const THRESHOLD = Math.min(WIDTH * RELEASE_FRACTION, RELEASE_MAX_PX);
const SLOW = 0;
const FAST = FLICK_MIN_SPEED + 0.1;

describe("releaseDecision", () => {
  it("a slow drag past min(width x fraction, max) commits", () => {
    expect(releaseDecision({ dx: THRESHOLD, speed: SLOW, width: WIDTH, cancelled: false }).commit).toBe(true);
  });

  it("the distance threshold is capped at RELEASE_MAX_PX on a wide element", () => {
    expect(releaseDecision({ dx: RELEASE_MAX_PX, speed: SLOW, width: 2000, cancelled: false }).commit).toBe(true);
    expect(releaseDecision({ dx: RELEASE_MAX_PX - 1, speed: SLOW, width: 2000, cancelled: false }).commit).toBe(false);
  });

  it("a short, slow drag returns", () => {
    expect(releaseDecision({ dx: THRESHOLD - 1, speed: SLOW, width: WIDTH, cancelled: false }).commit).toBe(false);
  });

  it("a fast short flick of at least FLICK_MIN_PX commits", () => {
    const dx = Math.max(FLICK_MIN_PX, 1);
    expect(dx).toBeLessThan(THRESHOLD);
    expect(releaseDecision({ dx, speed: FAST, width: WIDTH, cancelled: false }).commit).toBe(true);
  });

  it("a fast drag shorter than FLICK_MIN_PX does not commit", () => {
    expect(releaseDecision({ dx: FLICK_MIN_PX - 1, speed: FAST, width: WIDTH, cancelled: false }).commit).toBe(false);
  });

  it("with `cancelled` a flick does not commit, and only the far threshold does", () => {
    expect(releaseDecision({ dx: FLICK_MIN_PX, speed: FAST, width: WIDTH, cancelled: true }).commit).toBe(false);
    expect(releaseDecision({ dx: THRESHOLD, speed: SLOW, width: WIDTH, cancelled: true }).commit).toBe(true);
  });

  it("returns the sign of dx, so each caller allows its own direction", () => {
    expect(releaseDecision({ dx: THRESHOLD, speed: SLOW, width: WIDTH, cancelled: false }).direction).toBe(1);
    expect(releaseDecision({ dx: -THRESHOLD, speed: SLOW, width: WIDTH, cancelled: false })).toEqual({
      commit: true,
      direction: -1,
    });
  });
});
