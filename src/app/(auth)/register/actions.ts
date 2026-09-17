"use server";

import { RegistrationError, registerHousehold } from "@/modules/identity/auth";

export interface RegisterFormState {
  error: string | null;
  fieldError: "email" | "password" | null;
}

// AC-1.1/FR-1.1: both fields required; the missing one is named, not a generic error.
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
  } catch (err) {
    if (err instanceof RegistrationError) {
      return { error: err.message, fieldError: null };
    }
    throw err;
  }

  return { error: null, fieldError: null };
}
