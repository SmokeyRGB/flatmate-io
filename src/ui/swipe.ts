// The swipe rule shared by the screening deck and the candidate detail sheet (candidate-detail
// design D10): the constants and ONE pure function, so the two feel the same. The pointer handlers
// stay in each component, because they differ in nearly everything but this rule: the deck's two
// directions and its resistance at the ends, the sheet's rightward-only drag.
//
// Pure and import-free, so a client component and a unit test can both use it.

// Swipe thresholds (screening design D9): tuned in the walkthrough, so they are constants, not logic.
export const SLOP_PX = 10;
export const HORIZONTAL_RATIO = 1.5;
export const RELEASE_FRACTION = 0.25;
export const RELEASE_MAX_PX = 80;
// A quick flick counts too: on a phone the natural swipe is short and fast, not a long drag.
export const FLICK_MIN_PX = 30;
export const FLICK_MIN_SPEED = 0.4; // px per ms over the last move

// What a release does. `dx` is the drag's horizontal distance as shown (after any resistance), `speed`
// the pointer's speed over its last move in px per ms, `width` the swipeable element's width.
// `cancelled`: the browser ended the touch (pointercancel) instead of a release. Some mobile browsers
// do that at the end of a horizontal drag even under touch-action: pan-y (screening walkthrough
// 2026-10-02: the drag previewed the card but never went back). A cancel then commits only a drag
// already clearly past the distance threshold, never a flick; anything less springs back.
//
// `direction` is the sign of `dx` (1 right, -1 left): the caller decides which directions it
// allows.
export function releaseDecision({
  dx,
  speed,
  width,
  cancelled,
}: {
  dx: number;
  speed: number;
  width: number;
  cancelled: boolean;
}): { commit: boolean; direction: 1 | -1 } {
  const threshold = Math.min(width * RELEASE_FRACTION, RELEASE_MAX_PX);
  const far = Math.abs(dx) >= threshold;
  const flick = Math.abs(dx) >= FLICK_MIN_PX && speed >= FLICK_MIN_SPEED;
  return { commit: cancelled ? far : far || flick, direction: dx > 0 ? 1 : -1 };
}
