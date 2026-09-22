import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { listRoundsForSession } from "@/modules/casting/repository";
import { getMembershipForAccount } from "@/modules/identity/repository";
import { getCurrentSession } from "@/modules/identity/session-cookie";
import { de } from "@/ui/strings";

const t = de.org.dashboard;

// Screen O1. EC-1.5: exactly one round is presented as "active"; the rest are reachable only via
// the list below it, never surfaced as if several were simultaneously live.
//
// join-by-link EC-2.4: a visitor who opens a join link while already a member of this household
// is redirected here (the temporary Start stand-in, proposal Assumption 4) with `?note=` carrying
// which note to show — no code involved (G-A5 has nothing to say about it). `searchParams` is a
// Promise in this Next version, same as `params` (src/app/(org)/rounds/[id]/page.tsx).
export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ note?: string }>;
}) {
  const { note } = await searchParams;
  const current = await getCurrentSession();
  if (!current) redirect("/sign-in");

  const rounds = await listRoundsForSession(current.context);
  const [active, ...rest] = rounds;

  // FR-1.27: the Members link is only useful to administration/moderator — a plain resident
  // following it would hit a refusal (now handled gracefully on that page, but there's no reason
  // to lead them there in the first place).
  const membershipRow = await getMembershipForAccount(current.context, current.context.accountId);
  const canSeeMembersList =
    current.context.profileId === null ||
    membershipRow?.role === "household_admin" ||
    membershipRow?.role === "moderator";

  return (
    <div className="mx-auto max-w-2xl space-y-6 p-6">
      <h1 className="font-serif text-2xl font-semibold">{t.heading}</h1>

      {note === "already_member" && (
        <div role="note" className="callout callout-info">
          {de.join.alreadyMemberNote}
        </div>
      )}

      {active ? (
        <Link href={`/rounds/${active.id}`} className="card block transition hover:shadow-none">
          <p className="eyebrow">{t.activeRoundEyebrow}</p>
          <p className="mt-1 text-lg font-medium">{active.title}</p>
          <span className="badge mt-2">{de.status.round[active.status as keyof typeof de.status.round]}</span>
        </Link>
      ) : (
        // The single most important prompt on this page when nothing else is going on yet —
        // the "banded" featured-card variant (09-Design-System.md), not a quiet one.
        <div className="card card-featured">
          <div className="card-band">
            <p className="eyebrow">{t.asNextEyebrow}</p>
          </div>
          <div className="card-featured-body space-y-3">
            <p className="text-lg font-semibold">{t.openFirstRoundHeading}</p>
            <p className="text-sm text-muted-foreground">{t.openFirstRoundBody}</p>
            <Link href="/rounds/new" className="btn btn-primary">
              {t.openNewRound} <ArrowRight className="size-4" />
            </Link>
          </div>
        </div>
      )}

      {active && (
        <Link href="/rounds/new" className="btn-link">
          {t.openAnotherRound}
        </Link>
      )}

      {rest.length > 0 && (
        <div>
          <p className="text-sm font-medium">{t.otherRoundsHeading}</p>
          <ul className="mt-2 space-y-1">
            {rest.map((r: { id: string; title: string; status: string }) => (
              <li key={r.id} className="text-sm text-muted-foreground">
                <Link href={`/rounds/${r.id}`} className="btn-link">
                  {r.title} — {de.status.round[r.status as keyof typeof de.status.round]}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="flex flex-wrap gap-4 border-t border-border pt-4 text-sm">
        <Link href="/rooms" className="btn-link">
          {t.roomsLink}
        </Link>
        {canSeeMembersList && (
          <Link href="/members" className="btn-link">
            {t.membersLink}
          </Link>
        )}
        <Link href="/settings" className="btn-link">
          {t.settingsLink}
        </Link>
        {current.context.profileId !== null && (
          <Link href="/who-lives-here" className="btn-link">
            {t.whoLivesHereLink}
          </Link>
        )}
      </div>
    </div>
  );
}
