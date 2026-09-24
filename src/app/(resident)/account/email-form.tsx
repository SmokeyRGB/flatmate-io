"use client";

import { useActionState } from "react";
import { de } from "@/ui/strings";
import { changeEmailAction, type EmailFormState } from "./actions";

const initialState: EmailFormState = { error: null, saved: false };
const t = de.account.email;

// design.md Decision 8: `currentEmail` pre-fills the field with the server's own current value —
// not a typed draft from a previous submission (the action state itself carries no such value).
export function EmailForm({ currentEmail }: { currentEmail: string | null }) {
  const [state, formAction, pending] = useActionState(changeEmailAction, initialState);

  return (
    <form action={formAction} className="space-y-2">
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
      <button type="submit" disabled={pending} className="btn btn-primary w-full">
        {pending ? t.submitPending : t.submit}
      </button>
    </form>
  );
}
