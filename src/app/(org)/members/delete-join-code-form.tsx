"use client";

import { Trash2 } from "lucide-react";
import { useRef } from "react";
import { de } from "@/ui/strings";
import { deleteJoinCodeAction } from "./actions";

const t = de.members.joinCode;

// design.md Decision 6: "Löschen" sits behind a `.dialog` confirmation — the design system
// requires one for a hard-to-reverse action, and invalidating outstanding invitations is one —
// but deliberately WITHOUT a typed-name gate. That friction (RemoveMemberForm's confirmDisplayName
// field) is reserved for U-27's permanent member removal; reusing it here would flatten a
// distinction the design system draws on purpose.
export function DeleteJoinCodeForm({ issuanceId, code }: { issuanceId: string; code: string }) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  return (
    <>
      <button
        type="button"
        onClick={() => dialogRef.current?.showModal()}
        aria-label={t.deleteAriaLabel(code)}
        title={de.common.delete}
        className="btn-link"
      >
        <Trash2 className="size-4" /> {de.common.delete}
      </button>

      <dialog ref={dialogRef} className="dialog">
        <h2 className="font-serif text-lg font-semibold">{t.deleteDialog.heading}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{t.deleteDialog.consequence}</p>

        <form action={deleteJoinCodeAction} className="mt-4 flex items-center gap-4">
          <input type="hidden" name="issuanceId" value={issuanceId} />
          <button type="submit" className="btn btn-destructive">
            {de.common.delete}
          </button>
          <button type="button" onClick={() => dialogRef.current?.close()} className="btn-link">
            {de.common.cancel}
          </button>
        </form>
      </dialog>
    </>
  );
}
