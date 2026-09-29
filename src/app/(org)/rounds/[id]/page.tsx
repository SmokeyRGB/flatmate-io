import { ArrowLeft, TriangleAlert } from "lucide-react";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import {
  getRoundForSession,
  getRoundParticipants,
  hasProcedureChangedNotice,
  listOrganisationApplications,
} from "@/modules/casting/repository";
import {
  assertHasPermission,
  PermissionDeniedError,
} from "@/modules/identity/repository";
import { isUuid } from "@/db/session-context";
import { getCurrentSession } from "@/modules/identity/session-cookie";
import { de } from "@/ui/strings";
import { LinkPendingHint } from "@/ui/link-pending-hint";
import { ApplicationsSection, type ApplicationsView } from "./applications-section";
import { SavedToast } from "./saved-toast";

// Convergence T084/T085: the round-detail screen FR-1.19 (participant names) and FR-1.22 (the
// "procedure changed" notice) both need — `getRoundParticipants`/`hasProcedureChangedNotice`
// existed and were tested at the repository layer, but no route ever called either.
export default async function RoundDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams?: Promise<{ saved?: string }>;
}) {
  const { id } = await params;
  // ?saved=<application id> after a capture. Anything that is not a uuid is ignored (no toast, no
  // link): the value comes from the URL, so it is never trusted as a path segment.
  const savedParam = (await searchParams)?.saved;
  const savedId = typeof savedParam === "string" && isUuid(savedParam) ? savedParam : null;
  const current = await getCurrentSession();
  if (!current) redirect("/sign-in");

  const round = await getRoundForSession(current.context, id);
  if (!round) notFound();

  // F3 change 2: the way to capture an application is offered only to a resident profile that holds
  // create_application, for a round that is open. Nothing changes for the household account. The
  // check is the same try/catch pattern rounds/new uses; the capture page and the repository
  // refuse again on their own.
  let canCapture = false;
  if (current.context.profileId !== null && round.status === "open") {
    try {
      await assertHasPermission(current.context, current.context.accountId, "create_application");
      canCapture = true;
    } catch (err) {
      if (!(err instanceof PermissionDeniedError)) throw err;
    }
  }

  const [participants, procedureChanged] = await Promise.all([
    getRoundParticipants(current.context, id),
    hasProcedureChangedNotice(current.context, id),
  ]);

  // O4 (F3 change 3, design D2): three viewer cases. The household account gets the §8.6 sentence
  // and no read at all; a resident without either application permission gets no section (the
  // read refuses); a holder gets the list. The repository decides who may read, not this page.
  let section: ApplicationsView | null;
  if (current.context.profileId === null) {
    section = { view: "household_account" };
  } else {
    try {
      const rows = await listOrganisationApplications(current.context, id);
      section = { view: "list", rows: rows ?? [] };
    } catch (err) {
      if (err instanceof PermissionDeniedError) {
        section = null;
      } else if (err instanceof TypeError || err instanceof ReferenceError) {
        // A programming error (say, a repository function missing from a test's module mock) is
        // never shown as a load error.
        throw err;
      } else {
        // Never the error object: a Drizzle message carries bound values (change 2, D4).
        console.error({ code: "unexpected", name: err instanceof Error ? err.name : typeof err });
        section = { view: "load_error" };
      }
    }
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6 p-6">
      <Link href="/organization" className="back-link">
        <ArrowLeft className="size-4" /> {de.nav.organisation}
        <LinkPendingHint />
      </Link>

      {/* U-29, O4: the round's header and its „Bewerbungen" section are one visual block. */}
      <div className="panel-round space-y-5">
        <div>
          <h1 className="font-serif text-2xl font-semibold">{round.title}</h1>
          <span className="badge mt-1">{de.status.round[round.status as keyof typeof de.status.round]}</span>
        </div>

        {savedId && (
          <SavedToast
            message={de.applications.saved}
            link={{ href: `/rounds/${id}/applications/${savedId}`, label: de.applications.viewSaved }}
          />
        )}

        {section && <ApplicationsSection roundId={id} canCapture={canCapture} {...section} />}
      </div>

      {procedureChanged && (
        <div role="alert" className="callout callout-caution">
          <TriangleAlert className="size-4" />
          {de.rounds.detail.procedureChangedNotice}
        </div>
      )}

      {/* ADR-014/G-D15: a household-account session (no profile) never sees participant data —
          getRoundParticipants already refuses server-side; this also skips the empty section.
          The participants belong to the round too, but O4's one-block rule is about the header and
          the list, so this is a plain section below it. */}
      {current.context.profileId !== null && (
        <section>
          <h2 className="font-serif text-lg font-medium">{de.rounds.detail.participantsHeading}</h2>
          {/* FR-1.19/FR-1.28: names only — no join date, contact detail, or action controls. */}
          <ul className="mt-3 space-y-2">
            {participants.map((p, i) => (
              <li key={i} className="card py-2 text-sm">
                {p.displayName}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
