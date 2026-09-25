"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { de } from "@/ui/strings";
import { signInAction, type SignInFormState } from "./actions";
import { PasswordInput } from "@/ui/password-input";
import { SubmitButton } from "@/ui/submit-button";
import { LinkPendingHint } from "@/ui/link-pending-hint";

const initialState: SignInFormState = { error: null };
const t = de.auth.signIn;

// AC-1.6: two entry modes, household (email+password) and resident (household, display_name,
// password) — ADR-013's fixed-identity model means picking a mode here IS choosing the identity
// for the whole session; there is no in-session switch afterwards.
export function SignInForm() {
  const [mode, setMode] = useState<"household" | "resident">("household");
  // resident-settings (human decision 2026-09-24, walkthrough): on the resident tab, a resident
  // with an email may use it instead of household + name. The tab still decides the identity:
  // the server refuses a household account's address on this path (auth.ts `resident_email`).
  const [residentBy, setResidentBy] = useState<"name" | "email">("name");
  const submittedMode = mode === "resident" && residentBy === "email" ? "resident_email" : mode;
  const showEmail = mode === "household" || residentBy === "email";
  const [state, formAction] = useActionState(signInAction, initialState);

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
        <input type="hidden" name="mode" value={submittedMode} />

        {showEmail ? (
          <div>
            <label htmlFor="email" className="field-label">
              {t.emailLabel}
            </label>
            <input id="email" name="email" type="email" required autoComplete="email" className="field-input" />
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
          <PasswordInput id="password" name="password" required autoComplete="current-password" />
        </div>

        {mode === "resident" && (
          <button
            type="button"
            className="btn-link"
            onClick={() => setResidentBy(residentBy === "name" ? "email" : "name")}
          >
            {residentBy === "name" ? t.residentUseEmail : t.residentUseName}
          </button>
        )}

        {state.error && <p className="field-error">{state.error}</p>}

        <SubmitButton className="btn btn-primary w-full" pendingLabel={t.submitPending}>
          {t.submit}
        </SubmitButton>
      </form>

      {/* join-screen design.md Decision 8/proposal.md: the two ways in that are not sign-in itself
          — neither requires knowing a URL (spec "Sign-in leads to the ways in that are not
          sign-in"). "Beitrittscode eingeben" only makes sense for someone without an account yet,
          so it is shown on the resident tab only; "WG gründen" applies to either tab. */}
      <div className="flex flex-col items-center gap-2">
        <Link href="/register" className="btn-link">
          {t.foundHousehold}
          <LinkPendingHint />
        </Link>
        {mode === "resident" && (
          <Link href="/join" className="btn-link">
            {t.enterJoinCode}
            <LinkPendingHint />
          </Link>
        )}
      </div>
    </div>
  );
}
