"use client";

import { Info } from "lucide-react";
import { useActionState, useState } from "react";
import { de } from "@/ui/strings";
import { registerHouseholdAction, type RegisterFormState } from "./actions";
import { PasswordInput } from "@/ui/password-input";
import { SubmitButton } from "@/ui/submit-button";

const initialState: RegisterFormState = { error: null, fieldError: null };
const t = de.auth.register;

// Screen A1 plus its undescribed second step (proposal.md join-by-link Assumption 5, design.md
// Decision 6): registration is a TWO-STEP form with ONE submit, not a second route. Step 1 is
// exactly A1's two fields (email, password) — unchanged. Step 2 asks for the household's name.
// Both steps' fields stay mounted in the same <form> the whole time (hidden via CSS, not
// unmounted), so switching steps never loses what was typed and the credentials leave the browser
// in exactly one request, whichever step the user is looking at when they finally submit.
export function RegisterForm() {
  const [state, formAction] = useActionState(registerHouseholdAction, initialState);
  const [step, setStep] = useState<1 | 2>(1);

  // A server-side refusal must be visible on the step whose field it names — if the household-name
  // step is showing an error but the browser is still displaying step 1 (e.g. a resubmission),
  // nobody would ever see it, and vice versa. Adjusted during render rather than in an Effect
  // (React's documented "adjusting state when a prop changes" pattern, keyed on the `state` object
  // identity useActionState hands back after each submission) — an Effect would run one render
  // late and risk a visible flash of the wrong step.
  const [lastHandledState, setLastHandledState] = useState(state);
  if (state !== lastHandledState) {
    setLastHandledState(state);
    if (state.fieldError === "email" || state.fieldError === "password") setStep(1);
    if (state.fieldError === "name") setStep(2);
  }

  return (
    <div className="space-y-6">
      <h1 className="font-serif text-2xl font-semibold">
        {step === 1 ? t.heading : t.householdNameHeading}
      </h1>

      {step === 1 && (
        <div role="note" className="callout callout-info">
          <Info className="size-4" />
          {t.emailVisibleNotice}
        </div>
      )}

      <form action={formAction} className="card space-y-4" noValidate>
        <div className={step === 1 ? undefined : "hidden"}>
          <label htmlFor="email" className="field-label">
            {t.emailLabel}
          </label>
          <input id="email" name="email" type="email" className="field-input" />
          {state.fieldError === "email" && <p className="field-error">{state.error}</p>}
        </div>

        <div className={step === 1 ? undefined : "hidden"}>
          <label htmlFor="password" className="field-label">
            {t.passwordLabel}
          </label>
          <PasswordInput id="password" name="password" autoComplete="new-password" />
          {state.fieldError === "password" && <p className="field-error">{state.error}</p>}
        </div>

        <div className={step === 2 ? undefined : "hidden"}>
          <label htmlFor="name" className="field-label">
            {t.householdNameLabel}
          </label>
          <input
            id="name"
            name="name"
            type="text"
            placeholder={t.householdNamePlaceholder}
            className="field-input"
          />
          {state.fieldError === "name" && <p className="field-error">{state.error}</p>}
        </div>

        {state.error && !state.fieldError && <p className="field-error">{state.error}</p>}

        {step === 1 ? (
          <button type="button" className="btn btn-primary w-full" onClick={() => setStep(2)}>
            {t.next}
          </button>
        ) : (
          <div className="flex gap-2">
            <button type="button" className="btn btn-secondary" onClick={() => setStep(1)}>
              {t.back}
            </button>
            <SubmitButton className="btn btn-primary flex-1" pendingLabel={t.submitPending}>
              {t.submit}
            </SubmitButton>
          </div>
        )}
      </form>
    </div>
  );
}
