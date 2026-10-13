import type { ReactNode } from "react";

// F5 candidate-detail, design D1: the Casting area's layout carries the parallel `@detail` slot.
// A tap on a scoreboard row is intercepted into that slot, so the card slides in over the board
// while the board stays rendered beneath it; a direct link or a reload renders the full page
// instead. The open sheet marks everything behind it `inert` once, when it opens
// (src/ui/inert-outside.ts: the header and nav too). The board sits in this wrapper so that the
// marked element stays the same while the board re-renders beneath the sheet: a root the page swaps
// later (an error boundary, another branch) is still inside it. `contents` keeps the wrapper out of
// every screen's layout (the deck's height maths included): `inert` is a DOM-subtree property.
export default function CastingLayout({ children, detail }: { children: ReactNode; detail: ReactNode }) {
  return (
    <>
      <div id="casting-board" className="contents">
        {children}
      </div>
      {detail}
    </>
  );
}
