import { describe, expect, it, vi } from "vitest";
import {
  newPrefillSelection,
  onPrefillFocus,
  onPrefillInput,
  onPrefillMouseUp,
  onPrefillPointerDown,
} from "@/app/(auth)/sign-in/prefill-selection";

// organisation-task-list D10 (spec identity/device-memory "Typing replaces the prefill"). The repo
// has no DOM test environment, so this models the one browser behaviour the rule relies on: typing
// into a field whose whole content is selected replaces it, and typing into an unselected field
// appends.
function fakeField(initial: string) {
  const field = {
    value: initial,
    selected: false,
    select() {
      field.selected = true;
    },
    type(text: string, state: ReturnType<typeof newPrefillSelection>) {
      field.value = field.selected ? text : field.value + text;
      field.selected = false;
      onPrefillInput(state);
    },
  };
  return field;
}

describe("a prefilled household code", () => {
  it("is replaced, not appended to, when the person focuses and types a full code", () => {
    const state = newPrefillSelection();
    state.active = true; // what the prefill effect sets
    const field = fakeField("OLD-CODE");

    onPrefillFocus(state, field);
    field.type("NEW-CODE", state);

    expect(field.value).toBe("NEW-CODE");
  });

  it("stays editable: after the first input, typing appends again", () => {
    const state = newPrefillSelection();
    state.active = true;
    const field = fakeField("OLD");
    onPrefillFocus(state, field);
    field.type("AB", state);
    field.type("C", state);
    expect(field.value).toBe("ABC");
  });

  it("is not selected when the device prefilled nothing", () => {
    const state = newPrefillSelection();
    const field = fakeField("TYPED");
    onPrefillFocus(state, field);
    expect(field.selected).toBe(false);
    field.type("X", state);
    expect(field.value).toBe("TYPEDX");
  });

  it("lets a later click place the caret: only the mouseup of the focusing click is swallowed", () => {
    const state = newPrefillSelection();
    state.active = true;
    const field = fakeField("OLD");
    onPrefillPointerDown(state);
    onPrefillFocus(state, field);

    const first = { preventDefault: vi.fn() };
    onPrefillMouseUp(state, first);
    expect(first.preventDefault).toHaveBeenCalledOnce();

    const second = { preventDefault: vi.fn() };
    onPrefillMouseUp(state, second);
    expect(second.preventDefault).not.toHaveBeenCalled();
  });

  it("review fix R-7: a Tab focus selects the prefill but swallows no later click", () => {
    const state = newPrefillSelection();
    state.active = true;
    const field = fakeField("OLD");
    onPrefillFocus(state, field); // no pointerdown first
    expect(field.selected).toBe(true);

    const click = { preventDefault: vi.fn() };
    onPrefillMouseUp(state, click);
    expect(click.preventDefault).not.toHaveBeenCalled();
  });
});
