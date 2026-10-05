import { randomInt, randomUUID } from "node:crypto";
import { and, desc, eq, gt, isNotNull, isNull, ne, notInArray, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { withSessionContext, type SessionContext } from "@/db/session-context";

// Mirrors casting/repository.ts's own `Tx` alias — kept in sync with withSessionContext's
// signature so a `...Tx` helper below can be composed under one outer transaction by callers
// that need more than one write to commit atomically (speckit-bug-fix
// identity-moveout-session-revocation-not-atomic).
type Tx = Parameters<Parameters<typeof withSessionContext>[1]>[0];
import { recordActivityEvent } from "@/modules/audit/repository";
import {
  account,
  household,
  householdSettings,
  joinCodeIssuance,
  MODERATOR_PERMISSIONS,
  membership,
  PERMISSIONS,
  type PermissionName,
  RESIDENT_PERMISSIONS,
  residentProfile,
  session,
} from "./schema";
import {
  assertResidentProfileTransitionAllowed,
  NAME_RELEASING_STATUSES,
  type ResidentProfileStatus,
} from "./transitions";

export interface Actor {
  accountId: string | null;
  profileId: string | null;
}

// FR-1.4 (amended 2026-09-22): display_name unique among profiles whose status is not in
// NAME_RELEASING_STATUSES (neither moved_out nor removed) within a household. Checked here (a
// friendly, named error) in addition to the DB's own partial unique index (T009) — the index is
// the enforcement of record; this is the readable error path AC-1.3 asks for.
export async function isDisplayNameTaken(
  context: SessionContext,
  displayName: string,
): Promise<boolean> {
  return withSessionContext(context, (tx) => isDisplayNameTakenTx(tx, context.householdId, displayName));
}

// The same check on a transaction the caller already holds. createResidentProfile used to call
// isDisplayNameTaken from inside its own transaction, which checked out a second pooled
// connection while still holding the first. Once every Supavisor server connection is held by
// such a caller, all of them wait for a second one that never comes free: a pool deadlock with no
// timeout, which showed up as `Test timed out in 60000ms` against flatmate-io-dev.
async function isDisplayNameTakenTx(tx: Tx, householdId: string, displayName: string): Promise<boolean> {
  const rows = await tx
    .select({ id: residentProfile.id })
    .from(residentProfile)
    .where(
      and(
        eq(residentProfile.householdId, householdId),
        eq(residentProfile.displayName, displayName),
        notInArray(residentProfile.status, [...NAME_RELEASING_STATUSES]),
      ),
    );
  return rows.length > 0;
}

export class DuplicateDisplayNameError extends Error {
  constructor(displayName: string) {
    super(`A resident profile named "${displayName}" already exists in this household`);
    this.name = "DuplicateDisplayNameError";
  }
}

// FR-1.3/FR-1.5 (amended 2026-10-01): the household account or a moderator creates a resident
// profile but never occupies it — the profile starts `prepared` (identity.md's "regulärer
// Zwischenzustand") until someone actually signs up against it (auth.ts's claim step, out of F1's
// acceptance scope per plan.md's T023). Authorized by the stored permission
// `create_resident_profile` (matrix row „ResidentProfile anlegen"), checked inside this write
// transaction with the caller's membership locked FOR SHARE (design D4).
export async function createResidentProfile(
  context: SessionContext,
  displayName: string,
  actor: Actor,
) {
  // G-C fix (2026-09-23 human decision): a null actor.accountId used to skip this check
  // entirely instead of refusing — a repository function's own authorization must hold
  // regardless of what a future caller passes. A null or foreign actor id is refused with the same
  // PermissionDeniedError as a missing permission, never a bypass (PR #19: authorization derives
  // from the session's own account).
  if (!actor.accountId || actor.accountId !== context.accountId) {
    throw new PermissionDeniedError("create_resident_profile");
  }
  return withSessionContext(context, async (tx) => {
    await assertHasPermissionTx(tx, context, "create_resident_profile");
    if (await isDisplayNameTakenTx(tx, context.householdId, displayName)) {
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
async function transitionResidentProfileStatusTx(
  tx: Tx,
  residentProfileId: string,
  toStatus: ResidentProfileStatus,
  actor: Actor,
) {
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
  } else if (toStatus === "active" && fromStatus === "moved_out") {
    // moved_out -> active (reactivation, U-27/U-30): clear the stale move-out date rather than
    // leaving it dangling on an otherwise-active profile. Deliberately NOT fired for
    // moved_out -> removed (design.md Decision 5): moved_out_on is a "Wohn-Tatsache"
    // (data-inventory.yml) and a moved-out-then-removed profile keeps the date it already had —
    // removal sets no date of its own, whether from active or from moved_out.
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
}

// A direct status change of a claimed profile is refused: it would leave the membership and the
// profile disagreeing. No value in the message.
export class ClaimedProfileTransitionError extends Error {
  readonly code = "claimed_profile_transition";
  constructor() {
    super(
      "A claimed resident profile changes status only through setMovedOut, removeMember or reactivateMember, which also revoke or restore its membership",
    );
    this.name = "ClaimedProfileTransitionError";
  }
}

export async function transitionResidentProfileStatus(
  context: SessionContext,
  residentProfileId: string,
  toStatus: ResidentProfileStatus,
  actor: Actor,
) {
  // G-C fix (2026-09-23 human decision): this export had NO authorization check at all — no
  // route calls it today (only display-name-uniqueness.test.ts, which needs it to move a
  // PREPARED profile with no account yet, so it cannot be replaced by setMovedOut), but it stays
  // exported and must be guarded like its siblings removeMember/setMovedOut/reactivateMember: by
  // the stored permission `manage_members` (matrix row „Mitglied entfernen / auf moved_out
  // setzen"), checked first inside the write transaction (design D4).
  if (!actor.accountId || actor.accountId !== context.accountId) {
    throw new PermissionDeniedError("manage_members");
  }
  return withSessionContext(context, async (tx) => {
    await assertHasPermissionTx(tx, context, "manage_members");
    // A claimed profile (one that has a membership row) moves out, is removed or comes back only
    // through the paths that also revoke or restore its membership. A status change alone would
    // leave a live membership acting for a moved-out person, or a revoked one for an active
    // person (V-3). A prepared profile has no membership yet, so it still moves here.
    if (toStatus === "moved_out" || toStatus === "removed" || toStatus === "active") {
      const [claimed] = await tx
        .select({ id: membership.id })
        .from(membership)
        .where(eq(membership.residentProfileId, residentProfileId));
      if (claimed) {
        const [current] = await tx
          .select({ status: residentProfile.status })
          .from(residentProfile)
          .where(eq(residentProfile.id, residentProfileId));
        if (toStatus !== "active" || (current && current.status !== "active")) {
          throw new ClaimedProfileTransitionError();
        }
      }
    }
    return transitionResidentProfileStatusTx(tx, residentProfileId, toStatus, actor);
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

// Copilot review round 5 (PR #23), FIX 1: signIn needs the DATABASE clock, read ONCE, BEFORE its
// own signInWithPassword call — so it can later refuse a sign-in whose password_changed_at
// generation is at or after this read, without ever mixing a JS Date into that comparison
// (CLAUDE.md: "compare in SQL or with the DB-returned values, never mixing JS clock and DB
// clock"). No household is known yet at that point in signIn (the household/resident_email input
// kinds only resolve one AFTER a successful signInWithPassword), so this needs no RLS/tenant
// context at all — same reasoning as resolveAccountHousehold's own bootstrap exception above,
// and the same import-boundary rule (G-C1/FR-0.1) is what confines the raw `db` call to this file.
export async function readDatabaseClock(): Promise<Date> {
  // drizzle-orm's postgres-js driver (drizzle/driver.js `construct()`) installs a "transparent"
  // parser for every timestamp-ish OID at the CONNECTION level, project-wide — it deliberately
  // wants raw SQL to hand back the wire-format STRING, not a driver-parsed Date, so that typed
  // queries (schema.ts's own `timestamp` columns) are the only place doing that conversion,
  // consistently, via their own column type. A raw `db.execute()` call with no schema mapping (no
  // `fields`/`customResultMapper`) therefore returns a plain postgres text value here — verified
  // directly against this connection, not assumed — so this parses it into a `Date` itself, the
  // same as drizzle's own `timestamp` column mapping would.
  const rows = await db.execute<{ now: string }>(sql`SELECT clock_timestamp() AS now`);
  return new Date(rows[0].now);
}

// join-code-protections (O-18) design.md Decision 3: the refusal type cannot carry a reason. A
// discriminated union of causes plus a rule that every caller collapse it makes correctness a
// matter of discipline at each call site; a type that never held the cause cannot leak it at any
// of them (FR-2.8). `null` is the only failure value on both functions below — no reason, no
// error subclass.
//
// resident-settings design.md Decision 4: every link now carries a purpose — 'join' is every link
// this table has ever held, 'password_reset' is the new administration-issued reset link
// (identity/password-reset). Kept as a plain string union here rather than imported from
// schema.ts's pgEnum: this type describes the SQL function's output column, not the Drizzle table.
export type JoinCodePurpose = "join" | "password_reset";

// join-by-link design.md Decision 13: `boundResidentProfile` carries the bound profile's id and
// display name when the resolved/claimed link names one, `null` for a neutral link — never a
// second lookup, since drizzle/0015's resolve_join_code/claim_join_code already LEFT JOIN
// resident_profile and return both columns in the same row.
export type JoinCodeResolution = {
  householdId: string;
  issuanceId: string;
  householdName: string;
  boundResidentProfile: { id: string; displayName: string } | null;
  purpose: JoinCodePurpose;
} | null;

type JoinCodeFunctionRow = {
  household_id: string;
  issuance_id: string;
  household_name: string;
  bound_resident_profile_id: string | null;
  bound_resident_display_name: string | null;
  purpose: JoinCodePurpose;
};

function toJoinCodeResolution(rows: JoinCodeFunctionRow[]): JoinCodeResolution {
  const row = rows[0];
  if (!row) return null;
  return {
    householdId: row.household_id,
    issuanceId: row.issuance_id,
    householdName: row.household_name,
    boundResidentProfile:
      row.bound_resident_profile_id && row.bound_resident_display_name
        ? { id: row.bound_resident_profile_id, displayName: row.bound_resident_display_name }
        : null,
    purpose: row.purpose,
  };
}

// The second deliberate RLS-bootstrap exception, alongside resolveAccountHousehold above: a
// stranger presenting a join code has no session yet — discovering the household IS what
// resolving the code is for. `resolve_join_code` (drizzle/0013_join_code_issuance.sql) is
// STABLE and non-consuming: FR-2.9 requires the household's name before any input is requested, so
// merely looking at a link must not spend one of its uses. Its comment carries the load-bearing
// caveat this call site cannot enforce itself: it is defensible only because FR-2.28's attempt
// limit (change 2) exists before any public route can reach it.
export async function resolveJoinCode(code: string): Promise<JoinCodeResolution> {
  const rows = await db.execute<JoinCodeFunctionRow>(
    sql`SELECT * FROM resolve_join_code(${normalizeJoinCode(code)})`,
  );
  return toJoinCodeResolution(rows);
}

// EC-2.1: the atomic claim. `claim_join_code` wraps design.md Decision 1's single conditional
// `UPDATE ... RETURNING` — one statement decides and counts, so of two concurrent calls on a
// single-use link exactly one succeeds; the loser gets the same `null` every other refusal
// produces (Decision 3).
//
// join-by-link design.md Decision 2: after this change, nothing under `src/` calls this
// standalone version — `joinHousehold` (auth.ts) uses `claimJoinCodeTx` below instead, so the
// claim runs inside the same transaction as the resident it creates. This one stays only for the
// three join-code tests that need a standalone statement — `join-code-atomicity.test.ts` races
// concurrent claims against each other, which is precisely what a Tx-scoped variant cannot do
// from outside its own (single) transaction.
// resident-settings design.md Decision 4: the caller now STATES which purpose it redeems — so a
// joining redemption can never spend a reset link and a reset redemption can never spend a joining
// one, and neither needs a rollback to find out (the SQL function's own WHERE filters on
// p_purpose). No default: every caller must say which purpose it means, deliberately, rather than
// silently redeeming whatever the code happens to be.
export async function claimJoinCode(code: string, purpose: JoinCodePurpose): Promise<JoinCodeResolution> {
  const rows = await db.execute<JoinCodeFunctionRow>(
    sql`SELECT * FROM claim_join_code(${normalizeJoinCode(code)}, ${purpose}::join_code_purpose)`,
  );
  return toJoinCodeResolution(rows);
}

// join-by-link design.md Decision 2: the Tx-scoped claim — runs `claim_join_code` on the caller's
// OWN transaction (not a fresh one), so a join's claim and its resident-creating inserts commit or
// roll back together. This is the SECOND exported `*Tx` primitive in this codebase, after
// `issueJoinCodeTx` below.
//
// ⚠ THIS FUNCTION PERFORMS NO AUTHORIZATION, and that is correct — do not "fix" it by adding one.
// A stranger presenting a join code with no session at all is this call's entire purpose; the
// control on it is the route's attempt limit (recordJoinAttempt), checked BEFORE any code lookup
// (AC-2.25), not an identity check here. Adding an assert here would be tautological: there is no
// identity yet to assert against.
export async function claimJoinCodeTx(
  tx: Tx,
  code: string,
  purpose: JoinCodePurpose,
): Promise<JoinCodeResolution> {
  const rows = await tx.execute<JoinCodeFunctionRow>(
    sql`SELECT * FROM claim_join_code(${normalizeJoinCode(code)}, ${purpose}::join_code_purpose)`,
  );
  return toJoinCodeResolution(rows);
}

// design.md Decision 3 (FR-2.28/EC-2.14): the join route's attempt limit. 15 minutes / 20
// attempts — generous enough that several flatmates behind one carrier NAT, each opening a link
// more than once, plus a hand-typed code mistyped a few times, never reach it; strict enough that
// a 10-character code over a 32-character alphabet (~1.1×10^15 codes) stays hopeless to guess even
// against 10,000 live links at once. Retention (24h) is enforced by record_join_attempt itself,
// not a separate job — see drizzle/0014_join_attempt.sql.
const JOIN_ATTEMPT_WINDOW_SECONDS = 15 * 60;
const JOIN_ATTEMPT_LIMIT = 20;

// The third deliberate RLS-bootstrap exception (after resolveAccountHousehold and
// resolveJoinCode/claimJoinCode above): a stranger presenting a code has no session, and rate
// limiting the attempt is the check that must run BEFORE any code lookup (AC-2.25 — "refused
// without being checked against any link"), so it cannot depend on one either.
// `record_join_attempt` (drizzle/0014_join_attempt.sql) prunes, records, counts and decides in one
// call — every attempt is recorded, including refused ones (design.md Decision 3).
export async function recordJoinAttempt(sourceHash: string): Promise<boolean> {
  const rows = await db.execute<{ record_join_attempt: boolean }>(
    sql`SELECT record_join_attempt(${sourceHash}, ${JOIN_ATTEMPT_WINDOW_SECONDS}, ${JOIN_ATTEMPT_LIMIT})`,
  );
  return rows[0]?.record_join_attempt ?? false;
}

export class HouseholdAccountCannotVoteError extends Error {
  constructor() {
    super("The household account cannot cast a vote (FR-1.7)");
    this.name = "HouseholdAccountCannotVoteError";
  }
}

// FR-1.7/AC-1.5: the household account shall not be able to cast a vote — the authorization check
// itself, not the Vote table. Called by deliberation's `castVote` inside its insert transaction,
// before anything is recorded. Refuses by every route that would eventually call it, because there
// is exactly one such check, not one per route.
//
// Matrix row „Vote abgeben / ändern": the stored permission `vote`, the resident set (a moderator
// who is also a resident holds it through that set; the household account and a moderator without
// a resident profile hold none). It reads the caller's live membership FOR SHARE in `tx`, so a
// move-out or a stripped `vote` committed first is seen and one in flight is waited for.
export async function assertAccountCanVoteTx(tx: Tx, context: SessionContext): Promise<void> {
  const row = await readLiveMembershipTx(tx, context, true);
  if (!row || !membershipHoldsPermission(row, "vote")) {
    throw new HouseholdAccountCannotVoteError();
  }
}

export class PermissionDeniedError extends Error {
  constructor(permission: string) {
    super(`Missing permission: ${permission}`);
    this.name = "PermissionDeniedError";
  }
}

// Roles are names for fixed sets of STORED permissions (design D3; human decisions 2026-09-28 and
// 2026-09-29: "The terms 'household' or 'moderator' should simply map to permissions; they
// shouldn't be a separate workaround for permissions / Backdoor for ignoring permissions."). The
// sets are HOUSEHOLD_/RESIDENT_/MODERATOR_PERMISSIONS in ./schema. Registration, joining and
// appointment store them; demotion, move-out and removal take them out again, in the same write
// (see setMemberRole, revokeMembershipForProfileTx, reactivateMember). drizzle/0024's CHECKs make
// a membership that disagrees with its roles a refused write. So this is the ONE rights
// mechanism: no role is read here, for the administering membership either. An individual grant
// (the matrix's ⬜) is an extra stored value beyond the role sets.
//
// The one place the rule lives: assertHasPermission and the transaction-scoped asserts below both
// call it. A live membership holds a permission iff it is stored on it.
export function membershipHoldsPermission(
  row: { permissions: readonly string[]; revokedAt: Date | null },
  permission: string,
): boolean {
  return row.revokedAt === null && row.permissions.includes(permission);
}

export async function assertHasPermission(
  context: SessionContext,
  accountId: string,
  permission: string,
): Promise<void> {
  // PR #19 review: authorization derives from the authenticated session, not from whatever
  // accountId a caller passes in — accountId must name the session's own account
  // (context.accountId), never an id supplied independently of it.
  if (accountId !== context.accountId) throw new PermissionDeniedError(permission);
  const membershipRow = await getMembershipForAccount(context, accountId);
  if (!membershipRow || !membershipHoldsPermission(membershipRow, permission)) {
    throw new PermissionDeniedError(permission);
  }
}

// D4 a: the in-transaction permission primitive. It reads the caller's LIVE membership FOR SHARE
// inside the transaction that also does the write, so a revocation or role change committed
// first is seen, and one in flight is waited for (FOR SHARE conflicts with every membership
// writer's row lock). assertHasPermission above reads in its own transaction and returns, which
// leaves a window before the caller's write; the older mutators keep that shape (see design
// Risks). Refuses when there is no live row, when the row's resident profile is not the one the
// session claims (a stale claim), or when the permission is not stored.
export async function assertHoldsAnyPermissionTx(
  tx: Tx,
  context: SessionContext,
  permissions: readonly string[],
  // A writer needs the row lock to serialize against revocation (D4 a). So does a read that
  // returns personal data (getOrganisationApplication). `lock: false` is only for a read that
  // returns nothing an ended membership could not see.
  options: { lock: boolean } = { lock: true },
): Promise<void> {
  const denied = () => new PermissionDeniedError(permissions.join(" | "));
  const row = await readLiveMembershipTx(tx, context, options.lock);
  if (!row) throw denied();
  if (!permissions.some((p) => membershipHoldsPermission(row, p))) throw denied();
}

// The same primitive for a rule that needs EVERY listed permission (a transition's `requires`,
// casting/transitions.ts). One read of the locked row checks them all, where one
// assertHasPermissionTx per entry would read the same row again for each (code review).
export async function assertHoldsAllPermissionsTx(
  tx: Tx,
  context: SessionContext,
  permissions: readonly string[],
): Promise<void> {
  const row = await readLiveMembershipTx(tx, context, true);
  const missing = permissions.find((p) => !row || !membershipHoldsPermission(row, p));
  if (!row || missing !== undefined) throw new PermissionDeniedError(missing ?? permissions.join(" & "));
}

// The caller's live membership, read inside the caller's transaction (FOR SHARE when `lock`), or
// null when there is none or its resident profile is not the one the session claims (a stale
// claim). Shared by the two in-transaction permission primitives above, so they cannot drift.
async function readLiveMembershipTx(tx: Tx, context: SessionContext, lock: boolean) {
  const query = tx
    .select()
    .from(membership)
    .where(and(eq(membership.accountId, context.accountId), isNull(membership.revokedAt)));
  const [row] = lock ? await query.for("share") : await query;
  if (!row || row.residentProfileId !== context.profileId) return null;
  return row;
}

export async function assertHasPermissionTx(
  tx: Tx,
  context: SessionContext,
  permission: string,
): Promise<void> {
  await assertHoldsAnyPermissionTx(tx, context, [permission]);
}

// Literal SQL text[] for a role set, computed inside an UPDATE so the union/difference happens on
// the locked row, never from an earlier unlocked read (design D3, pre-mortem 11). Values are
// single-quote-escaped and never bound parameters.
function permissionSet(values: readonly string[]) {
  if (values.length === 0) return sql.raw(`'{}'::text[]`);
  return sql.raw(`ARRAY[${values.map((v) => `'${v.replace(/'/g, "''")}'`).join(", ")}]::text[]`);
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

// resident-settings design.md Decision 8 (identity/account-settings): E1's own "current address, if
// any" read. Self-service, own account only — the account acted on is ALWAYS context.accountId,
// never a value the caller supplies (authorization-matrix.test.ts records this exemption). A
// household session (profileId null) is refused, same shape as every other resident-only path.
//
// Copilot review round 5 (PR #23), FIX 2: the profileId !== null check above is a claim the
// SESSION made at sign-in (ADR-013 — set once, never rewritten) and can go stale, exactly the same
// staleness changeResidentEmail/changeResidentPassword's own membership locks already guard
// against (auth.ts's big comments) — a move-out or a removal that commits AFTER this session's
// CurrentSession was read still carries a non-null profileId in the cookie. So this now joins
// membership on account_id = context.accountId, requiring a LIVE (revokedAt IS NULL) resident
// (isResident = true) membership, inside the same transaction as the account read — no lock is
// taken (this is a read, not a writer serializing against one), but the predicate itself is now
// the authoritative, non-stale one rather than trusting the session's own claim.
//
// Returns `null` rather than throwing PermissionDeniedError for this specific case (unlike the
// profileId === null branch above): E1's page (src/app/(resident)/account/page.tsx) calls this
// directly, with no try/catch, after its own profileId === null branch already returned its own
// fallback UI — a PermissionDeniedError thrown here would bubble past that page straight into
// (resident)/error.tsx's shared boundary (a generic "unexpected error" state, and every retry
// would throw again since the membership stays revoked). Returning null instead lets the existing
// render proceed exactly as it does for "no email yet" — no address is disclosed either way, and
// the page never crashes or shows an error state for what is, from the reader's side, simply "no
// current address to show".
export async function getOwnAccountEmail(context: SessionContext): Promise<string | null> {
  if (context.profileId === null) {
    throw new PermissionDeniedError("this reads a resident's own account only (identity/account-settings)");
  }
  return withSessionContext(context, async (tx) => {
    const [row] = await tx
      .select({ email: account.email })
      .from(account)
      .innerJoin(
        membership,
        and(
          eq(membership.accountId, account.id),
          isNull(membership.revokedAt),
          eq(membership.isResident, true),
        ),
      )
      .where(eq(account.id, context.accountId));
    return row?.email ?? null;
  });
}

// AC-1.6: "the interface states which identity I am signed in as." A household-account session
// (profileId null) states the household's name; a resident session states their display name.
//
// german-ui-vocabulary: returns structured data rather than a composed display string — the
// caller (currently only (org)/layout.tsx) resolves the German label from src/ui/strings, since a
// German literal may only live there, never in this module (tasks.md's sweep rule).
export type IdentityLabel =
  | { kind: "household"; householdName: string | null }
  | { kind: "resident"; displayName: string | null };

export async function getIdentityLabel(context: SessionContext): Promise<IdentityLabel> {
  if (context.profileId === null) {
    const householdRow = await getHousehold(context);
    return { kind: "household", householdName: householdRow?.name ?? null };
  }
  return withSessionContext(context, async (tx) => {
    const [profile] = await tx
      .select({ displayName: residentProfile.displayName })
      .from(residentProfile)
      .where(eq(residentProfile.id, context.profileId as string));
    return { kind: "resident", displayName: profile?.displayName ?? null };
  });
}

/// The four permissions that open the members list and make a caller a member administrator
// (design D1, "Reads"): any one of them shows the list and the navigation item, so a later
// decision that takes every one of them from a role takes the list with them, with no read to edit.
const MEMBER_ADMINISTRATION_PERMISSIONS = [
  "manage_members",
  "manage_join_codes",
  "create_resident_profile",
  "appoint_moderator",
] as const;

// start-screen design.md Decision 4 / role-permissions design D6, D9: decides what the resident
// frame's avatar menu, Start's moderation bridge and the organisation overview SHOW, and — through
// requireOrganisationAccess ((org)/organisation-access.ts) — whether an organisation page renders
// at all. Every flag derives from the caller's STORED permissions, never a role. Goes through
// getMembershipForAccount, so a revoked membership gives every flag `false` the same way every
// other check in this file already does. An unlocked read: it returns navigation booleans, and
// every action keeps its own in-transaction check.
//
// `organisation` = any stored permission outside the resident set, so `vote` alone never opens the
// organisation area; a retired name or an unknown string never counts (design D6). Change 5 builds
// the rest of the organisation guard on this same flag.
export async function getNavigationAccess(
  context: SessionContext,
): Promise<{ organisation: boolean; membersList: boolean; rooms: boolean; settings: boolean }> {
  const membershipRow = await getMembershipForAccount(context, context.accountId);
  if (!membershipRow) return { organisation: false, membersList: false, rooms: false, settings: false };

  const organisation = (Object.keys(PERMISSIONS) as PermissionName[]).some(
    (p) => !(RESIDENT_PERMISSIONS as readonly string[]).includes(p) && membershipHoldsPermission(membershipRow, p),
  );
  const membersList = MEMBER_ADMINISTRATION_PERMISSIONS.some((p) => membershipHoldsPermission(membershipRow, p));
  return {
    organisation,
    membersList,
    rooms: membershipHoldsPermission(membershipRow, "manage_rooms"),
    settings: membershipHoldsPermission(membershipRow, "manage_voting_procedure"),
  };
}

export async function getHousehold(context: SessionContext) {
  return withSessionContext(context, async (tx) => {
    const [row] = await tx.select().from(household).where(eq(household.id, context.householdId));
    return row ?? null;
  });
}

// O20 (the voting-procedure settings screen as built today): authorized by the stored permission
// `manage_voting_procedure` (matrix row „Abstimmungsverfahren ändern"; household ✅, moderator ⬜,
// so a moderator sees it only when individually granted it). The check lives HERE, not in the
// route: authorization is in the repository function (CLAUDE.md "A sibling entry"). It runs before
// the read's own transaction, never inside it: assertHasPermission opens its own, and nesting
// throws NestedSessionContextError. An unlocked read: the settings are what the holder may edit anyway.
export async function getHouseholdSettings(context: SessionContext) {
  await assertHasPermission(context, context.accountId, "manage_voting_procedure");
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
  // resident-settings design.md Decision 8 (data minimisation): the administration learns WHETHER
  // a profile's account has an email, for O16's "Passwort-Link erstellen" row action — never the
  // address itself. `false` alongside accountId === null (not yet claimed, no Account to carry one).
  hasEmail: boolean;
};

export type ResidentListResult = {
  members: ResidentListEntry[];
  // One flag per permission-gated control the members screen offers (design D6), each derived from
  // the caller's stored permissions on one locked read. The screen decides what to show from these
  // alone; it never reads the caller's role.
  canManageMembers: boolean;
  canManageJoinCodes: boolean;
  canCreateProfile: boolean;
  canAppointModerator: boolean;
  canIssueResetLink: boolean;
  leadWithJoinCode: boolean;
};

// FR-1.25/FR-1.26/FR-1.27 (revised 2026-09-17, U-30; permission-based since F3 change 2b): the list
// is returned to a caller holding ANY member-administration permission (manage_members,
// manage_join_codes, create_resident_profile, appoint_moderator) — the household account and a
// moderator today — and refused entirely to anyone else, per FR-1.27's "not reachable at all — by
// any route". Who holds which is the Rechtematrix's decision, so a later move needs no edit here.
//
// Hardening (audit finding #1, the PR #19 hole): `accountId` must be the session's own account. A
// caller used to be able to name another account's id and borrow its rights. It is refused with
// the same denial as a missing permission, and the rows are never read. The check and the flags
// come from ONE locked read of the caller's row (readLiveMembershipTx, FOR SHARE: the list returns
// personal data), so a demotion committed first is seen and the rule stays in
// membershipHoldsPermission alone.
//
// FR-1.25/FR-1.26 as amended 2026-09-22 (human decision): a REMOVED member is excluded here —
// unlike moved_out, which stays listed with "Ausgezogen" and a reactivate action. The audit trail
// still carries the record (FR-1.30/AC-1.23 unchanged); this is only the resident list.
export async function getResidentList(
  context: SessionContext,
  accountId: string,
): Promise<ResidentListResult> {
  if (accountId !== context.accountId) {
    throw new PermissionDeniedError(MEMBER_ADMINISTRATION_PERMISSIONS.join(" | "));
  }
  return withSessionContext(context, async (tx) => {
    const callerRow = await readLiveMembershipTx(tx, context, true);
    if (!callerRow || !MEMBER_ADMINISTRATION_PERMISSIONS.some((p) => membershipHoldsPermission(callerRow, p))) {
      throw new PermissionDeniedError(MEMBER_ADMINISTRATION_PERMISSIONS.join(" | "));
    }
    const canManageJoinCodes = membershipHoldsPermission(callerRow, "manage_join_codes");

    const rows = await tx
      .select({
        id: residentProfile.id,
        accountId: membership.accountId,
        displayName: residentProfile.displayName,
        joinDate: residentProfile.movedInOn,
        status: residentProfile.status,
        role: membership.role,
        accountEmail: account.email,
      })
      .from(residentProfile)
      .leftJoin(membership, eq(membership.residentProfileId, residentProfile.id))
      .leftJoin(account, eq(account.id, membership.accountId))
      .where(
        and(eq(residentProfile.householdId, context.householdId), ne(residentProfile.status, "removed")),
      );

    const members: ResidentListEntry[] = rows.map((r) => ({
      id: r.id,
      displayName: r.displayName,
      status: r.status,
      accountId: r.accountId ?? null,
      joinDate: r.joinDate ? new Date(r.joinDate) : null,
      contactDetail: null,
      role: r.role ?? null,
      hasEmail: r.accountEmail !== null,
    }));

    return {
      members,
      canManageMembers: membershipHoldsPermission(callerRow, "manage_members"),
      canManageJoinCodes,
      canCreateProfile: membershipHoldsPermission(callerRow, "create_resident_profile"),
      canAppointModerator: membershipHoldsPermission(callerRow, "appoint_moderator"),
      canIssueResetLink: membershipHoldsPermission(callerRow, "issue_password_reset_link"),
      // AC-1.22/FR-1.29: no resident member exists yet -> lead with the join-link action instead of
      // an empty list. A moderator always sees at least its own profile, so "no resident yet"
      // needs no role (design D6).
      leadWithJoinCode: canManageJoinCodes && members.length === 0,
    };
  });
}

// V-3 (docs/domain/invarianten.md §5.3): "moved_out" revokes access immediately — the Membership
// AND any Session already issued for the account are revoked in the same step as the
// ResidentProfile transition, not left for a caller to remember separately (a still-valid Session
// would otherwise go on resolving to this profile regardless of Membership.revokedAt). Shared by
// both removal tiers below (U-27): the soft path (an actual move-out, via
// transitionResidentProfileStatus) and the hard path (removeMember) both end here.
// speckit-bug-fix identity-moveout-session-revocation-not-atomic: split into a `Tx` helper (no
// `withSessionContext` of its own) so setMovedOut/removeMember can compose it under the same
// outer transaction as transitionResidentProfileStatusTx — the status update, the
// membership/session revocation, and both audit writes now commit or roll back together instead
// of as two independent commits.
//
// design.md Decision 5: removeMember can now be called on an ALREADY moved-out member (Decision 1
// of that same design — a moved_out profile can still be removed). Its membership is already
// revoked, and `isNull(membership.revokedAt)` on the UPDATE below leaves that original
// revocation timestamp untouched rather than overwriting it with a later one — the audit event is
// still ALWAYS written, so `membership.removed_as_intruder` reliably distinguishes the hard tier
// in the trail (FR-1.30) even when the SET itself was a no-op.
//
// LOCK ORDER (role-permissions pre-mortem M9): every in-transaction permission check takes
// S(caller membership) first, and castVote does the same before the vote_guard trigger takes S on
// the profile. So one order everywhere: membership, then profile, then round/participation
// (drizzle/0028's trigger). The callers below therefore lock the TARGET membership FOR UPDATE
// before they update the target's profile; the read here repeats it (same transaction, no cost).
async function revokeMembershipForProfileTx(
  tx: Tx,
  context: SessionContext,
  residentProfileId: string,
  eventType: "membership.revoked" | "membership.removed_as_intruder",
  actor: Actor,
): Promise<void> {
  const [target] = await tx
    .select()
    .from(membership)
    .where(eq(membership.residentProfileId, residentProfileId))
    .for("update");
  if (!target) return; // profile was never claimed (still `prepared`) — nothing to revoke

  // Losing the resident status and the moderator role is part of the revocation (design D3):
  // role -> member and every stored permission cleared, in this one UPDATE on the one row.
  await tx
    .update(membership)
    .set({ revokedAt: new Date(), role: "member", permissions: [] })
    .where(and(eq(membership.id, target.id), isNull(membership.revokedAt)));

  // V-3: a pre-existing session must stop working immediately, not just at its next
  // resolveSessionContext-independent check — revoking the Membership alone leaves any session
  // already issued for this account still resolving (session.revokedAt is a separate column).
  await tx
    .update(session)
    .set({ revokedAt: new Date() })
    .where(and(eq(session.accountId, target.accountId), isNull(session.revokedAt)));

  await recordActivityEvent(tx, {
    householdId: context.householdId,
    eventType,
    subjectType: "membership",
    subjectId: target.id,
    actorAccountId: actor.accountId,
    actorProfileId: actor.profileId,
    payload: {},
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
// (the soft tier) instead. Authorized by the stored permission `manage_members` (matrix row
// „Mitglied entfernen / auf moved_out setzen"; the household account and a moderator, FR-1.27/U-30),
// checked first inside the write transaction with the caller's membership locked FOR SHARE.
//
// Sets ResidentProfile.status to `removed` (human decision, 2026-09-22): a fourth state, final —
// `transitions.ts` declares no transition out of it, and drizzle/0017's trigger refuses one even
// against a direct database update under app_runtime. Callable on an `active` OR a `moved_out`
// profile (both `active -> removed` and `moved_out -> removed` are declared), so a moderator who
// used the soft tier first does not have to reactivate before reaching the hard one. Purging
// their votes/applications from score (U-27's other half) is F5's: votes now exist (F4) and are
// kept on removal, and excluding a removed member's votes from the score and the log belongs to
// the score computation (docs/review-log.md, "U-27: Stimmen entfernter Mitglieder"). `removed` is
// the state that exclusion will key on.
export async function removeMember(
  context: SessionContext,
  actingAccountId: string,
  targetAccountId: string,
  confirmDisplayName: string,
): Promise<void> {
  if (actingAccountId !== context.accountId) throw new PermissionDeniedError("manage_members");
  const actor: Actor = { accountId: actingAccountId, profileId: context.profileId };

  // speckit-bug-fix identity-moveout-session-revocation-not-atomic: the lookup/confirmation
  // check, the status transition, and the membership/session revocation now share one
  // transaction — previously each was its own withSessionContext call, so a failure between them
  // (e.g. while revoking the session) could leave a `removed` profile with a still-usable
  // session, violating V-3.
  await withSessionContext(context, async (tx) => {
    await assertHasPermissionTx(tx, context, "manage_members");
    // Target membership FOR UPDATE before the profile is touched: membership, then profile (see
    // revokeMembershipForProfileTx's lock order).
    const [row] = await tx
      .select()
      .from(membership)
      .where(eq(membership.accountId, targetAccountId))
      .for("update");
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

    // Goes through the declared transition table (ADR-002) like every other status change, not a
    // raw UPDATE — active -> removed and moved_out -> removed are both declared transitions;
    // removed -> anything is not, so a second removal call on an already-removed profile throws
    // InvalidResidentProfileTransitionError instead of silently no-op'ing.
    await transitionResidentProfileStatusTx(tx, profile.id, "removed", actor);
    await revokeMembershipForProfileTx(tx, context, profile.id, "membership.removed_as_intruder", actor);
  });
}

export class ResidentProfileNotPreparedError extends Error {
  constructor(residentProfileId: string) {
    super(`ResidentProfile ${residentProfileId} is not a prepared profile of this household`);
    this.name = "ResidentProfileNotPreparedError";
  }
}

// Deletes a PREPARED profile (created, never claimed): prepared -> removed, final, name released.
// Authorized by `manage_members`, checked first inside the write transaction. The profile row is
// locked, and claiming's own conditional `prepared` UPDATE serializes against it: one of the two
// sees a non-prepared row and refuses. Live links bound to the profile are deleted in the same
// transaction (they would be refused at redemption anyway; this keeps O16 honest).
export async function removePreparedProfile(
  context: SessionContext,
  actingAccountId: string,
  residentProfileId: string,
): Promise<void> {
  if (actingAccountId !== context.accountId) throw new PermissionDeniedError("manage_members");
  const actor: Actor = { accountId: actingAccountId, profileId: context.profileId };
  await withSessionContext(context, async (tx) => {
    await assertHasPermissionTx(tx, context, "manage_members");
    const [profile] = await tx
      .select({ id: residentProfile.id, status: residentProfile.status })
      .from(residentProfile)
      .where(
        and(eq(residentProfile.id, residentProfileId), eq(residentProfile.householdId, context.householdId)),
      )
      .for("update");
    const [claimed] = await tx
      .select({ id: membership.id })
      .from(membership)
      .where(eq(membership.residentProfileId, residentProfileId));
    if (!profile || profile.status !== "prepared" || claimed) {
      throw new ResidentProfileNotPreparedError(residentProfileId);
    }
    await transitionResidentProfileStatusTx(tx, residentProfileId, "removed", actor);
    // Same event deleteJoinCode writes, one per link: a link going dead is audited either way.
    const deletedLinks = await tx
      .update(joinCodeIssuance)
      .set({ deletedAt: new Date() })
      .where(
        and(
          eq(joinCodeIssuance.householdId, context.householdId),
          eq(joinCodeIssuance.residentProfileId, residentProfileId),
          isNull(joinCodeIssuance.deletedAt),
        ),
      )
      .returning({ id: joinCodeIssuance.id });
    for (const link of deletedLinks) {
      await recordActivityEvent(tx, {
        householdId: context.householdId,
        eventType: "household.join_code_deleted",
        subjectType: "join_code_issuance",
        subjectId: link.id,
        actorAccountId: actingAccountId,
        actorProfileId: context.profileId,
        payload: {},
      });
    }
  });
}

// FR-1.26 soft tier ("moved_out"): the regular path for an actual move-out — votes/history stay
// (once F3+ has any), only the access consequence (V-3) is immediate, same as the hard tier.
// Authorized by `manage_members`, checked first inside the write transaction (design D4); a
// demotion or removal of the caller that commits first is seen, and one in flight is waited for.
export async function setMovedOut(
  context: SessionContext,
  actingAccountId: string,
  targetAccountId: string,
): Promise<void> {
  if (actingAccountId !== context.accountId) throw new PermissionDeniedError("manage_members");
  const actor: Actor = { accountId: actingAccountId, profileId: context.profileId };

  // speckit-bug-fix identity-moveout-session-revocation-not-atomic: one shared transaction — see
  // removeMember above for why (V-3 requires the status change and the revocation to commit or
  // roll back together).
  await withSessionContext(context, async (tx) => {
    await assertHasPermissionTx(tx, context, "manage_members");
    const [row] = await tx
      .select()
      .from(membership)
      .where(eq(membership.accountId, targetAccountId))
      .for("update");
    if (!row) throw new Error(`Membership not found for account ${targetAccountId}`);
    if (!row.residentProfileId) throw new Error("Cannot set moved_out on an account with no resident profile");

    await transitionResidentProfileStatusTx(tx, row.residentProfileId, "moved_out", actor);
    await revokeMembershipForProfileTx(tx, context, row.residentProfileId, "membership.revoked", actor);
  });
}

// Reverses the SOFT tier only (moved_out -> active, the one transition transitions.ts declares
// out of moved_out): restores ResidentProfile to `active` and un-revokes the Membership. A
// `removed` profile has no declared way out — the Tx-scoped transition below throws
// InvalidResidentProfileTransitionError, and because the lookup, the transition attempt, the
// un-revoke and the audit write now all share ONE transaction (final-member-removal tasks.md 4.4,
// replacing the previous two-part standalone-transition-then-separate-transaction split), that
// throw rolls back everything: the membership stays revoked, no "reactivated" event is written,
// and the caller sees the same error a raw removed -> active attempt would produce.
// Authorized by `manage_members`, checked first inside the write transaction (design D4).
export async function reactivateMember(
  context: SessionContext,
  actingAccountId: string,
  targetAccountId: string,
): Promise<void> {
  if (actingAccountId !== context.accountId) throw new PermissionDeniedError("manage_members");
  const actor: Actor = { accountId: actingAccountId, profileId: context.profileId };

  await withSessionContext(context, async (tx) => {
    await assertHasPermissionTx(tx, context, "manage_members");
    // Target membership FOR UPDATE before its profile changes: the same lock order as the revoke paths.
    const [target] = await tx
      .select()
      .from(membership)
      .where(eq(membership.accountId, targetAccountId))
      .for("update");
    if (!target) throw new Error(`Membership not found for account ${targetAccountId}`);

    if (target.residentProfileId) {
      await transitionResidentProfileStatusTx(tx, target.residentProfileId, "active", actor);
    }

    // A reactivated member holds the resident set as a member (design D3). A former moderator is
    // appointed again, visibly, rather than silently regaining the role.
    await tx
      .update(membership)
      .set({ revokedAt: null, role: "member", permissions: [...RESIDENT_PERMISSIONS] })
      .where(eq(membership.id, target.id));

    await recordActivityEvent(tx, {
      householdId: context.householdId,
      eventType: "membership.reactivated",
      subjectType: "membership",
      subjectId: target.id,
      actorAccountId: actingAccountId,
      actorProfileId: context.profileId,
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

// FR-2.26 / domain/identity.md §2.1's sixth condition on the code: short, upper case, two groups
// of five, drawn from an alphabet without easily confused characters (no I/O/0/1) — P-1
// Kanalneutralität requires that anything arriving by link can also be entered by hand.
const JOIN_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const JOIN_CODE_GROUP_LENGTH = 5;

function randomJoinCodeGroup(): string {
  let group = "";
  for (let i = 0; i < JOIN_CODE_GROUP_LENGTH; i++) {
    group += JOIN_CODE_ALPHABET[randomInt(JOIN_CODE_ALPHABET.length)];
  }
  return group;
}

export function generateJoinCode(): string {
  return `${randomJoinCodeGroup()}-${randomJoinCodeGroup()}`;
}

// G-A5/AC-2.18: the code is a URL PATH SEGMENT, never a query parameter, on EVERY route that
// builds an invite link — a pure function so the shape is directly testable
// (join-code-never-in-query-or-log.test.ts) without rendering the members screen that calls it.
export function buildJoinUrl(host: string | null, code: string): string {
  return host ? `https://${host}/join/${code}` : `/join/${code}`;
}

// design.md Decision 4 (EC-2.15/AC-2.24): upper-case, strip every whitespace character and every
// "-", then re-insert the separator between the two groups of five so the result matches the
// stored shape exactly — applied inside resolveJoinCode/claimJoinCodeTx so both entry paths (the
// URL and the form body) normalise identically and no call site can forget. Injective over
// JOIN_CODE_ALPHABET: that alphabet already excludes I/O/0/1, so there is no confusable pair to
// fold and upper-casing/stripping separators cannot map two distinct issued codes onto one
// another. NEVER throws — a wrong-length input is normalised and simply matches nothing at lookup
// (FR-2.8's single refusal, not a second observable outcome).
export function normalizeJoinCode(input: string): string {
  const stripped = input.toUpperCase().replace(/[\s-]/g, "");
  if (stripped.length !== JOIN_CODE_GROUP_LENGTH * 2) return stripped;
  return `${stripped.slice(0, JOIN_CODE_GROUP_LENGTH)}-${stripped.slice(JOIN_CODE_GROUP_LENGTH)}`;
}

// join-screen design.md Decision 3 (FR-2.27/EC-2.15): the one definition of "a string that could be
// a code at all" — two groups of five JOIN_CODE_ALPHABET characters joined by a hyphen, built from
// the SAME alphabet and group length normalizeJoinCode/generateJoinCode already use, so it can never
// drift into judging a shape the generator does not produce. It is a UX hint (refuse before any
// lookup, AC-2.24), but it is also load-bearing for I2: the alphabet excludes `/`, `.`, `%`, `?` and
// `#`, so a string this returns true for is, by construction, exactly one URL path segment — which
// is what makes `buildJoinUrl(null, normalised)` safe to call on it without ever encoding. Callers
// always pass the ALREADY-NORMALISED string (normalizeJoinCode's output), never raw user input.
const JOIN_CODE_SHAPE = new RegExp(
  `^[${JOIN_CODE_ALPHABET}]{${JOIN_CODE_GROUP_LENGTH}}-[${JOIN_CODE_ALPHABET}]{${JOIN_CODE_GROUP_LENGTH}}$`,
);

export function isWellFormedJoinCode(normalised: string): boolean {
  return JOIN_CODE_SHAPE.test(normalised);
}

const POSTGRES_UNIQUE_VIOLATION = "23505";

function isUniqueViolation(err: unknown): boolean {
  return typeof err === "object" && err !== null && "code" in err && (err as { code?: unknown }).code === POSTGRES_UNIQUE_VIOLATION;
}

export interface IssueJoinCodeOptions {
  validDays: number;
  maxUses: number;
  // join-by-link design.md Decision 13: names one prepared resident profile of the SAME household
  // to bind the link to — omitted or undefined for an ordinary neutral link. issueJoinCodeTx
  // verifies both conditions (same household, status "prepared") before it ever reaches the
  // insert; a bound link is always issued with maxUses forced to 1 regardless of what is passed.
  residentProfileId?: string;
  // resident-settings design.md Decision 4/6: internal-only — omitted (defaults to 'join') for
  // every ordinary invitation. 'password_reset' reaches this function only through
  // issuePasswordResetLink below; issueJoinCode's own public options type (below) has no such
  // field at all, so a route can never mint a reset link by passing this in directly.
  purpose?: JoinCodePurpose;
}

// The public, route-reachable shape of IssueJoinCodeOptions — omits `purpose` entirely (D6:
// "issueJoinCode's public options type stays without purpose"), so the only way to mint a
// password-reset link is issuePasswordResetLink below, never issueJoinCode with a crafted option.
export type PublicIssueJoinCodeOptions = Omit<IssueJoinCodeOptions, "purpose">;

export class ResidentProfileNotEligibleForBindingError extends Error {
  constructor(residentProfileId: string) {
    super(
      `ResidentProfile ${residentProfileId} cannot be bound to a join link: not found in this household, or not "prepared"`,
    );
    this.name = "ResidentProfileNotEligibleForBindingError";
  }
}

// ⚠ THIS FUNCTION PERFORMS NO AUTHORIZATION. Do not call it from anything reachable by a request.
//
// Use `issueJoinCode` (below) for that — it is the entry point that checks the stored permission
// `manage_join_codes`, which only the household account and a moderator hold (FR-1.27/U-30), and
// nobody else has any access at all. Calling this one from a route or a server
// action is an authorization bypass (G-C), and it will look like perfectly ordinary code.
//
// The one legitimate caller is `registerHousehold` (auth.ts), and it is legitimate for a reason
// that does not generalise: at the point it mints the founding link there is nobody to authorize.
// The Membership row does not exist yet (it is inserted a few lines later), the Account row does
// not either, and the caller *is* the code creating the household. Asking "does this account have
// rights in a household that does not exist yet?" is a category error, not a security check —
// which is why this function omits the check rather than being handed a weaker one.
//
// Note also that of the five `*Tx` primitives in this codebase, this is the ONLY exported one —
// transitionResidentProfileStatusTx, revokeMembershipForProfileTx, insertDraftRoundTx and
// openRoundTx all stay file-private, because each is composed only by functions sharing its file.
// This one is exported solely because `registerHousehold` lives in auth.ts, and that export is the
// entire risk the warning above is about. If a future refactor lets registerHousehold reach the
// authorized path instead, delete the export rather than keeping it "just in case".
//
// Tx-scoped core of issueJoinCode below, factored out so registerHousehold (auth.ts) can mint the
// founding link through the SAME code path — generation, the retry-on-collision loop, and the
// audit write — inside its own already-open transaction, rather than reaching for the public
// issueJoinCode function. That function opens its own transaction and requires an existing
// Membership (to check `manage_join_codes` against), neither of which holds yet at the point in
// registerHousehold's transaction where the founding link is created (the household_admin
// Membership row hasn't been inserted yet, and a second nested withSessionContext transaction
// would not see this transaction's uncommitted rows anyway). Uniqueness comes from the table's own
// UNIQUE constraint plus retry on violation (design.md Decision 7), never a pre-check — a
// read-then-insert has the same race as the read-then-update Decision 1 rejected for claiming. A
// SAVEPOINT (not a fresh transaction) is what lets a collision retry without aborting the rest of
// the caller's transaction.
//
// resident-settings design.md Decision 6: `options.purpose` defaults to 'join'. For 'join' with a
// residentProfileId, the `prepared` check below still applies — an invitation may only bind a
// profile that hasn't been claimed yet. For 'password_reset' the check is SKIPPED: the public
// caller (issuePasswordResetLink) has already verified the profile is `active`, its membership is
// live, and its account has no email, inside the SAME transaction as this insert — re-deriving
// that check here would just be the same read twice. Either purpose with a residentProfileId set
// forces maxUses to 1 (a reset link is single-use by the same rule a bound invitation already is).
export async function issueJoinCodeTx(
  tx: Tx,
  householdId: string,
  actingAccountId: string,
  // The acting session's profile (null only when the household account acts), written to the audit
  // event as actor_profile_id. Required, so no caller can forget it.
  actingProfileId: string | null,
  options: IssueJoinCodeOptions,
): Promise<typeof joinCodeIssuance.$inferSelect> {
  const expiresAt = new Date(Date.now() + options.validDays * 24 * 60 * 60 * 1000);
  const purpose: JoinCodePurpose = options.purpose ?? "join";

  // join-by-link design.md Decision 13: a bound link names one prepared profile of THIS
  // household — verified here, before any row is written, rather than trusted from the caller.
  // "belongs to this household" and "is prepared" are both checked in one read: a profile of
  // another household, an already-active/moved-out profile, or an id that doesn't exist at all
  // all fail the same way (ResidentProfileNotEligibleForBindingError), never a distinguishable
  // reason — nothing downstream of this function needs to tell them apart. A bound link is
  // ALWAYS single-use (spec.md "A link may name the person it was issued for": "SHALL carry a
  // maximum of one redemption"), regardless of what options.maxUses says.
  let maxUses = options.maxUses;
  if (options.residentProfileId) {
    if (purpose === "join") {
      const [profile] = await tx
        .select({ id: residentProfile.id })
        .from(residentProfile)
        .where(
          and(
            eq(residentProfile.id, options.residentProfileId),
            eq(residentProfile.householdId, householdId),
            eq(residentProfile.status, "prepared"),
          ),
        );
      if (!profile) throw new ResidentProfileNotEligibleForBindingError(options.residentProfileId);
    }
    maxUses = 1;
  }

  for (;;) {
    const code = generateJoinCode();
    await tx.execute(sql`SAVEPOINT join_code_issue`);
    try {
      const [row] = await tx
        .insert(joinCodeIssuance)
        .values({
          householdId,
          code,
          expiresAt,
          maxUses,
          createdByAccountId: actingAccountId,
          residentProfileId: options.residentProfileId ?? null,
          purpose,
        })
        .returning();
      await tx.execute(sql`RELEASE SAVEPOINT join_code_issue`);

      // household.join_code_issued (audit/repository.ts PAYLOAD_ALLOWLIST): empty payload — the
      // code itself must never enter one (G-A5).
      await recordActivityEvent(tx, {
        householdId,
        eventType: "household.join_code_issued",
        subjectType: "join_code_issuance",
        subjectId: row.id,
        actorAccountId: actingAccountId,
        actorProfileId: actingProfileId,
        payload: {},
      });

      return row;
    } catch (err) {
      if (isUniqueViolation(err)) {
        await tx.execute(sql`ROLLBACK TO SAVEPOINT join_code_issue`);
        continue; // collide -> mint a fresh code, retry
      }
      throw err;
    }
  }
}

// FR-2.1/FR-2.3/FR-2.4/FR-2.26/FR-1.27 (U-30 parity): mints and stores a new link — issuing never
// edits an existing one (design.md Decision 6: "ein ausgestellter Link ... wird nachträglich nicht
// umgeschrieben"). Authorized by the stored permission `manage_join_codes` (matrix row
// „Beitrittscode erzeugen / löschen"), checked first inside the transaction that inserts the link
// (design D4); issueJoinCodeTx itself stays ungated for registerHousehold.
export async function issueJoinCode(
  context: SessionContext,
  actingAccountId: string,
  options: PublicIssueJoinCodeOptions,
): Promise<typeof joinCodeIssuance.$inferSelect> {
  if (actingAccountId !== context.accountId) throw new PermissionDeniedError("manage_join_codes");
  return withSessionContext(context, async (tx) => {
    await assertHasPermissionTx(tx, context, "manage_join_codes");
    return issueJoinCodeTx(tx, context.householdId, actingAccountId, context.profileId, options);
  });
}

export class ResidentProfileNotEligibleForResetError extends Error {
  constructor(residentProfileId: string) {
    super(
      `ResidentProfile ${residentProfileId} is not eligible for a password-reset link: not an ` +
        `active, live member of this household, or its account already has an email`,
    );
    this.name = "ResidentProfileNotEligibleForResetError";
  }
}

// resident-settings design.md Decision 6 (O-16, human decision 2026-09-24): the household
// account — and ONLY the household account, proposal Assumption 5 — may issue a single-use
// password-reset link for an ACTIVE profile of its own household whose account has no email yet.
// One class, no distinguishable reason (the issueJoinCodeTx precedent above): a prepared,
// moved-out or removed profile, a revoked membership, and a profile whose account already has an
// email all refuse identically.
//
// Deliberately unserialized against a concurrent email add (design.md's "What serializes the
// check-then-insert: nothing, deliberately") — an email added right after this check makes the
// resulting link dead at resolve and at claim time (drizzle/0019's predicate, redeemPasswordReset's
// own re-check), so a stale link this function issues costs nothing.
const PASSWORD_RESET_LINK_VALID_DAYS = 7;

export async function issuePasswordResetLink(
  context: SessionContext,
  actingAccountId: string,
  residentProfileId: string,
): Promise<typeof joinCodeIssuance.$inferSelect> {
  if (actingAccountId !== context.accountId) throw new PermissionDeniedError("issue_password_reset_link");

  return withSessionContext(context, async (tx) => {
    // The stored household-only permission `issue_password_reset_link` (the O-16 box,
    // domain/identity.md §2.1): the database refuses it on every other membership, so no moderator
    // can hold it. Checked first, inside this transaction, caller's membership FOR SHARE.
    await assertHasPermissionTx(tx, context, "issue_password_reset_link");
    const [row] = await tx
      .select({ accountEmail: account.email })
      .from(residentProfile)
      .innerJoin(
        membership,
        and(eq(membership.residentProfileId, residentProfile.id), isNull(membership.revokedAt)),
      )
      .innerJoin(account, eq(account.id, membership.accountId))
      .where(
        and(
          eq(residentProfile.id, residentProfileId),
          eq(residentProfile.householdId, context.householdId),
          eq(residentProfile.status, "active"),
        ),
      );
    if (!row || row.accountEmail !== null) {
      throw new ResidentProfileNotEligibleForResetError(residentProfileId);
    }

    return issueJoinCodeTx(tx, context.householdId, actingAccountId, context.profileId, {
      validDays: PASSWORD_RESET_LINK_VALID_DAYS,
      maxUses: 1,
      residentProfileId,
      purpose: "password_reset",
    });
  });
}

export class JoinCodeIssuanceNotFoundError extends Error {
  constructor(issuanceId: string) {
    super(`JoinCodeIssuance not found: ${issuanceId}`);
    this.name = "JoinCodeIssuanceNotFoundError";
  }
}

const EXTEND_JOIN_CODE_MS = 7 * 24 * 60 * 60 * 1000;

// O-15 ("mit einem Tippen verlängerbar"): one action, not a date field. Adds seven days to the
// link's OWN current expiry (not to `now()`), so extending twice compounds correctly, and changes
// nothing else about the link. Deliberately not audited (design.md Decision 5) — it changes no
// one's access, only defers an expiry. Authorized by `manage_join_codes`, checked first inside the
// write transaction (design D4).
export async function extendJoinCode(
  context: SessionContext,
  actingAccountId: string,
  issuanceId: string,
): Promise<typeof joinCodeIssuance.$inferSelect> {
  if (actingAccountId !== context.accountId) throw new PermissionDeniedError("manage_join_codes");
  return withSessionContext(context, async (tx) => {
    await assertHasPermissionTx(tx, context, "manage_join_codes");
    const [current] = await tx
      .select()
      .from(joinCodeIssuance)
      .where(and(eq(joinCodeIssuance.id, issuanceId), eq(joinCodeIssuance.householdId, context.householdId)));
    if (!current) throw new JoinCodeIssuanceNotFoundError(issuanceId);

    const [updated] = await tx
      .update(joinCodeIssuance)
      .set({ expiresAt: new Date(current.expiresAt.getTime() + EXTEND_JOIN_CODE_MS) })
      .where(eq(joinCodeIssuance.id, issuanceId))
      .returning();

    return updated;
  });
}

// FR-2.5 as amended: deletion invalidates the link immediately (every subsequent presentation is
// refused, via resolve_join_code/claim_join_code's own `deleted_at IS NULL` clause), leaves the
// household's other links usable, and leaves memberships already created through it untouched —
// this only ever sets deleted_at, never deletes the row or touches membership. Deleting every live
// link achieves what rotating the old single code used to (design.md Decision 5). Authorized by
// `manage_join_codes`, checked first inside the write transaction (design D4).
export async function deleteJoinCode(
  context: SessionContext,
  actingAccountId: string,
  issuanceId: string,
): Promise<void> {
  if (actingAccountId !== context.accountId) throw new PermissionDeniedError("manage_join_codes");
  await withSessionContext(context, async (tx) => {
    await assertHasPermissionTx(tx, context, "manage_join_codes");
    const [current] = await tx
      .select()
      .from(joinCodeIssuance)
      .where(and(eq(joinCodeIssuance.id, issuanceId), eq(joinCodeIssuance.householdId, context.householdId)));
    if (!current) throw new JoinCodeIssuanceNotFoundError(issuanceId);

    await tx.update(joinCodeIssuance).set({ deletedAt: new Date() }).where(eq(joinCodeIssuance.id, issuanceId));

    await recordActivityEvent(tx, {
      householdId: context.householdId,
      eventType: "household.join_code_deleted",
      subjectType: "join_code_issuance",
      subjectId: issuanceId,
      actorAccountId: actingAccountId,
      actorProfileId: context.profileId,
      payload: {},
    });
  });
}

export type JoinCodeIssuanceWithJoiners = (typeof joinCodeIssuance.$inferSelect) & {
  // AC-2.26: who came in through this link — a used-up or deleted link still names them
  // ("Löschen berührt keine Mitgliedschaft", domain/identity.md §2.1). A link nobody has
  // redeemed yet names nobody — an empty array, not an absent field.
  //
  // design.md Decision 9 (human decision, 2026-09-22): a joiner who was subsequently REMOVED is
  // excluded here — they are no longer a resident and are already hidden from the resident list
  // (proposal Assumption 2), so naming them here would undo that hiding. `hasRemovedJoiner` below
  // carries the fact without the name.
  joinedResidentNames: string[];
  // design.md Decision 9: true iff at least one removed member joined through this link. O16
  // renders a caution beside "Löschen" when this is true AND the link is not yet deleted — the
  // link's use count is unaffected either way.
  hasRemovedJoiner: boolean;
};

// FR-2.29: O16 lists live AND dead links, most recent first — a dead link is never hidden, only
// marked (design.md's "Dead links are never cleaned up, by design"). FR-1.27/U-30 parity: refused
// entirely to a caller without the stored permission `manage_join_codes` (the household account and
// a moderator today).
//
// AC-2.26 (join-by-link): extended to also name each link's joiners, joining `membership` on
// `joined_via_issuance_id` and `resident_profile` for the display name. Two queries rather than
// one join-and-aggregate, so an issuance with zero joiners still appears (an INNER/LEFT JOIN
// aggregate would need its own empty-array handling either way, and this keeps each query simple).
export async function listJoinCodeIssuances(
  context: SessionContext,
  actingAccountId: string,
): Promise<JoinCodeIssuanceWithJoiners[]> {
  if (actingAccountId !== context.accountId) throw new PermissionDeniedError("manage_join_codes");

  return withSessionContext(context, async (tx) => {
    // review fix (O-16): a password_reset row's code/url lets whoever reads it take over the named
    // resident's profile (open the link, set their password) — only the holder of
    // `issue_password_reset_link` (the household account; issuePasswordResetLink's own permission)
    // may issue one, and for the exact same reason only that holder may READ one back here. The
    // permission check and the filter come from ONE locked read of the caller's own row (the
    // session's account, never a caller-supplied flag): the list returns codes, so it takes FOR
    // SHARE. deleteJoinCode/extendJoinCode stay reachable with `manage_join_codes` alone, since
    // neither discloses the code.
    const callerRow = await readLiveMembershipTx(tx, context, true);
    if (!callerRow || !membershipHoldsPermission(callerRow, "manage_join_codes")) {
      throw new PermissionDeniedError("manage_join_codes");
    }
    const canSeeResetLinks = membershipHoldsPermission(callerRow, "issue_password_reset_link");

    const issuances = await tx
      .select()
      .from(joinCodeIssuance)
      .where(eq(joinCodeIssuance.householdId, context.householdId))
      .orderBy(desc(joinCodeIssuance.createdAt));

    const joiners = await tx
      .select({
        issuanceId: membership.joinedViaIssuanceId,
        displayName: residentProfile.displayName,
        status: residentProfile.status,
      })
      .from(membership)
      .innerJoin(residentProfile, eq(residentProfile.id, membership.residentProfileId))
      .where(
        and(eq(membership.householdId, context.householdId), isNotNull(membership.joinedViaIssuanceId)),
      )
      // Without an ORDER BY the planner may return these rows in any order, so each link's
      // joinedResidentNames would be nondeterministic across runs — unstable for the reader of O16
      // and a latent flake for any test asserting the array. joinedAt is both stable and the order
      // a person expects: who came through this link, in the order they came.
      .orderBy(membership.joinedAt);

    const namesByIssuance = new Map<string, string[]>();
    const removedJoinerIssuances = new Set<string>();
    for (const joiner of joiners) {
      if (!joiner.issuanceId) continue; // isNotNull above narrows this at the SQL level only
      // design.md Decision 9: a removed joiner is not pushed into the name list — only flagged.
      if (joiner.status === "removed") {
        removedJoinerIssuances.add(joiner.issuanceId);
        continue;
      }
      const names = namesByIssuance.get(joiner.issuanceId) ?? [];
      names.push(joiner.displayName);
      namesByIssuance.set(joiner.issuanceId, names);
    }

    return issuances
      .filter((issuance) => canSeeResetLinks || issuance.purpose !== "password_reset")
      .map((issuance) => ({
        ...issuance,
        joinedResidentNames: namesByIssuance.get(issuance.id) ?? [],
        hasRemovedJoiner: removedJoinerIssuances.has(issuance.id),
      }));
  });
}

export class CannotChangeAdminRoleError extends Error {
  constructor() {
    super("The household_admin role cannot be changed via this action");
    this.name = "CannotChangeAdminRoleError";
  }
}

// EC-1.7 (Convergence, amended 2026-10-01): "administration may create a resident profile and
// appoint it moderator" — and, by human decision of 2026-10-01, so may a moderator (appointing more
// moderators shares the organising load). Authorized by the stored permission `appoint_moderator`
// (matrix row „Moderator ernennen / zurückstufen"), checked first inside this write transaction with
// the caller's membership locked FOR SHARE (design D4). A moderator may demote other moderators and
// itself; the administering membership is never a target. Toggles only between "member" and
// "moderator" — household_admin is the registering account's own role (C-1.4) and is never
// reassigned by this action.
export async function setMemberRole(
  context: SessionContext,
  actingAccountId: string,
  targetAccountId: string,
  toRole: "member" | "moderator",
): Promise<void> {
  if (actingAccountId !== context.accountId) throw new PermissionDeniedError("appoint_moderator");

  await withSessionContext(context, async (tx) => {
    await assertHasPermissionTx(tx, context, "appoint_moderator");
    // The target is read FOR UPDATE and only while live: a move-out that commits first must not be
    // overwritten by a demotion that writes `vote` onto a revoked row (the UPDATE below also
    // filters revoked_at IS NULL). A vanished live target takes the "not found" path, no write.
    const [target] = await tx
      .select()
      .from(membership)
      .where(and(eq(membership.accountId, targetAccountId), isNull(membership.revokedAt)))
      .for("update");
    if (!target) throw new Error(`Membership not found for account ${targetAccountId}`);
    // role-state-read: a clear refusal for the administering row, a target state not the caller's right; the household-only CHECK would refuse it too, but as a raw constraint error
    if (target.role === "household_admin") throw new CannotChangeAdminRoleError();

    const fromRole = target.role;
    if (fromRole === toRole) return;

    // Appointment stores the moderator set; demotion sets the row to EXACTLY the resident set
    // (`vote` for a resident, none otherwise): under the matrix a member holds the resident set and
    // nothing else, so no set difference is taken — it would leave an individually granted
    // `manage_voting_procedure` or a retired name behind, which the administration CHECK refuses.
    // Computed in SQL on the locked row (design D3, pre-mortem 11).
    const permissions =
      toRole === "moderator"
        ? sql`ARRAY(SELECT DISTINCT p FROM unnest(${membership.permissions} || ${permissionSet(MODERATOR_PERMISSIONS)}) AS p ORDER BY p)`
        : sql`CASE WHEN ${membership.isResident} THEN ${permissionSet(RESIDENT_PERMISSIONS)} ELSE '{}'::text[] END`;
    await tx
      .update(membership)
      .set({ role: toRole, permissions })
      .where(and(eq(membership.id, target.id), isNull(membership.revokedAt)));

    await recordActivityEvent(tx, {
      householdId: context.householdId,
      eventType: "membership.role_changed",
      subjectType: "membership",
      subjectId: target.id,
      actorAccountId: actingAccountId,
      actorProfileId: context.profileId,
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
//
// Authorized by the stored permission `export_subject_access` (matrix row „Datenauskunft
// erzeugen"; household ✅ and moderator ✅, so a moderator may trigger it too). It uses
// assertHasPermission (its own read, before the return) and not an in-transaction check: there is
// no transaction and no write to serialize against. The moderator's „mit Einsicht" content arrives
// with the real export (G-D6, v0.2).
export async function triggerSubjectAccessExport(
  context: SessionContext,
  actingAccountId: string,
  applicationId: string,
): Promise<{ exportId: string }> {
  await assertHasPermission(context, actingAccountId, "export_subject_access");
  return { exportId: `export-${applicationId}-${Date.now()}` };
}

// G-C fix (2026-09-23 human decision): this used to accept ANY sessionId under RLS's
// household-only scoping — no check that the session belonged to the CALLER's own account, so a
// plain resident who learned or guessed another member's session id could revoke it. Scoped here
// to context.accountId as well: through this function, a session can only be revoked by its own
// account. RLS guarantees household isolation only (ADR-004); within a household this rule is
// application-level, like every role and ownership rule — raw SQL as app_runtime inside the
// household is not bound by it (PR #19 review). sign-out-action.ts's only call site already
// passes the caller's own sessionId, so its behaviour is unchanged.
//
// revokeSession review fix: filtered the UPDATE on revokedAt IS NULL, matching the repo's
// convention that an original revocation timestamp is never overwritten (see
// revokeMembershipForProfileTx's comment ~line 526). Signing out twice (or revoking an
// already-revoked session of your own) must still be a no-op-shaped success, not a refusal — so
// when the UPDATE matches nothing, look the session up by id+account unfiltered: if it exists
// (already revoked, but still the caller's own), return normally. Only throw
// PermissionDeniedError when no session with that id belongs to context.accountId at all.
export async function revokeSession(context: SessionContext, sessionId: string): Promise<void> {
  await withSessionContext(context, async (tx) => {
    const [revoked] = await tx
      .update(session)
      .set({ revokedAt: new Date() })
      .where(and(eq(session.id, sessionId), eq(session.accountId, context.accountId), isNull(session.revokedAt)))
      .returning({ id: session.id });
    if (revoked) return;

    const [existing] = await tx
      .select({ id: session.id })
      .from(session)
      .where(and(eq(session.id, sessionId), eq(session.accountId, context.accountId)));
    if (existing) return; // already revoked, still the caller's own session — harmless no-op

    throw new PermissionDeniedError("revoke_session");
  });
}

export { account, household, householdSettings, joinCodeIssuance, membership, residentProfile, session };
