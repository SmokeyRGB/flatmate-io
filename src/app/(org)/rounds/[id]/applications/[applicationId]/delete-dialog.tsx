"use client";

import { X } from "lucide-react";
import { useActionState, useId, useRef, useState } from "react";
import { useStrings } from "@/ui/strings/provider";
import { SubmitButton } from "@/ui/submit-button";
import { deleteApplicationAction, type DeleteFormState } from "./delete-actions";

const initialState: DeleteFormState = { status: "idle" };

// What the dialog needs: the two ids its form posts and the name it asks about. No message, no
// attribute, no contact.
export interface DeleteDialogProps {
  roundId: string;
  applicationId: string;
  applicantName: string;
}

// F3 application-deletion (design D6, FR-3.19, AC-3.17): „Löschen" and its confirmation, on the
// organisation's application detail (O5). A native <dialog className="dialog">, modelled on
// rooms/remove-room-form.tsx. A plain confirm, not type-to-confirm (the Design System keeps that
// for removing a member). The form that deletes lives inside the dialog, so nothing is submitted
// from outside the confirmation; cancelling or closing writes nothing. A refusal shows in the
// dialog (useActionState), which stays open.
// Each opening mounts a fresh form (the key), so a refusal from an earlier opening is not shown again
// (as invite-dialog.tsx).
export function DeleteDialog({ roundId, applicationId, applicantName }: DeleteDialogProps) {
  const s = useStrings();
  const t = s.applications.delete;
  const dialogRef = useRef<HTMLDialogElement>(null);
  const headingId = useId();
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
        className="btn-link text-destructive"
      >
        {t.trigger}
      </button>

      <dialog ref={dialogRef} className="dialog" aria-labelledby={headingId}>
        <div className="flex items-start justify-between gap-4">
          <h2 id={headingId} className="font-serif text-lg font-semibold">
            {t.heading(applicantName)}
          </h2>
          <button
            type="button"
            onClick={close}
            aria-label={s.common.close}
            className="-m-1 rounded-full p-1 text-muted-foreground transition hover:bg-muted"
          >
            <X className="size-5" />
          </button>
        </div>
        <p className="mt-3 text-sm text-muted-foreground">{t.body}</p>
        <DeleteForm key={opening} roundId={roundId} applicationId={applicationId} onCancel={close} />
      </dialog>
    </>
  );
}

function DeleteForm({
  roundId,
  applicationId,
  onCancel,
}: Omit<DeleteDialogProps, "applicantName"> & { onCancel: () => void }) {
  const s = useStrings();
  const t = s.applications.delete;
  const [state, formAction] = useActionState(deleteApplicationAction, initialState);

  return (
    <form action={formAction} className="mt-4 space-y-2">
      <input type="hidden" name="roundId" value={roundId} />
      <input type="hidden" name="applicationId" value={applicationId} />
      <div className="flex items-center gap-4">
        <SubmitButton className="btn btn-destructive" pendingLabel={t.confirmPending}>
          {t.confirm}
        </SubmitButton>
        <button type="button" onClick={onCancel} className="btn-link">
          {s.common.cancel}
        </button>
      </div>
      {state.status === "error" && (
        <p className="field-error" role="alert">
          {t.refusal[state.code]}
        </p>
      )}
    </form>
  );
}
