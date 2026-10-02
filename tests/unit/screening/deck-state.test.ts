import { describe, expect, it } from "vitest";
import { deckReducer, initialDeckState, type DeckAction, type DeckState } from "@/app/(resident)/casting/screening/deck-state";

// F4 change 1 tasks 7.2 (design D9): the pass's navigation rules, pure.
const IDS = ["a", "b", "c", "d"];

function run(state: DeckState, ...actions: DeckAction[]): DeckState {
  return actions.reduce(deckReducer, state);
}

describe("deckReducer", () => {
  it("forward is refused on an unrated card and at the last index", () => {
    const s = initialDeckState(IDS);
    expect(deckReducer(s, { type: "forward" })).toBe(s);
    const atLast = run(s, { type: "submitted", id: "a" }, { type: "rated", id: "a", value: "good" });
    expect(atLast.index).toBe(1);
    // Rate everything but the last, then check forward from the last (rated) card.
    let st = s;
    for (const id of ["a", "b", "c"]) st = run(st, { type: "submitted", id }, { type: "rated", id, value: "no" });
    expect(st.index).toBe(3);
    st = run(st, { type: "submitted", id: "d" }, { type: "failed", id: "d" });
    expect(deckReducer(st, { type: "forward" })).toBe(st);
  });

  it("forward works from a rated card that is not the last", () => {
    const s = run(
      initialDeckState(IDS),
      { type: "submitted", id: "a" },
      { type: "rated", id: "a", value: "good" },
      { type: "back" },
    );
    expect(s.index).toBe(0);
    expect(deckReducer(s, { type: "forward" }).index).toBe(1);
  });

  it("back stops at 0", () => {
    const s = initialDeckState(IDS);
    expect(deckReducer(s, { type: "back" })).toBe(s);
  });

  it("while pending, back, forward and a second submitted are no-ops", () => {
    const s = run(initialDeckState(IDS), { type: "submitted", id: "a" });
    expect(s.pending).toBe("a");
    expect(deckReducer(s, { type: "back" })).toBe(s);
    expect(deckReducer(s, { type: "forward" })).toBe(s);
    expect(deckReducer(s, { type: "submitted", id: "a" })).toBe(s);
    // A rated card while pending still cannot move on.
    const rated = run(initialDeckState(IDS, { a: "good" }), { type: "submitted", id: "a" });
    expect(deckReducer(rated, { type: "forward" })).toBe(rated);
  });

  it("rated(id) moves to indexOf(id) + 1, even if the index had changed", () => {
    // The resident is on card 'c' (index 2) when the reply for 'a' arrives.
    const s: DeckState = { ...initialDeckState(IDS, { b: "good" }), index: 2, pending: "a" };
    const after = deckReducer(s, { type: "rated", id: "a", value: "no" });
    expect(after.index).toBe(1);
    expect(after.ratings).toEqual({ a: "no", b: "good" });
    expect(after.pending).toBeNull();
  });

  it("rating the last unrated card sets done", () => {
    let st = initialDeckState(["a", "b"]);
    st = run(st, { type: "submitted", id: "a" }, { type: "rated", id: "a", value: "good" });
    expect(st.phase).toBe("rating");
    st = run(st, { type: "submitted", id: "b" }, { type: "rated", id: "b", value: "no" });
    expect(st.phase).toBe("done");
  });

  it("revising an earlier card advances by one", () => {
    let st = initialDeckState(IDS);
    st = run(st, { type: "submitted", id: "a" }, { type: "rated", id: "a", value: "good" });
    st = run(st, { type: "submitted", id: "b" }, { type: "rated", id: "b", value: "good" });
    expect(st.index).toBe(2);
    st = run(st, { type: "back" }, { type: "back" });
    expect(st.index).toBe(0);
    st = run(st, { type: "submitted", id: "a" }, { type: "rated", id: "a", value: "definitely" });
    expect(st.index).toBe(1);
    expect(st.ratings.a).toBe("definitely");
    expect(st.phase).toBe("rating");
  });

  it("failed keeps the card and clears pending", () => {
    const st = run(initialDeckState(IDS), { type: "submitted", id: "a" }, { type: "failed", id: "a" });
    expect(st.pending).toBeNull();
    expect(st.index).toBe(0);
    expect(st.ratings).toEqual({});
  });

  describe("dropped", () => {
    it("clamps the index and shrinks the total", () => {
      let st = initialDeckState(["a", "b", "c"]);
      st = run(st, { type: "submitted", id: "a" }, { type: "rated", id: "a", value: "good" });
      st = run(st, { type: "submitted", id: "b" }, { type: "rated", id: "b", value: "good" });
      expect(st.index).toBe(2);
      st = run(st, { type: "submitted", id: "c" }, { type: "dropped", id: "c" });
      expect(st.ids).toEqual(["a", "b"]);
      expect(st.pending).toBeNull();
      // Everything left is rated, so the pass is done.
      expect(st.phase).toBe("done");
    });

    it("dropping a card before the current one keeps the same card current", () => {
      let st = initialDeckState(["a", "b", "c", "d"]);
      st = run(st, { type: "submitted", id: "a" }, { type: "rated", id: "a", value: "good" });
      expect(st.ids[st.index]).toBe("b");
      st = deckReducer(st, { type: "dropped", id: "a" });
      expect(st.ids[st.index]).toBe("b");
      expect(st.phase).toBe("rating");
    });

    it("dropping the current unrated card shows the next one", () => {
      let st = initialDeckState(["a", "b", "c"]);
      st = run(st, { type: "submitted", id: "a" }, { type: "dropped", id: "a" });
      expect(st.ids).toEqual(["b", "c"]);
      expect(st.ids[st.index]).toBe("b");
    });

    it("dropping the last unrated card, or the only card, sets done", () => {
      let st = initialDeckState(["a", "b"]);
      st = run(st, { type: "submitted", id: "a" }, { type: "rated", id: "a", value: "good" });
      st = run(st, { type: "submitted", id: "b" }, { type: "dropped", id: "b" });
      expect(st.phase).toBe("done");
      expect(deckReducer(initialDeckState(["only"]), { type: "dropped", id: "only" }).phase).toBe("done");
    });

    it("dropping an unknown id only clears pending", () => {
      const st = run(initialDeckState(IDS), { type: "submitted", id: "a" }, { type: "dropped", id: "zzz" });
      expect(st.pending).toBeNull();
      expect(st.ids).toEqual(IDS);
    });
  });

  it("the initial state comes only from its input: an empty or fully rated deck starts done", () => {
    expect(initialDeckState([]).phase).toBe("done");
    expect(initialDeckState(["a"], { a: "no" }).phase).toBe("done");
    expect(initialDeckState(IDS).phase).toBe("rating");
  });

  // Breaks (tasks 7.2): allow `forward` on an unrated card; use `index + 1` in `rated`; omit `done`
  // in `dropped` -> each fails its case above.
});
