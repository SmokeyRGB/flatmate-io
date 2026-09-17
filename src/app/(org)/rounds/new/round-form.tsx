"use client";

import { useActionState } from "react";
import { createAndOpenRoundAction, type CreateRoundFormState } from "./actions";

const initialState: CreateRoundFormState = { error: null };

export function RoundForm({ rooms }: { rooms: { id: string; label: string }[] }) {
  const [state, formAction, pending] = useActionState(createAndOpenRoundAction, initialState);

  return (
    <form action={formAction} className="space-y-4">
      <div className="space-y-1">
        <label htmlFor="title" className="block text-sm font-medium text-[#190F09]">
          Round title
        </label>
        <input
          id="title"
          name="title"
          placeholder="e.g. Nachbesetzung Herbst"
          className="w-full rounded-[10px] border border-[#D9C7B8] bg-[#FBF3EA] px-3 py-2"
        />
      </div>

      <fieldset className="space-y-2">
        <legend className="text-sm font-medium text-[#190F09]">Rooms this round covers</legend>
        {rooms.map((r) => (
          <label key={r.id} className="flex items-center gap-2 text-sm text-[#190F09]">
            <input type="checkbox" name="roomIds" value={r.id} />
            {r.label}
          </label>
        ))}
        {rooms.length === 0 && (
          <p className="text-sm text-[#6B4F3B]">No rooms yet — add one on the Rooms screen first.</p>
        )}
      </fieldset>

      {state.error && <p className="text-sm text-[#B3261E]">{state.error}</p>}

      <button
        type="submit"
        disabled={pending}
        className="rounded-full bg-[#B6522D] px-4 py-2 font-medium text-[#FBF3EA] disabled:opacity-60"
      >
        {pending ? "Opening…" : "Open round"}
      </button>
    </form>
  );
}
