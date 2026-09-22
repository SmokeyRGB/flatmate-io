"use server";

import { revalidatePath } from "next/cache";
import {
  DisplayNameConfirmationMismatchError,
  createResidentProfile,
  deleteJoinCode,
  extendJoinCode,
  issueJoinCode,
  reactivateMember,
  removeMember,
  setMemberRole,
  setMovedOut,
} from "@/modules/identity/repository";
import { getCurrentSession } from "@/modules/identity/session-cookie";
import { de } from "@/ui/strings";

export interface RemoveMemberFormState {
  error: string | null;
}

// FR-1.3/FR-1.5: the household account creates a resident profile (including one for the person
// operating it). The person then claims it by opening an invitation issued **for that profile**
// (join-by-link design.md Decision 13) — `/claim` is deleted, and a link is now the only route to
// a prepared profile. A duplicate display name (FR-1.4) surfaces via Next's error boundary, same as
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
      // One throw site, one message (tasks.md 2.3) — mapped by class to a fixed key.
      return { error: de.members.errors.nameMismatch };
    }
    // FR-008 / spec.md's Edge Cases (003-remove-resident-modal): unlike this action's siblings,
    // the remove dialog explicitly promises an inline error for ANY failure — including the
    // named edge case of the target's membership having already changed (e.g. someone else
    // already acted on it) — never Next's default crash screen. Deliberately generic (not
    // err.message): the underlying errors are internal repository messages (e.g. "Membership
    // not found for account <uuid>"), not written for a moderator to read.
    return { error: de.members.errors.genericRemoveFailure };
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

// design.md Decision 6: the create form parameterises the NEXT link, not an existing one — two
// fields, one action. No permission check here (task 3.2) — assertIsAdministrationOrModerator
// lives in the repository (2.3), the one place FR-1.27's "not reachable at all" boundary is
// enforced.
export async function issueJoinCodeAction(formData: FormData): Promise<void> {
  const current = await getCurrentSession();
  if (!current) throw new Error("Not signed in");
  const rawValidDays = Number(formData.get("validDays"));
  const rawMaxUses = Number(formData.get("maxUses"));
  // O-15's defaults (7 days, max 1) stand in for anything the form didn't send a sane number for
  // — a blank/garbled field must not silently mint an instantly-dead or unbounded-looking link.
  const validDays = Number.isFinite(rawValidDays) && rawValidDays >= 1 ? Math.trunc(rawValidDays) : 7;
  // 0 is a deliberate, valid value (EC-2.8: "geschlossen") — only reject NaN/negative, never treat
  // an absent value as unlimited (spec.md "There SHALL be no such thing as an unlimited link").
  const maxUses = Number.isFinite(rawMaxUses) && rawMaxUses >= 0 ? Math.trunc(rawMaxUses) : 1;

  await issueJoinCode(current.context, current.context.accountId, { validDays, maxUses });
  revalidatePath("/members");
}

// join-by-link design.md Decision 13 / task 12.8: the one place a bound link is issued — without
// this action the feature is unreachable outside tests. No permission check here (same as
// issueJoinCodeAction above): assertIsAdministrationOrModerator lives in issueJoinCode itself
// (issueJoinCodeTx also verifies the named profile belongs to THIS household and is `prepared`
// before it ever writes a row). Always 7 days / effectively single-use — issueJoinCodeTx forces
// maxUses to 1 for a bound link regardless of what is passed, so there is no maxUses field on this
// form to begin with.
export async function issueJoinCodeForProfileAction(formData: FormData): Promise<void> {
  const current = await getCurrentSession();
  if (!current) throw new Error("Not signed in");
  const residentProfileId = String(formData.get("residentProfileId") ?? "");
  if (!residentProfileId) return;

  await issueJoinCode(current.context, current.context.accountId, {
    validDays: 7,
    maxUses: 1,
    residentProfileId,
  });
  revalidatePath("/members");
}

export async function extendJoinCodeAction(formData: FormData): Promise<void> {
  const current = await getCurrentSession();
  if (!current) throw new Error("Not signed in");
  const issuanceId = String(formData.get("issuanceId") ?? "");
  if (!issuanceId) return;
  await extendJoinCode(current.context, current.context.accountId, issuanceId);
  revalidatePath("/members");
}

export async function deleteJoinCodeAction(formData: FormData): Promise<void> {
  const current = await getCurrentSession();
  if (!current) throw new Error("Not signed in");
  const issuanceId = String(formData.get("issuanceId") ?? "");
  if (!issuanceId) return;
  await deleteJoinCode(current.context, current.context.accountId, issuanceId);
  revalidatePath("/members");
}
