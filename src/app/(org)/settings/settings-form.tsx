"use client";

import { useActionState } from "react";
import { updateSettingsAction, type SettingsFormState } from "./actions";

const initialState: SettingsFormState = { error: null };

export function SettingsForm({ quorumShare }: { quorumShare: string }) {
  const [state, formAction, pending] = useActionState(updateSettingsAction, initialState);

  return (
    <form action={formAction} className="space-y-4">
      <div className="space-y-1">
        <label htmlFor="quorumShare" className="block text-sm font-medium text-[#190F09]">
          Quorum share
        </label>
        <input
          id="quorumShare"
          name="quorumShare"
          defaultValue={quorumShare}
          className="w-full rounded-[10px] border border-[#D9C7B8] bg-[#FBF3EA] px-3 py-2"
        />
      </div>

      {state.error && <p className="text-sm text-[#B3261E]">{state.error}</p>}

      <button
        type="submit"
        disabled={pending}
        className="rounded-full bg-[#B6522D] px-4 py-2 font-medium text-[#FBF3EA] disabled:opacity-60"
      >
        {pending ? "Saving…" : "Save"}
      </button>
    </form>
  );
}
