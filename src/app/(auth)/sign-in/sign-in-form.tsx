"use client";

import Link from "next/link";
import { useActionState, useEffect, useRef, useState } from "react";
import { browserLocalStorage, readStoredHouseholdCode } from "@/app/household-code-storage";
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
  // household-sign-in-code: the join form's `draft` pattern (join-by-link design.md Decision 4).
  // React 19 resets the form after every action that does not throw, and that reset rewrites even a
  // controlled checkbox's DOM state back to its default without React re-syncing it — seen in the
  // 2026-10-05 walkthrough: a cleared "angemeldet bleiben" came back ticked after a refused attempt,
  // so the retry would have created a long session and stored the code on the device against the
  // person's choice (identity/device-memory: opt-in only). Rendering `defaultValue`/`defaultChecked`
  // from `draft`, filled in the action wrapper before the dispatch, makes the reset restore what was
  // just submitted. The password is never captured.
  const [draft, setDraft] = useState({ householdCode: "", displayName: "", rememberMe: true });
  const submittedMode = mode === "resident" && residentBy === "email" ? "resident_email" : mode;
  const showEmail = mode === "household" || residentBy === "email";
  const [state, formAction] = useActionState(signInAction, initialState);

  // household-sign-in-code D6: prefill the WG-Kennung from the device. Read in an effect after the
  // field mounts, never during render, so server and client markup agree. The input stays
  // uncontrolled and the effect writes the DOM value directly (no setState in an effect), so what
  // the person types is what posts. Only an empty field is prefilled. Storage that is missing or
  // throws leaves the field empty (P-2).
  const householdCodeRef = useRef<HTMLInputElement>(null);
  const showHouseholdCode = !showEmail;
  useEffect(() => {
    const input = householdCodeRef.current;
    if (!showHouseholdCode || !input || input.value) return;
    const stored = readStoredHouseholdCode(browserLocalStorage());
    if (stored) input.value = stored;
  }, [showHouseholdCode, state]); // `state`: React resets an uncontrolled form after each action

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

      <form
        action={(formData: FormData) => {
          setDraft({
            householdCode: String(formData.get("householdCode") ?? ""),
            displayName: String(formData.get("displayName") ?? ""),
            rememberMe: formData.get("rememberMe") === "on",
          });
          formAction(formData);
        }}
        className="card space-y-4"
      >
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
              <div className="flex items-center justify-between gap-2">
                <label htmlFor="householdCode" className="field-label">
                  {t.householdLabel}
                </label>
                {/* Same "(?)" popover as the deck and the ranking board (globals.css `.deck-help` /
                    `.weights-popover`, anchor --help-trigger — one trigger per page, and this page
                    has no other). A plain type="button", so it never submits the form. */}
                <button
                  type="button"
                  className="deck-help"
                  popoverTarget="household-code-help"
                  aria-label={t.householdHelpToggleLabel}
                >
                  {t.householdHelpToggle}
                </button>
                <div id="household-code-help" popover="auto" className="weights-popover card">
                  <p className="font-semibold">{t.householdHelpHeading}</p>
                  <p className="mt-3 text-sm text-muted-foreground">{t.householdHelpBody}</p>
                </div>
              </div>
              <input
                id="householdCode"
                name="householdCode"
                type="text"
                required
                ref={householdCodeRef}
                defaultValue={draft.householdCode}
                placeholder={t.householdPlaceholder}
                autoCapitalize="characters"
                autoComplete="off"
                spellCheck={false}
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
                defaultValue={draft.displayName}
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

        {/* identity/sign-in: "angemeldet bleiben" on both tabs, ticked by default. One checkbox
            outside the tab conditional, so it keeps its state when the tab or the way in changes. */}
        <div className="flex items-center gap-2">
          <input
            id="rememberMe"
            name="rememberMe"
            type="checkbox"
            defaultChecked={draft.rememberMe}
          />
          <label htmlFor="rememberMe" className="field-label">
            {de.join.rememberMeLabel}
          </label>
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
