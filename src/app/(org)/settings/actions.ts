"use server";

import { revalidatePath } from "next/cache";
import { updateHouseholdSettings } from "@/modules/casting/repository";
import { getCurrentSession } from "@/modules/identity/session-cookie";
import { getStringsFor } from "@/ui/strings/request";

export interface SettingsFormState {
  error: string | null;
  saved: boolean;
}

// FR-1.21 (relaxed 2026-10-05): allowed while a round is open; it reaches later rounds only.
export async function updateSettingsAction(
  _prevState: SettingsFormState,
  formData: FormData,
): Promise<SettingsFormState> {
  const current = await getCurrentSession();
  if (!current) throw new Error("Not signed in");
  const s = await getStringsFor(current);

  const quorumShare = String(formData.get("quorumShare") ?? "");
  // A form always submits a checkbox's state: absent means unchecked (design D7).
  const revealVoteAuthorship = formData.get("revealVoteAuthorship") === "on";
  const actor = { accountId: current.context.accountId, profileId: current.context.profileId };

  try {
    await updateHouseholdSettings(current.context, { quorumShare, revealVoteAuthorship }, actor);
  } catch (err) {
    // german-ui-vocabulary: this used to pass `err.message` straight through, which leaks
    // PermissionDeniedError's raw permission slug to the resident. Mapped to one generic key
    // instead; the real message still reaches the log.
    if (err instanceof Error) {
      console.error(err);
      return { error: s.settings.errors.genericSaveFailure, saved: false };
    }
    throw err;
  }

  revalidatePath("/settings");
  return { error: null, saved: true };
}
