import { randomUUID } from "node:crypto";
import { and, eq, gt, isNull, ne, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { withSessionContext, type SessionContext } from "@/db/session-context";
import { recordActivityEvent } from "@/modules/audit/repository";
import { account, household, householdSettings, membership, residentProfile, session } from "./schema";
import {
  assertResidentProfileTransitionAllowed,
  type ResidentProfileStatus,
} from "./transitions";

export interface Actor {
  accountId: string | null;
  profileId: string | null;
}

// FR-1.4: display_name unique among status != moved_out profiles within a household. Checked
// here (a friendly, named error) in addition to the DB's own partial unique index (T009) — the
// index is the enforcement of record; this is the readable error path AC-1.3 asks for.
export async function isDisplayNameTaken(
  context: SessionContext,
  displayName: string,
): Promise<boolean> {
  return withSessionContext(context, async (tx) => {
    const rows = await tx
      .select({ id: residentProfile.id })
      .from(residentProfile)
      .where(
        and(
          eq(residentProfile.householdId, context.householdId),
          eq(residentProfile.displayName, displayName),
          ne(residentProfile.status, "moved_out"),
        ),
      );
    return rows.length > 0;
  });
}

export class DuplicateDisplayNameError extends Error {
  constructor(displayName: string) {
    super(`A resident profile named "${displayName}" already exists in this household`);
    this.name = "DuplicateDisplayNameError";
  }
}

// FR-1.3/FR-1.5: the household account creates a resident profile but never occupies it — the
// profile starts `prepared` (identity.md's "regulärer Zwischenzustand") until someone actually
// signs up against it (auth.ts's claim step, out of F1's acceptance scope per plan.md's T023).
export async function createResidentProfile(
  context: SessionContext,
  displayName: string,
  actor: Actor,
) {
  if (actor.accountId) {
    await assertIsAdministration(context, actor.accountId);
  }
  return withSessionContext(context, async (tx) => {
    if (await isDisplayNameTaken(context, displayName)) {
      throw new DuplicateDisplayNameError(displayName);
    }

    const [profile] = await tx
      .insert(residentProfile)
      .values({ householdId: context.householdId, displayName, status: "prepared" })
      .returning();

    await recordActivityEvent(tx, {
      householdId: context.householdId,
      eventType: "resident_profile.created",
      subjectType: "resident_profile",
      subjectId: profile.id,
      actorAccountId: actor.accountId,
      actorProfileId: actor.profileId,
      payload: {},
    });

    return profile;
  });
}

// FR-1.26 ("set moved_out", "reactivate") and the claim step (prepared -> active) all route
// through this one transition function — ADR-002's "declared table, no silent fallthrough"
// discipline, mirrored from casting/repository.ts's transitionApplication.
export async function transitionResidentProfileStatus(
  context: SessionContext,
  residentProfileId: string,
  toStatus: ResidentProfileStatus,
  actor: Actor,
) {
  return withSessionContext(context, async (tx) => {
    const [current] = await tx
      .select()
      .from(residentProfile)
      .where(eq(residentProfile.id, residentProfileId));

    if (!current) {
      throw new Error(`ResidentProfile not found: ${residentProfileId}`);
    }

    const fromStatus = current.status;
    assertResidentProfileTransitionAllowed(fromStatus, toStatus);

    const patch: { status: ResidentProfileStatus; movedOutOn?: string | null } = { status: toStatus };
    if (toStatus === "moved_out") {
      patch.movedOutOn = new Date().toISOString().slice(0, 10);
    } else if (fromStatus === "moved_out") {
      // moved_out -> active (reactivation, U-27/U-30): clear the stale move-out date rather than
      // leaving it dangling on an otherwise-active profile.
      patch.movedOutOn = null;
    }

    const [updated] = await tx
      .update(residentProfile)
      .set(patch)
      .where(eq(residentProfile.id, residentProfileId))
      .returning();

    await recordActivityEvent(tx, {
      householdId: current.householdId,
      eventType: "resident_profile.status_changed",
      subjectType: "resident_profile",
      subjectId: residentProfileId,
      actorAccountId: actor.accountId,
      actorProfileId: actor.profileId,
      payload: { fromStatus, toStatus },
    });

    return updated;
  });
}

// The ONE deliberate RLS-bootstrap exception (drizzle/0005_identity_login_bootstrap_function.sql,
// G-C1/G-C2's "raw client only in repository.ts" rule is what keeps this call confined to this
// file): sign-in already verified `accountId` via Supabase Auth before calling this — there is no
// household_id to SET LOCAL yet, since discovering it is this call's entire purpose, so it
// deliberately does not go through withSessionContext. The SECURITY DEFINER function itself is the
// narrow, audited hole, not this call site.
export async function resolveAccountHousehold(accountId: string): Promise<string | null> {
  const rows = await db.execute<{ resolve_account_household: string | null }>(
    sql`SELECT resolve_account_household(${accountId}::uuid)`,
  );
  return rows[0]?.resolve_account_household ?? null;
}

export class HouseholdAccountCannotVoteError extends Error {
  constructor() {
    super("The household account cannot cast a vote (FR-1.7)");
    this.name = "HouseholdAccountCannotVoteError";
  }
}

// FR-1.7/AC-1.5: the household account shall not be able to cast a vote — the authorization check
// itself, not the Vote table (F3), which is what every vote-casting route calls before recording
// anything. Refuses by every route that would eventually call it, because there is exactly one
// such check, not one per route.
export async function assertAccountCanVote(context: SessionContext, accountId: string): Promise<void> {
  const membershipRow = await getMembershipForAccount(context, accountId);
  if (!membershipRow || !membershipRow.isResident) {
    throw new HouseholdAccountCannotVoteError();
  }
}

export class PermissionDeniedError extends Error {
  constructor(permission: string) {
    super(`Missing permission: ${permission}`);
    this.name = "PermissionDeniedError";
  }
}

// docs/domain/identity.md §2.1: manage_rooms is "vorbelegt bei household_admin und moderator" —
// the one permission with a documented role-based default. Every other permission is
// individually grantable only (C-1.3: orthogonal, no role hierarchy/presets) — household_admin
// implicitly has every permission regardless (it's the account that registered, C-1.4, not a
// security boundary), but a moderator otherwise needs a permission explicitly in the array.
const MODERATOR_DEFAULT_PERMISSIONS = new Set(["manage_rooms"]);

export async function assertHasPermission(
  context: SessionContext,
  accountId: string,
  permission: string,
): Promise<void> {
  const membershipRow = await getMembershipForAccount(context, accountId);
  if (!membershipRow) throw new PermissionDeniedError(permission);
  if (membershipRow.role === "household_admin") return;
  if (membershipRow.role === "moderator" && MODERATOR_DEFAULT_PERMISSIONS.has(permission)) return;
  if (!membershipRow.permissions.includes(permission)) {
    throw new PermissionDeniedError(permission);
  }
}

// A revoked Membership (removeMember) grants nothing — every permission/role check in this file
// routes through this one lookup, so the revocation takes effect everywhere at once rather than
// needing a repeated check at each call site.
export async function getMembershipForAccount(context: SessionContext, accountId: string) {
  return withSessionContext(context, async (tx) => {
    const [row] = await tx
      .select()
      .from(membership)
      .where(and(eq(membership.accountId, accountId), isNull(membership.revokedAt)));
    return row ?? null;
  });
}

// AC-1.6: "the interface states which identity I am signed in as." A household-account session
// (profileId null) states the household's name; a resident session states their display name.
export async function getIdentityLabel(context: SessionContext): Promise<string> {
  if (context.profileId === null) {
    const householdRow = await getHousehold(context);
    return householdRow ? `${householdRow.name} (administration)` : "Household administration";
  }
  return withSessionContext(context, async (tx) => {
    const [profile] = await tx
      .select({ displayName: residentProfile.displayName })
      .from(residentProfile)
      .where(eq(residentProfile.id, context.profileId as string));
    return profile?.displayName ?? "Resident";
  });
}

export async function getHousehold(context: SessionContext) {
  return withSessionContext(context, async (tx) => {
    const [row] = await tx.select().from(household).where(eq(household.id, context.householdId));
    return row ?? null;
  });
}

export async function getHouseholdSettings(context: SessionContext) {
  return withSessionContext(context, async (tx) => {
    const [row] = await tx
      .select()
      .from(householdSettings)
      .where(eq(householdSettings.householdId, context.householdId));
    return row ?? null;
  });
}

// Reconstructs a SessionContext from a Session row (cookie carries sessionId + householdId; see
// session-cookie.ts — householdId is not secret, C-1.4, so it's fine in a plain cookie value).
// accountId isn't yet known when this bootstrap read runs, so a throwaway value is used for it —
// no current RLS policy keys on app.account_id (only household_id and profile_id do), so this
// does not weaken any isolation guarantee; it only satisfies withSessionContext's own shape.
export async function resolveSessionContext(
  sessionId: string,
  householdId: string,
): Promise<SessionContext | null> {
  const bootstrap: SessionContext = { accountId: randomUUID(), householdId, profileId: null };
  return withSessionContext(bootstrap, async (tx) => {
    const [row] = await tx
      .select()
      .from(session)
      .where(
        and(
          eq(session.id, sessionId),
          eq(session.householdId, householdId),
          isNull(session.revokedAt),
          gt(session.expiresAt, new Date()),
        ),
      );
    if (!row) return null;
    return { accountId: row.accountId, householdId, profileId: row.actingProfileId };
  });
}

export type MembershipRole = "household_admin" | "moderator" | "member";

export type ResidentListEntry = {
  id: string;
  accountId: string | null; // null if the profile is still `prepared` (never claimed, no Account yet)
  displayName: string;
  joinDate: Date | null;
  status: ResidentProfileStatus;
  contactDetail: null; // no contact-detail field exists on ResidentProfile in F1's scope
  role: MembershipRole | null; // null alongside accountId === null (not yet claimed)
};

// FR-1.25/FR-1.26/FR-1.27 (revised 2026-09-17, U-30)/FR-1.29: full parity for administration AND
// a moderator — same rows, same actions (`canAct` is true for both) — refused entirely to anyone
// else. Per FR-1.27's "not reachable at all — by any route" for a non-moderator, non-admin caller.
export async function getResidentList(
  context: SessionContext,
  accountId: string,
): Promise<{ members: ResidentListEntry[]; canAct: boolean; isAdmin: boolean; leadWithJoinCode: boolean }> {
  const membershipRow = await getMembershipForAccount(context, accountId);
  const isAdmin = membershipRow?.role === "household_admin";
  const isModerator = membershipRow?.role === "moderator";
  if (!isAdmin && !isModerator) {
    throw new PermissionDeniedError("resident-list access requires administration or moderator");
  }

  return withSessionContext(context, async (tx) => {
    const rows = await tx
      .select({
        id: residentProfile.id,
        accountId: membership.accountId,
        displayName: residentProfile.displayName,
        joinDate: residentProfile.movedInOn,
        status: residentProfile.status,
        role: membership.role,
      })
      .from(residentProfile)
      .leftJoin(membership, eq(membership.residentProfileId, residentProfile.id))
      .where(eq(residentProfile.householdId, context.householdId));

    const members: ResidentListEntry[] = rows.map((r) => ({
      ...r,
      accountId: r.accountId ?? null,
      joinDate: r.joinDate ? new Date(r.joinDate) : null,
      contactDetail: null,
      role: r.role ?? null,
    }));

    // AC-1.22/FR-1.29: administration is the only member -> lead with the join-code action
    // instead of an empty list. "Only member" means no resident member exists yet.
    const leadWithJoinCode = isAdmin && members.length === 0;

    return { members, canAct: isAdmin || isModerator, isAdmin, leadWithJoinCode };
  });
}

export class ResidentListActionDeniedError extends Error {
  constructor() {
    super("Only administration or a moderator may act on the resident list (FR-1.27)");
    this.name = "ResidentListActionDeniedError";
  }
}

// FR-1.27 (revised 2026-09-17, U-30): full parity for administration AND moderator — the same
// actions, not a subset. `triggerSubjectAccessExport` below deliberately does NOT use this: FR-1.24
// names that action as administration's specifically, unaffected by U-30's resident-list parity.
async function assertIsAdministrationOrModerator(context: SessionContext, accountId: string): Promise<void> {
  const membershipRow = await getMembershipForAccount(context, accountId);
  if (!membershipRow || (membershipRow.role !== "household_admin" && membershipRow.role !== "moderator")) {
    throw new ResidentListActionDeniedError();
  }
}

export async function assertIsAdministration(context: SessionContext, accountId: string): Promise<void> {
  const membershipRow = await getMembershipForAccount(context, accountId);
  if (!membershipRow || membershipRow.role !== "household_admin") {
    throw new ResidentListActionDeniedError();
  }
}

// V-3 (docs/domain/invarianten.md §5.3): "moved_out" revokes access immediately — the Membership
// is revoked in the same step as the ResidentProfile transition, not left for a caller to
// remember separately. Shared by both removal tiers below (U-27): the soft path (an actual
// move-out, via transitionResidentProfileStatus) and the hard path (removeMember) both end here.
async function revokeMembershipForProfile(
  context: SessionContext,
  residentProfileId: string,
  eventType: "membership.revoked" | "membership.removed_as_intruder",
  actor: Actor,
): Promise<void> {
  await withSessionContext(context, async (tx) => {
    const [target] = await tx
      .select()
      .from(membership)
      .where(eq(membership.residentProfileId, residentProfileId));
    if (!target) return; // profile was never claimed (still `prepared`) — nothing to revoke

    await tx.update(membership).set({ revokedAt: new Date() }).where(eq(membership.id, target.id));

    await recordActivityEvent(tx, {
      householdId: context.householdId,
      eventType,
      subjectType: "membership",
      subjectId: target.id,
      actorAccountId: actor.accountId,
      actorProfileId: actor.profileId,
      payload: {},
    });
  });
}

export class DisplayNameConfirmationMismatchError extends Error {
  constructor() {
    super("The typed name does not match this member's display name (U-27)");
    this.name = "DisplayNameConfirmationMismatchError";
  }
}

// FR-1.26/U-27 hard tier ("Entfernen"): final, requires typing the exact display name (not a
// plain click), meant specifically for a person who joined falsely or maliciously via the join
// code — not for real move-outs, which go through transitionResidentProfileStatus's `moved_out`
// (the soft tier) instead. Full parity: administration or moderator (FR-1.27/U-30).
//
// Sets ResidentProfile.status to `moved_out` too (not a new status value — U-27 doesn't need a
// fourth ResidentProfile state, since the access/quorum consequence is identical to a real
// move-out; what distinguishes the two tiers is the confirmation friction and the audit trail,
// not a different data state). Purging their votes/applications from score (U-27's other half)
// has nothing to act on yet — Application/Vote don't exist until F3+; that purge is F3+'s job
// when those tables exist, not invented here ahead of them.
export async function removeMember(
  context: SessionContext,
  actingAccountId: string,
  targetAccountId: string,
  confirmDisplayName: string,
): Promise<void> {
  await assertIsAdministrationOrModerator(context, actingAccountId);
  const actor: Actor = { accountId: actingAccountId, profileId: null };

  const residentProfileId = await withSessionContext(context, async (tx) => {
    const [row] = await tx.select().from(membership).where(eq(membership.accountId, targetAccountId));
    if (!row) throw new Error(`Membership not found for account ${targetAccountId}`);
    if (!row.residentProfileId) throw new Error("Cannot remove an account with no resident profile");

    const [profile] = await tx
      .select()
      .from(residentProfile)
      .where(eq(residentProfile.id, row.residentProfileId));
    if (!profile) throw new Error(`ResidentProfile not found: ${row.residentProfileId}`);
    if (profile.displayName !== confirmDisplayName) {
      throw new DisplayNameConfirmationMismatchError();
    }

    return profile.id;
  });

  // Goes through the declared transition table (ADR-002) like every other status change, not a
  // raw UPDATE — active/prepared -> moved_out are both already-declared transitions.
  await transitionResidentProfileStatus(context, residentProfileId, "moved_out", actor);
  await revokeMembershipForProfile(context, residentProfileId, "membership.removed_as_intruder", actor);
}

// FR-1.26 soft tier ("moved_out"): the regular path for an actual move-out — votes/history stay
// (once F3+ has any), only the access consequence (V-3) is immediate, same as the hard tier.
export async function setMovedOut(
  context: SessionContext,
  actingAccountId: string,
  targetAccountId: string,
): Promise<void> {
  await assertIsAdministrationOrModerator(context, actingAccountId);
  const actor: Actor = { accountId: actingAccountId, profileId: null };

  const target = await withSessionContext(context, async (tx) => {
    const [row] = await tx.select().from(membership).where(eq(membership.accountId, targetAccountId));
    if (!row) throw new Error(`Membership not found for account ${targetAccountId}`);
    if (!row.residentProfileId) throw new Error("Cannot set moved_out on an account with no resident profile");
    return row;
  });

  await transitionResidentProfileStatus(context, target.residentProfileId!, "moved_out", actor);
  await revokeMembershipForProfile(context, target.residentProfileId!, "membership.revoked", actor);
}

// Reverses either removal tier: restores ResidentProfile to `active` (via the declared
// moved_out -> active transition) and un-revokes the Membership. One reactivate for both tiers,
// since both land in the same moved_out + revoked-Membership state (see removeMember above).
export async function reactivateMember(
  context: SessionContext,
  actingAccountId: string,
  targetAccountId: string,
): Promise<void> {
  await assertIsAdministrationOrModerator(context, actingAccountId);
  const actor: Actor = { accountId: actingAccountId, profileId: null };

  const target = await withSessionContext(context, async (tx) => {
    const [row] = await tx.select().from(membership).where(eq(membership.accountId, targetAccountId));
    if (!row) throw new Error(`Membership not found for account ${targetAccountId}`);
    return row;
  });

  if (target.residentProfileId) {
    await transitionResidentProfileStatus(context, target.residentProfileId, "active", actor);
  }

  await withSessionContext(context, async (tx) => {
    await tx.update(membership).set({ revokedAt: null }).where(eq(membership.id, target.id));

    await recordActivityEvent(tx, {
      householdId: context.householdId,
      eventType: "membership.reactivated",
      subjectType: "membership",
      subjectId: target.id,
      actorAccountId: actingAccountId,
      actorProfileId: null,
      payload: {},
    });
  });
}

// FR-1.31/U-30: every resident (any active ResidentProfile, moderator or not) can see current
// household members — display names only, `status = active` only (no moved_out/prepared), no
// actions, no contact detail, no join dates. A household account (profileId null) is refused —
// this is specifically a resident-to-resident view (screens/B-start.md B5), distinct from the
// administration resident list (FR-1.25-1.30) and the round participant list (FR-1.19); none of
// the three link to either other's data.
export async function getCurrentHouseholdMembers(context: SessionContext): Promise<{ displayName: string }[]> {
  if (context.profileId === null) {
    throw new PermissionDeniedError("the household members view requires an active resident profile (FR-1.31)");
  }
  return withSessionContext(context, (tx) =>
    tx
      .select({ displayName: residentProfile.displayName })
      .from(residentProfile)
      .where(and(eq(residentProfile.householdId, context.householdId), eq(residentProfile.status, "active"))),
  );
}

// FR-1.26: share/rotate the join code — full parity, administration or moderator (FR-1.27/U-30).
export async function rotateJoinCode(context: SessionContext, actingAccountId: string) {
  await assertIsAdministrationOrModerator(context, actingAccountId);
  return withSessionContext(context, async (tx) => {
    const [updated] = await tx
      .update(household)
      .set({ joinCode: randomUUID(), joinCodeRotatedAt: new Date() })
      .where(eq(household.id, context.householdId))
      .returning();

    await recordActivityEvent(tx, {
      householdId: context.householdId,
      eventType: "household.join_code_rotated",
      subjectType: "household",
      subjectId: context.householdId,
      actorAccountId: actingAccountId,
      actorProfileId: null,
      payload: {},
    });

    return updated;
  });
}

export class CannotChangeAdminRoleError extends Error {
  constructor() {
    super("The household_admin role cannot be changed via this action");
    this.name = "CannotChangeAdminRoleError";
  }
}

// EC-1.7 (Convergence): "administration may create a resident profile and appoint it moderator" —
// the appointment action that was never actually built. Administration-only, per EC-1.7's own
// wording ("administration may... appoint"), not moderator-parity like the resident-list actions
// FR-1.26 names. Toggles only between "member" and "moderator" — household_admin is the
// registering account's own role (C-1.4) and is never reassigned by this action.
export async function setMemberRole(
  context: SessionContext,
  actingAccountId: string,
  targetAccountId: string,
  toRole: "member" | "moderator",
): Promise<void> {
  await assertIsAdministration(context, actingAccountId);

  await withSessionContext(context, async (tx) => {
    const [target] = await tx.select().from(membership).where(eq(membership.accountId, targetAccountId));
    if (!target) throw new Error(`Membership not found for account ${targetAccountId}`);
    if (target.role === "household_admin") throw new CannotChangeAdminRoleError();

    const fromRole = target.role;
    if (fromRole === toRole) return;

    await tx.update(membership).set({ role: toRole }).where(eq(membership.id, target.id));

    await recordActivityEvent(tx, {
      householdId: context.householdId,
      eventType: "membership.role_changed",
      subjectType: "membership",
      subjectId: target.id,
      actorAccountId: actingAccountId,
      actorProfileId: null,
      payload: { fromRole, toRole },
    });
  });
}

// AC-1.16/FR-1.23: an account acting without an active resident profile reaches household
// administration only. This asserts the boundary for the entities F1 itself builds; F3–F5 add the
// same assertion at each new table as it lands (quickstart.md §4).
export function assertHasResidentProfile(context: SessionContext): void {
  if (context.profileId === null) {
    throw new PermissionDeniedError("this route requires an active resident profile (FR-1.23)");
  }
}

// AC-1.17/FR-1.24: administration may trigger a subject-access export without its contents being
// displayed to it. A stub — the export's actual content generation is compliance-feature scope,
// out of F1's acceptance criteria; this only proves the interface shape (a caller gets a handle,
// never the rendered content) that AC-1.17 requires.
export async function triggerSubjectAccessExport(
  context: SessionContext,
  actingAccountId: string,
  applicationId: string,
): Promise<{ exportId: string }> {
  await assertIsAdministration(context, actingAccountId);
  return { exportId: `export-${applicationId}-${Date.now()}` };
}

export async function revokeSession(context: SessionContext, sessionId: string): Promise<void> {
  await withSessionContext(context, (tx) =>
    tx.update(session).set({ revokedAt: new Date() }).where(eq(session.id, sessionId)),
  );
}

export { account, household, householdSettings, membership, residentProfile, session };
