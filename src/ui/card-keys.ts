// The key rules of the candidate card, shared by the sliding sheet, the full page and (later) the
// browse control, so one guard decides when a key belongs to the card (candidate-revise D7). No React
// import, so a unit test can use it with a stub document.

// The part of `document` the rules read.
export interface KeyDoc {
  querySelector(selector: string): unknown;
}

// An open "(?)" popover or a modal dialog (the invite and withdraw confirmations) takes a key first:
// the browser closes it, and the card stays as it is.
export function overlayOpen(doc: KeyDoc): boolean {
  return doc.querySelector(":popover-open, dialog[open]") !== null;
}

// Escape closes the card unless an overlay is open.
export function escapeClosesCard(key: string, doc: KeyDoc): boolean {
  return key === "Escape" && !overlayOpen(doc);
}
