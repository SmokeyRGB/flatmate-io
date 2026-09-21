"use client";

import { Trash2, TriangleAlert } from "lucide-react";
import { useActionState, useEffect, useRef, useState } from "react";
import { de } from "@/ui/strings";
import { removeMemberAction, type RemoveMemberFormState } from "./actions";

const initialState: RemoveMemberFormState = { error: null };
const t = de.members.remove;

// FR-1.26/U-27 hard tier: requires typing the exact display name, not a plain click. Presented as
// a modal dialog per docs/09-Design-System.md's "Dialogs & confirmations" — title, consequence
// explanation, a nested cautionary callout, the typed-name field (placeholder previews the
// expected value), and a solid destructive confirm button that stays disabled (50% opacity)
// until the name matches — not the always-visible inline control this replaces
// (003-remove-resident-modal).
export function RemoveMemberForm({ accountId, displayName }: { accountId: string; displayName: string }) {
  const [state, formAction, pending] = useActionState(removeMemberAction, initialState);
  const [typedName, setTypedName] = useState("");
  const dialogRef = useRef<HTMLDialogElement>(null);

  // `removeMember` performs a soft `status: "moved_out"` transition, not a deletion — the row
  // stays in the list (it re-renders with a "moved out" badge and a Reactivate button instead),
  // so closing "for free" via the row unmounting (as originally assumed in research.md Decision
  // 4) does not happen. Close explicitly on a successful, already-open submission; a failed one
  // (state.error set) stays open so the inline error is visible (FR-008).
  useEffect(() => {
    if (state.error === null && dialogRef.current?.open) {
      dialogRef.current.close();
    }
  }, [state]);

  return (
    <>
      <button
        type="button"
        onClick={() => dialogRef.current?.showModal()}
        aria-label={t.ariaLabel(displayName)}
        title={t.buttonLabel}
        className="shrink-0 rounded-full p-1.5 text-destructive transition hover:bg-destructive/10"
      >
        <Trash2 className="size-5" />
      </button>

      {/* Resetting on `close` covers both the Cancel button below and the native Escape-dismiss
          gesture (which fires `close` too) — one handler, no separate case needed. */}
      <dialog ref={dialogRef} className="dialog" onClose={() => setTypedName("")}>
        <h2 className="font-serif text-lg font-semibold">{t.dialogHeading(displayName)}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{t.consequence}</p>

        <div className="callout callout-caution mt-3">
          <TriangleAlert className="size-4" />
          <p>{t.caution}</p>
        </div>

        <form action={formAction} className="mt-4 space-y-3">
          <input type="hidden" name="accountId" value={accountId} />
          <div>
            <label htmlFor={`confirm-${accountId}`} className="field-label">
              {t.confirmLabel(displayName)}
            </label>
            <input
              id={`confirm-${accountId}`}
              name="confirmDisplayName"
              value={typedName}
              onChange={(e) => setTypedName(e.target.value)}
              placeholder={displayName}
              className="field-input"
            />
          </div>
          {state.error && <p className="field-error">{state.error}</p>}
          <div className="flex items-center gap-4">
            <button
              type="submit"
              disabled={pending || typedName !== displayName}
              className="btn btn-destructive"
            >
              {pending ? t.submitPending : t.submit}
            </button>
            <button type="button" onClick={() => dialogRef.current?.close()} className="btn-link">
              {t.cancel}
            </button>
          </div>
        </form>
      </dialog>
    </>
  );
}
