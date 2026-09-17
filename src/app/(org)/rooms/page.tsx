import { redirect } from "next/navigation";
import { listRooms } from "@/modules/casting/repository";
import { getCurrentSession } from "@/modules/identity/session-cookie";
import { createRoomAction, removeRoomAction, renameRoomAction, transitionRoomAction } from "./actions";

const ROOM_STATUSES = ["planned", "open", "promised", "occupied", "on_hold", "not_available"] as const;

// Screen O14. FR-1.9–FR-1.11: create/rename/remove rooms; each room's state is its own.
export default async function RoomsPage() {
  const current = await getCurrentSession();
  if (!current) redirect("/sign-in");

  const rooms = await listRooms(current.context);

  return (
    <div className="mx-auto max-w-2xl space-y-6 p-6">
      <h1 className="text-2xl font-semibold text-[#190F09]">Rooms</h1>

      <form action={createRoomAction} className="flex gap-2">
        <input
          name="label"
          placeholder="Room label"
          className="flex-1 rounded-[10px] border border-[#D9C7B8] bg-[#FBF3EA] px-3 py-2"
        />
        <button type="submit" className="rounded-full bg-[#B6522D] px-4 py-2 text-[#FBF3EA]">
          Add room
        </button>
      </form>

      <ul className="space-y-3">
        {rooms.map((r) => (
          <li key={r.id} className="rounded-xl border border-[#D9C7B8] bg-[#FBF3EA] p-4">
            <div className="flex items-center justify-between">
              <span className="font-medium text-[#190F09]">{r.label}</span>
              <span className="text-sm text-[#6B4F3B]">{r.status}</span>
            </div>

            <div className="mt-2 flex flex-wrap gap-2">
              <form action={renameRoomAction} className="flex gap-1">
                <input type="hidden" name="roomId" value={r.id} />
                <input
                  name="label"
                  defaultValue={r.label}
                  className="rounded-[8px] border border-[#D9C7B8] bg-white px-2 py-1 text-sm"
                />
                <button type="submit" className="text-sm text-[#B6522D] underline">
                  Rename
                </button>
              </form>

              <form action={transitionRoomAction} className="flex gap-1">
                <input type="hidden" name="roomId" value={r.id} />
                <select name="toStatus" defaultValue={r.status} className="rounded-[8px] border border-[#D9C7B8] bg-white px-2 py-1 text-sm">
                  {ROOM_STATUSES.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
                <button type="submit" className="text-sm text-[#B6522D] underline">
                  Change state
                </button>
              </form>

              <form action={removeRoomAction}>
                <input type="hidden" name="roomId" value={r.id} />
                <button type="submit" className="text-sm text-[#B3261E] underline">
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
