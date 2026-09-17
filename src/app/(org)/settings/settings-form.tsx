"use client";

import { useActionState } from "react";
import { updateSettingsAction, type SettingsFormState } from "./actions";

const initialState: SettingsFormState = { error: null };

export function SettingsForm({ quorumShare }: { quorumShare: string }) {
  const [state, formAction, pending] = useActionState(updateSettingsAction, initialState);

  return (
    <form action={formAction} className="card space-y-4">
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
    </form>
  );
}
