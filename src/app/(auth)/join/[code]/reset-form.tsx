"use client";

import { useActionState, useState } from "react";
import { de } from "@/ui/strings";
import { redeemPasswordResetAction, type ResetFormState } from "./actions";
import { PasswordInput } from "@/ui/password-input";

const initialState: ResetFormState = { error: null, fieldError: null };
const t = de.join;

// identity/password-reset (O-16, screens/A-zugang.md A3 bound shape): one password field, the
// stay-signed-in choice, no name and no email (spec: "SHALL NOT ask for a name or an email").
// design.md Decision 4: `draft` restores "stay signed in" across a refused submission the same way
// JoinForm's own draft does — the password itself is never captured into it.
export function ResetForm({ code, passwordMinLength }: { code: string; passwordMinLength: number }) {
  const [draft, setDraft] = useState({ rememberMe: true });
  const [state, formAction, pending] = useActionState(redeemPasswordResetAction, initialState);

  return (
    <form
      action={(formData: FormData) => {
        setDraft({ rememberMe: formData.get("rememberMe") === "on" });
        formAction(formData);
      }}
      className="card space-y-4"
      noValidate
    >
      <input type="hidden" name="code" value={code} />

      <div>
        <label htmlFor="password" className="field-label">
          {t.reset.newPasswordLabel}
        </label>
        <PasswordInput id="password" name="password" autoComplete="new-password" />
        <p className="field-helper">{t.passwordRequirement(passwordMinLength)}</p>
        {state.fieldError === "password" && (
          <p className="field-error" role="alert">
            {state.error}
          </p>
        )}
      </div>

      <div className="flex items-center gap-2">
        <input id="rememberMe" name="rememberMe" type="checkbox" defaultChecked={draft.rememberMe} />
        <label htmlFor="rememberMe" className="field-label">
          {t.rememberMeLabel}
        </label>
      </div>

      {state.error && !state.fieldError && (
        <p className="field-error" role="alert">
          {state.error}
        </p>
      )}

      <button type="submit" disabled={pending} className="btn btn-primary w-full">
        {pending ? t.reset.submitPending : t.reset.submit}
      </button>
    </form>
  );
}
