"use client";

import { useActionState, useState } from "react";
import { removeMemberAction, type RemoveMemberFormState } from "./actions";

const initialState: RemoveMemberFormState = { error: null };

// FR-1.26/U-27 hard tier: "Entfernen" requires typing the exact display name, not a plain click —
// specifically for a person who joined falsely or maliciously via the join code, not for a real
// move-out (that's the separate, one-click "set moved out" action next to this one).
export function RemoveMemberForm({ accountId, displayName }: { accountId: string; displayName: string }) {
  const [state, formAction, pending] = useActionState(removeMemberAction, initialState);
  const [typedName, setTypedName] = useState("");

  return (
    <form action={formAction} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="accountId" value={accountId} />
      <input
        name="confirmDisplayName"
        value={typedName}
        onChange={(e) => setTypedName(e.target.value)}
        placeholder={`Type "${displayName}" to confirm`}
        className="field-input py-1 text-sm"
      />
      <button
        type="submit"
        disabled={pending || typedName !== displayName}
        className="btn-link text-destructive disabled:opacity-40"
      >
        Remove (intruder)
      </button>
      {state.error && <p className="field-error w-full">{state.error}</p>}
    </form>
  );
}
