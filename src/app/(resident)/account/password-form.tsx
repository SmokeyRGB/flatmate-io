"use client";

import { useActionState } from "react";
import { de } from "@/ui/strings";
import { changePasswordAction, type PasswordFormState } from "./actions";

const initialState: PasswordFormState = { error: null, saved: false };
const t = de.account.password;

// design.md Decision 8: no typed value survives into action state — neither password ever has a
// `defaultValue` and both fields are empty after every submit, success or refusal alike.
export function PasswordForm({ passwordMinLength }: { passwordMinLength: number }) {
  const [state, formAction, pending] = useActionState(changePasswordAction, initialState);

  return (
    <form action={formAction} className="space-y-2">
      <div>
        <label htmlFor="currentPassword" className="field-label">
          {t.currentLabel}
        </label>
        <input id="currentPassword" name="currentPassword" type="password" className="field-input" />
      </div>
      <div>
        <label htmlFor="newPassword" className="field-label">
          {t.newLabel}
        </label>
        <input id="newPassword" name="newPassword" type="password" className="field-input" />
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
      <button type="submit" disabled={pending} className="btn btn-primary w-full">
        {pending ? t.submitPending : t.submit}
      </button>
    </form>
  );
}
