"use server";

import { revalidatePath } from "next/cache";
import { updateHouseholdSettingsWithProcedureLock } from "@/modules/casting/repository";
import { getCurrentSession } from "@/modules/identity/session-cookie";

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
    if (err instanceof Error) return { error: err.message };
    throw err;
  }

  revalidatePath("/settings");
  return { error: null };
}
