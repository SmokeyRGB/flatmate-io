"use server";

import { revalidatePath } from "next/cache";
import { redirect, RedirectType } from "next/navigation";
import { isUuid } from "@/db/session-context";
import type { RoundStatus } from "@/modules/casting/repository";
import { ProfileRequiredError } from "@/modules/casting/repository";
import { VoteError, castVote, withdrawVote, type VoteErrorCode } from "@/modules/deliberation/repository";
import { getCurrentSession } from "@/modules/identity/session-cookie";

// Codes only, never applicant data. `no_session` and `failed` are the action's own.
export type RatingResult =
  | { ok: true }
  | { ok: false; code: VoteErrorCode | "no_session" | "failed"; roundStatus?: RoundStatus };

// The detail card's two writes (candidate-revise D2), beside `castVoteAction`, which stays untouched:
// the pass revalidates nothing (FR-4.4), the card must. Both are plain-object calls from a client
// transition. The ids are checked as UUIDs before the session is read; castVote checks the value.

// Revalidates the three paths a rating moves. An open sheet re-renders in place on these, as it does
// after an invite.
function revalidateCard(applicationId: string) {
  revalidatePath("/casting");
  revalidatePath(`/casting/candidate/${applicationId}`);
  revalidatePath("/dashboard");
}

function refusalOf(err: unknown): RatingResult {
  if (err instanceof VoteError) return { ok: false, code: err.code, roundStatus: err.roundStatus };
  if (err instanceof ProfileRequiredError) return { ok: false, code: "not_eligible" };
  // Anything else (VoteWriteError, a dropped connection): the state is unknown. The class name only,
  // since a driver error can echo ids (G-D7).
  console.error("candidate rating action failed:", err instanceof Error ? err.name : typeof err);
  return { ok: false, code: "failed" };
}

// A repository refusal (a VoteError) is worth a re-render: the card shows the current state. An unknown
// failure, a missing session or a missing profile is not: nothing is known to have changed.
const rerendersOn = (err: unknown) => err instanceof VoteError && err.code !== "invalid_input";

export async function changeRatingAction(input: {
  roundId: string;
  applicationId: string;
  value: string;
}): Promise<RatingResult> {
  const roundId = input?.roundId;
  const applicationId = input?.applicationId;
  if (typeof roundId !== "string" || !isUuid(roundId) || typeof applicationId !== "string" || !isUuid(applicationId)) {
    return { ok: false, code: "not_found" };
  }
  const current = await getCurrentSession();
  if (!current) return { ok: false, code: "no_session" };
  try {
    await castVote(current.context, { roundId, applicationId, value: String(input.value) });
  } catch (err) {
    if (rerendersOn(err)) revalidateCard(applicationId);
    return refusalOf(err);
  }
  revalidateCard(applicationId);
  return { ok: true };
}

// Withdrawing means "decide again" (human decision 2026-10-13): on success the viewer goes straight to
// the pass, where this candidate now waits. The card path is NOT revalidated then: that would re-render
// a card the viewer is leaving, and its "vote first" redirect would push a second history entry. The
// redirect replaces instead, so back from the pass returns to the board. An already withdrawn vote
// (`not_found`, a second tab) is the same success: the intent is met.
export async function withdrawRatingAction(input: { applicationId: string }): Promise<RatingResult> {
  const applicationId = input?.applicationId;
  if (typeof applicationId !== "string" || !isUuid(applicationId)) return { ok: false, code: "not_found" };
  const current = await getCurrentSession();
  if (!current) return { ok: false, code: "no_session" };
  try {
    await withdrawVote(current.context, { applicationId });
  } catch (err) {
    if (!(err instanceof VoteError && err.code === "not_found")) {
      if (rerendersOn(err)) revalidateCard(applicationId);
      return refusalOf(err);
    }
  }
  revalidatePath("/casting");
  revalidatePath("/dashboard");
  // Outside the try/catch: redirect throws.
  redirect("/casting/screening", RedirectType.replace);
}
