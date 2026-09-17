import { redirect } from "next/navigation";
import { listRooms } from "@/modules/casting/repository";
import { getCurrentSession } from "@/modules/identity/session-cookie";
import { RoundForm } from "./round-form";

// Screen O2.
export default async function NewRoundPage() {
  const current = await getCurrentSession();
  if (!current) redirect("/sign-in");

  const rooms = await listRooms(current.context);

  return (
    <div className="mx-auto max-w-md space-y-6 p-6">
      <h1 className="font-serif text-2xl font-semibold">Open a casting round</h1>
      <RoundForm rooms={rooms.map((r) => ({ id: r.id, label: r.label }))} />
    </div>
  );
}
