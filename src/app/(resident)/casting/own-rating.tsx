"use client";

import { unstable_rethrow, useRouter } from "next/navigation";
import { useId, useRef, useState, useTransition, type FormEvent } from "react";
import { displayName } from "@/app/(org)/rounds/[id]/applications/invite-text";
import type { OwnRating as OwnRatingData } from "@/modules/deliberation/repository";
import type { VoteValue } from "@/modules/deliberation/vote-values";
import { useStrings } from "@/ui/strings/provider";
import { SubmitButton } from "@/ui/submit-button";
import { changeRatingAction, withdrawRatingAction, type RatingResult } from "./candidate-actions";
import { RatingBar, submittedRating } from "./rating-bar";

export type OutcomeMessage = "notVotable" | "roundNotOpen" | "notPossible" | "failed";

// What a result of a change or a withdrawal means for the card (candidate-revise D5). Pure, so every
// code is a unit test (there is no DOM environment). `ok` has no message: the re-rendered rating is
// the feedback. A withdrawal that succeeds never gets here: the action redirects.
export function ratingOutcome(result: RatingResult): { message?: OutcomeMessage; signIn?: true } {
  if (result.ok) return {};
  switch (result.code) {
    case "no_session":
      return { signIn: true };
    case "not_votable":
      return { message: "notVotable" };
    case "round_not_open":
      return { message: "roundNotOpen" };
    case "not_eligible":
    case "not_found":
    case "own_application":
      return { message: "notPossible" };
    default:
      return { message: "failed" };
  }
}

const failedResult = (): RatingResult => ({ ok: false, code: "failed" });

// A rejected action call is a calm failure, except Next's own navigation errors: a successful
// withdrawal redirects, and its client promise rejects with NEXT_REDIRECT. That one must propagate,
// never become „Sorry, das hat nicht geklappt" (candidate-revise code review).
export function failedUnlessNavigation(err: unknown): RatingResult {
  unstable_rethrow(err);
  return failedResult();
}

// The viewer's own rating on the card. With `canChange` it offers the four ratings and a withdrawal;
// otherwise it shows the rating read-only with the reason. Its message state lives here, in the one
// component that renders in every state, so a message survives the re-render that removes the
// controls after a refusal.
export function OwnRating({
  roundId,
  applicationId,
  applicantName,
  own,
  roundStatus,
  state,
}: {
  roundId: string;
  applicationId: string;
  applicantName: string;
  own: OwnRatingData;
  roundStatus: string;
  state: string;
}) {
  const s = useStrings();
  const d = s.casting.detail;
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [chosen, setChosen] = useState<VoteValue | null>(null);
  const [message, setMessage] = useState<OutcomeMessage | null>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const headingId = useId();
  const name = displayName(applicantName);

  function settle(result: RatingResult) {
    const outcome = ratingOutcome(result);
    if (outcome.signIn) router.push("/sign-in");
    setMessage(outcome.message ?? null);
  }

  function onChange(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const value = submittedRating(event);
    // The rating already held sends nothing (the server would no-op anyway).
    if (!value || value === own.rating || pending) return;
    setMessage(null);
    setChosen(value);
    startTransition(async () => {
      const result = await changeRatingAction({ roundId, applicationId, value }).catch(failedResult);
      setChosen(null);
      settle(result);
    });
  }

  // A <form action>, so the confirm button's pending state comes from useFormStatus.
  async function withdraw() {
    setMessage(null);
    const result = await withdrawRatingAction({ applicationId }).catch(failedUnlessNavigation);
    dialogRef.current?.close();
    settle(result);
  }

  const reason = state === "new" || state === "screened" ? (roundStatus === "paused" ? d.pausedReason : null) : d.finalReason(name);

  return (
    <section className="space-y-2">
      <h3 className="text-sm font-semibold">{d.ownRatingLabel}</h3>
      {own.canChange && own.rating ? (
        <>
          <RatingBar selected={own.rating} chosen={chosen} busy={pending} onSubmit={onChange} />
          {/* Not while a change is in flight: a change landing after the withdrawal would re-cast the vote. */}
          <button
            type="button"
            className="btn-link"
            disabled={pending}
            onClick={() => dialogRef.current?.showModal()}
          >
            {d.withdraw}
          </button>
          <dialog ref={dialogRef} className="dialog" aria-labelledby={headingId}>
            <h2 id={headingId} className="font-serif text-lg font-semibold">
              {d.withdrawHeading}
            </h2>
            <p className="mt-2 text-sm">{d.withdrawBody(name)}</p>
            <form action={withdraw} className="mt-4 flex flex-wrap items-center gap-3">
              <SubmitButton className="btn btn-primary">{d.withdrawConfirm}</SubmitButton>
              <button type="button" className="btn btn-secondary" onClick={() => dialogRef.current?.close()}>
                {d.withdrawCancel}
              </button>
            </form>
          </dialog>
        </>
      ) : own.rating ? (
        <>
          <p className="text-sm">{s.screening.ratings[own.rating]}</p>
          {reason && <p className="text-sm text-muted-foreground">{reason}</p>}
        </>
      ) : (
        <p className="text-sm text-muted-foreground">{d.notRated}</p>
      )}
      {message && (
        <p role="status" className="text-sm">
          {d.outcome[message]}
        </p>
      )}
    </section>
  );
}
