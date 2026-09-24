"use server";

import { redirect } from "next/navigation";
import { SignInError, signIn } from "@/modules/identity/auth";
import { sessionCookieMaxAge, setSessionCookie } from "@/modules/identity/session-cookie";
import { de } from "@/ui/strings";
import { landingPathFor } from "@/app/landing";

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
  let landingPath: "/dashboard" | "/settings";

  try {
    const result =
      mode === "household" || mode === "resident_email"
        ? await signIn({
            kind: mode,
            email: String(formData.get("email") ?? ""),
            password: String(formData.get("password") ?? ""),
          })
        : await signIn({
            kind: "resident",
            householdId: String(formData.get("householdId") ?? ""),
            displayName: String(formData.get("displayName") ?? ""),
            password: String(formData.get("password") ?? ""),
          });

    await setSessionCookie(
      result.session.id,
      result.context.householdId,
      sessionCookieMaxAge(result.session.expiresAt),
    );
    landingPath = landingPathFor(result.context);
  } catch (err) {
    if (err instanceof SignInError) {
      // Exhaustive switch (design.md Decision 4): a missed code is a compile error.
      const code = err.code;
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
    throw err;
  }

  redirect(landingPath);
}
