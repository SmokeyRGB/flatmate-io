"use client";

import { useActionState, useState } from "react";
import { de } from "@/ui/strings";
import { joinHouseholdAction, type JoinFormState } from "./actions";
import { HandEntryWayBack, SignOutAndReturnForm } from "./join-ways-forward";
import { PasswordInput } from "@/ui/password-input";
import { SubmitButton } from "@/ui/submit-button";

const initialState: JoinFormState = { error: null, fieldError: null, refusal: null };
const t = de.join;

// FR-2.10/FR-2.10a/FR-2.11: exactly two required fields (name, password) plus a visibly optional
// email — no third required field, no password confirmation. `code` travels as a HIDDEN FORM
// FIELD (G-A5, design.md Decision 10), never a query parameter. No passkey enrolment and no
// install prompt appear anywhere on this form (FR-2.13/FR-2.14).
//
// design.md Decision 13: `boundDisplayName` set means this link is BOUND to a prepared profile —
// the name field is not rendered at all (the name is not the visitor's to choose; FR-2.10 asks
// for two fields, a bound link asks for one). `null`/unset renders the ordinary two-field form.
//
// design.md Decision 4: `draft` holds what the browser itself remembers of a refused submission —
// name, email, "stay signed in" — filled by the form's `action` wrapper BEFORE the useActionState
// dispatch, in the SAME transition. React 19 resets a form's uncontrolled fields after every action
// that does not throw; rendering each input's `defaultValue`/`defaultChecked` from `draft` means
// that reset restores what was just chosen instead of clearing it (AC-2.17, EC-2.10). The password
// is deliberately never captured into `draft` and carries no `defaultValue` — it is empty after
// every refusal (proposal.md Assumption 5). None of this ever reaches the server: `JoinFormState`
// itself carries no typed value (design.md constraint 5).
export function JoinForm({
  code,
  passwordMinLength,
  boundDisplayName,
}: {
  code: string;
  passwordMinLength: number;
  boundDisplayName?: string | null;
}) {
  const [draft, setDraft] = useState({ displayName: "", email: "", rememberMe: true });
  const [state, formAction] = useActionState(joinHouseholdAction, initialState);

  return (
    <div className="space-y-4">
      <form
        action={(formData: FormData) => {
          setDraft({
            displayName: String(formData.get("displayName") ?? ""),
            email: String(formData.get("email") ?? ""),
            rememberMe: formData.get("rememberMe") === "on",
          });
          formAction(formData);
        }}
        className="card space-y-4"
        noValidate
      >
        <input type="hidden" name="code" value={code} />

        {!boundDisplayName && (
          <div>
            <label htmlFor="displayName" className="field-label">
              {t.nameLabel}
            </label>
            <input
              id="displayName"
              name="displayName"
              type="text"
              defaultValue={draft.displayName}
              className="field-input"
            />
            {state.fieldError === "displayName" && (
              <p className="field-error" role="alert">
                {state.error}
              </p>
            )}
          </div>
        )}

        <div>
          <label htmlFor="password" className="field-label">
            {t.passwordLabel}
          </label>
          <PasswordInput id="password" name="password" autoComplete="new-password" />
          {/* FR-2.10a/AC-2.20: the requirement is readable before submitting, not discovered by a
              rejection. */}
          <p className="field-helper">{t.passwordRequirement(passwordMinLength)}</p>
          {state.fieldError === "password" && (
            <p className="field-error" role="alert">
              {state.error}
            </p>
          )}
        </div>

        <div>
          <label htmlFor="email" className="field-label">
            {t.emailLabel}
          </label>
          <input
            id="email"
            name="email"
            type="email"
            defaultValue={draft.email}
            className="field-input"
          />
          <p className="field-helper">{t.emailHelper}</p>
          {/* review fix: invalid_email/email_taken now target the email field itself, same as
              displayName/password above, instead of falling through to the form's generic error. */}
          {state.fieldError === "email" && (
            <p className="field-error" role="alert">
              {state.error}
            </p>
          )}
        </div>

        <div className="flex items-center gap-2">
          <input
            id="rememberMe"
            name="rememberMe"
            type="checkbox"
            defaultChecked={draft.rememberMe}
          />
          <label htmlFor="rememberMe" className="field-label">
            {t.rememberMeLabel}
          </label>
        </div>

        {state.error && !state.fieldError && (
          <p className="field-error" role="alert">
            {state.error}
          </p>
        )}

        <SubmitButton className="btn btn-primary w-full" pendingLabel={t.submitPending}>
          {t.submit}
        </SubmitButton>
      </form>

      {/* design.md Decision 10: a refusal reached at submit time carries the same way forward as
          the page's own state rendering (page.tsx) — the same components, so the two can never
          drift (CLAUDE.md's sibling-entry hazard). Rendered OUTSIDE the join <form>: the sign-out
          way forward is a <form> of its own, and a nested form is invalid HTML — the browser drops
          the inner tag and its button would submit the join instead. */}
      {state.refusal === "invalid_link" && <HandEntryWayBack />}
      {state.refusal === "other_household" && <SignOutAndReturnForm code={code} />}
    </div>
  );
}
