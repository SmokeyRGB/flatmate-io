import { headers } from "next/headers";
import { redirect } from "next/navigation";
import {
  PermissionDeniedError,
  getResidentList,
  isHouseholdAccount,
  listJoinCodeIssuances,
} from "@/modules/identity/repository";
import { getCurrentSession } from "@/modules/identity/session-cookie";
import { de } from "@/ui/strings";
import { requireOrganisationAccess } from "../organisation-access";
import { MembersView } from "./members-view";

const t = de.members;

// Screen O16. FR-1.25–FR-1.29 (revised 2026-09-17, U-30; permission-based since F3 change 2b): the
// body is members-view.tsx, rendered from the capability flags getResidentList derives from the
// caller's stored permissions. This page loads the data and renders the two refusals.
export default async function MembersPage() {
  const current = await getCurrentSession();
  if (!current) redirect("/sign-in");

  // role-permissions design D9: every organisation page first checks the caller's stored
  // permissions on this request, so a demotion committed since the last load shows the access
  // message on reload.
  // A caller without organisation access gets this page's own refusal, which also points a resident
  // to the read-only household list (FR-1.31), rather than the generic organisation message.
  if (!(await requireOrganisationAccess(current))) return <MembersAccessDenied />;

  // FR-1.27: "not reachable at all — by any route" for a caller holding no member-administration
  // permission — this is that refusal actually reaching a resident (e.g. via the dashboard's
  // Members link), not an unexpected crash. Convergence: previously uncaught, it hit Next's raw
  // error overlay.
  let residentList: Awaited<ReturnType<typeof getResidentList>>;
  try {
    residentList = await getResidentList(current.context, current.context.accountId);
  } catch (err) {
    if (err instanceof PermissionDeniedError) return <MembersAccessDenied />;
    throw err;
  }

  // join-code-protections (O-18): several links now, not one household column — fetched once for
  // the join-code section. Only a caller holding `manage_join_codes` may list them (a caller who
  // may only manage members sees no links, and listJoinCodeIssuances would refuse).
  const joinCodeIssuances = residentList.canManageJoinCodes
    ? await listJoinCodeIssuances(current.context, current.context.accountId)
    : [];
  // task 3.5: "https://<host>/join/<code>", host from next/headers, never an env var. The /join
  // route itself doesn't exist until join-code-protections's change 2 (proposal.md Assumption 3)
  // — a copied link 404s until then, named and bounded behind authentication.
  const host = (await headers()).get("host");

  // Copilot review fix: exactly one `now` per render, threaded through every helper, so a link's
  // live/dead split, its status label, and the removed-joiner caution cannot disagree.
  // founding-link-moderator R3: the founding row speaks to the founder, so the view must know
  // whether the caller is the household account (a moderator sees this screen too).
  const callerIsHouseholdAccount = await isHouseholdAccount(current.context);
  return (
    <MembersView
      residentList={residentList}
      joinCodeIssuances={joinCodeIssuances}
      host={host}
      now={new Date()}
      callerIsHouseholdAccount={callerIsHouseholdAccount}
    />
  );
}

// Both refusals of this page: no organisation access at all, or organisation access without a
// member-administration permission. The pointer to /who-lives-here serves a resident (FR-1.31).
function MembersAccessDenied() {
  return (
    <div className="mx-auto max-w-md space-y-4 p-6">
      <h1 className="font-serif text-2xl font-semibold">{t.heading}</h1>
      <p className="text-sm text-muted-foreground">
        {t.accessDeniedBody} {t.accessDeniedLinkPrefix}{" "}
        <a href="/who-lives-here" className="btn-link">
          {de.org.dashboard.whoLivesHereLink}
        </a>
        .
      </p>
    </div>
  );
}
