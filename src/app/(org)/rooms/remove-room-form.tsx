"use client";

import { useId, useRef } from "react";
import { useStrings } from "@/ui/strings/provider";
import { SubmitButton } from "@/ui/submit-button";
import { removeRoomAction } from "./actions";

// organisation-task-list D7: removing a room asks first. The trigger only opens a native <dialog>;
// the form that removes lives inside it, so nothing is submitted from outside the confirmation.
// Modelled on members/remove-member-form.tsx, without the typed name (a room is not a person).
export function RemoveRoomForm({ roomId, label }: { roomId: string; label: string }) {
  const s = useStrings();
  const t = s.rooms.removeDialog;
  const dialogRef = useRef<HTMLDialogElement>(null);
  const headingId = useId();

  return (
    <>
      <button
        type="button"
        onClick={() => dialogRef.current?.showModal()}
        className="btn-link text-destructive"
      >
        {s.rooms.remove}
      </button>

      <dialog ref={dialogRef} className="dialog" aria-labelledby={headingId}>
        <h2 id={headingId} className="font-serif text-lg font-semibold">
          {t.heading(label)}
        </h2>
        <form action={removeRoomAction} className="mt-4 flex items-center gap-4">
          <input type="hidden" name="roomId" value={roomId} />
          <SubmitButton className="btn btn-destructive" pendingLabel={t.submitPending}>
            {t.submit}
          </SubmitButton>
          <button type="button" onClick={() => dialogRef.current?.close()} className="btn-link">
            {s.common.cancel}
          </button>
        </form>
      </dialog>
    </>
  );
}
