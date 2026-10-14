import { describe, expect, it } from "vitest";
import { pickActiveRound, roundFallbackPrimary } from "@/app/(org)/organisation-task-view";

// organisation-task-list fix round F2: the active round's one action with no open task follows
// the step. Pure, so each case is a unit test.
describe("roundFallbackPrimary", () => {
  it("collecting applications: capture", () => {
    expect(roundFallbackPrimary({}, true)).toBe("capture");
  });

  it("voting: the casting view, even for a caller who may also capture", () => {
    expect(roundFallbackPrimary({ new: 3 }, true)).toBe("casting");
  });

  it("invitations stage: the casting view, even without the right to capture", () => {
    expect(roundFallbackPrimary({ invited: 1, new: 2 }, false)).toBe("casting");
  });

  it("household account (no counts): capture when allowed, otherwise nothing", () => {
    expect(roundFallbackPrimary(null, true)).toBe("capture");
    expect(roundFallbackPrimary(null, false)).toBeNull();
  });

  it("collecting without the right to capture: nothing", () => {
    expect(roundFallbackPrimary({}, false)).toBeNull();
  });
});

describe("pickActiveRound (review fix R-2)", () => {
  const rounds = [
    { id: "a", status: "open" },
    { id: "b", status: "open" },
    { id: "c", status: "closed" },
  ];

  it("two open rounds, standing on the second: the second", () => {
    expect(pickActiveRound(rounds, "b")?.id).toBe("b");
  });

  it("no standing, or a standing on a closed round: the first open round", () => {
    expect(pickActiveRound(rounds, null)?.id).toBe("a");
    expect(pickActiveRound(rounds, "c")?.id).toBe("a");
  });

  it("no open round: null", () => {
    expect(pickActiveRound([{ id: "c", status: "closed" }], "c")).toBeNull();
  });
});
