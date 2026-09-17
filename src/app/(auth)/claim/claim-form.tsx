"use client";

import { useActionState } from "react";
import { claimResidentProfileAction, type ClaimFormState } from "./actions";

const initialState: ClaimFormState = { error: null };

// FR-1.5/US1 AC3: the missing step between a household admin creating a resident profile and
// that profile becoming a signed-in identity — someone with the household + the display name
// they were given sets a password here, once, to claim it.
export function ClaimForm() {
  const [state, formAction, pending] = useActionState(claimResidentProfileAction, initialState);

  return (
    <div className="mx-auto max-w-md space-y-6 p-6">
      <h1 className="font-serif text-2xl font-semibold">Claim your resident profile</h1>
      <p className="text-sm text-muted-foreground">
        Ask whoever registered the household for its household id and the display name they
        created for you, then set your own password here.
      </p>

      <form action={formAction} className="card space-y-4" noValidate>
        <div>
          <label htmlFor="householdId" className="field-label">
            Household
          </label>
          <input id="householdId" name="householdId" type="text" className="field-input" />
        </div>

        <div>
          <label htmlFor="displayName" className="field-label">
            Your name
          </label>
          <input id="displayName" name="displayName" type="text" className="field-input" />
        </div>

        <div>
          <label htmlFor="password" className="field-label">
            Choose a password
          </label>
          <input id="password" name="password" type="password" className="field-input" />
        </div>

        {state.error && <p className="field-error">{state.error}</p>}

        <button type="submit" disabled={pending} className="btn btn-primary w-full">
          {pending ? "Claiming…" : "Claim profile"}
        </button>
      </form>
    </div>
  );
}
