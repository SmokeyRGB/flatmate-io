import type { ReactNode } from "react";

// F5 candidate-detail, design D1: the Casting area's layout carries the parallel `@detail` slot.
// A tap on a scoreboard row is intercepted into that slot, so the card slides in over the board
// while the board stays rendered beneath it; a direct link or a reload renders the full page
// instead. The board sits in a wrapper the open sheet marks `inert`, so focus and clicks cannot
// reach it. `contents` keeps the wrapper out of every screen's layout (the deck's height maths
// included): `inert` is a DOM-subtree property and needs no box.
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
