import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { f1TargetStatusesFor } from "@/modules/casting/room-transitions";
import { listRooms } from "@/modules/casting/repository";
import { getCurrentSession } from "@/modules/identity/session-cookie";
import { de } from "@/ui/strings";
import { LinkPendingHint } from "@/ui/link-pending-hint";
import { SubmitButton } from "@/ui/submit-button";
import { createRoomAction, removeRoomAction, renameRoomAction, transitionRoomAction } from "./actions";

const t = de.rooms;

// Screen O14. FR-1.9–FR-1.11: create/rename/remove rooms; each room's state is its own.
export default async function RoomsPage() {
  const current = await getCurrentSession();
  if (!current) redirect("/sign-in");

  const rooms = await listRooms(current.context);

  return (
    <div className="mx-auto max-w-2xl space-y-6 p-6">
      <Link href="/organization" className="back-link">
        <ArrowLeft className="size-4" /> {de.nav.organisation}
        <LinkPendingHint />
      </Link>
      <h1 className="font-serif text-2xl font-semibold">{t.heading}</h1>

      <form action={createRoomAction} className="flex gap-2">
        <input name="label" placeholder={t.addPlaceholder} className="field-input flex-1" />
        <SubmitButton className="btn btn-primary shrink-0">{t.addSubmit}</SubmitButton>
      </form>

      <ul className="space-y-3">
        {rooms.map((r) => (
          <li key={r.id} className="card">
            <div className="flex items-center justify-between">
              <span className="font-medium">{r.label}</span>
              <span className="badge">{de.status.room[r.status]}</span>
            </div>

            <div className="mt-3 flex flex-wrap gap-2">
              <form action={renameRoomAction} className="flex gap-1">
                <input type="hidden" name="roomId" value={r.id} />
                <input name="label" defaultValue={r.label} className="field-input py-1 text-sm" />
                <SubmitButton className="btn-link shrink-0">{de.common.rename}</SubmitButton>
              </form>

              <form action={transitionRoomAction} className="flex gap-1">
                <input type="hidden" name="roomId" value={r.id} />
                <select name="toStatus" defaultValue={r.status} className="field-input py-1 text-sm">
                  {/* Options are this room's own legal targets (plus its current status), not
                      every F1-reachable target across all rooms — see f1TargetStatusesFor. */}
                  {f1TargetStatusesFor(r.status).map((s) => (
                    <option key={s} value={s}>
                      {de.status.room[s]}
                    </option>
                  ))}
                </select>
                <SubmitButton className="btn-link shrink-0">{t.changeState}</SubmitButton>
              </form>

              <form action={removeRoomAction}>
                <input type="hidden" name="roomId" value={r.id} />
                <SubmitButton className="btn-link text-destructive">{t.remove}</SubmitButton>
              </form>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
