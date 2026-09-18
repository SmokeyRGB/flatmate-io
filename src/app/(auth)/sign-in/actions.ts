"use server";

import { redirect } from "next/navigation";
import { SignInError, signIn } from "@/modules/identity/auth";
import { setSessionCookie } from "@/modules/identity/session-cookie";

export interface SignInFormState {
  error: string | null;
}

// FR-1.6/ADR-013: two entry modes, resolved server-side; on success, exactly one Session row is
// created with acting_profile_id fixed for its lifetime (auth.ts's signIn).
export async function signInAction(
  _prevState: SignInFormState,
  formData: FormData,
): Promise<SignInFormState> {
  const mode = String(formData.get("mode") ?? "household");

  try {
    const result =
      mode === "household"
        ? await signIn({
            kind: "household",
            email: String(formData.get("email") ?? ""),
            password: String(formData.get("password") ?? ""),
          })
        : await signIn({
            kind: "resident",
            householdId: String(formData.get("householdId") ?? ""),
            displayName: String(formData.get("displayName") ?? ""),
            password: String(formData.get("password") ?? ""),
          });

    await setSessionCookie(result.session.id, result.context.householdId);
  } catch (err) {
    if (err instanceof SignInError) {
      return { error: err.message };
    }
    throw err;
  }

  redirect("/dashboard");
}
