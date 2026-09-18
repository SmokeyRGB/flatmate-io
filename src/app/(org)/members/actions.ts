"use server";

import { revalidatePath } from "next/cache";
import {
  DisplayNameConfirmationMismatchError,
  createResidentProfile,
  reactivateMember,
  removeMember,
  rotateJoinCode,
  setMemberRole,
  setMovedOut,
} from "@/modules/identity/repository";
import { getCurrentSession } from "@/modules/identity/session-cookie";

export interface RemoveMemberFormState {
  error: string | null;
}

// FR-1.3/FR-1.5: the household account creates a resident profile (including one for the person
// operating it) — a person then claims it via `/claim` (Convergence T082) to actually sign in as
// that resident. A duplicate display name (FR-1.4) surfaces via Next's error boundary, same as
// every other unhandled repository error this form's siblings (setMovedOutAction etc.) leave
// uncaught — not worth a client-component reducer just for this one message.
export async function createResidentProfileAction(formData: FormData): Promise<void> {
  const current = await getCurrentSession();
  if (!current) throw new Error("Not signed in");
  const displayName = String(formData.get("displayName") ?? "").trim();
  if (!displayName) return;

  await createResidentProfile(current.context, displayName, {
    accountId: current.context.accountId,
    profileId: current.context.profileId,
  });

  revalidatePath("/members");
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

// EC-1.7 (Convergence): the "appoint it moderator" action — administration-only, toggles
// member <-> moderator.
export async function setMemberRoleAction(formData: FormData): Promise<void> {
  const current = await getCurrentSession();
  if (!current) throw new Error("Not signed in");
  const targetAccountId = String(formData.get("accountId") ?? "");
  const toRole = String(formData.get("toRole") ?? "");
  if (!targetAccountId || (toRole !== "member" && toRole !== "moderator")) return;
  await setMemberRole(current.context, current.context.accountId, targetAccountId, toRole);
  revalidatePath("/members");
}

export async function rotateJoinCodeAction(): Promise<void> {
  const current = await getCurrentSession();
  if (!current) throw new Error("Not signed in");
  await rotateJoinCode(current.context, current.context.accountId);
  revalidatePath("/members");
}
