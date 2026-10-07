"use client";

import { X } from "lucide-react";
import { useRouter } from "next/navigation";
import {
  ViewTransition,
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
import { useStrings } from "@/ui/strings/provider";
import { HORIZONTAL_RATIO, SLOP_PX, releaseDecision } from "@/ui/swipe";

// The card that slides over the scoreboard (F5 candidate-detail design D1/D10). It is the frame of
// the intercepted route and nothing else: the content, the skeleton and the refusal all render
// inside it, so there is one instance, one enter animation and one focus move per opening.
//
// - A fixed right panel (the full width on a phone) over a transparent backdrop, so the scoreboard
//   stays rendered and visible beneath it. While the panel is mounted its effect marks the board's
//   wrapper (`#casting-board`, rendered by casting/layout.tsx) `inert`.
// - Escape, the close button and a tap on the backdrop call `router.back()`, as the browser's back
//   does, so all four close it the same way.
// - React <ViewTransition> animates the enter and the exit declaratively, because a navigation is a
//   transition (node_modules/next/dist/docs/01-app/02-guides/view-transitions.md). Where the View
//   Transitions API is missing the card simply appears and disappears.
// - The swipe shares its release rule with the screening deck (src/ui/swipe.ts) and nothing else:
//   rightward only, the panel follows the finger, a commit animates it off and then goes back with
//   the exit transition suppressed, a short drag springs back. `touch-action: pan-y` keeps vertical
//   scrolling inside the card native, so a vertical scroll is never a swipe.
export function DetailSheet({ children }: { children: ReactNode }) {
  const t = useStrings().casting.detail;
  const router = useRouter();
  const panelRef = useRef<HTMLDivElement>(null);
  // Set before router.back() after a swipe: the panel is already off-screen, so the exit slide must
  // not play again.
  const [swiped, setSwiped] = useState(false);
  const close = useCallback(() => router.back(), [router]);

  useEffect(() => {
    const board = document.getElementById("casting-board");
    board?.setAttribute("inert", "");
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    panelRef.current?.focus();
    return () => {
      board?.removeAttribute("inert");
      opener?.focus?.();
    };
  }, []);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      // An open "(?)" popover or the invite dialog takes the Escape first: the browser closes it, and
      // the card stays open.
      if (document.querySelector(":popover-open, dialog[open]")) return;
      close();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [close]);

  const swipe = useRef<{
    x: number;
    y: number;
    decided: boolean;
    active: boolean;
    dx: number;
    speed: number;
    lastX: number;
    lastT: number;
  } | null>(null);

  function setDrag(dx: number | null) {
    const panel = panelRef.current;
    if (!panel) return;
    if (dx === null) {
      panel.style.removeProperty("transform");
      panel.style.removeProperty("transition");
      return;
    }
    panel.style.transition = "none";
    panel.style.transform = `translateX(${dx}px)`;
  }
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
      if (s.active) {
        // Best effort: capture keeps the release on the panel, but its absence must not stop the drag.
        try {
          event.currentTarget.setPointerCapture(event.pointerId);
        } catch {}
      }
    }
    if (!s.active) return;
    // Rightward only: a leftward drag leaves the panel where it is.
    s.dx = Math.max(0, dx);
    const dt = event.timeStamp - s.lastT;
    if (dt > 0) s.speed = Math.abs(event.clientX - s.lastX) / dt;
    s.lastX = event.clientX;
    s.lastT = event.timeStamp;
    setDrag(s.dx);
  }
  function finishSwipe(event: ReactPointerEvent<HTMLDivElement>, cancelled: boolean) {
    const s = swipe.current;
    swipe.current = null;
    if (!s || !s.active) {
      setDrag(null);
      return;
    }
    const panel = panelRef.current;
    const width = panel?.offsetWidth ?? event.currentTarget.offsetWidth;
    const { commit, direction } = releaseDecision({ dx: s.dx, speed: s.speed, width, cancelled });
    if (!commit || direction < 0 || !panel) {
      // Short of the threshold: the panel springs back to its place.
      panel?.style.setProperty("transition", "transform 180ms ease-out");
      panel?.style.setProperty("transform", "translateX(0)");
      window.setTimeout(() => setDrag(null), 200);
      return;
    }
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const finish = () => {
      setSwiped(true);
      // The exit prop is read when the sheet unmounts, so let the re-render with "none" land first.
      window.setTimeout(close, 0);
    };
    if (reduceMotion) {
      finish();
      return;
    }
    panel.style.setProperty("transition", "transform 180ms ease-in");
    panel.style.setProperty("transform", `translateX(${width}px)`);
    window.setTimeout(finish, 190);
  }

  return (
    <>
      <div className="detail-backdrop" onClick={close} aria-hidden="true" />
      <ViewTransition enter="detail-slide-in" exit={swiped ? "none" : "detail-slide-out"} default="none">
        <div
          ref={panelRef}
          className="detail-sheet"
          role="dialog"
          aria-modal="true"
          aria-label={t.sheetTitle}
          tabIndex={-1}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={(event) => finishSwipe(event, false)}
          onPointerCancel={(event) => finishSwipe(event, true)}
        >
          <div className="mb-2 flex justify-end">
            <button type="button" className="detail-close" onClick={close} aria-label={t.closeLabel}>
              <X className="size-5" aria-hidden="true" />
            </button>
          </div>
          {children}
        </div>
      </ViewTransition>
    </>
  );
}
