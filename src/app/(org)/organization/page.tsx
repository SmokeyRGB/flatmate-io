import { ArrowLeft, ArrowRight } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { listRoundsForSession } from "@/modules/casting/repository";
import { getNavigationAccess } from "@/modules/identity/repository";
import { getCurrentSession } from "@/modules/identity/session-cookie";
import { de } from "@/ui/strings";

const t = de.org.dashboard;

// Screen O1, now at `/organization` (start-screen change: moved off `/dashboard`, which is B1,
// Start, everywhere from here on). EC-1.5: exactly one round is presented as "active"; the rest
// are reachable only via the list below it, never surfaced as if several were simultaneously
// live. F3 rebuilds this screen as the task list `O-organisation.md` O1 describes.
//
// The `already_member` note used to render here (EC-2.4) — it now lives on each identity's own
// landing (design.md Decision 8): B1 for a resident, O20 for the household account.
export default async function OrganizationPage() {
  const current = await getCurrentSession();
  if (!current) redirect("/sign-in");

  const rounds = await listRoundsForSession(current.context);
  const [active, ...rest] = rounds;

  // FR-1.27: the Members link is only useful to administration/moderator — a plain resident
  // following it would hit a refusal (now handled gracefully on that page, but there's no reason
  // to lead them there in the first place). start-screen tasks.md 3.3: the resident branch of
  // this rule now goes through getNavigationAccess, so the avatar menu and this page cannot
  // disagree about who sees the members link.
  const canSeeMembersList =
    current.context.profileId === null || (await getNavigationAccess(current.context)).membersList;

  return (
    <div className="mx-auto max-w-2xl space-y-6 p-6">
      {/* A resident reaches O1 from the avatar menu or Start's moderation bridge, and the (org)
          frame has no resident navigation, so this is their only way back (walkthrough finding,
          2026-09-24). The household account has no Start, since its landing is O20. */}
      {current.context.profileId !== null && (
        <Link href="/dashboard" className="back-link">
          <ArrowLeft className="size-4" /> {de.nav.start}
        </Link>
      )}
      <h1 className="font-serif text-2xl font-semibold">{t.heading}</h1>

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
