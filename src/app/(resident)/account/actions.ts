"use server";

import { revalidatePath } from "next/cache";
import {
  AccountSettingsError,
  JOIN_PASSWORD_MIN_LENGTH,
  changeResidentEmail,
  changeResidentPassword,
} from "@/modules/identity/auth";
import { getCurrentSession } from "@/modules/identity/session-cookie";
import { getStringsFor } from "@/ui/strings/request";

// design.md Decision 8: no typed value (email) survives into this state — `next dev` prints the
// previous action state on the next submit, which is change 3's lesson 1.
export interface EmailFormState {
  error: string | null;
  saved: boolean;
}

export async function changeEmailAction(
  _prevState: EmailFormState,
  formData: FormData,
): Promise<EmailFormState> {
  const current = await getCurrentSession();
  if (!current) throw new Error("Not signed in");
  const t = (await getStringsFor(current)).account;
  const email = String(formData.get("email") ?? "");

  try {
    await changeResidentEmail(current, email);
  } catch (err) {
    if (err instanceof AccountSettingsError) {
      const code = err.code;
      switch (code) {
        case "missing_email":
          return { error: t.email.errors.missingEmail, saved: false };
        case "invalid_email":
          return { error: t.email.errors.invalidEmail, saved: false };
        case "email_taken":
          return { error: t.email.errors.emailTaken, saved: false };
        case "not_a_resident":
          return { error: t.email.errors.notAResident, saved: false };
        // Copilot review round 4 (PR #23): the session this request rode in on was ended by a
        // password reset/change (auth.ts's own new membership -> account -> session lock order) —
        // told plainly, not as genericFailure, since "sign in again" is the actual remedy.
        case "session_ended":
          return { error: t.email.errors.sessionEnded, saved: false };
        // Copilot review round 3 (PR #23): a failed COMMIT after the provider call already
        // succeeded, where the best-effort compensating transaction (auth.ts's own big comment on
        // changeResidentEmail) also failed — a distinct, honest message, not genericFailure.
        case "change_incomplete":
          return { error: t.email.errors.changeIncomplete, saved: false };
        // auth-provider-deadline design.md D6: the identity provider's answer never arrived and
        // could not be resolved — nothing was changed.
        case "provider_unavailable":
          return { error: t.email.errors.providerUnavailable, saved: false };
        // The password-only codes never reach this action (changeResidentEmail never throws
        // them) — covered here only so the switch stays exhaustive over the shared error type.
        case "missing_fields":
        case "password_too_short":
        case "wrong_current_password":
        case "password_unchanged_sessions_ended":
        case "password_uncertain_sessions_ended":
          return { error: t.email.errors.genericFailure, saved: false };
        default: {
          const _exhaustive: never = code;
          return _exhaustive;
        }
      }
    }
    throw err;
  }

  revalidatePath("/account");
  return { error: null, saved: true };
}

// design.md Decision 8: no typed value (either password) survives into this state.
export interface PasswordFormState {
  error: string | null;
  saved: boolean;
}

export async function changePasswordAction(
  _prevState: PasswordFormState,
  formData: FormData,
): Promise<PasswordFormState> {
  const current = await getCurrentSession();
  if (!current) throw new Error("Not signed in");
  const t = (await getStringsFor(current)).account;
  const currentPassword = String(formData.get("currentPassword") ?? "");
  const newPassword = String(formData.get("newPassword") ?? "");

  try {
    await changeResidentPassword(current, currentPassword, newPassword);
  } catch (err) {
    if (err instanceof AccountSettingsError) {
      const code = err.code;
      switch (code) {
        case "missing_fields":
          return { error: t.password.errors.missingFields, saved: false };
        case "password_too_short":
          return {
            error: t.password.errors.passwordTooShort(JOIN_PASSWORD_MIN_LENGTH),
            saved: false,
          };
        case "wrong_current_password":
          return { error: t.password.errors.wrongCurrentPassword, saved: false };
        case "not_a_resident":
          return { error: t.password.errors.notAResident, saved: false };
        // Copilot review round 4 (PR #23): see the matching case in changeEmailAction above — the
        // session this request rode in on was ended by a concurrent reset/change.
        case "session_ended":
          return { error: t.password.errors.sessionEnded, saved: false };
        // Copilot review round 3 (PR #23): see the matching case in changeEmailAction above — the
        // compensating transaction in changeResidentPassword's own big comment also failed.
        case "change_incomplete":
          return { error: t.password.errors.changeIncomplete, saved: false };
        // auth-provider-deadline design.md D7: an unanswered current-password check, or a check
        // refused for any reason other than the password itself, is never "wrong current password".
        case "provider_unavailable":
          return { error: t.password.errors.providerUnavailable, saved: false };
        // D7's safe direction: every OTHER session already ended as a precaution, because an
        // unanswered write may still apply later, after this lock releases.
        case "password_unchanged_sessions_ended":
          return { error: t.password.errors.unchangedSessionsEnded, saved: false };
        case "password_uncertain_sessions_ended":
          return { error: t.password.errors.uncertainSessionsEnded, saved: false };
        // The email-only codes never reach this action — covered so the switch stays exhaustive.
        case "missing_email":
        case "invalid_email":
        case "email_taken":
          return { error: t.password.errors.genericFailure, saved: false };
        default: {
          const _exhaustive: never = code;
          return _exhaustive;
        }
      }
    }
    throw err;
  }

  revalidatePath("/account");
  return { error: null, saved: true };
}
