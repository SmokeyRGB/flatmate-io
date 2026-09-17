"use client";

import { useActionState } from "react";
import { createAndOpenRoundAction, type CreateRoundFormState } from "./actions";

const initialState: CreateRoundFormState = { error: null };

export function RoundForm({ rooms }: { rooms: { id: string; label: string }[] }) {
  const [state, formAction, pending] = useActionState(createAndOpenRoundAction, initialState);

  return (
    <form action={formAction} className="card space-y-4">
      <div>
        <label htmlFor="title" className="field-label">
          Round title
        </label>
        <input id="title" name="title" placeholder="e.g. Nachbesetzung Herbst" className="field-input" />
      </div>

      <fieldset>
        <legend className="field-label">Rooms this round covers</legend>
        <div className="space-y-2">
          {rooms.map((r) => (
            <label key={r.id} className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="roomIds" value={r.id} className="accent-primary" />
              {r.label}
            </label>
          ))}
          {rooms.length === 0 && (
            <p className="text-sm text-muted-foreground">No rooms yet — add one on the Rooms screen first.</p>
          )}
        </div>
      </fieldset>

      {state.error && <p className="field-error">{state.error}</p>}

      <button type="submit" disabled={pending} className="btn btn-primary">
        {pending ? "Opening…" : "Open round"}
      </button>
    </form>
  );
}
