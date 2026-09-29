import { describe, expect, it } from "vitest";
import { applicationStateEnum } from "@/modules/casting/schema";
import { APPLICATION_STATE_ORDER, groupApplicationsByState } from "@/modules/casting/application-groups";
import { MAIN_PATH, type ApplicationState } from "@/modules/casting/transitions";

// Design D1: grouping is a pure function, and the order is the main path followed by the side
// states. A state added to the enum later must fail the set test, not vanish from the list.
describe("APPLICATION_STATE_ORDER", () => {
  it("equals the enum's values as a set, with no duplicate", () => {
    expect(new Set(APPLICATION_STATE_ORDER)).toEqual(new Set(applicationStateEnum.enumValues));
    expect(APPLICATION_STATE_ORDER).toHaveLength(new Set(APPLICATION_STATE_ORDER).size);
  });

  it("starts with the main path in its order, then the four side states", () => {
    expect(APPLICATION_STATE_ORDER.slice(0, MAIN_PATH.length)).toEqual([...MAIN_PATH]);
    expect(APPLICATION_STATE_ORDER.slice(MAIN_PATH.length)).toEqual([
      "rejected_by_household",
      "declined_by_applicant",
      "withdrawn",
      "archived",
    ]);
  });
});

const row = (id: string, state: ApplicationState) => ({ id, state });

describe("groupApplicationsByState", () => {
  it("orders the groups by APPLICATION_STATE_ORDER, whatever the input order", () => {
    const groups = groupApplicationsByState([
      row("a", "withdrawn"),
      row("b", "screened"),
      row("c", "new"),
      row("d", "moved_in"),
    ]);
    expect(groups.map((g) => g.state)).toEqual(["new", "screened", "moved_in", "withdrawn"]);
  });

  it("drops empty groups", () => {
    expect(groupApplicationsByState([row("a", "new")]).map((g) => g.state)).toEqual(["new"]);
    expect(groupApplicationsByState([])).toEqual([]);
  });

  it("keeps the input order inside a group", () => {
    const groups = groupApplicationsByState([row("1", "new"), row("2", "screened"), row("3", "new"), row("4", "new")]);
    expect(groups[0].rows.map((r) => r.id)).toEqual(["1", "3", "4"]);
  });

  it("counts equal the row counts, and every row appears exactly once", () => {
    const input = [row("1", "new"), row("2", "screened"), row("3", "new"), row("4", "archived")];
    const groups = groupApplicationsByState(input);
    for (const g of groups) expect(g.count).toBe(g.rows.length);
    expect(groups.reduce((n, g) => n + g.count, 0)).toBe(input.length);
  });
});
