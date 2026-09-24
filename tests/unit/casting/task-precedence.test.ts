import { describe, expect, it } from "vitest";
import {
  distributionOf,
  orderTasks,
  phaseOf,
  type OpenTask,
} from "@/modules/casting/task-precedence";

// start-screen design.md Decisions 5/6, tasks.md 2.2. Pure — no DB.

describe("orderTasks", () => {
  it("puts a dated task ahead of an undated one of an earlier fixed-order rank", () => {
    const t1Undated: OpenTask = { type: "T1", dueAt: null, key: "t1" };
    const t5Dated: OpenTask = { type: "T5", dueAt: new Date("2026-10-01"), key: "t5" };
    expect(orderTasks([t1Undated, t5Dated]).map((t) => t.key)).toEqual(["t5", "t1"]);
  });

  it("orders two dated tasks soonest first", () => {
    const later: OpenTask = { type: "T5", dueAt: new Date("2026-10-05"), key: "later" };
    const sooner: OpenTask = { type: "T2", dueAt: new Date("2026-10-01"), key: "sooner" };
    expect(orderTasks([later, sooner]).map((t) => t.key)).toEqual(["sooner", "later"]);
  });

  it("sorts an overdue date before a future one", () => {
    const overdue: OpenTask = { type: "T5", dueAt: new Date("2020-01-01"), key: "overdue" };
    const future: OpenTask = { type: "T5", dueAt: new Date("2099-01-01"), key: "future" };
    expect(orderTasks([future, overdue]).map((t) => t.key)).toEqual(["overdue", "future"]);
  });

  it("orders undated tasks T1..T6 when given in reverse", () => {
    const tasks: OpenTask[] = [
      { type: "T6", dueAt: null, key: "t6" },
      { type: "T3", dueAt: null, key: "t3" },
      { type: "T2", dueAt: null, key: "t2" },
      { type: "T1", dueAt: null, key: "t1" },
    ];
    // No T5 present, so T6 is not dropped (tests dropT6BesideT5's negative branch too).
    expect(orderTasks(tasks).map((t) => t.type)).toEqual(["T1", "T2", "T3", "T6"]);
  });

  it("T4 and T5 tie in rank and resolve by key", () => {
    const t5: OpenTask = { type: "T5", dueAt: null, key: "b" };
    const t4: OpenTask = { type: "T4", dueAt: null, key: "a" };
    expect(orderTasks([t5, t4]).map((t) => t.key)).toEqual(["a", "b"]);
  });

  it("drops T6 when a T5 is present, keeps it when there is none", () => {
    const t5: OpenTask = { type: "T5", dueAt: null, key: "t5" };
    const t6: OpenTask = { type: "T6", dueAt: null, key: "t6" };
    expect(orderTasks([t5, t6]).map((t) => t.type)).toEqual(["T5"]);
    expect(orderTasks([t6]).map((t) => t.type)).toEqual(["T6"]);
  });

  it("gives the same order for the same input shuffled 20 times", () => {
    const base: OpenTask[] = [
      { type: "T5", dueAt: new Date("2026-10-05"), key: "a" },
      { type: "T2", dueAt: new Date("2026-10-01"), key: "b" },
      { type: "T1", dueAt: null, key: "c" },
      { type: "T3", dueAt: null, key: "d" },
    ];
    const expected = orderTasks(base).map((t) => t.key);
    for (let i = 0; i < 20; i++) {
      const shuffled = [...base].sort(() => Math.random() - 0.5);
      expect(orderTasks(shuffled).map((t) => t.key)).toEqual(expected);
    }
  });

  it("never mutates its input array", () => {
    const input: OpenTask[] = [
      { type: "T3", dueAt: null, key: "c" },
      { type: "T1", dueAt: null, key: "a" },
    ];
    const copy = [...input];
    orderTasks(input);
    expect(input).toEqual(copy);
  });
});

describe("phaseOf", () => {
  it("no main-path applications -> waiting_for_applications", () => {
    expect(phaseOf({})).toBe("waiting_for_applications");
  });

  it("side states only -> waiting_for_applications", () => {
    expect(phaseOf({ rejected_by_household: 3, withdrawn: 1 })).toBe("waiting_for_applications");
  });

  it("new/screened -> voting_round_1", () => {
    expect(phaseOf({ new: 2 })).toBe("voting_round_1");
    expect(phaseOf({ screened: 2 })).toBe("voting_round_1");
  });

  it("invited/scheduled -> scheduling", () => {
    expect(phaseOf({ invited: 1 })).toBe("scheduling");
    expect(phaseOf({ scheduled: 1 })).toBe("scheduling");
  });

  it("interviewed -> voting_round_2", () => {
    expect(phaseOf({ interviewed: 1 })).toBe("voting_round_2");
  });

  it("offer_made/moved_in -> offer", () => {
    expect(phaseOf({ offer_made: 1 })).toBe("offer");
    expect(phaseOf({ moved_in: 1 })).toBe("offer");
  });

  it("the furthest state wins regardless of counts", () => {
    expect(phaseOf({ new: 20, offer_made: 1 })).toBe("offer");
  });
});

describe("distributionOf", () => {
  it("omits zero buckets and keeps main-path order", () => {
    expect(distributionOf({ new: 2, interviewed: 1 })).toEqual([
      { bucket: "in_screening", count: 2 },
      { bucket: "interviewed", count: 1 },
    ]);
  });

  it("returns an empty array when there are no counts", () => {
    expect(distributionOf({})).toEqual([]);
  });
});
