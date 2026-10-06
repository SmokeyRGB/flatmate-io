"use client";

import { X } from "lucide-react";
import { useActionState, useEffect, useId, useRef, useState } from "react";
import { de } from "@/ui/strings";
import { SubmitButton } from "@/ui/submit-button";
import { inviteApplicationAction, type InviteFormState } from "./invite-actions";
import { displayName, inviteText } from "./invite-text";
import { NoticeTextPanel } from "./notice";

const t = de.invite;
const initialState: InviteFormState = { status: "idle" };

// What the dialog needs: the two ids its form posts and the name for the greeting. No message, no
// attribute, no contact, no notice fact.
export interface InviteDialogProps {
  roundId: string;
  applicationId: string;
  applicantName: string;
}

// F5 candidate-invite (design D4): „Einladen" and its dialog, mounted by the scoreboard's rows and
// by the organisation's application detail (O5). A native <dialog className="dialog">, as
// new-room-dialog.tsx.
//
// The body mounts only once the dialog has been opened (`opening > 0`), so a closed row carries no
// text and no numeral: the board's HTML does not grow by one copy of text per row, and its digit
// assertions keep holding. Each opening mounts a fresh body (the key), so an
// earlier opening's edit, error or late result cannot leak into the next.
//
// The example text carries NO privacy notice (human decision 2026-10-06): it is the invitation
// only, and the panel shows no `[Link]` hint. Rules, as notice.tsx:
// - the example text is a SUGGESTION in NoticeTextPanel: editable, one copy button;
// - its <textarea> has NO name and sits OUTSIDE the <form>, so the edited text is never posted: the
//   form carries only `roundId` and `applicationId` (G-J4);
// - NO send, share or mailto control exists anywhere here (FR-5.26): the household writes to the
//   person on a channel of its own;
// - closing writes nothing, so „Einladen" stays where it was (R-3 a). Only „Eingeladen!" invites.
export function InviteDialog({
  defaultOpen = false,
  ...props
}: InviteDialogProps & {
  // Only for the render tests, which cannot press the trigger: mount the body from the start.
  defaultOpen?: boolean;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const headingId = useId();
  const [opening, setOpening] = useState(defaultOpen ? 1 : 0);
  const close = () => dialogRef.current?.close();
  const name = displayName(props.applicantName);

  return (
    <>
      <button
        type="button"
        className="btn btn-secondary shrink-0"
        aria-label={t.openLabel(name)}
        onClick={() => {
          setOpening((n) => n + 1);
          dialogRef.current?.showModal();
        }}
      >
        {t.open}
      </button>

      <dialog ref={dialogRef} className="dialog" aria-labelledby={headingId}>
        <div className="flex items-start justify-between gap-4">
          <h2 id={headingId} className="font-serif text-lg font-semibold">
            {t.heading(name)}
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

        {opening > 0 && <InviteBody key={opening} {...props} name={name} onDone={close} />}
      </dialog>
    </>
  );
}

function InviteBody({
  roundId,
  applicationId,
  name,
  onDone,
}: InviteDialogProps & { name: string; onDone: () => void }) {
  const [state, formAction] = useActionState(inviteApplicationAction, initialState);
  const [edited, setEdited] = useState<string | null>(null);
  const panelId = useId();
  const seed = inviteText(name);

  useEffect(() => {
    if (state.status === "ok") onDone();
  }, [state, onDone]);

  return (
    <div className="mt-4 space-y-4">
      <p className="text-sm text-muted-foreground">{t.intro}</p>

      <NoticeTextPanel
        panelId={panelId}
        text={edited ?? seed}
        edited={edited !== null}
        onChange={setEdited}
        onRegenerate={() => setEdited(null)}
        linkHint={false}
      />

      <form action={formAction} className="space-y-2">
        <input type="hidden" name="roundId" value={roundId} />
        <input type="hidden" name="applicationId" value={applicationId} />
        <div className="flex flex-wrap items-center gap-3">
          <SubmitButton className="btn btn-primary">{t.confirm}</SubmitButton>
          <p className="text-xs text-muted-foreground">{t.confirmHint}</p>
        </div>
        {state.status === "error" && (
          <p className="field-error" role="alert">
            {t.refusal[state.code]}
          </p>
        )}
      </form>
    </div>
  );
}
