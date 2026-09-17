"use server";

import { revalidatePath } from "next/cache";
import {
  DisplayNameConfirmationMismatchError,
  reactivateMember,
  removeMember,
  rotateJoinCode,
  setMovedOut,
} from "@/modules/identity/repository";
import { getCurrentSession } from "@/modules/identity/session-cookie";

export interface RemoveMemberFormState {
  error: string | null;
}

// FR-1.26/U-27 hard tier: requires the exact display name typed as confirmation, not a plain click.
export async function removeMemberAction(
  _prevState: RemoveMemberFormState,
  formData: FormData,
): Promise<RemoveMemberFormState> {
  const current = await getCurrentSession();
  if (!current) throw new Error("Not signed in");
  const targetAccountId = String(formData.get("accountId") ?? "");
  const confirmDisplayName = String(formData.get("confirmDisplayName") ?? "");
  if (!targetAccountId) return { error: null };

  try {
    await removeMember(current.context, current.context.accountId, targetAccountId, confirmDisplayName);
  } catch (err) {
    if (err instanceof DisplayNameConfirmationMismatchError) {
      return { error: err.message };
    }
    throw err;
  }

  revalidatePath("/members");
  return { error: null };
}

// FR-1.26 soft tier: the regular path for an actual move-out.
export async function setMovedOutAction(formData: FormData): Promise<void> {
  const current = await getCurrentSession();
  if (!current) throw new Error("Not signed in");
  const targetAccountId = String(formData.get("accountId") ?? "");
  if (!targetAccountId) return;
  await setMovedOut(current.context, current.context.accountId, targetAccountId);
  revalidatePath("/members");
}

export async function reactivateMemberAction(formData: FormData): Promise<void> {
  const current = await getCurrentSession();
  if (!current) throw new Error("Not signed in");
  const targetAccountId = String(formData.get("accountId") ?? "");
  if (!targetAccountId) return;
  await reactivateMember(current.context, current.context.accountId, targetAccountId);
  revalidatePath("/members");
}

export async function rotateJoinCodeAction(): Promise<void> {
  const current = await getCurrentSession();
  if (!current) throw new Error("Not signed in");
  await rotateJoinCode(current.context, current.context.accountId);
  revalidatePath("/members");
}
