"use client";

import { useRouter } from "next/navigation";
import { useRef, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import { HORIZONTAL_RATIO, SLOP_PX, releaseDecision } from "@/ui/swipe";

// The full page's swipe (a direct link or a reload, design D10): a rightward swipe leads to the
// scoreboard of the card's round, like the sheet's swipe closes it. There is no scoreboard beneath
// here, so nothing follows the finger: the release rule is the same (src/ui/swipe.ts) and the
// result is a navigation. The back link is the control that works without a swipe (P-2).
// `touch-action: pan-y` keeps vertical scrolling native, so a vertical scroll is never a swipe.
export function SwipeToBoard({ href, children }: { href: string; children: ReactNode }) {
  const router = useRouter();
  const swipe = useRef<{ x: number; y: number; decided: boolean; active: boolean; dx: number; speed: number; lastX: number; lastT: number } | null>(null);

  function onPointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    if (event.pointerType !== "touch") return;
    swipe.current = {
      x: event.clientX,
      y: event.clientY,
      decided: false,
      active: false,
      dx: 0,
      speed: 0,
      lastX: event.clientX,
      lastT: event.timeStamp,
    };
  }
  function onPointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    const s = swipe.current;
    if (!s) return;
    const dx = event.clientX - s.x;
    const dy = event.clientY - s.y;
    if (!s.decided) {
      if (Math.hypot(dx, dy) < SLOP_PX) return;
      s.decided = true;
      s.active = Math.abs(dx) > HORIZONTAL_RATIO * Math.abs(dy);
    }
    if (!s.active) return;
    s.dx = dx;
    const dt = event.timeStamp - s.lastT;
    if (dt > 0) s.speed = Math.abs(event.clientX - s.lastX) / dt;
    s.lastX = event.clientX;
    s.lastT = event.timeStamp;
  }
  function finish(event: ReactPointerEvent<HTMLDivElement>, cancelled: boolean) {
    const s = swipe.current;
    swipe.current = null;
    if (!s || !s.active) return;
    const { commit, direction } = releaseDecision({
      dx: s.dx,
      speed: s.speed,
      width: event.currentTarget.offsetWidth,
      cancelled,
    });
    // Rightward only.
    if (commit && direction > 0) router.replace(href);
  }

  return (
    <div
      className="swipe-pan-y"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={(event) => finish(event, false)}
      onPointerCancel={(event) => finish(event, true)}
    >
      {children}
    </div>
  );
}
