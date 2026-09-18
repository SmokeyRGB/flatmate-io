"use server";

import { randomUUID } from "node:crypto";
import { redirect } from "next/navigation";
import {
  ClaimError,
  SignInError,
  claimResidentProfile,
  findPreparedResidentProfile,
  signIn,
  undoClaimResidentProfile,
} from "@/modules/identity/auth";
import { setSessionCookie } from "@/modules/identity/session-cookie";
import { isUuid, type SessionContext } from "@/db/session-context";

export interface ClaimFormState {
  error: string | null;
}

// Convergence T082: the step FR-1.5 implies but never names — a prepared ResidentProfile
// (created via the members page's "Add resident" form) must be claimed before anyone can sign in
// as it. Reuses claimResidentProfile (creates the Supabase Auth account + Membership) and then
// the already-tested `signIn` resident path, rather than duplicating session-creation logic.
export async function claimResidentProfileAction(
  _prevState: ClaimFormState,
  formData: FormData,
): Promise<ClaimFormState> {
  const householdId = String(formData.get("householdId") ?? "").trim();
  const displayName = String(formData.get("displayName") ?? "").trim();
  const password = String(formData.get("password") ?? "");

  if (!householdId || !displayName || !password) {
    return { error: "Household, name, and password are all required." };
  }

  // householdId reaches findPreparedResidentProfile -> withSessionContext's assertUuid below,
  // whose plain (non-ClaimError) Error would otherwise escape this action's catch block uncaught
  // for a non-empty, non-UUID value — fail closed here instead (isUuid is exported from
  // session-context.ts for exactly this: untrusted input reaching a session-context boundary).
  if (!isUuid(householdId)) {
    return { error: "That household link looks invalid." };
  }

  try {
    const profile = await findPreparedResidentProfile(householdId, displayName);
    if (!profile) {
      return { error: "No profile with that name is waiting to be claimed in this household." };
    }

    const context: SessionContext = { accountId: randomUUID(), householdId, profileId: null };
    const claimed = await claimResidentProfile(context, profile.id, password);

    // speckit-bug-fix claim-action-not-atomic-with-session-setup: claimResidentProfile already
    // committed (Auth user + Account + Membership + status: "active"). signIn requires that
    // committed Auth user to exist, so it cannot run first — instead, any failure past this point
    // (including a plain Error, e.g. hashSessionToken's missing-secret case, which isn't a
    // SignInError) triggers compensating cleanup so a retry finds the profile `prepared` again.
    try {
      const result = await signIn({ kind: "resident", householdId, displayName, password });
      await setSessionCookie(result.session.id, result.context.householdId);
    } catch (sessionErr) {
      await undoClaimResidentProfile(context, profile.id, claimed.accountId);
      if (sessionErr instanceof SignInError) {
        return { error: sessionErr.message };
      }
      return { error: "Something went wrong completing sign-in. Please try again." };
    }
  } catch (err) {
    if (err instanceof ClaimError) {
      return { error: err.message };
    }
    throw err;
  }

  redirect("/dashboard");
}
