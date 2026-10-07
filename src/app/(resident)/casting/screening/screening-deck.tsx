"use client";

import { ArrowDown, ArrowUp, Check, ChevronLeft, Star, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  useCallback,
  useEffect,
  useReducer,
  useRef,
  useState,
  useTransition,
  type FormEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
import type { RoundStatus } from "@/modules/casting/repository";
import type { ScreeningCard } from "@/modules/deliberation/repository";
import type { ScaleWeights } from "@/modules/deliberation/round-rules";
import { VOTE_VALUES, type VoteValue } from "@/modules/deliberation/vote-values";
import { HORIZONTAL_RATIO, SLOP_PX, releaseDecision } from "@/ui/swipe";
import { SubmitButton } from "@/ui/submit-button";
import { useStrings } from "@/ui/strings/provider";
import { CardBody } from "../candidate-card-body";
import { WeightsList } from "../weights-list";
import { castVoteAction, type CastVoteResult } from "./actions";
import { canGoBack, canGoForward, deckReducer, initialDeckState } from "./deck-state";

// One colour class per level (a red-to-green scale from the design system's --vote-* tokens, see
// globals.css). Colour never stands alone: every level also has its symbol and its label, and the
// selected one a check glyph and aria-pressed (FR-4.19).
const RATING_CLASS: Record<VoteValue, string> = {
  no: "rating-btn-no",
  rather_not: "rating-btn-rather-not",
  good: "rating-btn-good",
  definitely: "rating-btn-definitely",
};

const ICONS: Record<VoteValue, ReactNode> = {
  no: <X className="size-5" aria-hidden="true" />,
  rather_not: <ArrowDown className="size-5" aria-hidden="true" />,
  good: <ArrowUp className="size-5" aria-hidden="true" />,
  definitely: <Star className="size-5" aria-hidden="true" />,
};

type Refusal = { kind: "round_not_open"; status: RoundStatus | null } | { kind: "not_eligible" };

// One card of the stack. The previous, current and next card are all rendered with their real
// content, keyed by application id so React never remounts them mid-animation; only `data-pos`
// changes, and CSS transitions carry the move (globals.css). The two neighbours are hidden from
// assistive technology and inert: the resident is only ever on the current card.
function DeckCard({ card, pos }: { card: ScreeningCard; pos: "prev" | "current" | "next" }) {
  const isCurrent = pos === "current";
  return (
    <div
      className="deck-card card"
      data-pos={pos}
      aria-hidden={isCurrent ? undefined : true}
      inert={isCurrent ? undefined : true}
    >
      <CardBody card={card} />
    </div>
  );
}

// The four ratings, side by side in one form (one row, symbol above label, no numbers). Exported
// so the selected-state markup is a unit test (tests/unit/screening/screening-deck.test.ts).
export function RatingBar({
  selected,
  chosen,
  busy,
  onSubmit,
}: {
  selected: VoteValue | undefined;
  chosen: VoteValue | null;
  busy: boolean;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  const t = useStrings().screening;
  return (
    <form onSubmit={onSubmit} className="rating-bar" aria-label={t.ratingGroupLabel}>
      {VOTE_VALUES.map((v) => {
        const isSelected = selected === v;
        return (
          <SubmitButton
            key={v}
            name="value"
            value={v}
            icon={ICONS[v]}
            className={`rating-btn ${RATING_CLASS[v]}${isSelected ? " rating-btn-selected" : ""}`}
            aria-pressed={isSelected}
            disabled={busy}
            pending={chosen === v}
          >
            {t.ratings[v]}
            {isSelected && (
              <>
                <span className="rating-check" aria-hidden="true">
                  <Check className="size-3.5" />
                </span>
                <span className="sr-only">{t.selected}</span>
              </>
            )}
          </SubmitButton>
        );
      })}
    </form>
  );
}

// Screen C1's client half: it holds the deck for the whole pass. The deck is initialised ONCE from
// the server's props (useReducer's initialiser) and later prop changes are ignored; together with
// the action's lack of revalidation, that is FR-4.4.
export function ScreeningDeck({
  roundId,
  roundTitle,
  weights,
  cards,
}: {
  roundId: string;
  roundTitle: string;
  weights: ScaleWeights;
  cards: ScreeningCard[];
}) {
  const s = useStrings();
  const t = s.screening;
  const router = useRouter();
  const [state, dispatch] = useReducer(deckReducer, cards, (initial) => initialDeckState(initial.map((c) => c.applicationId)));
  const [byId] = useState(() => new Map(cards.map((c) => [c.applicationId, c])));
  const [, startTransition] = useTransition();
  const [chosen, setChosen] = useState<VoteValue | null>(null);
  const [refusal, setRefusal] = useState<Refusal | null>(null);
  const [failed, setFailed] = useState(false);
  const stackRef = useRef<HTMLDivElement>(null);
  // Read by event handlers only; refreshed after every committed render.
  const stateRef = useRef(state);
  useEffect(() => {
    stateRef.current = state;
  });

  const currentId = state.ids[state.index];
  const card = currentId ? byId.get(currentId) : undefined;
  const prevCard = state.index > 0 ? byId.get(state.ids[state.index - 1]) : undefined;
  const nextCard = state.index < state.ids.length - 1 ? byId.get(state.ids[state.index + 1]) : undefined;

  // When the last card is rated (or the last unratable one dropped) the pass leads to the Casting
  // tab (FR-4.18). The existing redirect there sends a resident with new arrivals into a fresh pass.
  useEffect(() => {
    if (state.phase === "done") router.push("/casting");
  }, [state.phase, router]);

  const goBack = useCallback(() => {
    if (!canGoBack(stateRef.current)) return;
    setFailed(false);
    dispatch({ type: "back" });
  }, []);

  const goForward = useCallback(() => {
    if (!canGoForward(stateRef.current)) return;
    setFailed(false);
    dispatch({ type: "forward" });
  }, []);

  // ← and → on desktop. Ignored with a modifier key, while the pop-over is open, and when the
  // event comes from a text field.
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
      if (event.ctrlKey || event.metaKey || event.altKey || event.shiftKey) return;
      const target = event.target as HTMLElement | null;
      if (target && (["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName) || target.isContentEditable)) return;
      if (document.querySelector(":popover-open")) return;
      if (event.key === "ArrowLeft") goBack();
      else goForward();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [goBack, goForward]);

  // Swipe (Pointer Events, touch only) on the current card. It never rates: it maps to back/forward.
  // While dragging, the stack's --drag variable moves the current card with the finger and pulls the
  // previous card in behind it (globals.css); the card being revealed is already rendered.
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
    const stack = stackRef.current;
    if (!stack) return;
    if (dx === null) {
      stack.removeAttribute("data-dragging");
      stack.style.removeProperty("--drag");
      stack.style.removeProperty("--tilt");
      stack.style.removeProperty("--drag-p");
      return;
    }
    stack.setAttribute("data-dragging", dx > 0 ? "back" : "forward");
    stack.style.setProperty("--drag", `${dx}px`);
    stack.style.setProperty("--tilt", `${dx / 30}deg`);
    // Back: the current card sinks into the pile in proportion to the drag (globals.css).
    const width = stack.offsetWidth || 1;
    stack.style.setProperty("--drag-p", `${Math.min(Math.abs(dx) / width, 1)}`);
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
        // Best effort: capture keeps the release on the stack, but its absence must not stop the drag.
        try {
          event.currentTarget.setPointerCapture(event.pointerId);
        } catch {}
      }
    }
    if (!s.active) return;
    // Backward needs a previous card and forward a rated one; otherwise the card resists.
    const allowed = dx > 0 ? canGoBack(stateRef.current) : canGoForward(stateRef.current);
    s.dx = allowed ? dx : dx / 4;
    const dt = event.timeStamp - s.lastT;
    if (dt > 0) s.speed = Math.abs(event.clientX - s.lastX) / dt;
    s.lastX = event.clientX;
    s.lastT = event.timeStamp;
    setDrag(s.dx);
  }
  // `cancelled`: the browser ended the touch (pointercancel) instead of a release. Some mobile
  // browsers do that at the end of a horizontal drag even under touch-action: pan-y (human
  // walkthrough 2026-10-02: the drag previewed the card but never went back). A cancel then commits
  // only a drag already clearly past the distance threshold, never a flick; anything less springs
  // back. A swipe never rates, so the worst case of a wrongly committed cancel is a move to the
  // neighbouring card.
  function finishSwipe(event: ReactPointerEvent<HTMLDivElement>, cancelled: boolean) {
    const s = swipe.current;
    swipe.current = null;
    if (!s || !s.active) {
      setDrag(null);
      return;
    }
    const width = stackRef.current?.offsetWidth ?? event.currentTarget.offsetWidth;
    // The release rule is shared with the candidate detail sheet (src/ui/swipe.ts).
    const { commit, direction } = releaseDecision({ dx: s.dx, speed: s.speed, width, cancelled });
    // The drag ends first; if the move commits, the state change then animates from where the
    // finger let go, otherwise the card springs back.
    setDrag(null);
    if (!commit) return;
    // Right = back, left = forward; forward only if the card is rated (canGoForward).
    if (direction > 0) goBack();
    else goForward();
  }


  function handleResult(result: CastVoteResult, id: string, value: VoteValue) {
    if (result.ok) {
      dispatch({ type: "rated", id, value });
      setChosen(null);
      return;
    }
    setChosen(null);
    switch (result.code) {
      case "not_found":
      case "not_votable":
      case "own_application":
        // The card can never be rated again: drop it and go on.
        dispatch({ type: "dropped", id });
        return;
      case "round_not_open":
        dispatch({ type: "failed", id });
        // No guessed state: an unknown status gets the message without one (code review).
        setRefusal({ kind: "round_not_open", status: result.roundStatus ?? null });
        return;
      case "not_eligible":
        dispatch({ type: "failed", id });
        setRefusal({ kind: "not_eligible" });
        return;
      case "no_session":
        router.push("/sign-in");
        return;
      default:
        dispatch({ type: "failed", id });
        setFailed(true);
    }
  }

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    // An implicit submit through an aria-disabled button is still a submit: refuse it here.
    if (stateRef.current.pending !== null || refusal || !card) return;
    const submitter = (event.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null;
    const value = submitter?.value;
    if (!value || !(VOTE_VALUES as readonly string[]).includes(value)) return;
    const rating = value as VoteValue;
    const id = card.applicationId;
    setFailed(false);
    setChosen(rating);
    dispatch({ type: "submitted", id });
    startTransition(async () => {
      // A rejected action (the request never came back) is the same calm failure as a "failed"
      // result: it clears `pending`, so the deck is never left locked (Copilot, PR #48).
      const result = await castVoteAction({ roundId, applicationId: id, value: rating }).catch(
        (): CastVoteResult => ({ ok: false, code: "failed" }),
      );
      handleResult(result, id, rating);
    });
  }

  if (refusal) {
    return (
      <div className="mx-auto max-w-md space-y-3 p-6">
        <p className="text-sm" role="status">
          {refusal.kind === "round_not_open"
            ? refusal.status
              ? t.refusal.roundNotOpen(s.status.round[refusal.status])
              : t.refusal.roundNotOpenUnknown
            : t.refusal.notEligible}
        </p>
        <Link href="/dashboard" className="btn-link">
          {t.backToStart}
        </Link>
      </div>
    );
  }

  if (!card) return null;

  const position = Math.min(state.index + 1, state.ids.length);
  const total = state.ids.length;
  const backAllowed = canGoBack(state);

  return (
    <div className="deck-screen mx-auto flex max-w-md flex-col gap-3 px-4 pt-3">
      <h1 className="sr-only">{roundTitle}</h1>
      <div className="deck-topbar">
        {backAllowed ? (
          <button type="button" className="deck-back" onClick={goBack} aria-label={t.backAria}>
            <ChevronLeft className="size-5 md:hidden" aria-hidden="true" />
            <span className="hidden md:inline">{t.back}</span>
          </button>
        ) : (
          <span className="deck-back-spacer" aria-hidden="true" />
        )}
        <div className="deck-progress">
          <div
            role="progressbar"
            aria-label={t.progressLabel}
            aria-valuemin={0}
            aria-valuemax={total}
            aria-valuenow={position}
            aria-valuetext={t.progress(position, total)}
            className="deck-progress-track"
          >
            <div className="deck-progress-fill" style={{ width: `${(position / total) * 100}%` }} />
          </div>
          <span className="deck-progress-text" aria-hidden="true">
            {t.progress(position, total)}
          </span>
        </div>
        <button type="button" className="deck-help" popoverTarget="weights-popover" aria-label={t.weightsToggleLabel}>
          {t.weightsToggle}
        </button>
      </div>

      <div id="weights-popover" popover="auto" className="weights-popover card">
        <p className="font-semibold">{t.weightsHeading}</p>
        <WeightsList weights={weights} />
        <p className="mt-3 text-sm text-muted-foreground">
          {t.weightsSentence(t.ratings.rather_not, t.ratings.good)}
        </p>
      </div>

      <div
        ref={stackRef}
        className="deck-stack"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={(event) => finishSwipe(event, false)}
        onPointerCancel={(event) => finishSwipe(event, true)}
      >
        {prevCard && <DeckCard key={prevCard.applicationId} card={prevCard} pos="prev" />}
        <DeckCard key={card.applicationId} card={card} pos="current" />
        {nextCard && <DeckCard key={nextCard.applicationId} card={nextCard} pos="next" />}
      </div>

      {failed && (
        <p role="status" className="text-sm text-muted-foreground">
          {t.refusal.voteFailed}
        </p>
      )}

      <RatingBar
        selected={state.ratings[card.applicationId]}
        chosen={state.pending === card.applicationId ? chosen : null}
        busy={state.pending !== null}
        onSubmit={onSubmit}
      />
    </div>
  );
}
