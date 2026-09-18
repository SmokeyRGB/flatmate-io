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

  if (!email) return { error: "Email is required.", fieldError: "email" };
  if (!password) return { error: "Password is required.", fieldError: "password" };

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
        return { error: sessionErr.message, fieldError: null };
      }
      return { error: "Something went wrong completing sign-in. Please try again.", fieldError: null };
    }
  } catch (err) {
    if (err instanceof RegistrationError) {
      return { error: err.message, fieldError: null };
    }
    throw err;
  }

  redirect("/dashboard");
}
