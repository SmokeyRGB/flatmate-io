"use server";

import { redirect } from "next/navigation";
import { RegistrationError, SignInError, registerHousehold, signIn } from "@/modules/identity/auth";
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
    await registerHousehold(email, password);
    const result = await signIn({ kind: "household", email, password });
    await setSessionCookie(result.session.id, result.context.householdId);
  } catch (err) {
    if (err instanceof RegistrationError || err instanceof SignInError) {
      return { error: err.message, fieldError: null };
    }
    throw err;
  }

  redirect("/dashboard");
}
