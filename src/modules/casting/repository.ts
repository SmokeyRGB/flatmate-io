import { and, asc, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { isUuid, withSessionContext, type SessionContext } from "@/db/session-context";
import { PayloadValidationError, recordActivityEvent } from "@/modules/audit/repository";
import { activityEvent } from "@/modules/audit/schema";
import {
  assertHasPermission,
  assertHasPermissionTx,
  assertHoldsAllPermissionsTx,
  assertHoldsAnyPermissionTx,
  PermissionDeniedError,
} from "@/modules/identity/repository";
import { householdSettings, membership, residentProfile } from "@/modules/identity/schema";
import {
  parseApplicationInput,
  type ParsedApplication,
  type RawApplicationInput,
} from "./application-input";
import {
  applicationBaseline,
  changedApplicationFields,
  CORRECTABLE_FIELDS,
  type CorrectableField,
} from "./application-changes";
import { application, castingRound, castingRoundStatusEnum, room, roundParticipation } from "./schema";
import { LOCKED_SETTINGS_FIELDS, type LockedSettingsField } from "./settings-fields";
import { ruleFor, type ApplicationState } from "./transitions";
import { assertF1RoomTransitionAllowed, type RoomStatus } from "./room-transitions";

export const ROUND_STATUSES = castingRoundStatusEnum.enumValues;
export type RoundStatus = (typeof ROUND_STATUSES)[number];

export interface Actor {
  accountId: string | null;
  profileId: string | null;
}

// The tx type withSessionContext's callback receives — inferred rather than duplicated, so a
// helper that takes an already-open tx (shared across createRound + openRound, see
// createAndOpenRound below) stays in sync with withSessionContext's own signature.
type Tx = Parameters<Parameters<typeof withSessionContext>[1]>[0];

// G-D15/ADR-014 (openspec application-requires-resident-profile, design Decision 4): a
// household-account session (no resident profile acting) refuses before any query runs, in the
// shape of getRoundParticipants above. Without this, RLS alone would hide the row and the caller
// would see "Application not found" — a refusal reached by the wrong path (CLAUDE.md, "Tests that
// can fail"). The RESTRICTIVE policy in schema.ts enforces the same rule underneath, for every
// path this function does not cover (raw SQL, a future repository function).
export class ProfileRequiredError extends Error {
  readonly code = "profile_required";
  constructor(action: string) {
    super(`${action} requires a resident profile (G-D15)`);
    this.name = "ProfileRequiredError";
  }
}

// The lifecycle columns of an application, never a personal one. Shared by getApplication and the
// state change, so the two cannot drift apart (pre-mortem M10). Personal columns leave this module
// through exactly two reads: getOrganisationApplication (permission-gated) and listVoteCandidatesTx
// (voter-gated, card columns only).
const APPLICATION_LIFECYCLE_COLUMNS = {
  id: application.id,
  householdId: application.householdId,
  roundId: application.roundId,
  state: application.state,
  stateChangedAt: application.stateChangedAt,
  becameResidentId: application.becameResidentId,
  createdAt: application.createdAt,
  retentionUntil: application.retentionUntil,
} as const;

// FR-0.1: the only sanctioned entry point for reading/writing Application — every call opens its
// transaction through the session-context helper (FR-0.3), never queries the raw client directly.
//
// Returns the LIFECYCLE columns only, never a personal one (applicant name, contact, message,
// attributes, age, source, collected_from). Personal data leaves the module only through
// `getOrganisationApplication`, which checks the caller's permission (Copilot, PR #39), and the
// voter-gated card columns of `listVoteCandidatesTx`.
export async function getApplication(context: SessionContext, id: string) {
  // G-D15/ADR-014: a household-account session sees no Application row. Checked here, before
  // opening a transaction, rather than left to the RESTRICTIVE policy alone (Decision 4).
  if (context.profileId === null) return null;
  return withSessionContext(context, async (tx) => {
    const [row] = await tx
      .select(APPLICATION_LIFECYCLE_COLUMNS)
      .from(application)
      .where(eq(application.id, id));
    return row ?? null;
  });
}

export type ApplicationCaptureErrorCode = "round_not_found" | "round_not_open";

export class ApplicationCaptureError extends Error {
  readonly code: ApplicationCaptureErrorCode;
  constructor(code: ApplicationCaptureErrorCode) {
    super(`Application capture refused: ${code}`);
    this.name = "ApplicationCaptureError";
    this.code = code;
  }
}

// D4, "No value leaves in an error": Drizzle puts every bound value into a failed query's
// message ("Failed query: ... params: ...") and Postgres adds "Failing row contains (...)" in the
// cause. So the capture's writes are wrapped and any failure is rethrown as THIS, built fresh:
// no cause, no message from the original, no params. It carries the SQLSTATE and the constraint
// name and nothing else. (The Supabase Postgres log is outside the app's control; the parser
// mirroring every CHECK is what keeps a normal refusal from ever reaching it.)
export class ApplicationWriteError extends Error {
  readonly code = "db_refused";
  readonly sqlState: string | null;
  readonly constraint: string | null;
  constructor(sqlState: string | null, constraint: string | null) {
    super(
      `Application write refused by the database (${sqlState ?? "unknown"}${constraint ? `, ${constraint}` : ""})`,
    );
    this.name = "ApplicationWriteError";
    this.sqlState = sqlState;
    this.constraint = constraint;
  }
}

function toApplicationWriteError(err: unknown): ApplicationWriteError {
  // The postgres driver's error is on `cause` for a Drizzle-wrapped one, or the error itself.
  const candidates = [err, (err as { cause?: unknown } | null)?.cause];
  let sqlState: string | null = null;
  let constraint: string | null = null;
  for (const c of candidates) {
    if (typeof c !== "object" || c === null) continue;
    const code = (c as { code?: unknown }).code;
    const name = (c as { constraint_name?: unknown }).constraint_name;
    if (sqlState === null && typeof code === "string" && /^[0-9A-Z]{5}$/.test(code)) sqlState = code;
    if (constraint === null && typeof name === "string" && /^[A-Za-z0-9_]{1,63}$/.test(name)) {
      constraint = name;
    }
  }
  return new ApplicationWriteError(sqlState, constraint);
}

// The write half of a capture: the INSERT and its audit event, wrapped so that no value can leave
// in an error. Exported as the seam D4 asks for (and pre-mortem 1's test): a test calls it inside
// its own transaction with a round id the repository's own round check would have refused, to
// force a database refusal. `source` is a literal here, never from input (FR-3.6), and both actor
// ids come from `context`.
export async function insertCapturedApplicationTx(
  tx: Tx,
  context: SessionContext,
  roundId: string,
  parsed: ParsedApplication,
): Promise<{ id: string }> {
  if (context.profileId === null) throw new ProfileRequiredError("captureApplication");
  try {
    const [row] = await tx
      .insert(application)
      .values({
        householdId: context.householdId,
        roundId,
        state: "new",
        source: "manual_form",
        collectedFrom: parsed.collectedFrom,
        applicantName: parsed.applicantName,
        age: parsed.age,
        contactEmail: parsed.contactEmail,
        contactPhone: parsed.contactPhone,
        contactOther: parsed.contactOther,
        messageRaw: parsed.messageRaw,
        attributes: parsed.attributes,
        createdByAccountId: context.accountId,
        createdByProfileId: context.profileId,
      })
      .returning({ id: application.id });

    await recordActivityEvent(tx, {
      householdId: context.householdId,
      eventType: "application.created",
      subjectType: "application",
      subjectId: row.id,
      actorAccountId: context.accountId,
      actorProfileId: context.profileId,
      payload: { source: "manual_form", collectedFrom: parsed.collectedFrom },
    });
    return { id: row.id };
  } catch (err) {
    // A payload-allowlist violation is a code bug, not a database refusal, and its message names
    // keys only, never values: it is rethrown as itself so the cause stays visible (code review).
    if (err instanceof PayloadValidationError) throw err;
    throw toApplicationWriteError(err);
  }
}

// F3 change 2 (application-capture), FR-3.1-3.10, design D4. The only way an application is
// created. Takes NO actor: both actor ids come from `context` (CLAUDE.md hazards: never from a
// caller-supplied actor id).
//
// Order (G-D15 obligation (a) first): a profile-less session is refused BEFORE any query. Then
// ONE transaction:
//   a. the caller's live membership is read FOR SHARE and must hold `create_application`;
//   b. the round is read FOR SHARE with the household predicate and must be `open`;
//   c. only then is the input parsed, so a plain member learns only that the permission is
//      missing, whatever it typed;
//   d. the wrapped INSERT and the audit event.
//
// What serialises each read-then-write:
//   - a against a revocation or role change: FOR SHARE conflicts with every membership writer's
//     row lock (UPDATE), so a revocation committed first is seen and one in flight is waited for;
//   - b against a status change: FOR SHARE conflicts with openRoundTx's FOR UPDATE. OBLIGATION:
//     every future writer of casting_round.status takes FOR UPDATE on the row, or the pair is no
//     longer serialised (also stated on castingRound.status in schema.ts);
//   - capture against capture: two FOR SHARE locks are compatible and two inserts do not
//     conflict. EC-3.1/3.11 want both rows.
//
// LOCK ORDER: membership (FOR SHARE) -> household_settings -> casting_round -> room -> application.
// No existing function locks casting_round and then membership (openRoundTx reads membership
// without a lock, revokeMembershipForProfileTx locks no round), so no deadlock cycle exists.
// A future writer keeps this order.
export async function captureApplication(
  context: SessionContext,
  input: RawApplicationInput & { roundId: string },
): Promise<{ id: string }> {
  if (context.profileId === null) throw new ProfileRequiredError("captureApplication");
  const roundId = input.roundId;
  if (typeof roundId !== "string" || !isUuid(roundId)) throw new ApplicationCaptureError("round_not_found");

  return withSessionContext(context, async (tx) => {
    await assertHasPermissionTx(tx, context, "create_application");

    const [round] = await tx
      .select({ id: castingRound.id, status: castingRound.status })
      .from(castingRound)
      .where(and(eq(castingRound.id, roundId), eq(castingRound.householdId, context.householdId)))
      .for("share");
    if (!round) throw new ApplicationCaptureError("round_not_found");
    if (round.status !== "open") throw new ApplicationCaptureError("round_not_open");

    const parsed = parseApplicationInput(input);
    return insertCapturedApplicationTx(tx, context, roundId, parsed);
  });
}

// D5: the ORGANISATION's read of one application, behind /rounds/[id]/applications/[applicationId]
// (O5's shell). It is NOT the read F4's screening deck will use: there, every participating
// resident sees the applicant's facts under V-2 through its own function with its own rule. The
// two must never be merged into one "application detail" read with a role switch, which is why
// this one is not called getApplicationDetail.
//
// Returns null for a profile-less session (no query runs), a malformed id, an unknown id, a round
// mismatch or another household. Throws PermissionDeniedError when the live membership holds
// neither create_application nor change_application_state. Sibling: `getApplication` above keeps
// its profile-only check but returns lifecycle columns only, so no other read returns an
// application's personal columns except `listVoteCandidatesTx`, the second, voter-gated one (name,
// age, message, attributes; never contact).
export async function getOrganisationApplication(
  context: SessionContext,
  roundId: string,
  applicationId: string,
) {
  if (context.profileId === null) return null;
  if (!isUuid(roundId) || !isUuid(applicationId)) return null;
  return withSessionContext(context, async (tx) => {
    // The share lock is held through the read, like the writers. Without it, a revocation that
    // commits between the check and the read would let the read return personal data at no
    // authorized instant (Copilot, PR #39).
    await assertHoldsAnyPermissionTx(tx, context, ["create_application", "change_application_state"]);
    const [row] = await tx
      .select()
      .from(application)
      .where(
        and(
          eq(application.id, applicationId),
          eq(application.roundId, roundId),
          eq(application.householdId, context.householdId),
        ),
      );
    return row ?? null;
  });
}

// F3 change 3 (application-pipeline), design D1. The ORGANISATION's list of one round's
// applications (screen O4). It is the sibling of getOrganisationApplication above and follows the
// same rule, written the same way:
//   - a profile-less session, or a malformed round id, returns null BEFORE any query (G-D15);
//   - the caller's live membership must hold `create_application` or `change_application_state`,
//     checked inside the read's transaction with the share lock kept to the end of the read. The
//     rows carry names and contacts, so without the lock a revocation could commit between the
//     check and the read (Copilot, PR #39);
//   - only rows of the session's own household and of this round.
// It is NOT merged with the detail read: one keyed on an id and one on a round are two reads with
// two guards, and a "list or one" switch is the merged read change 2's D5 warns against.
//
// Lists the columns O4 shows and nothing else: never `message_raw` or `attributes`. There is no
// `deleted_at IS NULL` filter, like getOrganisationApplication (change 4 drops the column).
export async function listOrganisationApplications(context: SessionContext, roundId: string) {
  if (context.profileId === null) return null;
  if (typeof roundId !== "string" || !isUuid(roundId)) return null;
  return withSessionContext(context, async (tx) => {
    await assertHoldsAnyPermissionTx(tx, context, ["create_application", "change_application_state"]);
    return tx
      .select({
        id: application.id,
        applicantName: application.applicantName,
        state: application.state,
        collectedFrom: application.collectedFrom,
        age: application.age,
        contactEmail: application.contactEmail,
        contactPhone: application.contactPhone,
        contactOther: application.contactOther,
        createdAt: application.createdAt,
      })
      .from(application)
      .where(and(eq(application.roundId, roundId), eq(application.householdId, context.householdId)))
      .orderBy(desc(application.createdAt));
  });
}

export type ApplicationUpdateErrorCode = "not_found" | "stale";

// Codes only: no field name and no value (a stale refusal names no field, FR-3.21).
export class ApplicationUpdateError extends Error {
  readonly code: ApplicationUpdateErrorCode;
  constructor(code: ApplicationUpdateErrorCode) {
    super(`Application update refused: ${code}`);
    this.name = "ApplicationUpdateError";
    this.code = code;
  }
}

// F3 change 3, design D4, FR-3.21/3.22 (Art. 16). Corrects the eight captured fields of one
// application. Takes NO actor: both ids come from `context`.
//
// Order: a profile-less session is refused BEFORE any query. Then ONE transaction:
//   a. the caller's live membership is read FOR SHARE and must hold `create_application`;
//   b. the row is read FOR UPDATE with the round and household predicates (no row -> not_found);
//   c. STALE CHECK: the form carries a digest of the values it was shown. If it differs from the
//      locked row, someone corrected the application in between, and the whole correction is
//      refused with nothing written. Without it the diff would run against the locked row while
//      the form holds page-load values, and B's save would silently revert A's correction;
//   c2. the input is parsed, after the checks, so a member without the permission learns only
//      that. Keys the parser does not know (`source`, `state`) are ignored: it never reads them,
//      and `roundId` only selects the row;
//   d. the diff over the eight fixed fields; nothing changed -> no UPDATE and no event;
//   e. the UPDATE of the changed columns only, and one `application.updated` event that names
//      those fields and never a value.
//
// The SET list never contains round_id or household_id, so the pairing trigger (UPDATE OF
// round_id, household_id) does not fire and no round lock is taken. It never contains state,
// state_changed_at, source, created_* or became_resident_id either.
//
// LOCK ORDER: membership (FOR SHARE) -> household_settings -> casting_round -> room -> application.
// This function takes membership FOR SHARE, then the application row FOR UPDATE, the same as
// transitionApplication, so the two are serialised on the row and no cycle exists.
//
// Returns { changed } only, never the row.
export async function updateApplication(
  context: SessionContext,
  input: RawApplicationInput & { roundId: string; applicationId: string; baseline: string },
): Promise<{ changed: CorrectableField[] }> {
  if (context.profileId === null) throw new ProfileRequiredError("updateApplication");
  const { roundId, applicationId } = input;
  if (
    typeof roundId !== "string" ||
    !isUuid(roundId) ||
    typeof applicationId !== "string" ||
    !isUuid(applicationId)
  ) {
    throw new ApplicationUpdateError("not_found");
  }

  return withSessionContext(context, async (tx) => {
    await assertHasPermissionTx(tx, context, "create_application");

    const [current] = await tx
      .select()
      .from(application)
      .where(
        and(
          eq(application.id, applicationId),
          eq(application.roundId, roundId),
          eq(application.householdId, context.householdId),
        ),
      )
      .for("update");
    if (!current) throw new ApplicationUpdateError("not_found");

    // The stale check needs only the locked row, so it runs BEFORE parsing: a stale form is told
    // so at once, never first sent to fix a field only to be refused as stale after (code review).
    if (typeof input.baseline !== "string" || applicationBaseline(current) !== input.baseline) {
      throw new ApplicationUpdateError("stale");
    }

    const parsed = parseApplicationInput(input);

    const changed = changedApplicationFields(current, parsed);
    if (changed.length === 0) return { changed: [] };

    // The allowlist checks keys only, so a code bug could still put a value into the array. Every
    // element must be one of the eight fixed names before it is recorded.
    for (const field of changed) {
      if (!(CORRECTABLE_FIELDS as readonly string[]).includes(field)) {
        throw new Error("updateApplication: a changed field is not a correctable field");
      }
    }

    try {
      await tx
        .update(application)
        .set(Object.fromEntries(changed.map((field) => [field, parsed[field]])))
        .where(and(eq(application.id, applicationId), eq(application.householdId, context.householdId)));

      await recordActivityEvent(tx, {
        householdId: context.householdId,
        eventType: "application.updated",
        subjectType: "application",
        subjectId: applicationId,
        actorAccountId: context.accountId,
        actorProfileId: context.profileId,
        payload: { fields: changed },
      });
    } catch (err) {
      if (err instanceof PayloadValidationError) throw err;
      throw toApplicationWriteError(err);
    }
    return { changed };
  });
}

export type ApplicationTransitionErrorCode = "not_found" | "step_not_available";

// Codes only, no id and no value in the message: the caller (a future screen's action) maps the
// code to a sentence.
export class ApplicationTransitionError extends Error {
  readonly code: ApplicationTransitionErrorCode;
  constructor(code: ApplicationTransitionErrorCode) {
    super(`Application transition refused: ${code}`);
    this.name = "ApplicationTransitionError";
    this.code = code;
  }
}

// The one place a state change is executed (F3 change 3, design D6/D6a). Runs inside the caller's
// transaction, on a row the caller has already locked FOR UPDATE:
//   ruleFor (throws InvalidTransitionError for an undeclared pair) -> a `pending` row is refused
//   as not available -> EVERY permission of the row's `requires` is checked on the membership row
//   the caller already share-locked (never assuming an entry was checked earlier: a later row may
//   require `confirm_appointment` and not `change_application_state`) -> the UPDATE of `state` and
//   `state_changed_at` -> exactly one `application.state_changed` event, the actor from `context`.
//
// It stays private here. The first feature that owns an operation with effects (an appointment, an
// offer with its room), OR needs two or more rows in one transaction (F5's "Als eingeladen
// markieren" takes new -> screened -> invited in one action; two transitionApplication calls would
// be two transactions and nesting them is refused, NestedSessionContextError), exports it with an
// `expectedKind` argument.
//
// Both the SELECT the caller made and the RETURNING here list lifecycle columns only: this used to
// hand out the whole row, name, contacts and message included (pre-mortem M10).
async function applyTransitionTx(
  tx: Tx,
  context: SessionContext,
  current: { id: string; householdId: string; state: ApplicationState },
  toState: ApplicationState,
) {
  const fromState = current.state;
  const rule = ruleFor(fromState, toState);
  if (rule.kind === "pending") throw new ApplicationTransitionError("step_not_available");
  // EVERY entry, in one read of the membership row the caller already share-locked.
  await assertHoldsAllPermissionsTx(tx, context, rule.requires);

  const [updated] = await tx
    .update(application)
    .set({ state: toState, stateChangedAt: new Date() })
    .where(and(eq(application.id, current.id), eq(application.householdId, context.householdId)))
    .returning(APPLICATION_LIFECYCLE_COLUMNS);

  await recordActivityEvent(tx, {
    householdId: current.householdId,
    eventType: "application.state_changed",
    subjectType: "application",
    subjectId: current.id,
    actorAccountId: context.accountId,
    actorProfileId: context.profileId,
    payload: { fromState, toState },
  });

  return updated;
}

// FR-0.10/FR-0.11/FR-0.12, FR-3.24, AC-3.21. Takes NO actor: the account and profile come from
// `context` (BREAKING: the caller-supplied actor parameter is gone).
//
// Order: a profile-less session is refused BEFORE any query (G-D15). Then ONE transaction:
//   a. the caller's live membership is read FOR SHARE and must hold `change_application_state`,
//      so someone without it learns nothing about the row;
//   b. the row is read FOR UPDATE with the household predicate (no row -> `not_found`). Before
//      this lock, two concurrent transitions both read `new` and both wrote;
//   c. applyTransitionTx: the declared rule (D6a), every permission it requires, the UPDATE and
//      the event.
//
// Writers of an application row (design D7), each serialised on the row lock in ONE lock order,
// membership (FOR SHARE) -> household_settings -> casting_round -> room -> application:
//   captureApplication: INSERT, membership FOR SHARE -> round FOR SHARE;
//   updateApplication / transitionApplication: membership FOR SHARE -> application FOR UPDATE;
//   deleteApplication (change 4) OBLIGATION: takes FOR UPDATE (or DELETE ... RETURNING).
// Raw SQL as app_runtime is bound by RLS (household) only: the application-level rules do not
// apply there (ADR-004 layering), as for every table.
//
// Returns lifecycle columns only, like getApplication.
export async function transitionApplication(
  context: SessionContext,
  applicationId: string,
  toState: ApplicationState,
) {
  // G-D15/ADR-014: a household-account session may not transition an Application. Refused here,
  // before any query, so the error names the missing profile instead of arriving as "not found"
  // once RLS hides the row.
  if (context.profileId === null) {
    throw new ProfileRequiredError("transitionApplication");
  }
  if (typeof applicationId !== "string" || !isUuid(applicationId)) {
    throw new ApplicationTransitionError("not_found");
  }
  return withSessionContext(context, async (tx) => {
    await assertHasPermissionTx(tx, context, "change_application_state");

    const [current] = await tx
      .select({
        id: application.id,
        householdId: application.householdId,
        state: application.state,
      })
      .from(application)
      .where(and(eq(application.id, applicationId), eq(application.householdId, context.householdId)))
      .for("update");
    if (!current) throw new ApplicationTransitionError("not_found");

    return applyTransitionTx(tx, context, current, toState);
  });
}

// FR-1.9: create, rename, remove — the moderator's room CRUD (manage_rooms).
// G-C (speckit-analyze finding C1): these four functions had no authorization check of their
// own — same class of bug already found and fixed once for `manage_voting_procedure` above — relying
// entirely on src/app/(org)/rooms/actions.ts to have checked first. Self-enforcing here matches
// identity/repository.ts's member-management functions, which are safe regardless of caller.
export async function createRoom(context: SessionContext, label: string, actor: Actor) {
  if (!actor.accountId) throw new Error("createRoom requires an actor accountId");
  await assertHasPermission(context, actor.accountId, "manage_rooms");
  return withSessionContext(context, async (tx) => {
    const [row] = await tx
      .insert(room)
      .values({ householdId: context.householdId, label })
      .returning();

    await recordActivityEvent(tx, {
      householdId: context.householdId,
      eventType: "room.created",
      subjectType: "room",
      subjectId: row.id,
      actorAccountId: actor.accountId,
      actorProfileId: actor.profileId,
      payload: {},
    });

    return row;
  });
}

// Clarifications (Session 2026-09-17): renaming is unrestricted at any round state and any room
// state; the label itself is never stored in the ActivityEvent payload (free text — G-D7).
export async function renameRoom(
  context: SessionContext,
  roomId: string,
  newLabel: string,
  actor: Actor,
) {
  if (!actor.accountId) throw new Error("renameRoom requires an actor accountId");
  await assertHasPermission(context, actor.accountId, "manage_rooms");
  return withSessionContext(context, async (tx) => {
    const [updated] = await tx
      .update(room)
      .set({ label: newLabel })
      .where(eq(room.id, roomId))
      .returning();
    if (!updated) throw new Error(`Room not found: ${roomId}`);

    await recordActivityEvent(tx, {
      householdId: context.householdId,
      eventType: "room.renamed",
      subjectType: "room",
      subjectId: roomId,
      actorAccountId: actor.accountId,
      actorProfileId: actor.profileId,
      payload: {},
    });

    return updated;
  });
}

// FR-1.10/FR-1.11: a room's state is independent of every other room's and of any round covering
// it — this function only ever touches the one row it's given.
export async function transitionRoomStatus(
  context: SessionContext,
  roomId: string,
  toStatus: RoomStatus,
  actor: Actor,
) {
  if (!actor.accountId) throw new Error("transitionRoomStatus requires an actor accountId");
  await assertHasPermission(context, actor.accountId, "manage_rooms");
  return withSessionContext(context, async (tx) => {
    const [current] = await tx.select().from(room).where(eq(room.id, roomId)).for("update");
    if (!current) throw new Error(`Room not found: ${roomId}`);

    const fromStatus = current.status;
    assertF1RoomTransitionAllowed(fromStatus, toStatus);

    const [updated] = await tx
      .update(room)
      .set({ status: toStatus })
      .where(eq(room.id, roomId))
      .returning();

    await recordActivityEvent(tx, {
      householdId: context.householdId,
      eventType: "room.status_changed",
      subjectType: "room",
      subjectId: roomId,
      actorAccountId: actor.accountId,
      actorProfileId: actor.profileId,
      payload: { fromStatus, toStatus },
    });

    return updated;
  });
}

export class RoomInUseByOpenRoundError extends Error {
  constructor(roomId: string) {
    super(`Room ${roomId} is covered by an open round and cannot be removed (EC-1.6)`);
    this.name = "RoomInUseByOpenRoundError";
  }
}

// EC-1.6: refused while a round covering it is open; the room may be set not_available instead.
export async function removeRoom(context: SessionContext, roomId: string, actor: Actor) {
  if (!actor.accountId) throw new Error("removeRoom requires an actor accountId");
  if (actor.accountId !== context.accountId) throw new PermissionDeniedError("manage_rooms");
  return withSessionContext(context, async (tx) => {
    await assertHasPermissionTx(tx, context, "manage_rooms");
    await tx.select({ id: room.id }).from(room).where(eq(room.id, roomId)).for("update");
    const [openRoundCoveringIt] = await tx
      .select({ id: castingRound.id })
      .from(castingRound)
      .where(
        and(
          eq(castingRound.status, "open"),
          sql`${roomId}::uuid = ANY(${castingRound.roomIds})`,
        ),
      );
    if (openRoundCoveringIt) throw new RoomInUseByOpenRoundError(roomId);

    await tx.update(room).set({ deletedAt: new Date() }).where(eq(room.id, roomId));

    await recordActivityEvent(tx, {
      householdId: context.householdId,
      eventType: "room.removed",
      subjectType: "room",
      subjectId: roomId,
      actorAccountId: actor.accountId,
      actorProfileId: actor.profileId,
      payload: {},
    });
  });
}

export async function listRooms(context: SessionContext) {
  return withSessionContext(context, (tx) =>
    tx.select().from(room).where(and(eq(room.householdId, context.householdId), isNull(room.deletedAt))),
  );
}

// FR-1.12: create a round in draft, selecting the rooms it covers.
// FR-1.12: round-lifecycle actions are gated on `manage_rounds` (create/open; matrix row
// „CastingRound anlegen / schließen / wiedereröffnen", which renamed the earlier gate
// in F3 change 2b) and `manage_round_participation` (manual add; matrix row
// „RoundParticipation hinzufügen / entfernen") — same G-C fix as createRoom
// above (speckit-analyze finding C1): no internal check previously, relied entirely on the one
// caller (src/app/(org)/rounds/new/actions.ts) to have checked first.
async function insertDraftRoundTx(
  tx: Tx,
  context: SessionContext,
  title: string,
  roomIds: string[],
  actor: Actor,
) {
  const [row] = await tx
    .insert(castingRound)
    .values({ householdId: context.householdId, title, roomIds, status: "draft" })
    .returning();

  await recordActivityEvent(tx, {
    householdId: context.householdId,
    eventType: "casting_round.created",
    subjectType: "casting_round",
    subjectId: row.id,
    actorAccountId: actor.accountId,
    actorProfileId: actor.profileId,
    payload: {},
  });

  return row;
}

export async function createRound(context: SessionContext, title: string, roomIds: string[], actor: Actor) {
  if (!actor.accountId) throw new Error("createRound requires an actor accountId");
  await assertHasPermission(context, actor.accountId, "manage_rounds");
  return withSessionContext(context, (tx) => insertDraftRoundTx(tx, context, title, roomIds, actor));
}

// german-ui-vocabulary: not one of design.md Decision 4's named classes (tasks.md's error-code
// tasks enumerate RegistrationError/ClaimError/SignInError only), but this class's message reaches
// the same form as those — rounds/new/actions.ts's `return { error: err.message }` — with four
// distinct conditions, one of which carries a raw round id. Given the same code-discriminant
// treatment for the same reason (design.md Decision 4); see the implementation report.
export type RoundOpenPreconditionErrorCode =
  | "not_in_draft"
  | "no_rooms_selected"
  | "rooms_unavailable"
  | "no_eligible_residents";

export class RoundOpenPreconditionError extends Error {
  constructor(message: string, readonly code: RoundOpenPreconditionErrorCode) {
    super(message);
  }
}

const LOCKED_ROOM_STATUSES: ReadonlySet<RoomStatus> = new Set(["occupied", "not_available"]);

// FR-1.14/FR-1.15/FR-1.16: draft -> open takes an atomic snapshot of eligible residents into
// RoundParticipation and freezes HouseholdSettings' four locked fields into settings_snapshot —
// both effects or neither, in one transaction. EC-1.1/EC-1.2/EC-1.3 preconditions checked first.
// LOCK ORDER: membership (FOR SHARE) ->
// household_settings -> casting_round -> room -> application. Settings come before the round
// because the settings writer has no round id and locks the household's single settings row;
// rooms come after the round because this function learns the covered ids from the locked round,
// and removeRoom locks the room before it reads rounds.
// The eligibility read below stays unlocked. auto_join_open_rounds (drizzle/0031) runs inside
// the membership INSERT, or the UPDATE that makes that membership a live resident. Either
// statement already holds the membership row, and the trigger then takes casting_round FOR SHARE.
// Locking membership rows after this round lock would deadlock with a late joiner.
async function openRoundTx(tx: Tx, context: SessionContext, roundId: string, actor: Actor) {
  const [settings] = await tx
    .select()
    .from(householdSettings)
    .where(eq(householdSettings.householdId, context.householdId))
    .for("share");
  if (!settings) throw new Error(`HouseholdSettings not found for household ${context.householdId}`);

  // EC-1.9: two moderators opening the same draft round simultaneously must produce exactly
  // one opening. `FOR UPDATE` locks this row for the rest of the transaction — a concurrent
  // openRound's own SELECT ... FOR UPDATE blocks here until this transaction commits or rolls
  // back, then re-reads the now-`open` row and correctly fails the status check below, instead
  // of both transactions reading `draft` and both inserting a duplicate snapshot.
  const [round] = await tx.select().from(castingRound).where(eq(castingRound.id, roundId)).for("update");
  if (!round) throw new Error(`CastingRound not found: ${roundId}`);
  if (round.status !== "draft") {
    throw new RoundOpenPreconditionError(`Round ${roundId} is not in draft`, "not_in_draft");
  }

  // EC-1.1: no rooms selected.
  if (round.roomIds.length === 0) {
    throw new RoundOpenPreconditionError("This round has no rooms selected", "no_rooms_selected");
  }

  // EC-1.2: every still-present covered room is already occupied/not_available.
  // A removed room is ignored. A round whose covered rooms are all removed fails
  // with rooms_unavailable.
  const coveredRooms = await tx
    .select()
    .from(room)
    .where(and(inArray(room.id, round.roomIds), isNull(room.deletedAt)))
    .orderBy(room.id)
    .for("share");
  const hasAvailableRoom = coveredRooms.some((r) => !LOCKED_ROOM_STATUSES.has(r.status));
  if (!hasAvailableRoom) {
    throw new RoundOpenPreconditionError(
      "Every room this round covers is already occupied or not available",
      "rooms_unavailable",
    );
  }

  // EC-1.3: zero eligible residents. Eligible = active ResidentProfile with an is_resident
  // Membership in this household.
  const eligibleProfiles = await tx
    .select({
      profileId: residentProfile.id,
      canVote: membership.isResident,
    })
    .from(residentProfile)
    .innerJoin(membership, eq(membership.residentProfileId, residentProfile.id))
    .where(
      and(
        eq(residentProfile.householdId, context.householdId),
        eq(residentProfile.status, "active"),
        isNull(membership.revokedAt),
      ),
    );
  if (eligibleProfiles.length === 0) {
    // EC-1.4: exactly one eligible resident is fine — only zero is refused.
    throw new RoundOpenPreconditionError("There are no eligible residents to snapshot", "no_eligible_residents");
  }

  // FR-1.16: both effects together, in the same transaction — a thrown error above or below
  // this point leaves the round untouched in `draft` with no RoundParticipation rows written.
  await tx.insert(roundParticipation).values(
    eligibleProfiles.map((p) => ({
      roundId,
      householdId: context.householdId,
      residentProfileId: p.profileId,
      source: "snapshot_at_open" as const,
      canVote: p.canVote,
    })),
  );

  const [updated] = await tx
    .update(castingRound)
    .set({
      status: "open",
      openedAt: new Date(),
      settingsSnapshot: {
        scaleWeights: settings.scaleWeights,
        favoriteBudgetFactor: settings.favoriteBudgetFactor,
        hideResultsUntilVoted: settings.hideResultsUntilVoted,
        quorumShare: settings.quorumShare,
      },
    })
    .where(eq(castingRound.id, roundId))
    .returning();

  await recordActivityEvent(tx, {
    householdId: context.householdId,
    eventType: "casting_round.opened",
    subjectType: "casting_round",
    subjectId: roundId,
    actorAccountId: actor.accountId,
    actorProfileId: actor.profileId,
    payload: { participantCount: eligibleProfiles.length },
  });

  return updated;
}

export async function openRound(context: SessionContext, roundId: string, actor: Actor) {
  if (!actor.accountId) throw new Error("openRound requires an actor accountId");
  if (actor.accountId !== context.accountId) throw new PermissionDeniedError("manage_rounds");
  return withSessionContext(context, async (tx) => {
    await assertHasPermissionTx(tx, context, "manage_rounds");
    return openRoundTx(tx, context, roundId, actor);
  });
}

// rounds-new-orphan-draft-atomicity: createRound and openRound each committed in their own
// transaction, so a precondition failure during open left the draft round (and its
// casting_round.created ActivityEvent) permanently behind — every failed "new round" submission
// accumulated an orphan draft. The only real-world caller creates and opens in the same breath
// (src/app/(org)/rounds/new/actions.ts), so this runs both steps inside one withSessionContext
// transaction: a thrown RoundOpenPreconditionError rolls back the draft insert too, the same way
// openRoundTx's own preconditions already roll back its snapshot writes (AC-1.10).
export async function createAndOpenRound(
  context: SessionContext,
  title: string,
  roomIds: string[],
  actor: Actor,
) {
  if (!actor.accountId) throw new Error("createAndOpenRound requires an actor accountId");
  if (actor.accountId !== context.accountId) throw new PermissionDeniedError("manage_rounds");
  return withSessionContext(context, async (tx) => {
    await assertHasPermissionTx(tx, context, "manage_rounds");
    const round = await insertDraftRoundTx(tx, context, title, roomIds, actor);
    // The inserted row is new, so nobody else can lock it. Inserting it before openRoundTx
    // takes the household_settings lock is not a lock-order violation.
    return openRoundTx(tx, context, round.id, actor);
  });
}

// FR-1.18: add a resident to an already-open round, marked as added manually, never touching the
// existing snapshot rows.
// speckit-bug-fix round-participation-duplicate-on-manual-add: the auto-join trigger may have
// already added this resident (source `joined_after_open`) before a moderator gets here — the
// active-pairing unique index (drizzle/0011) makes a second insert conflict; on conflict this
// returns the existing active row unchanged instead of writing a duplicate denominator row.
export async function addResidentToRound(
  context: SessionContext,
  roundId: string,
  residentProfileId: string,
  actor: Actor,
) {
  if (!actor.accountId) throw new Error("addResidentToRound requires an actor accountId");
  await assertHasPermission(context, actor.accountId, "manage_round_participation");
  return withSessionContext(context, async (tx) => {
    const [inserted] = await tx
      .insert(roundParticipation)
      .values({
        roundId,
        householdId: context.householdId,
        residentProfileId,
        source: "added_manually",
        canVote: true,
      })
      .onConflictDoNothing({
        target: [roundParticipation.roundId, roundParticipation.residentProfileId],
        where: isNull(roundParticipation.removedAt),
      })
      .returning();

    if (!inserted) {
      const [existing] = await tx
        .select()
        .from(roundParticipation)
        .where(
          and(
            eq(roundParticipation.roundId, roundId),
            eq(roundParticipation.residentProfileId, residentProfileId),
            isNull(roundParticipation.removedAt),
          ),
        );
      return existing;
    }

    await recordActivityEvent(tx, {
      householdId: context.householdId,
      eventType: "casting_round.participant_added",
      subjectType: "round_participation",
      subjectId: inserted.id,
      actorAccountId: actor.accountId,
      actorProfileId: actor.profileId,
      payload: { source: "added_manually" },
    });

    return inserted;
  });
}

// ADR-014/G-D15/research.md §3: a profile-less session reads the admin view (identity/lifecycle
// columns only); a resident session reads the full row. V-2's participation-based row visibility
// is out of F1's scope (research.md §3) — household scoping (RLS) is what gates a resident
// session's access here, same as every other table in this feature.
export async function getRoundForSession(context: SessionContext, roundId: string) {
  // A route param is untrusted input — fail closed on a malformed id the same way
  // claim/actions.ts and session-cookie.ts do, instead of letting Postgres's `::uuid` cast (or
  // the Drizzle-builder branch below) throw a raw DB error up through the page.
  if (!isUuid(roundId)) return null;
  return withSessionContext(context, async (tx) => {
    if (context.profileId === null) {
      const [row] = await tx.execute<{
        id: string;
        household_id: string;
        title: string;
        status: string;
        room_ids: string[];
        opened_at: string | null;
        closed_at: string | null;
        phase_deadline_at: string | null;
        retention_until: string | null;
        retention_extensions: string[];
        retention_warned_at: string | null;
      }>(sql`SELECT * FROM casting_round_admin_view WHERE id = ${roundId}::uuid`);
      return row ?? null;
    }
    const [row] = await tx.select().from(castingRound).where(eq(castingRound.id, roundId));
    return row ?? null;
  });
}

// FR-1.19/FR-1.28: names only — no join date, contact detail, or action controls. A distinct
// query path from the resident-list read (identity/repository.ts's getResidentList); neither
// links to the other's underlying rows.
//
// ADR-014/G-D15: a profile-less (household-account) session gets round identity/lifecycle only —
// see getRoundForSession above — and participant names are Application-derived/participant data,
// explicitly excluded. Enforced here (not just at the call site) so every caller is covered.
//
// final-member-removal design.md Decision 7 (V-3/FR-1.19, human decision 2026-09-22): a
// participant who has since moved out or been removed no longer belongs on "current residents
// taking part" — added eq(residentProfile.status, "active"). Deliberately does NOT write
// round_participation.removed_at: that column means a moderator took someone out of a round,
// a different fact from a change to their ResidentProfile status. F4's denominator still reads
// the untouched round_participation rows.
export async function getRoundParticipants(context: SessionContext, roundId: string) {
  if (context.profileId === null) return [];
  return withSessionContext(context, (tx) =>
    tx
      .select({ displayName: residentProfile.displayName })
      .from(roundParticipation)
      .innerJoin(residentProfile, eq(residentProfile.id, roundParticipation.residentProfileId))
      .where(
        and(
          eq(roundParticipation.roundId, roundId),
          isNull(roundParticipation.removedAt),
          eq(residentProfile.status, "active"),
        ),
      ),
  );
}

// ---------------------------------------------------------------------------------------------
// Query ports for deliberation (F4 change 1, design D2). Deliberation owns the vote table, so it
// never joins casting tables in its own SQL (docs/domain/kontextgrenzen.md §4 rule 1); it asks
// casting through these two `...Tx` primitives, which take the caller's transaction so one pass
// reads on one connection. Both trust the `context` they are given, and deliberation's repository
// is the only caller (authorization-matrix.test.ts asserts no `src/app` file imports them). Both
// refuse a profile-less context before any query, and neither takes a lock: every write
// re-validates under lock (vote_guard, drizzle/0028), so a stale read costs at most a typed
// refusal.
//
// The voter predicate joins `resident_profile`, an identity table, inside casting SQL. That
// strictly breaks §4 rule 1, exactly as getRoundParticipants and openRoundTx already do; the
// import direction casting -> identity is allowed, and a port for one status predicate would cost
// a round-trip and a second copy of "active". Recorded as a register row (docs/review-log.md).
// ---------------------------------------------------------------------------------------------

export interface VoterRound {
  roundId: string;
  title: string;
  status: RoundStatus;
  phaseDeadlineAt: Date | null;
  createdAt: Date;
  settingsSnapshot: unknown;
}

// The rounds in which the session's profile holds an active participation with the right to
// vote, and is itself an active resident. The status is returned rather than filtered, so the
// caller can name a non-open state (AC-4.13). A draft round normally has no participations;
// addResidentToRound has no status check, so one can, which the caller refuses as not open.
export async function listVoterRoundsTx(
  tx: Tx,
  context: SessionContext,
  options: { roundId?: string } = {},
): Promise<VoterRound[]> {
  if (context.profileId === null) throw new ProfileRequiredError("listVoterRoundsTx");
  if (options.roundId !== undefined && !isUuid(options.roundId)) return [];
  const rows = await tx
    .select({
      roundId: castingRound.id,
      title: castingRound.title,
      status: castingRound.status,
      phaseDeadlineAt: castingRound.phaseDeadlineAt,
      createdAt: castingRound.createdAt,
      settingsSnapshot: castingRound.settingsSnapshot,
    })
    .from(roundParticipation)
    .innerJoin(
      castingRound,
      and(
        eq(castingRound.id, roundParticipation.roundId),
        eq(castingRound.householdId, roundParticipation.householdId),
      ),
    )
    .innerJoin(
      residentProfile,
      and(
        eq(residentProfile.id, roundParticipation.residentProfileId),
        eq(residentProfile.householdId, roundParticipation.householdId),
      ),
    )
    .where(
      and(
        eq(roundParticipation.householdId, context.householdId),
        eq(roundParticipation.residentProfileId, context.profileId),
        isNull(roundParticipation.removedAt),
        eq(roundParticipation.canVote, true),
        eq(residentProfile.status, "active"),
        ...(options.roundId !== undefined ? [eq(castingRound.id, options.roundId)] : []),
      ),
    )
    .orderBy(desc(castingRound.createdAt), desc(castingRound.id));
  return rows;
}

export interface VoteCandidateCard {
  applicantName: string;
  age: number | null;
  messageRaw: string | null;
  attributes: unknown;
}

export interface VoteCandidate {
  applicationId: string;
  roundId: string;
  createdAt: Date;
  // Present only when the caller asked for the card. Contact columns, `collected_from`, `source`
  // and audit columns are never selected (human decision Q-2, Art. 5(1)(c)).
  card?: VoteCandidateCard;
}

// The rounds' applications in `new`/`screened` that are not the viewer's own, oldest first. The
// port re-applies the voter predicate itself: a round for which the viewer is not an active voting
// participant contributes no row, so a caller that forgot the eligibility check cannot leak card
// data (V-2, hazards "Authorization lives in the repository function"). The card columns are the
// V-2 surface: the second, voter-gated personal-column read, beside getOrganisationApplication.
// `IS DISTINCT FROM`, never `ne()`: became_resident_id is NULL for nearly every application.
export async function listVoteCandidatesTx(
  tx: Tx,
  context: SessionContext,
  roundIds: string[],
  options: { withCard: boolean },
): Promise<VoteCandidate[]> {
  if (context.profileId === null) throw new ProfileRequiredError("listVoteCandidatesTx");
  const ids = roundIds.filter((id) => isUuid(id));
  if (ids.length === 0) return [];
  const profileId = context.profileId;
  const where = and(
    eq(application.householdId, context.householdId),
    inArray(application.roundId, ids),
    inArray(application.state, ["new", "screened"]),
    sql`${application.becameResidentId} IS DISTINCT FROM ${profileId}::uuid`,
    sql`EXISTS (
      SELECT 1 FROM round_participation rp
      JOIN resident_profile rprof ON rprof.id = rp.resident_profile_id AND rprof.household_id = rp.household_id
      WHERE rp.round_id = ${application.roundId}
        AND rp.resident_profile_id = ${profileId}::uuid
        AND rp.household_id = ${context.householdId}::uuid
        AND rp.removed_at IS NULL
        AND rp.can_vote
        AND rprof.status = 'active'
    )`,
  );
  const order = [asc(application.createdAt), asc(application.id)] as const;
  if (!options.withCard) {
    return tx
      .select({
        applicationId: application.id,
        roundId: application.roundId,
        createdAt: application.createdAt,
      })
      .from(application)
      .where(where)
      .orderBy(...order);
  }
  const rows = await tx
    .select({
      applicationId: application.id,
      roundId: application.roundId,
      createdAt: application.createdAt,
      applicantName: application.applicantName,
      age: application.age,
      messageRaw: application.messageRaw,
      attributes: application.attributes,
    })
    .from(application)
    .where(where)
    .orderBy(...order);
  return rows.map((r) => ({
    applicationId: r.applicationId,
    roundId: r.roundId,
    createdAt: r.createdAt,
    card: {
      applicantName: r.applicantName,
      age: r.age,
      messageRaw: r.messageRaw,
      attributes: r.attributes,
    },
  }));
}

export class ProcedureLockedError extends Error {
  constructor(public readonly openRoundId: string, field: string) {
    super(`Cannot change ${field}: round ${openRoundId} is open (FR-1.21)`);
    this.name = "ProcedureLockedError";
  }
}

// FR-1.21/FR-1.22/invariant I-7: while any round is open, the four locked settings are refused,
// naming the open round. Lives in the casting module (not identity/repository.ts), because
// identity is the bounded-context root and may import nothing (kontextgrenzen.md §4) — the lock
// itself is a casting-round invariant reaching into identity-owned data, and casting is already
// permitted to import from identity, never the reverse.
export async function updateHouseholdSettingsWithProcedureLock(
  context: SessionContext,
  patch: Partial<Record<LockedSettingsField, unknown>>,
  actor: Actor,
) {
  // FR-1.8/G-C (Convergence): this had no authorization check at all — any signed-in account,
  // including a plain resident with no granted permissions, could change household settings as
  // long as no round was open. `manage_voting_procedure` (matrix row „Abstimmungsverfahren ändern";
  // household ✅, moderator ⬜) is in the stored household set (identity/schema.ts,
  // HOUSEHOLD_PERMISSIONS) and otherwise individually grantable to a moderator; no role is read.
  if (!actor.accountId) throw new Error("updateHouseholdSettingsWithProcedureLock requires an actor accountId");
  if (actor.accountId !== context.accountId) throw new PermissionDeniedError("manage_voting_procedure");

  return withSessionContext(context, async (tx) => {
    await assertHasPermissionTx(tx, context, "manage_voting_procedure");
    const [settings] = await tx
      .select()
      .from(householdSettings)
      .where(eq(householdSettings.householdId, context.householdId))
      .for("update");
    if (!settings) throw new Error(`HouseholdSettings not found for household ${context.householdId}`);
    const changedFields = Object.keys(patch) as LockedSettingsField[];
    const [openRound] = await tx
      .select({ id: castingRound.id })
      .from(castingRound)
      .where(and(eq(castingRound.householdId, context.householdId), eq(castingRound.status, "open")));

    const lockedFieldChanged = changedFields.some((f) => LOCKED_SETTINGS_FIELDS.includes(f));
    if (openRound && lockedFieldChanged) {
      throw new ProcedureLockedError(openRound.id, changedFields.join(", "));
    }

    const columnPatch: Record<string, unknown> = {};
    if (patch.scaleWeights !== undefined) columnPatch.scaleWeights = patch.scaleWeights;
    if (patch.favoriteBudgetFactor !== undefined) columnPatch.favoriteBudgetFactor = patch.favoriteBudgetFactor;
    if (patch.hideResultsUntilVoted !== undefined) columnPatch.hideResultsUntilVoted = patch.hideResultsUntilVoted;
    if (patch.quorumShare !== undefined) columnPatch.quorumShare = patch.quorumShare;
    columnPatch.updatedAt = new Date();
    columnPatch.updatedByAccountId = actor.accountId;

    const [updated] = await tx
      .update(householdSettings)
      .set(columnPatch)
      .where(eq(householdSettings.householdId, context.householdId))
      .returning();

    await recordActivityEvent(tx, {
      householdId: context.householdId,
      eventType: "household_settings.changed",
      subjectType: "household_settings",
      subjectId: context.householdId,
      actorAccountId: actor.accountId,
      actorProfileId: actor.profileId,
      payload: { field: changedFields.join(",") },
    });

    return updated;
  });
}

// AC-1.14/FR-1.22: an administrative bypass path that still writes an ActivityEvent and marks the
// round with a "procedure changed" notice — used only to exercise the guarded scenario where a
// locked setting is changed anyway; not exposed to any normal UI action.
export async function forceChangeSettingWhileRoundOpen(
  context: SessionContext,
  field: LockedSettingsField,
  value: unknown,
  openRoundId: string,
  actor: Actor,
) {
  if (!actor.accountId) throw new Error("forceChangeSettingWhileRoundOpen requires an actor accountId");
  const accountId = actor.accountId;
  await assertHasPermission(context, accountId, "manage_voting_procedure");

  return withSessionContext(context, async (tx) => {
    await tx
      .update(householdSettings)
      .set({ [field]: value, updatedAt: new Date(), updatedByAccountId: accountId })
      .where(eq(householdSettings.householdId, context.householdId));

    await recordActivityEvent(tx, {
      householdId: context.householdId,
      eventType: "household_settings.changed_while_round_open",
      subjectType: "casting_round",
      subjectId: openRoundId,
      actorAccountId: actor.accountId,
      actorProfileId: actor.profileId,
      payload: { field, roundId: openRoundId },
    });
  });
}

// EC-1.5: a second round may exist at the data level while one is already open, but the UI never
// offers it — one round is "active" (the most recently opened/created one still not archived),
// others reachable only via a round list. Column-restricted for a profile-less session same as
// getRoundForSession (ADR-014).
export async function listRoundsForSession(context: SessionContext) {
  return withSessionContext(context, async (tx) => {
    if (context.profileId === null) {
      return tx.execute<{
        id: string;
        household_id: string;
        title: string;
        status: string;
        room_ids: string[];
        opened_at: string | null;
        closed_at: string | null;
        phase_deadline_at: string | null;
        retention_until: string | null;
        retention_extensions: string[];
        retention_warned_at: string | null;
      }>(
        // `created_at` isn't in this view (ADR-014 doesn't list it as visible to a profile-less
        // session, research.md §3) — ordering uses only columns the view actually exposes.
        sql`SELECT * FROM casting_round_admin_view WHERE household_id = ${context.householdId}::uuid ORDER BY opened_at DESC NULLS LAST, id DESC`,
      );
    }
    return tx
      .select()
      .from(castingRound)
      .where(eq(castingRound.householdId, context.householdId))
      .orderBy(sql`created_at DESC`);
  });
}

// start-screen design.md Decision 4: the room-covered-by-a-round check for listOrganisationTasks
// below and getStartOverview's own reads share the "open round" concept but nothing else, so this
// stays local rather than becoming a third exported helper.
export interface OrganisationTask {
  kind: "open_round_for_room";
  roomId: string;
  label: string;
}

// start-screen design.md Decision 4/Assumption 3 (tasks.md 3.2): a room open for letting and not
// covered by any draft/open/paused round is v0.1's one organisation task. Returns `[]` for a
// viewer who does not hold `manage_rounds` — the permission `rounds/new`'s own action already
// requires — so the bridge's count never promises something the destination action would refuse.
// Carries no application-derived value, so it is not a G-D15 read (design.md Decision 9's finding
// is scoped to `application`, not `room`/`casting_round`).
export async function listOrganisationTasks(context: SessionContext): Promise<OrganisationTask[]> {
  try {
    await assertHasPermission(context, context.accountId, "manage_rounds");
  } catch (err) {
    if (err instanceof PermissionDeniedError) return [];
    throw err;
  }

  return withSessionContext(context, async (tx) => {
    const rows = await tx.execute<{ id: string; label: string }>(
      sql`SELECT room.id, room.label
          FROM room
          WHERE room.household_id = ${context.householdId}::uuid
            AND room.status = 'open' AND room.deleted_at IS NULL
            AND NOT EXISTS (
              SELECT 1 FROM casting_round cr
              WHERE cr.household_id = ${context.householdId}::uuid
                AND cr.status IN ('draft', 'open', 'paused')
                AND room.id = ANY(cr.room_ids)
            )`,
    );
    return rows.map((r: { id: string; label: string }) => ({
      kind: "open_round_for_room" as const,
      roomId: r.id,
      label: r.label,
    }));
  });
}

export interface StartOpenRound {
  roundId: string;
  title: string;
  phaseDeadlineAt: Date | null;
  canVote: boolean;
}

export interface StartStanding {
  roundId: string;
  stateCounts: Partial<Record<ApplicationState, number>>;
}

export interface StartOverview {
  anyOpenRound: boolean;
  openRounds: StartOpenRound[];
  standing: StartStanding | null;
}

// T-5 ("awaiting my vote") is not computed here: deliberation owns it once, in getAwaitingVoteCounts,
// so the deck and the count cannot drift (F4 change 1, design D3).

// start-screen design.md Decision 4/7/9 (FR-2.20-2.24, G-D15, V-1): the Start screen's one read.
// `null` for a profile-less (household-account) session, checked as the FIRST statement — before
// withSessionContext, so no query is issued at all for such a session (Decision 9's own test pins
// this with a spy on withSessionContext). No participation counter is read (human decision,
// 2026-09-24 — it left Start).
export async function getStartOverview(context: SessionContext): Promise<StartOverview | null> {
  if (context.profileId === null) return null;
  const profileId = context.profileId;

  return withSessionContext(context, async (tx) => {
    // Identity/lifecycle only — no application data — so this half of the read is safe even for
    // the "round runs without you" case below.
    const [{ exists: anyOpenRound }] = await tx.execute<{ exists: boolean }>(
      // household_id stated as well as RLS-scoped, like listRooms/listRoundsForSession, so the
      // answer stays this household's even under a connection that bypasses RLS (review finding).
      sql`SELECT EXISTS (
            SELECT 1 FROM casting_round
            WHERE household_id = ${context.householdId}::uuid AND status = 'open'
          ) AS exists`,
    );

    // Every open round the viewer actively takes part in (EC-2.2/EC-2.3: joining after open
    // counts via the auto-join trigger the same as the founding snapshot).
    const participationRows = await tx.execute<{
      round_id: string;
      title: string;
      phase_deadline_at: string | null;
      can_vote: boolean;
    }>(
      sql`SELECT cr.id AS round_id, cr.title, cr.phase_deadline_at, rp.can_vote
          FROM round_participation rp
          JOIN casting_round cr ON cr.id = rp.round_id
          WHERE rp.resident_profile_id = ${profileId}::uuid
            AND rp.household_id = ${context.householdId}::uuid
            AND rp.removed_at IS NULL
            AND cr.status = 'open'
          ORDER BY cr.created_at DESC`,
    );

    const openRounds: StartOpenRound[] = participationRows.map(
      (row: { round_id: string; title: string; phase_deadline_at: string | null; can_vote: boolean }) => ({
        roundId: row.round_id,
        title: row.title,
        phaseDeadlineAt: row.phase_deadline_at ? new Date(row.phase_deadline_at) : null,
        canVote: row.can_vote,
      }),
    );

    // EC-1.5: the standing's round is the most recently created open round THE VIEWER TAKES PART
    // IN — openRounds is already in that order (participationRows' ORDER BY). Not the household's
    // newest open round: a viewer taking part only in an older one would otherwise get no standing
    // and be told the round runs without them, which is false (review finding, test f4). Only a
    // viewer in no open round at all gets no standing (spec.md "A round runs without the resident").
    const activeRound = openRounds[0] ? { id: openRounds[0].roundId } : undefined;

    let standing: StartStanding | null = null;
    if (activeRound) {
      // §3.1's phase/distribution, computed from state counts. Excludes deleted applications
      // and — V-1, design.md Decision 7 — the viewer's own past application: `IS DISTINCT FROM`,
      // never Drizzle's `ne()` (which compiles to `<>` and silently drops every NULL row, i.e.
      // nearly every application, since `became_resident_id` is null until `moved_in`). Under
      // A-2.4 (one account per membership) the profile id is the account's whole redaction set
      // in this slice — full V-1 (`redaction_subjects()`) is not built.
      const stateRows = await tx.execute<{ state: ApplicationState; count: number }>(
        sql`SELECT state, count(*)::int AS count FROM application
            WHERE round_id = ${activeRound.id}::uuid
              AND household_id = ${context.householdId}::uuid
              AND deleted_at IS NULL
              AND became_resident_id IS DISTINCT FROM ${profileId}::uuid
            GROUP BY state`,
      );
      const stateCounts: Partial<Record<ApplicationState, number>> = {};
      for (const row of stateRows as { state: ApplicationState; count: number }[]) {
        stateCounts[row.state] = row.count;
      }
      standing = { roundId: activeRound.id, stateCounts };
    }

    return { anyOpenRound, openRounds, standing };
  });
}

// AC-1.14: has this round had a procedure change recorded against it while it was open?
export async function hasProcedureChangedNotice(context: SessionContext, roundId: string): Promise<boolean> {
  return withSessionContext(context, async (tx) => {
    const rows = await tx
      .select({ id: activityEvent.id })
      .from(activityEvent)
      .where(
        and(
          eq(activityEvent.eventType, "household_settings.changed_while_round_open"),
          eq(activityEvent.subjectId, roundId),
        ),
      );
    return rows.length > 0;
  });
}
