"use client";

import { Info } from "lucide-react";
import { useActionState } from "react";
import { registerHouseholdAction, type RegisterFormState } from "./actions";

const initialState: RegisterFormState = { error: null, fieldError: null };

// Screen A1. AC-1.2: the shared-address notice is unconditionally rendered above the fields —
// not behind a tooltip, accordion, or scroll — so it is visible without scrolling or interaction
// the moment this form mounts.
export function RegisterForm() {
  const [state, formAction, pending] = useActionState(registerHouseholdAction, initialState);

  return (
    <div className="mx-auto max-w-md space-y-6 p-6">
      <h1 className="font-serif text-2xl font-semibold">Register your household</h1>

      <div role="note" className="callout callout-info">
        <Info className="size-4" />
        This email address will be visible to everyone who joins your household.
      </div>

      <form action={formAction} className="card space-y-4" noValidate>
        <div>
          <label htmlFor="email" className="field-label">
            Email
          </label>
          <input id="email" name="email" type="email" className="field-input" />
          {state.fieldError === "email" && <p className="field-error">{state.error}</p>}
        </div>

        <div>
          <label htmlFor="password" className="field-label">
            Password
          </label>
          <input id="password" name="password" type="password" className="field-input" />
          {state.fieldError === "password" && <p className="field-error">{state.error}</p>}
        </div>

        {state.error && !state.fieldError && <p className="field-error">{state.error}</p>}

        <button type="submit" disabled={pending} className="btn btn-primary w-full">
          {pending ? "Registering…" : "Register household"}
        </button>
      </form>
    </div>
  );
}
