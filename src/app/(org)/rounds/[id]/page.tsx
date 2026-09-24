import { ArrowLeft, TriangleAlert } from "lucide-react";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import {
  getRoundForSession,
  getRoundParticipants,
  hasProcedureChangedNotice,
} from "@/modules/casting/repository";
import { getCurrentSession } from "@/modules/identity/session-cookie";
import { de } from "@/ui/strings";

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
      <Link href="/organization" className="back-link">
        <ArrowLeft className="size-4" /> {de.nav.organisation}
      </Link>

      <div>
        <h1 className="font-serif text-2xl font-semibold">{round.title}</h1>
        <span className="badge mt-1">{de.status.round[round.status as keyof typeof de.status.round]}</span>
      </div>

      {procedureChanged && (
        <div role="alert" className="callout callout-caution">
          <TriangleAlert className="size-4" />
          {de.rounds.detail.procedureChangedNotice}
        </div>
      )}

      {/* ADR-014/G-D15: a household-account session (no profile) never sees participant data —
          getRoundParticipants already refuses server-side; this also skips the empty panel. */}
      {current.context.profileId !== null && (
        // Everything below is scoped to this specific round — the larger-radius tinted panel
        // groups it visually, distinct from a plain card (09-Design-System.md).
        <div className="panel-round">
          <h2 className="font-serif text-lg font-medium">{de.rounds.detail.participantsHeading}</h2>
          {/* FR-1.19/FR-1.28: names only — no join date, contact detail, or action controls. */}
          <ul className="mt-3 space-y-2">
            {participants.map((p, i) => (
              <li key={i} className="card py-2 text-sm">
                {p.displayName}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
