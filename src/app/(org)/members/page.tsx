import { ArrowLeft, DoorOpen, ShieldCheck, TriangleAlert, UserMinus, UserPlus } from "lucide-react";
import Link from "next/link";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import {
  PermissionDeniedError,
  getResidentList,
  listJoinCodeIssuances,
} from "@/modules/identity/repository";
import { getCurrentSession } from "@/modules/identity/session-cookie";
import { de } from "@/ui/strings";
import {
  createResidentProfileAction,
  extendJoinCodeAction,
  issueJoinCodeAction,
  reactivateMemberAction,
  setMemberRoleAction,
  setMovedOutAction,
} from "./actions";
import { DeleteJoinCodeForm } from "./delete-join-code-form";
import { JoinCodeCopyButtons } from "./join-code-copy-buttons";
import { RemoveMemberForm } from "./remove-member-form";

const t = de.members;

type JoinCodeIssuanceRow = Awaited<ReturnType<typeof listJoinCodeIssuances>>[number];

function formatGermanDate(date: Date): string {
  return date.toLocaleDateString("de-DE", { day: "numeric", month: "numeric", year: "numeric" });
}

// design.md Decision 6 / spec.md "The moderating person governs the links": a link's state is
// derived (domain/identity.md §2.1 forbids a status column), and the surface is allowed to name
// the reason it's dead — the REDEMPTION path is what must never do that (FR-2.8).
function joinCodeStatusLabel(issuance: JoinCodeIssuanceRow): string {
  if (issuance.deletedAt) return t.joinCode.deletedOn(formatGermanDate(issuance.deletedAt));
  if (issuance.expiresAt.getTime() <= Date.now()) return t.joinCode.expiredOn(formatGermanDate(issuance.expiresAt));
  if (issuance.uses >= issuance.maxUses) return t.joinCode.usedUp;
  return t.joinCode.validUntil(formatGermanDate(issuance.expiresAt));
}

