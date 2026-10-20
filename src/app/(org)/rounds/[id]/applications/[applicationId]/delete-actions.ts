"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { isUuid } from "@/db/session-context";
import { ApplicationDeletionError, deleteApplication, ProfileRequiredError } from "@/modules/casting/repository";
import { PermissionDeniedError } from "@/modules/identity/repository";
import { getCurrentSession } from "@/modules/identity/session-cookie";

export type DeleteErrorCode = "not_found" | "denied" | "failed";

// Codes only: no applicant data, no text and no error object ever comes back. `next dev` logs a
// server action's previous state in full, so nothing personal may be put here.
export type DeleteFormState = { status: "idle" } | { status: "error"; code: DeleteErrorCode };

// F3 application-deletion (design D6). Reads ONLY `roundId` and `applicationId` from the form,
// checks both as UUIDs, and lets deleteApplication decide everything (permission, row, round). The
// acting account and profile come from the session, never from the form.
export async function deleteApplicationAction(
  _prev: DeleteFormState,
  formData: FormData,
): Promise<DeleteFormState> {
  const current = await getCurrentSession();
  if (!current) redirect("/sign-in");
  const roundId = formData.get("roundId");
  const applicationId = formData.get("applicationId");
  if (typeof roundId !== "string" || !isUuid(roundId) || typeof applicationId !== "string" || !isUuid(applicationId)) {
    return { status: "error", code: "not_found" };
  }

  try {
    await deleteApplication(current.context, { roundId, applicationId });
  } catch (err) {
    if (err instanceof ApplicationDeletionError) return { status: "error", code: "not_found" };
    if (err instanceof PermissionDeniedError || err instanceof ProfileRequiredError) {
      return { status: "error", code: "denied" };
    }
    // The class name only: a driver error can echo ids (G-D7).
    console.error("deleteApplicationAction failed:", err instanceof Error ? err.name : typeof err);
    return { status: "error", code: "failed" };
  }

  // Both ids are UUIDs by now, so neither can steer the path elsewhere. redirect() works by
  // throwing, so it stays OUTSIDE the try/catch above. The deck and the candidate view of the
  // application are gone with it.
  revalidatePath("/casting");
  revalidatePath(`/rounds/${roundId}`);
  redirect(`/rounds/${roundId}?deleted=1`);
}
