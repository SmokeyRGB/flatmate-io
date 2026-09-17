"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { signInAction, type SignInFormState } from "./actions";

const initialState: SignInFormState = { error: null };

// AC-1.6: two entry modes, household (email+password) and resident (household, display_name,
// password) — ADR-013's fixed-identity model means picking a mode here IS choosing the identity
// for the whole session; there is no in-session switch afterwards.
export function SignInForm() {
  const [mode, setMode] = useState<"household" | "resident">("household");
  const [state, formAction, pending] = useActionState(signInAction, initialState);

  return (
    <div className="mx-auto max-w-md space-y-6 p-6">
      <h1 className="font-serif text-2xl font-semibold">Sign in</h1>

      <div className="flex gap-2 rounded-full bg-muted p-1">
        <button
          type="button"
          onClick={() => setMode("household")}
          className={`flex-1 rounded-full px-4 py-1.5 text-sm font-medium transition ${mode === "household" ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}
        >
          Household
        </button>
        <button
          type="button"
          onClick={() => setMode("resident")}
          className={`flex-1 rounded-full px-4 py-1.5 text-sm font-medium transition ${mode === "resident" ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}
        >
          Resident
        </button>
      </div>

      <form action={formAction} className="card space-y-4" noValidate>
        <input type="hidden" name="mode" value={mode} />

        {mode === "household" ? (
          <div>
            <label htmlFor="email" className="field-label">
              Email
            </label>
            <input id="email" name="email" type="email" className="field-input" />
          </div>
        ) : (
          <>
            <div>
              <label htmlFor="householdId" className="field-label">
                Household
              </label>
              <input
                id="householdId"
                name="householdId"
                type="text"
                placeholder="remembered on this device after joining"
                className="field-input"
              />
            </div>
            <div>
              <label htmlFor="displayName" className="field-label">
                Your name
              </label>
              <input id="displayName" name="displayName" type="text" className="field-input" />
            </div>
            <p className="field-helper">
              Not signed up yet?{" "}
              <Link href="/claim" className="btn-link">
                Claim your resident profile
              </Link>
              .
            </p>
          </>
        )}

        <div>
          <label htmlFor="password" className="field-label">
            Password
          </label>
          <input id="password" name="password" type="password" className="field-input" />
        </div>

        {state.error && <p className="field-error">{state.error}</p>}

        <button type="submit" disabled={pending} className="btn btn-primary w-full">
          {pending ? "Signing in…" : "Sign in"}
        </button>
      </form>
    </div>
  );
}
