"use client";

import { Info } from "lucide-react";
import { useActionState } from "react";
import { de } from "@/ui/strings";
import { SubmitButton } from "@/ui/submit-button";
import { SuccessToast } from "@/ui/success-toast";
import { updateSettingsAction, type SettingsFormState } from "./actions";

const initialState: SettingsFormState = { error: null, saved: false };
const t = de.settings;

export function SettingsForm({
  quorumShare,
  revealVoteAuthorship = false,
  openRoundTitle,
}: {
  quorumShare: string;
  // Optional so the existing feedback test (which renders only the quorum field) stays unedited;
  // the page always passes the stored value.
  revealVoteAuthorship?: boolean;
  openRoundTitle: string | null;
}) {
  const [state, formAction] = useActionState(updateSettingsAction, initialState);

  return (
    <div className="space-y-4">
      {openRoundTitle && (
        <div role="note" className="callout callout-info">
          <Info className="size-4" />
          {t.appliesToNextRound(openRoundTitle)}
        </div>
      )}

      <SuccessToast message={t.saved} trigger={state.saved && !state.error ? state : null} />

      <form action={formAction} className="card">
        <fieldset className="space-y-4">
          <div>
            <label htmlFor="quorumShare" className="field-label">
              {t.quorumShareLabel}
            </label>
            <input id="quorumShare" name="quorumShare" defaultValue={quorumShare} className="field-input" />
          </div>

          <div>
            <label htmlFor="revealVoteAuthorship" className="flex items-center gap-2 font-medium">
              <input
                id="revealVoteAuthorship"
                name="revealVoteAuthorship"
                type="checkbox"
                defaultChecked={revealVoteAuthorship}
                aria-describedby="revealVoteAuthorshipHint"
              />
              {t.revealVoteAuthorshipLabel}
            </label>
            <p id="revealVoteAuthorshipHint" className="mt-1 text-sm text-muted-foreground">
              {t.revealVoteAuthorshipHint}
            </p>
          </div>

          {state.error && <p className="field-error">{state.error}</p>}

          <SubmitButton className="btn btn-primary" pendingLabel={t.savePending}>
            {t.save}
          </SubmitButton>
        </fieldset>
      </form>
    </div>
  );
}