// Screen O16. FR-1.25–FR-1.29 (revised 2026-09-17, U-30): full parity for administration AND a
// moderator; leads with the join-code action when administration is the only member. The
// "create a resident profile" form (FR-1.3/FR-1.5) is administration-only, per its own wording —
// U-30's parity is scoped to the resident-list actions FR-1.26 names, not profile creation.
export default async function MembersPage() {
  const current = await getCurrentSession();
  if (!current) redirect("/sign-in");

  // FR-1.27: "not reachable at all — by any route" for a non-moderator, non-admin caller — this
  // is that refusal actually reaching a resident (e.g. via the dashboard's Members link), not an
  // unexpected crash. Convergence: previously uncaught, it hit Next's raw error overlay.
  let residentList: Awaited<ReturnType<typeof getResidentList>>;
  try {
    residentList = await getResidentList(current.context, current.context.accountId);
  } catch (err) {
    if (err instanceof PermissionDeniedError) {
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
    throw err;
  }
  const { members, canAct, isAdmin, leadWithJoinCode } = residentList;

  // join-code-protections (O-18): several links now, not one household column — fetched once,
  // used by the same join-code section rendered in both branches below (task 3.5).
  const joinCodeIssuances = canAct
    ? await listJoinCodeIssuances(current.context, current.context.accountId)
    : [];
  // task 3.5: "https://<host>/join/<code>", host from next/headers, never an env var. The /join
  // route itself doesn't exist until join-code-protections's change 2 (proposal.md Assumption 3)
  // — a copied link 404s until then, named and bounded behind authentication.
  const host = (await headers()).get("host");

  const createResidentForm = isAdmin ? (
    <div className="card space-y-2">
      <form action={createResidentProfileAction} className="flex gap-2">
        <input name="displayName" placeholder={t.addResidentPlaceholder} className="field-input flex-1" />
        <button type="submit" className="btn btn-primary shrink-0">
          {t.addResidentSubmit}
        </button>
      </form>
      <p className="field-helper">
        {t.addResidentHelperHouseholdIdPrefix} <span className="font-mono">{current.context.householdId}</span>.{" "}
        {t.addResidentHelperClaimNote} <span className="font-mono">/claim</span>.
      </p>
    </div>
  ) : null;

  const backLink = (
    <Link href="/dashboard" className="back-link">
      <ArrowLeft className="size-4" /> {de.nav.organisation}
    </Link>
  );

  // design.md Decision 6: three parts, in this order — warning, create form, list of links.
  // task 3.8/EC-2.13: a household whose links are all dead still gets this whole section (create
  // form first, dead links still listed below) — never an empty state.
  const joinCodeSection = canAct ? (
    <div className="space-y-4">
      <p className="eyebrow">{t.joinCode.heading}</p>

      {/* FR-2.2/S-49: the warning sits beside the links, visible without interaction. C-2.5: this
          is social visibility, never security — no padlock, no "sicher", no "geschützt" anywhere
          in this section (task 3.9). */}
      <div className="callout callout-caution">
        <TriangleAlert className="size-4" />
        <p>{t.joinCode.warning}</p>
      </div>

      {/* The create form parameterises the NEXT link, not an existing one (Decision 6) — issuing
          never rewrites an already-issued link's limits. */}
      <form action={issueJoinCodeAction} className="card space-y-3">
        <div className="flex flex-wrap gap-3">
          <div className="flex-1">
            <label htmlFor="validDays" className="field-label">
              {t.joinCode.create.validDaysLabel}
            </label>
            <input
              id="validDays"
              name="validDays"
              type="number"
              min={1}
              defaultValue={7}
              className="field-input"
            />
          </div>
          <div className="flex-1">
            <label htmlFor="maxUses" className="field-label">
              {t.joinCode.create.maxUsesLabel}
            </label>
            <input
              id="maxUses"
              name="maxUses"
              type="number"
              min={0}
              defaultValue={1}
              className="field-input"
            />
            <p className="field-helper">{t.joinCode.create.maxUsesHelper}</p>
          </div>
        </div>
        <button type="submit" className="btn btn-primary">
          {t.joinCode.create.submit}
        </button>
      </form>

      {joinCodeIssuances.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t.joinCode.empty}</p>
      ) : (
        <ul className="space-y-3">
          {joinCodeIssuances.map((issuance) => {
            const isDeleted = issuance.deletedAt !== null;
            const url = host ? `https://${host}/join/${issuance.code}` : `/join/${issuance.code}`;
            return (
              <li key={issuance.id} className="card space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
                  <span>{joinCodeStatusLabel(issuance)}</span>
                  <span className="text-muted-foreground">
                    {t.joinCode.usageCount(issuance.uses, issuance.maxUses)}
                  </span>
                </div>

                {!isDeleted && (
                  <div className="flex flex-wrap items-center gap-3">
                    <form action={extendJoinCodeAction}>
                      <input type="hidden" name="issuanceId" value={issuance.id} />
                      <button type="submit" className="btn-link">
                        {t.joinCode.extend}
                      </button>
                    </form>
                    <DeleteJoinCodeForm issuanceId={issuance.id} code={issuance.code} />
                  </div>
                )}

                <p className="font-mono text-sm font-semibold">{issuance.code}</p>
                <p className="text-xs text-muted-foreground break-all">{url}</p>
                <JoinCodeCopyButtons code={issuance.code} url={url} />
              </li>
            );
          })}
        </ul>
      )}
    </div>
  ) : null;

  if (leadWithJoinCode) {
    return (
      <div className="mx-auto max-w-md space-y-4 p-6">
        {backLink}
        <h1 className="font-serif text-2xl font-semibold">{t.heading}</h1>
        <p className="text-sm text-muted-foreground">{t.noOneJoinedYet}</p>
        {joinCodeSection}
        {createResidentForm}
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6 p-6">
      {backLink}
      <h1 className="font-serif text-2xl font-semibold">{t.heading}</h1>

      {createResidentForm}

      <ul className="space-y-3">
        {members.map((m) => (
          <li key={m.id} className="card">
            <div className="flex items-start justify-between gap-2">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium">{m.displayName}</span>
                {m.role === "moderator" && (
                  <span className="badge badge-role">
                    <ShieldCheck className="size-3" /> {t.moderationBadge}
                  </span>
                )}
                {m.status === "moved_out" && (
                  <span className="badge">
                    <DoorOpen className="size-3" /> {de.status.movedOut}
                  </span>
                )}
              </div>
              {canAct && m.accountId && m.status !== "moved_out" && (
                <RemoveMemberForm accountId={m.accountId} displayName={m.displayName} />
              )}
            </div>

            {canAct && m.accountId && (
              <div className="mt-3">
                {m.status !== "moved_out" ? (
                  <div className="flex flex-wrap items-center gap-2">
                    {/* EC-1.7: administration may appoint (or unappoint) a moderator — a
                        reversible admin toggle, so it's a neutral secondary button, not a
                        destructive-weight link. */}
                    {isAdmin && m.role === "member" && (
                      <form action={setMemberRoleAction}>
                        <input type="hidden" name="accountId" value={m.accountId} />
                        <input type="hidden" name="toRole" value="moderator" />
                        <button type="submit" className="btn btn-secondary">
                          {t.makeModerator}
                        </button>
                      </form>
                    )}
                    {isAdmin && m.role === "moderator" && (
                      <form action={setMemberRoleAction}>
                        <input type="hidden" name="accountId" value={m.accountId} />
                        <input type="hidden" name="toRole" value="member" />
                        <button type="submit" className="btn btn-secondary">
                          {t.makeMember}
                        </button>
                      </form>
                    )}
                    {/* "Moved out" is reversible (via Reactivate) and gets the same neutral
                        secondary weight as the role toggle above; red is reserved for the one
                        irreversible action (Entfernen, the card-corner trash icon). */}
                    <form action={setMovedOutAction}>
                      <input type="hidden" name="accountId" value={m.accountId} />
                      <button type="submit" className="btn btn-secondary">
                        <UserMinus className="size-4" /> {t.markMovedOut}
                      </button>
                    </form>
                  </div>
                ) : (
                  <div className="flex flex-wrap items-center gap-2">
                    <form action={reactivateMemberAction}>
                      <input type="hidden" name="accountId" value={m.accountId} />
                      <button type="submit" className="btn btn-secondary">
                        <UserPlus className="size-4" /> {de.common.reactivate}
                      </button>
                    </form>
                  </div>
                )}
              </div>
            )}
          </li>
        ))}
      </ul>

      {canAct && <div className="border-t border-border pt-4">{joinCodeSection}</div>}
    </div>
  );
}
