"use client";

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
      <h1 className="text-2xl font-semibold text-[#190F09]">Register your household</h1>

      <div
        role="note"
        className="rounded-xl border border-[#D9C7B8] bg-[#FBF3EA] p-4 text-sm text-[#190F09]"
      >
        This email address will be visible to everyone who joins your household.
      </div>

      <form action={formAction} className="space-y-4" noValidate>
        <div className="space-y-1">
          <label htmlFor="email" className="block text-sm font-medium text-[#190F09]">
            Email
          </label>
          <input
            id="email"
            name="email"
            type="email"
            className="w-full rounded-[10px] border border-[#D9C7B8] bg-[#FBF3EA] px-3 py-2"
          />
          {state.fieldError === "email" && (
            <p className="text-sm text-[#B3261E]">{state.error}</p>
          )}
        </div>

        <div className="space-y-1">
          <label htmlFor="password" className="block text-sm font-medium text-[#190F09]">
            Password
          </label>
          <input
            id="password"
            name="password"
            type="password"
            className="w-full rounded-[10px] border border-[#D9C7B8] bg-[#FBF3EA] px-3 py-2"
          />
          {state.fieldError === "password" && (
            <p className="text-sm text-[#B3261E]">{state.error}</p>
          )}
        </div>

        {state.error && !state.fieldError && (
          <p className="text-sm text-[#B3261E]">{state.error}</p>
        )}

        <button
          type="submit"
          disabled={pending}
          className="w-full rounded-full bg-[#B6522D] px-4 py-2 font-medium text-[#FBF3EA] disabled:opacity-60"
        >
          {pending ? "Registering…" : "Register household"}
        </button>
      </form>
    </div>
  );
}
