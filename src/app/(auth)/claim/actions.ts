"use server";

import { randomUUID } from "node:crypto";
import { redirect } from "next/navigation";
import {
  ClaimError,
  SignInError,
  claimResidentProfile,
  findPreparedResidentProfile,
  signIn,
} from "@/modules/identity/auth";
import { setSessionCookie } from "@/modules/identity/session-cookie";
import type { SessionContext } from "@/db/session-context";

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

  try {
    const profile = await findPreparedResidentProfile(householdId, displayName);
    if (!profile) {
      return { error: "No profile with that name is waiting to be claimed in this household." };
    }

    const context: SessionContext = { accountId: randomUUID(), householdId, profileId: null };
    await claimResidentProfile(context, profile.id, password);

    const result = await signIn({ kind: "resident", householdId, displayName, password });
    await setSessionCookie(result.session.id, result.context.householdId);
  } catch (err) {
    if (err instanceof ClaimError || err instanceof SignInError) {
      return { error: err.message };
    }
    throw err;
  }

  redirect("/dashboard");
}
