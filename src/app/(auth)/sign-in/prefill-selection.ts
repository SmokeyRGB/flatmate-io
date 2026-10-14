// organisation-task-list D10 (spec identity/device-memory "Typing replaces the prefill"): a household
// code the device filled in is selected when the field gets focus, so the first thing typed replaces
// it instead of being appended to it. Kept out of the form so the rule is a unit test (the repo has
// no DOM test environment). `active` is set by the effect that prefills and cleared by the first
// input; a click-to-place-caret after the first focus works normally, because only the mouseup that
// ends the focusing click is swallowed (Safari would otherwise drop the selection on it).
export interface PrefillSelection {
  active: boolean;
  justFocused: boolean;
  // review fix R-7: set by pointerdown, which precedes the focus it causes; a Tab focus has none.
  pointerDown: boolean;
}

export const newPrefillSelection = (): PrefillSelection => ({ active: false, justFocused: false, pointerDown: false });

export function onPrefillFocus(state: PrefillSelection, input: { select(): void }): void {
  if (!state.active) return;
  input.select();
  state.justFocused = state.pointerDown;
}

export function onPrefillPointerDown(state: PrefillSelection): void {
  state.pointerDown = true;
}

export function onPrefillMouseUp(state: PrefillSelection, event: { preventDefault(): void }): void {
  state.pointerDown = false;
  if (!state.justFocused) return;
  event.preventDefault();
  state.justFocused = false;
}

export function onPrefillInput(state: PrefillSelection): void {
  state.active = false;
  state.justFocused = false;
}
