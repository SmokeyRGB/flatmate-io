import type { VoteValue } from "@/modules/deliberation/vote-values";

// The screening pass's navigation state machine (design D9): pure, so its rules are a unit test,
// not a rendering test. The deck is fixed when the pass starts (FR-4.4): the state is initialised
// ONCE from the server's cards, and there is deliberately no "props changed" action.
//
// Rules:
//  - Rating is the only way forward from an unrated card: `forward` works only from a rated card,
//    so no card can be skipped (the spec has no skip).
//  - While a rating is being recorded (`pending`), back, forward and a second submit are no-ops, so
//    an arrow key or a swipe during the round-trip cannot move the deck under the vote.
//  - `rated` moves to the card after the one that was rated, not to `index + 1`: the reply of an
//    earlier request must not depend on where the resident is by the time it arrives.
//  - `dropped` removes a card that can never be rated (deleted, left the voting stage, turned out
//    to be the resident's own) without ending the pass.

export interface DeckState {
  ids: readonly string[];
  index: number;
  ratings: Readonly<Record<string, VoteValue>>;
  pending: string | null;
  phase: "rating" | "done";
}

export type DeckAction =
  | { type: "submitted"; id: string }
  | { type: "rated"; id: string; value: VoteValue }
  | { type: "failed"; id: string }
  | { type: "back" }
  | { type: "forward" }
  | { type: "dropped"; id: string };

function allRated(ids: readonly string[], ratings: Readonly<Record<string, VoteValue>>): boolean {
  return ids.every((id) => ratings[id] !== undefined);
}

export function initialDeckState(ids: readonly string[], ratings: Readonly<Record<string, VoteValue>> = {}): DeckState {
  return {
    ids,
    index: 0,
    ratings,
    pending: null,
    phase: ids.length === 0 || allRated(ids, ratings) ? "done" : "rating",
  };
}

export function canGoForward(state: DeckState): boolean {
  const id = state.ids[state.index];
  return state.pending === null && id !== undefined && state.ratings[id] !== undefined && state.index < state.ids.length - 1;
}

export function canGoBack(state: DeckState): boolean {
  return state.pending === null && state.index > 0;
}

export function deckReducer(state: DeckState, action: DeckAction): DeckState {
  switch (action.type) {
    case "submitted": {
      if (state.pending !== null || state.phase === "done") return state;
      if (state.ids[state.index] !== action.id) return state;
      return { ...state, pending: action.id };
    }
    case "rated": {
      const ratings = { ...state.ratings, [action.id]: action.value };
      const at = state.ids.indexOf(action.id);
      if (allRated(state.ids, ratings)) {
        return { ...state, ratings, pending: null, phase: "done" };
      }
      const index = at < 0 ? state.index : Math.min(at + 1, state.ids.length - 1);
      return { ...state, ratings, pending: null, index };
    }
    case "failed":
      return { ...state, pending: null };
    case "back":
      return canGoBack(state) ? { ...state, index: state.index - 1 } : state;
    case "forward":
      return canGoForward(state) ? { ...state, index: state.index + 1 } : state;
    case "dropped": {
      const at = state.ids.indexOf(action.id);
      if (at < 0) return { ...state, pending: null };
      const ids = state.ids.filter((id) => id !== action.id);
      const { [action.id]: _removed, ...ratings } = state.ratings;
      void _removed;
      if (ids.length === 0 || allRated(ids, ratings)) {
        return { ids, ratings, pending: null, index: Math.max(0, Math.min(state.index, ids.length - 1)), phase: "done" };
      }
      // A card removed before the current one shifts everything after it one place left.
      const shifted = at < state.index ? state.index - 1 : state.index;
      return { ids, ratings, pending: null, index: Math.max(0, Math.min(shifted, ids.length - 1)), phase: "rating" };
    }
  }
}
