"use server";

import { redirect } from "next/navigation";
import {
  RegistrationError,
  SignInError,
  registerHousehold,
  signIn,
  undoRegisterHousehold,
} from "@/modules/identity/auth";
import { setSessionCookie } from "@/modules/identity/session-cookie";
import { de } from "@/ui/strings";

export interface RegisterFormState {
  error: string | null;
  fieldError: "email" | "password" | null;
}

// AC-1.1/FR-1.1: both fields required; the missing one is named, not a generic error. Convergence
// T083: sign the new household account in immediately (reusing the already-tested `signIn`) and
// land on the dashboard — a successful registration used to return silently with no navigation.
export async function registerHouseholdAction(
  _prevState: RegisterFormState,
  formData: FormData,
): Promise<RegisterFormState> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");

  if (!email) return { error: de.auth.errors.register.missingEmail, fieldError: "email" };
  if (!password) return { error: de.auth.errors.register.missingPassword, fieldError: "password" };

  try {
    const registered = await registerHousehold(email, password);

    // speckit-bug-fix register-action-not-atomic-with-signin: registerHousehold already committed
    // (Auth user + Household + HouseholdSettings + Account + Membership). signIn requires that
    // committed Auth user to exist, so it cannot run first — instead, any failure past this point
    // (including a plain Error, e.g. hashSessionToken's missing-secret case, which isn't a
    // SignInError) triggers compensating cleanup so a retry with the same email doesn't fail as a
    // duplicate registration.
    try {
      const result = await signIn({ kind: "household", email, password });
      await setSessionCookie(result.session.id, result.context.householdId);
    } catch (sessionErr) {
      await undoRegisterHousehold(registered.context, registered.context.householdId, registered.context.accountId);
      if (sessionErr instanceof SignInError) {
        // Exhaustive switch (design.md Decision 4): a missed code is a compile error.
        const code = sessionErr.code;
        switch (code) {
          case "missing_fields":
            return { error: de.auth.errors.signIn.missingFields, fieldError: null };
          case "invalid_household":
            return { error: de.auth.errors.signIn.invalidHousehold, fieldError: null };
          case "invalid_credentials":
            return { error: de.auth.errors.signIn.invalidCredentials, fieldError: null };
          case "no_household":
            return { error: de.auth.errors.signIn.noHousehold, fieldError: null };
          case "no_membership":
            return { error: de.auth.errors.signIn.noMembership, fieldError: null };
          default: {
            const _exhaustive: never = code;
            return _exhaustive;
          }
        }
      }
      // Decision 6: an unanticipated failure (e.g. hashSessionToken's missing-secret case) never
      // shows its own message — only a generic key. The original still reaches the log.
      console.error(sessionErr);
      return { error: de.auth.errors.genericSignInFailure, fieldError: null };
    }
  } catch (err) {
    if (err instanceof RegistrationError) {
      switch (err.code) {
        case "missing_email":
          return { error: de.auth.errors.register.missingEmail, fieldError: "email" };
        case "missing_password":
          return { error: de.auth.errors.register.missingPassword, fieldError: "password" };
        case "signup_failed":
          console.error(err);
          return { error: de.auth.errors.register.signupFailed, fieldError: null };
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
