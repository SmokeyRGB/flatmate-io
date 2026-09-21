import { ArrowLeft, DoorOpen, ShieldCheck, UserMinus, UserPlus } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { PermissionDeniedError, getHousehold, getResidentList } from "@/modules/identity/repository";
import { getCurrentSession } from "@/modules/identity/session-cookie";
import { de } from "@/ui/strings";
import {
  createResidentProfileAction,
  reactivateMemberAction,
  rotateJoinCodeAction,
  setMemberRoleAction,
  setMovedOutAction,
} from "./actions";
import { RemoveMemberForm } from "./remove-member-form";

const t = de.members;

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
  const household = canAct ? await getHousehold(current.context) : null;

  const createResidentForm = isAdmin ? (
    <div className="card space-y-2">
      <form action={createResidentProfileAction} className="flex gap-2">
        <input name="displayName" placeholder={t.addResidentPlaceholder} className="field-input flex-1" />
        <button type="submit" className="btn btn-primary shrink-0">
          {t.addResidentSubmit}
        </button>
      </form>
      <p className="field-helper">
        {t.addResidentHelperHouseholdIdPrefix} <span className="font-mono">{household?.id}</span>.{" "}
        {t.addResidentHelperClaimNote} <span className="font-mono">/claim</span>.
      </p>
    </div>
  ) : null;

  const backLink = (
    <Link href="/dashboard" className="back-link">
      <ArrowLeft className="size-4" /> {de.nav.organisation}
    </Link>
  );

  if (leadWithJoinCode) {
    return (
      <div className="mx-auto max-w-md space-y-4 p-6">
        {backLink}
        <h1 className="font-serif text-2xl font-semibold">{t.heading}</h1>
        <p className="text-sm text-muted-foreground">{t.noOneJoinedYet}</p>
        <p className="code-block font-mono text-sm">{household?.joinCode}</p>
        <form action={rotateJoinCodeAction}>
          <button type="submit" className="btn btn-primary">
            {t.rotateJoinCode}
          </button>
        </form>
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

      {canAct && (
        <div className="space-y-1 border-t border-border pt-4">
          {/* FR-1.26: "share or rotate" — the code itself must be visible to share, not just a
              blind rotate action. Deliberately NOT styled like a member row (card) — that shape
              reads as "a person," which this isn't. */}
          <p className="eyebrow">{t.joinCodeEyebrow}</p>
          <p className="code-block font-mono text-sm">{household?.joinCode}</p>
          <form action={rotateJoinCodeAction}>
            <button type="submit" className="btn-link">
              {t.rotateJoinCode}
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
