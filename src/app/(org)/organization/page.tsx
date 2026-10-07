import { ArrowLeft, ArrowRight } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { listOrganisationTasks, listRoundsForSession } from "@/modules/casting/repository";
import {
  assertHasPermission,
  getLiveFoundingLinkPath,
  isHouseholdAccount,
  getNavigationAccess,
  PermissionDeniedError,
} from "@/modules/identity/repository";
import { getCurrentSession } from "@/modules/identity/session-cookie";
import { getStrings } from "@/ui/strings/request";
import { LinkPendingHint } from "@/ui/link-pending-hint";
import { OrganisationAccessDenied } from "../organisation-access-denied";
import { requireOrganisationAccess } from "../organisation-access";

// Screen O1, now at `/organization` (start-screen change: moved off `/dashboard`, which is B1,
// Start, everywhere from here on). EC-1.5: exactly one round is presented as "active"; the rest
// are reachable only via the list below it, never surfaced as if several were simultaneously
// live. F3 rebuilds this screen as the task list `O-organisation.md` O1 describes.
//
// The `already_member` note (EC-2.4) renders on each identity's own landing (design.md Decision 8):
// B1 for a resident, and here for the household account, whose landing moved from O20 to O1
// (2026-10-05); O20 still renders it too.
export default async function OrganizationPage({
  searchParams,
}: {
  searchParams: Promise<{ note?: string }>;
}) {
  const s = await getStrings();
  const t = s.org.dashboard;
  const { note } = await searchParams;
  const current = await getCurrentSession();
  if (!current) redirect("/sign-in");

  // role-permissions design D9: every page of the organisation area checks the caller's stored
  // permissions on this request, so a demoted moderator sees the access message on reload.
  if (!(await requireOrganisationAccess(current))) return <OrganisationAccessDenied strings={await getStrings()} />;

  const rounds = await listRoundsForSession(current.context);
  const [active, ...rest] = rounds;

  // Every link is offered by the caller's stored permissions (design D9): rooms by manage_rooms,
  // members by any member-administration permission, settings by manage_voting_procedure. One read
  // through getNavigationAccess, so the avatar menu and this page cannot disagree. The household
  // account's old `profileId === null` shortcut is gone: it holds these permissions or it does not.
  const access = await getNavigationAccess(current.context);

  // The first-round card comes from the same task list Start's bridge counts, so the two cannot
  // disagree: `open_first_round` exists only for a caller holding manage_rounds, in a household
  // with no round of any status (so it can never show beside an `active` round).
  const showFirstRoundCard =
    !active &&
    (await listOrganisationTasks(current.context)).some((task) => task.kind === "open_first_round");

  // Design D13 (application-capture): the household account runs no rounds (03-PRD.md §4.0.1,
  // S-50/U-20), and neither does anyone without manage_rounds. The "open another round" link is
  // offered only to a session that holds it, checked the way rounds/new's own page does.
  let canOpenRound = false;
  try {
    await assertHasPermission(current.context, current.context.accountId, "manage_rounds");
    canOpenRound = true;
  } catch (err) {
    if (!(err instanceof PermissionDeniedError)) throw err;
  }

  // founding-link-moderator D4: the household account (no manage_rounds) is offered to join its own
  // household through the founding link while that link is unused and valid. A plain <a> below, not
  // next/link: the join GET records a rate-limit attempt and resolves the code, so it must not be
  // prefetched. The read returns null for a caller without manage_join_codes (the code is a secret).
  const foundingJoinPath =
    !active && !canOpenRound && (await isHouseholdAccount(current.context))
      ? await getLiveFoundingLinkPath(current.context)
      : null;

  return (
    <div className="mx-auto max-w-2xl space-y-6 p-6">
      {/* A resident reaches O1 from the avatar menu or Start's moderation bridge, and the (org)
          frame has no resident navigation, so this is their only way back (walkthrough finding,
          2026-09-24). The household account has no Start, since its landing is O20. */}
      {current.context.profileId !== null && (
        <Link href="/dashboard" className="back-link">
          <ArrowLeft className="size-4" /> {s.nav.start}
          <LinkPendingHint />
        </Link>
      )}
      {note === "already_member" && (
        <div role="note" className="callout callout-info">
          {s.join.alreadyMemberNote}
        </div>
      )}
      <h1 className="font-serif text-2xl font-semibold">{t.heading}</h1>

      {active ? (
        <Link href={`/rounds/${active.id}`} className="card block transition hover:shadow-none">
          <p className="eyebrow">{t.activeRoundEyebrow}</p>
          <p className="mt-1 text-lg font-medium">{active.title}</p>
          <span className="badge mt-2">{s.status.round[active.status as keyof typeof s.status.round]}</span>
          <LinkPendingHint />
        </Link>
      ) : foundingJoinPath ? (
        <div className="card card-featured">
          <div className="card-band">
            <p className="eyebrow">{t.asNextEyebrow}</p>
          </div>
          <div className="card-featured-body space-y-3">
            <p className="text-lg font-semibold">{t.foundingJoinHeading}</p>
            <p className="text-sm text-muted-foreground">{t.foundingJoinBody}</p>
            <a href={foundingJoinPath} className="btn btn-primary">
              {t.foundingJoinButton} <ArrowRight className="size-4" />
            </a>
          </div>
        </div>
      ) : showFirstRoundCard ? (
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
              <LinkPendingHint />
            </Link>
          </div>
        </div>
      ) : (
        <div className="card space-y-1">
          <p className="text-lg font-semibold">{t.noRoundYetHeading}</p>
          <p className="text-sm text-muted-foreground">{t.noRoundYetBody}</p>
        </div>
      )}

      {active && canOpenRound && (
        <Link href="/rounds/new" className="btn-link">
          {t.openAnotherRound}
          <LinkPendingHint />
        </Link>
      )}

      {rest.length > 0 && (
        <div>
          <p className="text-sm font-medium">{t.otherRoundsHeading}</p>
          <ul className="mt-2 space-y-1">
            {rest.map((r: { id: string; title: string; status: string }) => (
              <li key={r.id} className="text-sm text-muted-foreground">
                <Link href={`/rounds/${r.id}`} className="btn-link">
                  {r.title} — {s.status.round[r.status as keyof typeof s.status.round]}
                  <LinkPendingHint />
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="flex flex-wrap gap-4 border-t border-border pt-4 text-sm">
        {access.rooms && (
          <Link href="/rooms" className="btn-link">
            {t.roomsLink}
            <LinkPendingHint />
          </Link>
        )}
        {access.membersList && (
          <Link href="/members" className="btn-link">
            {t.membersLink}
            <LinkPendingHint />
          </Link>
        )}
        {access.settings && (
          <Link href="/settings" className="btn-link">
            {t.settingsLink}
            <LinkPendingHint />
          </Link>
        )}
        {current.context.profileId !== null && (
          <Link href="/who-lives-here" className="btn-link">
            {t.whoLivesHereLink}
            <LinkPendingHint />
          </Link>
        )}
      </div>
    </div>
  );
}
