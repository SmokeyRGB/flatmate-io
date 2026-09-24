"use client";

import { useActionState } from "react";
import { de } from "@/ui/strings";
import { changeEmailAction, type EmailFormState } from "./actions";
import { SuccessToast } from "@/ui/success-toast";

const initialState: EmailFormState = { error: null, saved: false };
const t = de.account.email;

// design.md Decision 8: `currentEmail` pre-fills the field with the server's own current value —
// not a typed draft from a previous submission (the action state itself carries no such value).
export function EmailForm({ currentEmail }: { currentEmail: string | null }) {
  const [state, formAction, pending] = useActionState(changeEmailAction, initialState);

  return (
    // noValidate: the server action is the one validator, so every refusal is our German text
    // (de.ts), never the browser's own tooltip in the browser's language (walkthrough 2026-09-24).
    <form action={formAction} className="space-y-2" noValidate>
      <div>
        <label htmlFor="email" className="field-label">
          {t.fieldLabel}
        </label>
        <input
          id="email"
          name="email"
          type="email"
          defaultValue={currentEmail ?? ""}
          className="field-input"
        />
      </div>
      {state.error && (
        <p className="field-error" role="alert">
          {state.error}
        </p>
      )}
      {state.saved && !state.error && <p className="text-sm text-muted-foreground">{t.saved}</p>}
      <SuccessToast message={t.saved} trigger={state.saved && !state.error ? state : null} />
      <button type="submit" disabled={pending} className="btn btn-primary w-full">
        {pending ? t.submitPending : t.submit}
      </button>
    </form>
  );
}
