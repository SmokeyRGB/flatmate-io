"use client";

import { ArrowDown, ArrowUp, Check, Star, X } from "lucide-react";
import type { FormEvent, ReactNode } from "react";
import { VOTE_VALUES, type VoteValue } from "@/modules/deliberation/vote-values";
import { SubmitButton } from "@/ui/submit-button";
import { useStrings } from "@/ui/strings/provider";

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

// The rating a submit event carries: the submitter's value if it is one of the four, else null. Shared
// by the screening deck and the candidate card (candidate-revise D4); pure, so it is a unit test.
export function submittedRating(event: FormEvent<HTMLFormElement>): VoteValue | null {
  const submitter = (event.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null;
  const value = submitter?.value;
  if (!value || !(VOTE_VALUES as readonly string[]).includes(value)) return null;
  return value as VoteValue;
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
