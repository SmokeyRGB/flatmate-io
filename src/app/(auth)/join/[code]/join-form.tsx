"use client";

import { useActionState } from "react";
import { de } from "@/ui/strings";
import { joinHouseholdAction, type JoinFormState } from "./actions";

const initialState: JoinFormState = { error: null, fieldError: null };
const t = de.join;

// FR-2.10/FR-2.10a/FR-2.11: exactly two required fields (name, password) plus a visibly optional
// email — no third required field, no password confirmation. `code` travels as a HIDDEN FORM
// FIELD (G-A5, design.md Decision 10), never a query parameter. No passkey enrolment and no
// install prompt appear anywhere on this form (FR-2.13/FR-2.14).
//
// design.md Decision 13: `boundDisplayName` set means this link is BOUND to a prepared profile —
// the name field is not rendered at all (the name is not the visitor's to choose; FR-2.10 asks
// for two fields, a bound link asks for one). `null`/unset renders the ordinary two-field form.
export function JoinForm({
  code,
  passwordMinLength,
  boundDisplayName,
}: {
  code: string;
  passwordMinLength: number;
  boundDisplayName?: string | null;
}) {
  const [state, formAction, pending] = useActionState(joinHouseholdAction, initialState);

  return (
    <form action={formAction} className="card space-y-4" noValidate>
      <input type="hidden" name="code" value={code} />

      {!boundDisplayName && (
        <div>
          <label htmlFor="displayName" className="field-label">
            {t.nameLabel}
          </label>
          <input id="displayName" name="displayName" type="text" className="field-input" />
          {state.fieldError === "displayName" && <p className="field-error">{state.error}</p>}
        </div>
      )}

      <div>
        <label htmlFor="password" className="field-label">
          {t.passwordLabel}
        </label>
        <input id="password" name="password" type="password" className="field-input" />
        {/* FR-2.10a/AC-2.20: the requirement is readable before submitting, not discovered by a
            rejection. */}
        <p className="field-helper">{t.passwordRequirement(passwordMinLength)}</p>
        {state.fieldError === "password" && <p className="field-error">{state.error}</p>}
      </div>

      <div>
        <label htmlFor="email" className="field-label">
          {t.emailLabel}
        </label>
        <input id="email" name="email" type="email" className="field-input" />
        <p className="field-helper">{t.emailHelper}</p>
      </div>

      <div className="flex items-center gap-2">
        <input id="rememberMe" name="rememberMe" type="checkbox" defaultChecked />
        <label htmlFor="rememberMe" className="field-label">
          {t.rememberMeLabel}
        </label>
      </div>

      {state.error && !state.fieldError && <p className="field-error">{state.error}</p>}

      <button type="submit" disabled={pending} className="btn btn-primary w-full">
        {pending ? t.submitPending : t.submit}
      </button>
    </form>
  );
}
