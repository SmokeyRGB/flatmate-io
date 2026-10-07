"use client";

import { useActionState } from "react";
import { useStrings } from "@/ui/strings/provider";
import { changePasswordAction, type PasswordFormState } from "./actions";
import { PasswordInput } from "@/ui/password-input";
import { SuccessToast } from "@/ui/success-toast";
import { SubmitButton } from "@/ui/submit-button";

const initialState: PasswordFormState = { error: null, saved: false };
// design.md Decision 8: no typed value survives into action state — neither password ever has a
// `defaultValue` and both fields are empty after every submit, success or refusal alike.
export function PasswordForm({ passwordMinLength }: { passwordMinLength: number }) {
  const s = useStrings();
  const t = s.account.password;
  const [state, formAction] = useActionState(changePasswordAction, initialState);

  return (
    // noValidate: the server action is the one validator, so every refusal is our German text
    // (s.ts), never the browser's own tooltip in the browser's language (walkthrough 2026-09-24).
    <form action={formAction} className="space-y-2" noValidate>
      <div>
        <label htmlFor="currentPassword" className="field-label">
          {t.currentLabel}
        </label>
        <PasswordInput id="currentPassword" name="currentPassword" autoComplete="current-password" />
      </div>
      <div>
        <label htmlFor="newPassword" className="field-label">
          {t.newLabel}
        </label>
        <PasswordInput id="newPassword" name="newPassword" autoComplete="new-password" />
        {/* FR-2.10a: the rule is visible beside the field before submitting, not discovered by a
            rejection. */}
        <p className="field-helper">{t.requirement(passwordMinLength)}</p>
      </div>
      {state.error && (
        <p className="field-error" role="alert">
          {state.error}
        </p>
      )}
      {state.saved && !state.error && <p className="text-sm text-muted-foreground">{t.saved}</p>}
      <SuccessToast message={t.saved} trigger={state.saved && !state.error ? state : null} />
      <SubmitButton className="btn btn-primary w-full" pendingLabel={t.submitPending}>
        {t.submit}
      </SubmitButton>
    </form>
  );
}
