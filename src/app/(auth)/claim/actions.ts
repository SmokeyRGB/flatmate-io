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
import { de } from "@/ui/strings";

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
    return { error: de.auth.errors.claim.householdRequired };
  }

  // householdId reaches findPreparedResidentProfile -> withSessionContext's assertUuid below,
  // whose plain (non-ClaimError) Error would otherwise escape this action's catch block uncaught
  // for a non-empty, non-UUID value — fail closed here instead (isUuid is exported from
  // session-context.ts for exactly this: untrusted input reaching a session-context boundary).
  if (!isUuid(householdId)) {
    return { error: de.auth.errors.claim.invalidHousehold };
  }

  try {
    const profile = await findPreparedResidentProfile(householdId, displayName);
    if (!profile) {
      return { error: de.auth.errors.claim.noProfileWaiting };
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
        // Exhaustive switch (design.md Decision 4): a missed code is a compile error.
        const code = sessionErr.code;
        switch (code) {
          case "missing_fields":
            return { error: de.auth.errors.signIn.missingFields };
          case "invalid_household":
            return { error: de.auth.errors.signIn.invalidHousehold };
          case "invalid_credentials":
            return { error: de.auth.errors.signIn.invalidCredentials };
          case "no_household":
            return { error: de.auth.errors.signIn.noHousehold };
          case "no_membership":
            return { error: de.auth.errors.signIn.noMembership };
          default: {
            const _exhaustive: never = code;
            return _exhaustive;
          }
        }
      }
      // Decision 6: an unanticipated failure never shows its own message — only a generic key.
      console.error(sessionErr);
      return { error: de.auth.errors.genericSignInFailure };
    }
  } catch (err) {
    if (err instanceof ClaimError) {
      switch (err.code) {
        case "not_found":
          console.error(err);
          return { error: de.auth.errors.claim.notFound };
        case "not_prepared":
          return { error: de.auth.errors.claim.alreadyClaimed };
        case "signup_failed":
          console.error(err);
          return { error: de.auth.errors.claim.signupFailed };
        default: {
          const _exhaustive: never = err.code;
          return _exhaustive;
        }
      }
    }
    throw err;
  }

  redirect("/dashboard");
}
