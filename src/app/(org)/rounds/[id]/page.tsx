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
      <div>
        <h1 className="font-serif text-2xl font-semibold">{round.title}</h1>
        <span className="badge mt-1">{round.status}</span>
      </div>

      {procedureChanged && (
        <div role="alert" className="rounded-2xl border border-destructive bg-card p-4 text-sm text-destructive">
          A voting-rule setting was changed while this round was open (FR-1.22).
        </div>
      )}

      <div>
        <h2 className="font-serif text-lg font-medium">Participants</h2>
        {/* FR-1.19/FR-1.28: names only — no join date, contact detail, or action controls. */}
        <ul className="mt-2 space-y-2">
          {participants.map((p, i) => (
            <li key={i} className="card py-2 text-sm">
              {p.displayName}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
