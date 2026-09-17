import { notFound, redirect } from "next/navigation";
import {
  getRoundForSession,
  getRoundParticipants,
  hasProcedureChangedNotice,
} from "@/modules/casting/repository";
import { getCurrentSession } from "@/modules/identity/session-cookie";

// Convergence T084/T085: the round-detail screen FR-1.19 (participant names) and FR-1.22 (the
// "procedure changed" notice) both need — `getRoundParticipants`/`hasProcedureChangedNotice`
// existed and were tested at the repository layer, but no route ever called either.
export default async function RoundDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const current = await getCurrentSession();
  if (!current) redirect("/sign-in");

  const round = await getRoundForSession(current.context, id);
  if (!round) notFound();

  const [participants, procedureChanged] = await Promise.all([
    getRoundParticipants(current.context, id),
    hasProcedureChangedNotice(current.context, id),
  ]);

  return (
    <div className="mx-auto max-w-2xl space-y-6 p-6">
      <h1 className="text-2xl font-semibold text-[#190F09]">{round.title}</h1>
      <p className="text-sm text-[#6B4F3B]">{round.status}</p>

      {procedureChanged && (
        <div
          role="alert"
          className="rounded-xl border border-[#B3261E] bg-[#FBF3EA] p-4 text-sm text-[#B3261E]"
        >
          A voting-rule setting was changed while this round was open (FR-1.22).
        </div>
      )}

      <div>
        <h2 className="text-lg font-medium text-[#190F09]">Participants</h2>
        {/* FR-1.19/FR-1.28: names only — no join date, contact detail, or action controls. */}
        <ul className="mt-2 space-y-1">
          {participants.map((p, i) => (
            <li key={i} className="text-sm text-[#6B4F3B]">
              {p.displayName}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
