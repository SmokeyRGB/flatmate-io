"use client";

import { useActionState } from "react";
import { de } from "@/ui/strings";
import { createAndOpenRoundAction, type CreateRoundFormState } from "./actions";

const initialState: CreateRoundFormState = { error: null };
const t = de.rounds.new;

export function RoundForm({ rooms }: { rooms: { id: string; label: string }[] }) {
  const [state, formAction, pending] = useActionState(createAndOpenRoundAction, initialState);

  return (
    <form action={formAction} className="card space-y-4">
      <div>
        <label htmlFor="title" className="field-label">
          {t.titleLabel}
        </label>
        <input id="title" name="title" placeholder={t.titlePlaceholder} className="field-input" />
      </div>

      <fieldset>
        <legend className="field-label">{t.roomsLegend}</legend>
        <div className="space-y-2">
          {rooms.map((r) => (
            <label key={r.id} className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="roomIds" value={r.id} className="accent-primary" />
              {r.label}
            </label>
          ))}
          {rooms.length === 0 && <p className="text-sm text-muted-foreground">{t.noRoomsYet}</p>}
        </div>
      </fieldset>

      {state.error && <p className="field-error">{state.error}</p>}

      <button type="submit" disabled={pending} className="btn btn-primary">
        {pending ? t.submitPending : t.submit}
      </button>
    </form>
  );
}
