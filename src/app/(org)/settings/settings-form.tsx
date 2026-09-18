"use client";

import { Lock } from "lucide-react";
import { useActionState } from "react";
import { updateSettingsAction, type SettingsFormState } from "./actions";

const initialState: SettingsFormState = { error: null };

export function SettingsForm({
  quorumShare,
  openRoundTitle,
}: {
  quorumShare: string;
  openRoundTitle: string | null;
}) {
  const [state, formAction, pending] = useActionState(updateSettingsAction, initialState);

  return (
    <div className="space-y-4">
      {openRoundTitle && (
        <div className="callout callout-caution">
          <Lock className="size-4" />
          While &quot;{openRoundTitle}&quot; is open, these settings stay unchanged (FR-1.21).
          Close the round to change them here.
        </div>
      )}

      <form action={formAction} className="card">
        <fieldset disabled={Boolean(openRoundTitle)} className="space-y-4 disabled:opacity-60">
          <div>
            <label htmlFor="quorumShare" className="field-label">
              Quorum share
            </label>
            <input id="quorumShare" name="quorumShare" defaultValue={quorumShare} className="field-input" />
          </div>

          {state.error && <p className="field-error">{state.error}</p>}

          <button type="submit" disabled={pending} className="btn btn-primary">
            {pending ? "Saving…" : "Save"}
          </button>
        </fieldset>
      </form>
    </div>
  );
}
