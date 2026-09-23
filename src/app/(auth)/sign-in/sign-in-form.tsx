"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { de } from "@/ui/strings";
import { signInAction, type SignInFormState } from "./actions";

const initialState: SignInFormState = { error: null };
const t = de.auth.signIn;

// AC-1.6: two entry modes, household (email+password) and resident (household, display_name,
// password) — ADR-013's fixed-identity model means picking a mode here IS choosing the identity
// for the whole session; there is no in-session switch afterwards.
export function SignInForm() {
  const [mode, setMode] = useState<"household" | "resident">("household");
  const [state, formAction, pending] = useActionState(signInAction, initialState);

  return (
    <div className="space-y-6">
      <h1 className="font-serif text-2xl font-semibold">{t.heading}</h1>

      {/* Tab switcher, not a choice selector — active tab is a raised cream sub-pill, not a
          solid-color fill (09-Design-System.md distinguishes the two explicitly). */}
      <div className="tab-track">
        <button
          type="button"
          onClick={() => setMode("household")}
          className={`tab-item ${mode === "household" ? "tab-item-active" : ""}`}
        >
          {t.tabHousehold}
        </button>
        <button
          type="button"
          onClick={() => setMode("resident")}
          className={`tab-item ${mode === "resident" ? "tab-item-active" : ""}`}
        >
          {t.tabResident}
        </button>
      </div>

      <form action={formAction} className="card space-y-4">
        <input type="hidden" name="mode" value={mode} />

        {mode === "household" ? (
          <div>
            <label htmlFor="email" className="field-label">
              {t.emailLabel}
            </label>
            <input id="email" name="email" type="email" required className="field-input" />
          </div>
        ) : (
          <>
            <div>
              <label htmlFor="householdId" className="field-label">
                {t.householdLabel}
              </label>
              <input
                id="householdId"
                name="householdId"
                type="text"
                required
                placeholder={t.householdPlaceholder}
                className="field-input"
              />
            </div>
            <div>
              <label htmlFor="displayName" className="field-label">
                {t.nameLabel}
              </label>
              <input
                id="displayName"
                name="displayName"
                type="text"
                required
                className="field-input"
              />
            </div>
          </>
        )}

        <div>
          <label htmlFor="password" className="field-label">
            {t.passwordLabel}
          </label>
          <input
            id="password"
            name="password"
            type="password"
            required
            className="field-input"
          />
        </div>

        {state.error && <p className="field-error">{state.error}</p>}

        <button type="submit" disabled={pending} className="btn btn-primary w-full">
          {pending ? t.submitPending : t.submit}
        </button>
      </form>

      {/* join-screen design.md Decision 8/proposal.md: the two ways in that are not sign-in itself
          — neither requires knowing a URL (spec "Sign-in leads to the ways in that are not
          sign-in"). "Beitrittscode eingeben" only makes sense for someone without an account yet,
          so it is shown on the resident tab only; "WG gründen" applies to either tab. */}
      <div className="flex flex-col items-center gap-2">
        <Link href="/register" className="btn-link">
          {t.foundHousehold}
        </Link>
        {mode === "resident" && (
          <Link href="/join" className="btn-link">
            {t.enterJoinCode}
          </Link>
        )}
      </div>
    </div>
  );
}
