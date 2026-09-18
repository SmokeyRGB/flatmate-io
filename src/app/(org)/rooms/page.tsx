import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { F1_REACHABLE_TRANSITIONS, type RoomStatus } from "@/modules/casting/room-transitions";
import { listRooms } from "@/modules/casting/repository";
import { getCurrentSession } from "@/modules/identity/session-cookie";
import { createRoomAction, removeRoomAction, renameRoomAction, transitionRoomAction } from "./actions";

// F1 only ever drives rooms into these states via transitionRoomAction (see
// F1_REACHABLE_TRANSITIONS in room-transitions.ts) — promised/occupied are Application-state-
// driven (F3+) and must not appear as choices here, or submitting them 500s server-side.
const F1_TARGET_STATUSES = [
  ...new Set([...F1_REACHABLE_TRANSITIONS].map((pair) => pair.split("->")[1] as RoomStatus)),
];

// Screen O14. FR-1.9–FR-1.11: create/rename/remove rooms; each room's state is its own.
export default async function RoomsPage() {
  const current = await getCurrentSession();
  if (!current) redirect("/sign-in");

  const rooms = await listRooms(current.context);

  return (
    <div className="mx-auto max-w-2xl space-y-6 p-6">
      <Link href="/dashboard" className="back-link">
        <ArrowLeft className="size-4" /> Dashboard
      </Link>
      <h1 className="font-serif text-2xl font-semibold">Rooms</h1>

      <form action={createRoomAction} className="flex gap-2">
        <input name="label" placeholder="Room label" className="field-input flex-1" />
        <button type="submit" className="btn btn-primary shrink-0">
          Add room
        </button>
      </form>

      <ul className="space-y-3">
        {rooms.map((r) => (
          <li key={r.id} className="card">
            <div className="flex items-center justify-between">
              <span className="font-medium">{r.label}</span>
              <span className="badge">{r.status}</span>
            </div>

            <div className="mt-3 flex flex-wrap gap-2">
              <form action={renameRoomAction} className="flex gap-1">
                <input type="hidden" name="roomId" value={r.id} />
                <input name="label" defaultValue={r.label} className="field-input py-1 text-sm" />
                <button type="submit" className="btn-link shrink-0">
                  Rename
                </button>
              </form>

              <form action={transitionRoomAction} className="flex gap-1">
                <input type="hidden" name="roomId" value={r.id} />
                <select name="toStatus" defaultValue={r.status} className="field-input py-1 text-sm">
                  {/* Include the room's current status so the select always has a matching option,
                      even if that status (e.g. "planned") isn't itself an F1-reachable target. */}
                  {[...new Set([r.status, ...F1_TARGET_STATUSES])].map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
                <button type="submit" className="btn-link shrink-0">
                  Change state
                </button>
              </form>

              <form action={removeRoomAction}>
                <input type="hidden" name="roomId" value={r.id} />
                <button type="submit" className="btn-link text-destructive">
                  Remove
                </button>
              </form>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
