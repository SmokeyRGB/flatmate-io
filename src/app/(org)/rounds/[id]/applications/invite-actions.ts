"use server";

import { revalidatePath } from "next/cache";
import { isUuid } from "@/db/session-context";
import {
  ApplicationTransitionError,
  inviteApplication,
  ProfileRequiredError,
} from "@/modules/casting/repository";
import { PermissionDeniedError } from "@/modules/identity/repository";
import { getCurrentSession } from "@/modules/identity/session-cookie";

export type InviteErrorCode = "not_found" | "not_invitable" | "not_allowed" | "no_session" | "failed";

// Codes only: no applicant data, no text and no error object ever comes back. `next dev` logs a
// server action's previous state in full, so nothing personal may be put here.
export type InviteFormState = { status: "idle" } | { status: "ok" } | { status: "error"; code: InviteErrorCode };

// F5 candidate-invite (design D4). „Eingeladen!": reads ONLY `roundId` and `applicationId` from the
// form (the example text is outside the form and never posted, Compliance §4.5 rule 4), checks both
// as UUIDs, and lets inviteApplication decide everything (permission, state, round). The acting
// account and profile come from the session, never from the form.
export async function inviteApplicationAction(
  _prev: InviteFormState,
  formData: FormData,
): Promise<InviteFormState> {
  const roundId = formData.get("roundId");
  const applicationId = formData.get("applicationId");
  if (typeof roundId !== "string" || !isUuid(roundId) || typeof applicationId !== "string" || !isUuid(applicationId)) {
    return { status: "error", code: "not_found" };
  }
  const current = await getCurrentSession();
  if (!current) return { status: "error", code: "no_session" };

  try {
    await inviteApplication(current.context, { roundId, applicationId });
  } catch (err) {
    if (err instanceof ApplicationTransitionError) {
      if (err.code === "not_invitable") return { status: "error", code: "not_invitable" };
      if (err.code === "not_found") return { status: "error", code: "not_found" };
    }
    if (err instanceof PermissionDeniedError || err instanceof ProfileRequiredError) {
      return { status: "error", code: "not_allowed" };
    }
    // The class name only: a driver error can echo ids (G-D7).
    console.error("inviteApplicationAction failed:", err instanceof Error ? err.name : typeof err);
    return { status: "error", code: "failed" };
  }

  // Both ids are UUIDs by now, so neither can steer the path elsewhere.
  revalidatePath("/casting");
  revalidatePath(`/rounds/${roundId}`);
  revalidatePath(`/rounds/${roundId}/applications/${applicationId}`);
  // The candidate detail (F5 candidate-detail D1): a full-page card refreshes; an open sheet re-renders
  // with the current tree on the action's refresh.
  revalidatePath(`/casting/candidate/${applicationId}`);
  return { status: "ok" };
}
