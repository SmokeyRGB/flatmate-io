import { redirect } from "next/navigation";
import { PermissionDeniedError, getHousehold, getResidentList } from "@/modules/identity/repository";
import { getCurrentSession } from "@/modules/identity/session-cookie";
import {
  createResidentProfileAction,
  reactivateMemberAction,
  rotateJoinCodeAction,
  setMemberRoleAction,
  setMovedOutAction,
} from "./actions";
import { RemoveMemberForm } from "./remove-member-form";

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
          <h1 className="font-serif text-2xl font-semibold">Members</h1>
          <p className="text-sm text-muted-foreground">
            This list is for administration and moderators. If you want to see who lives here, use{" "}
            <a href="/who-lives-here" className="btn-link">
              Who lives here
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
        <input name="displayName" placeholder="New resident's display name" className="field-input flex-1" />
        <button type="submit" className="btn btn-primary shrink-0">
          Add resident
        </button>
      </form>
      <p className="field-helper">
        After adding them, tell them your household id (
        <span className="font-mono">{household?.id}</span>) and the display name you chose — they
        set their own password at <span className="font-mono">/claim</span>.
      </p>
    </div>
  ) : null;

  if (leadWithJoinCode) {
    return (
      <div className="mx-auto max-w-md space-y-4 p-6">
        <h1 className="font-serif text-2xl font-semibold">Members</h1>
        <p className="text-sm text-muted-foreground">
          No one has joined yet — share your join code to invite the first resident.
        </p>
        <p className="card font-mono text-sm">{household?.joinCode}</p>
        <form action={rotateJoinCodeAction}>
          <button type="submit" className="btn btn-primary">
            Rotate join code
          </button>
        </form>
        {createResidentForm}
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6 p-6">
      <h1 className="font-serif text-2xl font-semibold">Members</h1>

      {createResidentForm}

      <ul className="space-y-3">
        {members.map((m) => (
          <li key={m.id} className="card">
            <div className="flex items-center justify-between">
              <span className="font-medium">{m.displayName}</span>
              <span className="flex items-center gap-2">
                <span className="badge">{m.status}</span>
                {m.role === "moderator" && <span className="badge">moderator</span>}
              </span>
            </div>

            {canAct && m.accountId && (
              <div className="mt-3 flex flex-wrap items-center gap-3">
                {m.status !== "moved_out" ? (
                  <>
                    {/* EC-1.7: administration may appoint (or unappoint) a moderator. */}
                    {isAdmin && m.role === "member" && (
                      <form action={setMemberRoleAction}>
                        <input type="hidden" name="accountId" value={m.accountId} />
                        <input type="hidden" name="toRole" value="moderator" />
                        <button type="submit" className="btn-link">
                          Make moderator
                        </button>
                      </form>
                    )}
                    {isAdmin && m.role === "moderator" && (
                      <form action={setMemberRoleAction}>
                        <input type="hidden" name="accountId" value={m.accountId} />
                        <input type="hidden" name="toRole" value="member" />
                        <button type="submit" className="btn-link">
                          Make member
                        </button>
                      </form>
                    )}
                    <form action={setMovedOutAction}>
                      <input type="hidden" name="accountId" value={m.accountId} />
                      <button type="submit" className="btn-link">
                        Set moved out
                      </button>
                    </form>
                    <RemoveMemberForm accountId={m.accountId} displayName={m.displayName} />
                  </>
                ) : (
                  <form action={reactivateMemberAction}>
                    <input type="hidden" name="accountId" value={m.accountId} />
                    <button type="submit" className="btn-link">
                      Reactivate
                    </button>
                  </form>
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
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Join code</p>
          <p className="font-mono text-sm">{household?.joinCode}</p>
          <form action={rotateJoinCodeAction}>
            <button type="submit" className="btn-link">
              Rotate join code
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
