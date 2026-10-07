"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getClientIp } from "@/app/request-ip";
import { SignInError, signIn, signInResidentByHouseholdCode } from "@/modules/identity/auth";
import { sessionCookieMaxAge, setSessionCookie } from "@/modules/identity/session-cookie";
import { getStrings } from "@/ui/strings/request";
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
  const t = await getStrings();
  const mode = String(formData.get("mode") ?? "household");
  // household-sign-in-code: "angemeldet bleiben" on both tabs, ticked by default in the form
  // (identity/sign-in). An unticked checkbox posts nothing, so absence means cleared.
  const rememberMe = formData.get("rememberMe") === "on";
  let landingPath: "/dashboard" | "/organization";

  try {
    const result =
      mode === "household" || mode === "resident_email"
        ? await signIn(
            {
              kind: mode,
              email: String(formData.get("email") ?? ""),
              password: String(formData.get("password") ?? ""),
            },
            { rememberMe },
          )
        : await signInResidentByHouseholdCode(
            {
              householdCode: String(formData.get("householdCode") ?? ""),
              displayName: String(formData.get("displayName") ?? ""),
              password: String(formData.get("password") ?? ""),
            },
            { rememberMe, sourceIp: getClientIp(await headers()) },
          );

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
          return { error: t.auth.errors.signIn.missingFields };
        case "invalid_household":
          return { error: t.auth.errors.signIn.invalidHousehold };
        case "invalid_credentials":
          return { error: t.auth.errors.signIn.invalidCredentials };
        case "no_household":
          return { error: t.auth.errors.signIn.noHousehold };
        case "no_membership":
          return { error: t.auth.errors.signIn.noMembership };
        case "provider_unavailable":
          return { error: t.auth.errors.signIn.providerUnavailable };
        case "rate_limited":
          return { error: t.auth.errors.signIn.tooManyAttempts };
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
