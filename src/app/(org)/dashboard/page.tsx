import Link from "next/link";
import { redirect } from "next/navigation";
import { listRoundsForSession } from "@/modules/casting/repository";
import { getCurrentSession } from "@/modules/identity/session-cookie";

// Screen O1. EC-1.5: exactly one round is presented as "active"; the rest are reachable only via
// the list below it, never surfaced as if several were simultaneously live.
export default async function DashboardPage() {
  const current = await getCurrentSession();
  if (!current) redirect("/sign-in");

  const rounds = await listRoundsForSession(current.context);
  const [active, ...rest] = rounds;

  return (
    <div className="mx-auto max-w-2xl space-y-6 p-6">
      <h1 className="text-2xl font-semibold text-[#190F09]">Organisation</h1>

      {active ? (
        <div className="rounded-xl border border-[#D9C7B8] bg-[#FBF3EA] p-4">
          <p className="text-sm text-[#6B4F3B]">Active round</p>
          <p className="text-lg font-medium text-[#190F09]">{active.title}</p>
          <p className="text-sm text-[#6B4F3B]">{active.status}</p>
        </div>
      ) : (
        <p className="text-sm text-[#6B4F3B]">No round yet.</p>
      )}

      <Link href="/rounds/new" className="inline-block rounded-full bg-[#B6522D] px-4 py-2 text-[#FBF3EA]">
        Open a new round
      </Link>

      {rest.length > 0 && (
        <div>
          <p className="text-sm font-medium text-[#190F09]">Other rounds</p>
          <ul className="mt-2 space-y-1">
            {rest.map((r: { id: string; title: string; status: string }) => (
              <li key={r.id} className="text-sm text-[#6B4F3B]">
                {r.title} — {r.status}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="flex flex-wrap gap-4 text-sm">
        <Link href="/rooms" className="text-[#B6522D] underline">
          Rooms
        </Link>
        <Link href="/members" className="text-[#B6522D] underline">
          Members
        </Link>
        <Link href="/settings" className="text-[#B6522D] underline">
          Settings
        </Link>
        {current.context.profileId !== null && (
          <Link href="/who-lives-here" className="text-[#B6522D] underline">
            Who lives here
          </Link>
        )}
      </div>
    </div>
  );
}
