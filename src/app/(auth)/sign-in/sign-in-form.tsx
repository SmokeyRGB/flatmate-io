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
      <h1 className="text-2xl font-semibold text-[#190F09]">Sign in</h1>

      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => setMode("household")}
          className={`rounded-full px-4 py-1 text-sm ${mode === "household" ? "bg-[#B6522D] text-[#FBF3EA]" : "bg-[#FBF3EA] text-[#190F09]"}`}
        >
          Household
        </button>
        <button
          type="button"
          onClick={() => setMode("resident")}
          className={`rounded-full px-4 py-1 text-sm ${mode === "resident" ? "bg-[#B6522D] text-[#FBF3EA]" : "bg-[#FBF3EA] text-[#190F09]"}`}
        >
          Resident
        </button>
      </div>

      <form action={formAction} className="space-y-4" noValidate>
        <input type="hidden" name="mode" value={mode} />

        {mode === "household" ? (
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
          </div>
        ) : (
          <>
            <div className="space-y-1">
              <label htmlFor="householdId" className="block text-sm font-medium text-[#190F09]">
                Household
              </label>
              <input
                id="householdId"
                name="householdId"
                type="text"
                placeholder="remembered on this device after joining"
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
            <p className="text-xs text-[#6B4F3B]">
              Not signed up yet?{" "}
              <Link href="/claim" className="text-[#B6522D] underline">
                Claim your resident profile
              </Link>
              .
            </p>
          </>
        )}

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
        </div>

        {state.error && <p className="text-sm text-[#B3261E]">{state.error}</p>}

        <button
          type="submit"
          disabled={pending}
          className="w-full rounded-full bg-[#B6522D] px-4 py-2 font-medium text-[#FBF3EA] disabled:opacity-60"
        >
          {pending ? "Signing in…" : "Sign in"}
        </button>
      </form>
    </div>
  );
}
