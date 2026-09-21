"use server";

import { revalidatePath } from "next/cache";
import { updateHouseholdSettingsWithProcedureLock } from "@/modules/casting/repository";
import { getCurrentSession } from "@/modules/identity/session-cookie";
import { de } from "@/ui/strings";

export interface SettingsFormState {
  error: string | null;
}

// FR-1.21/AC-1.13/AC-1.15: refused while any round is open, naming the open round.
export async function updateSettingsAction(
  _prevState: SettingsFormState,
  formData: FormData,
): Promise<SettingsFormState> {
  const current = await getCurrentSession();
  if (!current) throw new Error("Not signed in");

  const quorumShare = String(formData.get("quorumShare") ?? "");
  const actor = { accountId: current.context.accountId, profileId: current.context.profileId };

  try {
    await updateHouseholdSettingsWithProcedureLock(current.context, { quorumShare }, actor);
  } catch (err) {
    // german-ui-vocabulary: this used to pass `err.message` straight through. That leaks
    // ProcedureLockedError's raw text (a round id and field names) and PermissionDeniedError's
    // raw permission slug to the resident — both are neither coded (tasks.md 2.3/2.4) nor
    // English-literal-free. Mapped to one generic key instead; the real message still reaches the
    // log (design.md Decision 6's reasoning, applied here too — see the implementation report for
    // why this class needed it despite not being named in tasks.md).
    if (err instanceof Error) {
      console.error(err);
      return { error: de.settings.errors.genericSaveFailure };
    }
    throw err;
  }

  revalidatePath("/settings");
  return { error: null };
}
