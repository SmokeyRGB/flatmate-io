import { describe, expect, it } from "vitest";
import { escapeClosesCard, overlayOpen, type KeyDoc } from "@/ui/card-keys";

// candidate-revise D7: a stub document that answers each selector of the comma list on its own, so a
// dropped selector shows.
function doc(open: Array<":popover-open" | "dialog[open]">): KeyDoc {
  return {
    querySelector: (selector) =>
      selector
        .split(",")
        .map((part) => part.trim())
        .some((part) => (open as string[]).includes(part))
        ? {}
        : null,
  };
}

describe("escapeClosesCard", () => {
  it("Escape with no popover or dialog open closes the card", () => {
    expect(escapeClosesCard("Escape", doc([]))).toBe(true);
  });
  it("Escape with a dialog open does not", () => {
    expect(overlayOpen(doc(["dialog[open]"]))).toBe(true);
    expect(escapeClosesCard("Escape", doc(["dialog[open]"]))).toBe(false);
  });
  it("Escape with a popover open does not", () => {
    expect(escapeClosesCard("Escape", doc([":popover-open"]))).toBe(false);
  });
  it("another key never does", () => {
    expect(escapeClosesCard("Enter", doc([]))).toBe(false);
    expect(escapeClosesCard("a", doc([]))).toBe(false);
  });
});
