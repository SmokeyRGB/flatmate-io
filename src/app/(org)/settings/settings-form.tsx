"use client";

import { Lock } from "lucide-react";
import { useActionState } from "react";
import { de } from "@/ui/strings";
import { updateSettingsAction, type SettingsFormState } from "./actions";

const initialState: SettingsFormState = { error: null };
const t = de.settings;

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
          {t.lockedWhileRoundOpen(openRoundTitle)}
        </div>
      )}

      <form action={formAction} className="card">
        <fieldset disabled={Boolean(openRoundTitle)} className="space-y-4 disabled:opacity-60">
          <div>
            <label htmlFor="quorumShare" className="field-label">
              {t.quorumShareLabel}
            </label>
            <input id="quorumShare" name="quorumShare" defaultValue={quorumShare} className="field-input" />
          </div>

          {state.error && <p className="field-error">{state.error}</p>}

          <button type="submit" disabled={pending} className="btn btn-primary">
            {pending ? t.savePending : t.save}
          </button>
        </fieldset>
      </form>
    </div>
  );
}
