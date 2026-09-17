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
      <h1 className="text-2xl font-semibold text-[#190F09]">Claim your resident profile</h1>
      <p className="text-sm text-[#6B4F3B]">
        Ask whoever registered the household for its household id and the display name they
        created for you, then set your own password here.
      </p>

      <form action={formAction} className="space-y-4" noValidate>
        <div className="space-y-1">
          <label htmlFor="householdId" className="block text-sm font-medium text-[#190F09]">
            Household
          </label>
          <input
            id="householdId"
            name="householdId"
            type="text"
            className="w-full rounded-[10px] border border-[#D9C7B8] bg-[#FBF3EA] px-3 py-2"
          />
        </div>

        <div className="space-y-1">
          <label htmlFor="displayName" className="block text-sm font-medium text-[#190F09]">
            Your name
          </label>
          <input
            id="displayName"
            name="displayName"
            type="text"
            className="w-full rounded-[10px] border border-[#D9C7B8] bg-[#FBF3EA] px-3 py-2"
          />
        </div>

        <div className="space-y-1">
          <label htmlFor="password" className="block text-sm font-medium text-[#190F09]">
            Choose a password
          </label>
          <input
            id="password"
            name="password"
            type="password"
            className="w-full rounded-[10px] border border-[#D9C7B8] bg-[#FBF3EA] px-3 py-2"
          />
        </div>

        {state.error && <p className="text-sm text-[#B3261E]">{state.error}</p>}

        <button
          type="submit"
          disabled={pending}
          className="w-full rounded-full bg-[#B6522D] px-4 py-2 font-medium text-[#FBF3EA] disabled:opacity-60"
        >
          {pending ? "Claiming…" : "Claim profile"}
        </button>
      </form>
    </div>
  );
}
