"use server";

import type { RoundStatus } from "@/modules/casting/repository";
import { ProfileRequiredError } from "@/modules/casting/repository";
import { VoteError, castVote, type VoteErrorCode } from "@/modules/deliberation/repository";
import { getCurrentSession } from "@/modules/identity/session-cookie";

// Codes only, never applicant data (design D5). `no_session` and `failed` are the action's own.
export type CastVoteResult =
  | { ok: true }
  | { ok: false; code: VoteErrorCode | "no_session" | "failed"; roundStatus?: RoundStatus };

// The screening pass's one write. The session is resolved here, never taken from the client, and
// castVote derives the voter from it. Deliberately NO cache revalidation here, and the client asks
// for no refresh either: a re-render with a fresh deck would break FR-4.4 (the deck is fixed when
// the pass starts).
export async function castVoteAction(input: {
  roundId: string;
  applicationId: string;
  value: string;
}): Promise<CastVoteResult> {
  const current = await getCurrentSession();
  if (!current) return { ok: false, code: "no_session" };
  try {
    await castVote(current.context, {
      roundId: String(input?.roundId),
      applicationId: String(input?.applicationId),
      value: String(input?.value),
    });
    return { ok: true };
  } catch (err) {
    if (err instanceof VoteError) return { ok: false, code: err.code, roundStatus: err.roundStatus };
    if (err instanceof ProfileRequiredError) return { ok: false, code: "not_eligible" };
    // Anything else (VoteWriteError, a dropped connection): a calm failure, no detail leaves.
    return { ok: false, code: "failed" };
  }
}
