"use client";

import Link from "next/link";
import { useActionState } from "react";
import { de } from "@/ui/strings";
import { SubmitButton } from "@/ui/submit-button";
import { createAndOpenRoundAction, type CreateRoundFormState } from "./actions";

const initialState: CreateRoundFormState = { error: null };
const t = de.rounds.new;

export function RoundForm({ rooms }: { rooms: { id: string; label: string; castable: boolean }[] }) {
  const [state, formAction] = useActionState(createAndOpenRoundAction, initialState);
  // The notice below is for zero rooms only. The button also locks when rooms exist but none can
  // be cast for (occupied / not available), the case openRoundTx refuses with rooms_unavailable.
  // The server action refuses on its own; this lock is only the visible half.
  const noRooms = rooms.length === 0;
  const nothingToCastFor = !rooms.some((r) => r.castable);

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
          {noRooms && (
            <p className="text-sm text-muted-foreground">
              {t.noRoomsYetBefore}
              <Link href="/rooms" className="btn-link">
                {t.noRoomsYetLink}
              </Link>
              {t.noRoomsYetAfter}
            </p>
          )}
        </div>
      </fieldset>

      {state.error && <p className="field-error">{state.error}</p>}

      <SubmitButton className="btn btn-primary" pendingLabel={t.submitPending} disabled={nothingToCastFor}>
        {t.submit}
      </SubmitButton>
    </form>
  );
}
