"use client";

import { Plus, X } from "lucide-react";
import { useActionState, useEffect, useId, useRef, useState } from "react";
import { de } from "@/ui/strings";
import { SubmitButton } from "@/ui/submit-button";
import { createRoomAction, type CreateRoomFormState } from "./actions";

const initialState: CreateRoomFormState = { error: null };
const t = de.rooms.create;

// Screen O14's "Neues Zimmer": opens a `.dialog` modal instead of an inline field beside the
// heading, so the room's attributes have room to grow (a size in m², say) without crowding the
// list. Each attribute gets its own labelled row in NewRoomForm's fields stack.
export function NewRoomDialog() {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const headingId = useId();
  // Each opening mounts a fresh NewRoomForm (key below), so its input, its useActionState result
  // and any submission still in flight all belong to that opening alone: an error from an earlier
  // opening can't show again, and a late success from one can't close the next.
  const [opening, setOpening] = useState(0);
  const close = () => dialogRef.current?.close();

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setOpening((n) => n + 1);
          dialogRef.current?.showModal();
        }}
        className="btn btn-primary shrink-0"
      >
        <Plus className="size-4" /> {de.rooms.addSubmit}
      </button>

      <dialog ref={dialogRef} className="dialog" aria-labelledby={headingId}>
        {/* 09-Design-System.md's non-destructive dialog: a top-right × beside the heading. */}
        <div className="flex items-start justify-between gap-4">
          <h2 id={headingId} className="font-serif text-lg font-semibold">
            {t.heading}
          </h2>
          <button
            type="button"
            onClick={close}
            aria-label={de.common.close}
            className="-m-1 rounded-full p-1 text-muted-foreground transition hover:bg-muted"
          >
            <X className="size-5" />
          </button>
        </div>

        <NewRoomForm key={opening} autoFocus={opening > 0} onCreated={close} onCancel={close} />
      </dialog>
    </>
  );
}

function NewRoomForm({
  autoFocus,
  onCreated,
  onCancel,
}: {
  autoFocus: boolean;
  onCreated: () => void;
  onCancel: () => void;
}) {
  const [state, formAction] = useActionState(createRoomAction, initialState);

  useEffect(() => {
    if (state !== initialState && state.error === null) onCreated();
  }, [state, onCreated]);

  return (
    <form action={formAction} className="mt-4 space-y-4">
      <div className="space-y-3">
        <div>
          <label htmlFor="new-room-label" className="field-label">
            {t.labelField}
          </label>
          <input
            id="new-room-label"
            name="label"
            required
            // Mounts after showModal(), which focused the × (the first focusable element); this
            // moves focus to the field. Off for the mount at page load, while the dialog is closed.
            autoFocus={autoFocus}
            placeholder={t.labelPlaceholder}
            aria-invalid={state.error ? true : undefined}
            aria-describedby={state.error ? "new-room-error" : undefined}
            className="field-input"
          />
        </div>
      </div>
      {state.error && (
        <p id="new-room-error" className="field-error" role="alert">
          {state.error}
        </p>
      )}
      <div className="flex items-center gap-4">
        <SubmitButton className="btn btn-primary" pendingLabel={t.submitPending}>
          {t.submit}
        </SubmitButton>
        <button type="button" onClick={onCancel} className="btn-link">
          {de.common.cancel}
        </button>
      </div>
    </form>
  );
}
