"use client";

import { Trash2 } from "lucide-react";
import { useActionState, useState } from "react";
import { removeMemberAction, type RemoveMemberFormState } from "./actions";

const initialState: RemoveMemberFormState = { error: null };

// FR-1.26/U-27 hard tier: requires typing the exact display name, not a plain click — the
// nearby callout on the members page explains when to use this over the reversible "Moved out".
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
        <Trash2 className="mr-1 inline size-3.5" /> Remove
      </button>
      {state.error && <p className="field-error w-full">{state.error}</p>}
    </form>
  );
}
