"use client";

import { Trash2 } from "lucide-react";
import { useId, useRef } from "react";
import { useStrings } from "@/ui/strings/provider";
import { SubmitButton } from "@/ui/submit-button";
import { removePreparedProfileAction } from "./actions";

// Removing a prepared profile is terminal (prepared -> removed), so it sits behind the same
// `.dialog` confirmation as DeleteJoinCodeForm, without a typed-name gate.
export function DeletePreparedProfileForm({
  residentProfileId,
  displayName,
}: {
  residentProfileId: string;
  displayName: string;
}) {
  const s = useStrings();
  const t = s.members;
  const dialogRef = useRef<HTMLDialogElement>(null);
  const headingId = useId();

  return (
    <>
      <button type="button" onClick={() => dialogRef.current?.showModal()} className="btn btn-secondary">
        <Trash2 className="size-4" /> {t.deletePrepared}
      </button>

      <dialog ref={dialogRef} className="dialog" aria-labelledby={headingId}>
        <h2 id={headingId} className="font-serif text-lg font-semibold">{t.deletePreparedDialog.heading}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{t.deletePreparedDialog.consequence(displayName)}</p>

        <form action={removePreparedProfileAction} className="mt-4 flex items-center gap-4">
          <input type="hidden" name="residentProfileId" value={residentProfileId} />
          <SubmitButton className="btn btn-destructive">{s.common.delete}</SubmitButton>
          <button type="button" onClick={() => dialogRef.current?.close()} className="btn-link">
            {s.common.cancel}
          </button>
        </form>
      </dialog>
    </>
  );
}
