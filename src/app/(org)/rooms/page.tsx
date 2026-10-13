import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { f1TargetStatusesFor, type RoomStatus } from "@/modules/casting/room-transitions";
import { listRooms } from "@/modules/casting/repository";
import { getCurrentSession } from "@/modules/identity/session-cookie";
import { OrganisationAccessDenied } from "@/app/(org)/organisation-access-denied";
import { requireOrganisationAccess } from "@/app/(org)/organisation-access";
import type { Strings } from "@/ui/strings";
import { getStrings } from "@/ui/strings/request";
import { LinkPendingHint } from "@/ui/link-pending-hint";
import { SubmitButton } from "@/ui/submit-button";
import { renameRoomAction, transitionRoomAction } from "./actions";
import { NewRoomDialog } from "./new-room-dialog";
import { RemoveRoomForm } from "./remove-room-form";

// Screen O14. FR-1.9–FR-1.11: create/rename/remove rooms; each room's state is its own.
// organisation-task-list D7: the transition's own name, never "Open"/"Status ändern".
function transitionLabel(t: Strings["rooms"]["transitions"], from: RoomStatus, to: RoomStatus): string {
  if (to === "not_available") return t.notAvailable;
  if (to === "on_hold") return t.pause;
  return from === "planned" ? t.markFree : t.makeFreeAgain;
}

export default async function RoomsPage() {
  const s = await getStrings();
  const t = s.rooms;
  const current = await getCurrentSession();
  if (!current) redirect("/sign-in");

  // role-permissions design D9: every page of the organisation area first checks the caller's
  // stored permissions on this request (a demoted moderator loses the area on reload); the page's
  // own narrower check below stays.
  if (!(await requireOrganisationAccess(current))) return <OrganisationAccessDenied strings={await getStrings()} />;

  const rooms = await listRooms(current.context);

  return (
    <div className="mx-auto max-w-2xl space-y-6 p-6">
      <Link href="/organization" className="back-link">
        <ArrowLeft className="size-4" /> {s.nav.organisation}
        <LinkPendingHint />
      </Link>
      <div className="flex items-center justify-between gap-4">
        <h1 className="font-serif text-2xl font-semibold">{t.heading}</h1>
        <NewRoomDialog />
      </div>

      <ul className="space-y-3">
        {rooms.map((r) => (
          <li key={r.id} className="card">
            <div className="flex items-center justify-between">
              <span className="font-medium">{r.label}</span>
              <span className="badge">{s.status.room[r.status]}</span>
            </div>

            <div className="mt-3 flex flex-wrap gap-2">
              <form action={renameRoomAction} className="flex gap-1">
                <input type="hidden" name="roomId" value={r.id} />
                <input name="label" defaultValue={r.label} className="field-input py-1 text-sm" />
                <SubmitButton className="btn-link shrink-0">{s.common.rename}</SubmitButton>
              </form>

              {/* One form per target: this room's own legal targets (never every F1-reachable target
                  across all rooms, see f1TargetStatusesFor), minus its current status. */}
              {f1TargetStatusesFor(r.status)
                .filter((target) => target !== r.status)
                .map((target) => (
                  <form key={target} action={transitionRoomAction}>
                    <input type="hidden" name="roomId" value={r.id} />
                    <input type="hidden" name="toStatus" value={target} />
                    <SubmitButton className="btn btn-secondary py-1">
                      {transitionLabel(t.transitions, r.status, target)}
                    </SubmitButton>
                  </form>
                ))}
            </div>

            {/* Set apart on its own line: the one action that cannot be undone. */}
            <div className="mt-3 border-t border-border pt-3">
              <RemoveRoomForm roomId={r.id} label={r.label} />
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
