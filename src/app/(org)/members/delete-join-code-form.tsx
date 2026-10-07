"use client";

import { Trash2 } from "lucide-react";
import { useId, useRef } from "react";
import { useStrings } from "@/ui/strings/provider";
import { SubmitButton } from "@/ui/submit-button";
import { deleteJoinCodeAction } from "./actions";

// design.md Decision 6: "Löschen" sits behind a `.dialog` confirmation — the design system
// requires one for a hard-to-reverse action, and invalidating outstanding invitations is one —
// but deliberately WITHOUT a typed-name gate. That friction (RemoveMemberForm's confirmDisplayName
// field) is reserved for U-27's permanent member removal; reusing it here would flatten a
// distinction the design system draws on purpose.
export function DeleteJoinCodeForm({ issuanceId, code }: { issuanceId: string; code: string }) {
  const s = useStrings();
  const t = s.members.joinCode;
  const dialogRef = useRef<HTMLDialogElement>(null);
  const headingId = useId();

  return (
    <>
      <button
        type="button"
        onClick={() => dialogRef.current?.showModal()}
        aria-label={t.deleteAriaLabel(code)}
        title={s.common.delete}
        className="btn-link"
      >
        <Trash2 className="size-4" /> {s.common.delete}
      </button>

      <dialog ref={dialogRef} className="dialog" aria-labelledby={headingId}>
        <h2 id={headingId} className="font-serif text-lg font-semibold">{t.deleteDialog.heading}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{t.deleteDialog.consequence}</p>

        <form action={deleteJoinCodeAction} className="mt-4 flex items-center gap-4">
          <input type="hidden" name="issuanceId" value={issuanceId} />
          <SubmitButton className="btn btn-destructive">{s.common.delete}</SubmitButton>
          <button type="button" onClick={() => dialogRef.current?.close()} className="btn-link">
            {s.common.cancel}
          </button>
        </form>
      </dialog>
    </>
  );
}
