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
import type { ScaleWeights } from "@/modules/deliberation/scale-weights";
import { VOTE_VALUES, type VoteValue } from "@/modules/deliberation/vote-values";
import { SubmitButton } from "@/ui/submit-button";
import { de } from "@/ui/strings";
import { castVoteAction, type CastVoteResult } from "./actions";
import { canGoBack, canGoForward, deckReducer, initialDeckState } from "./deck-state";

const t = de.screening;

// Swipe thresholds (design D9): tuned in the walkthrough, so they are constants, not logic.
const SLOP_PX = 10;
const HORIZONTAL_RATIO = 1.5;
const RELEASE_FRACTION = 0.25;
const RELEASE_MAX_PX = 80;
const ANIMATION_MS = 240;

const ICONS: Record<VoteValue, ReactNode> = {
  no: <X className="size-5" aria-hidden="true" />,
  rather_not: <ArrowDown className="size-5" aria-hidden="true" />,
  good: <ArrowUp className="size-5" aria-hidden="true" />,
  definitely: <Star className="size-5" aria-hidden="true" />,
};

type Refusal = { kind: "round_not_open"; status: RoundStatus } | { kind: "not_eligible" };

function CardBody({ card }: { card: ScreeningCard }) {
  return (
    <>
      <h2 className="font-serif text-xl font-semibold">
        {card.applicantName}
        {card.age !== null && <span className="font-sans text-base font-normal text-muted-foreground">, {t.ageYears(card.age)}</span>}
      </h2>
      {card.messageRaw && <p className="mt-3 whitespace-pre-wrap text-sm">{card.messageRaw}</p>}
      {card.attributes && card.attributes.length > 0 && (
        <dl className="mt-4 space-y-1 text-sm">
          {card.attributes.map((a, i) => (
            <div key={i} className="flex gap-2">
              <dt className="font-medium">{a.label}:</dt>
              <dd>{a.value}</dd>
            </div>
          ))}
        </dl>
      )}
    </>
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
            className={`rating-btn${isSelected ? " rating-btn-selected" : ""}`}
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
  const router = useRouter();
  const [state, dispatch] = useReducer(deckReducer, cards, (initial) => initialDeckState(initial.map((c) => c.applicationId)));
  const [byId] = useState(() => new Map(cards.map((c) => [c.applicationId, c])));
  const [, startTransition] = useTransition();
  const [chosen, setChosen] = useState<VoteValue | null>(null);
  const [refusal, setRefusal] = useState<Refusal | null>(null);
  const [failed, setFailed] = useState(false);
  const [dir, setDir] = useState<"forward" | "back">("forward");
  const [leaving, setLeaving] = useState<{ card: ScreeningCard; dir: "forward" | "back" } | null>(null);
  // Read by event handlers only; refreshed after every committed render.
  const stateRef = useRef(state);
  useEffect(() => {
    stateRef.current = state;
  });

  const currentId = state.ids[state.index];
  const card = currentId ? byId.get(currentId) : undefined;
  const nextId = state.ids[state.index + 1];

  // When the last card is rated (or the last unratable one dropped) the pass leads to the Casting
  // tab (FR-4.18). The existing redirect there sends a resident with new arrivals into a fresh pass.
  useEffect(() => {
    if (state.phase === "done") router.push("/casting");
  }, [state.phase, router]);

  // Keeps the leaving card in the DOM for the length of the animation, then drops it.
  useEffect(() => {
    if (!leaving) return;
    const timer = window.setTimeout(() => setLeaving(null), ANIMATION_MS + 40);
    return () => window.clearTimeout(timer);
  }, [leaving]);

  const leave = useCallback((direction: "forward" | "back") => {
    const s = stateRef.current;
    const id = s.ids[s.index];
    const leavingCard = id ? byId.get(id) : undefined;
    setDir(direction);
    if (leavingCard) setLeaving({ card: leavingCard, dir: direction });
  }, [byId]);

  const goBack = useCallback(() => {
    if (!canGoBack(stateRef.current)) return;
    setFailed(false);
    leave("back");
    dispatch({ type: "back" });
  }, [leave]);

  const goForward = useCallback(() => {
    if (!canGoForward(stateRef.current)) return;
    setFailed(false);
    leave("forward");
    dispatch({ type: "forward" });
  }, [leave]);

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

  // Swipe (Pointer Events, touch only) on the top card. It never rates: it maps to back/forward.
  const swipe = useRef<{ x: number; y: number; decided: boolean; active: boolean; dx: number } | null>(null);
  function onPointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    if (event.pointerType !== "touch") return;
    swipe.current = { x: event.clientX, y: event.clientY, decided: false, active: false, dx: 0 };
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
      if (s.active) event.currentTarget.setPointerCapture(event.pointerId);
    }
    if (!s.active) return;
    s.dx = dx;
    event.currentTarget.style.transform = `translateX(${dx}px) rotate(${dx / 30}deg)`;
  }
  function endSwipe(event: ReactPointerEvent<HTMLDivElement>) {
    const s = swipe.current;
    swipe.current = null;
    const el = event.currentTarget;
    if (!s || !s.active) return;
    el.style.transform = "";
    const threshold = Math.min(el.offsetWidth * RELEASE_FRACTION, RELEASE_MAX_PX);
    if (Math.abs(s.dx) < threshold) return;
    // Right = back, left = forward; forward only if the card is rated (canGoForward).
    if (s.dx > 0) goBack();
    else goForward();
  }

  function handleResult(result: CastVoteResult, id: string, value: VoteValue) {
    if (result.ok) {
      leave("forward");
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
        leave("forward");
        dispatch({ type: "dropped", id });
        return;
      case "round_not_open":
        dispatch({ type: "failed", id });
        setRefusal({ kind: "round_not_open", status: result.roundStatus ?? "paused" });
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
      const result = await castVoteAction({ roundId, applicationId: id, value: rating });
      handleResult(result, id, rating);
    });
  }

  if (refusal) {
    return (
      <div className="mx-auto max-w-md space-y-3 p-6">
        <p className="text-sm" role="status">
          {refusal.kind === "round_not_open"
            ? t.refusal.roundNotOpen(de.status.round[refusal.status])
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
        <ul className="mt-2 space-y-1 text-sm">
          {VOTE_VALUES.map((v) => (
            <li key={v}>
              {t.ratings[v]}: {t.points(weights[v])}
              {v === "definitely" && <> {t.favouriteNote}</>}
            </li>
          ))}
        </ul>
        <p className="mt-3 text-sm text-muted-foreground">
          {t.weightsSentence(t.ratings.rather_not, t.ratings.good)}
        </p>
      </div>

      <div className="deck-stack" data-dir={dir}>
        {nextId && <div className="deck-card deck-card-next card" aria-hidden="true" />}
        {leaving && (
          <div key={`leaving-${leaving.card.applicationId}`} className="deck-card deck-card-leaving card" data-dir={leaving.dir} aria-hidden="true">
            <CardBody card={leaving.card} />
          </div>
        )}
        <div
          key={card.applicationId}
          className="deck-card deck-card-current card"
          data-entering={leaving ? "true" : undefined}
          data-dir={dir}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={endSwipe}
          onPointerCancel={endSwipe}
        >
          <CardBody card={card} />
        </div>
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
