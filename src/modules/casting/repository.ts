import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import { isUuid, withSessionContext, type SessionContext } from "@/db/session-context";
import { recordActivityEvent } from "@/modules/audit/repository";
import { activityEvent } from "@/modules/audit/schema";
import { assertHasPermission } from "@/modules/identity/repository";
import { householdSettings, membership, residentProfile } from "@/modules/identity/schema";
import { application, castingRound, room, roundParticipation } from "./schema";
import { assertTransitionAllowed, type ApplicationState } from "./transitions";
import { assertF1RoomTransitionAllowed, type RoomStatus } from "./room-transitions";

export interface Actor {
  accountId: string | null;
  profileId: string | null;
}

// The tx type withSessionContext's callback receives — inferred rather than duplicated, so a
// helper that takes an already-open tx (shared across createRound + openRound, see
// createAndOpenRound below) stays in sync with withSessionContext's own signature.
type Tx = Parameters<Parameters<typeof withSessionContext>[1]>[0];

// FR-0.1: the only sanctioned entry point for reading/writing Application — every call opens its
// transaction through the session-context helper (FR-0.3), never queries the raw client directly.
export async function getApplication(context: SessionContext, id: string) {
  return withSessionContext(context, async (tx) => {
    const [row] = await tx.select().from(application).where(eq(application.id, id));
    return row ?? null;
  });
}

// FR-0.10/FR-0.11/FR-0.12: validates against the declared transition table, throws on anything
// undeclared, and writes exactly one ActivityEvent alongside the state change — `state` is the
// only field this touches; no derived boolean is read or written for lifecycle status.
export async function transitionApplication(
  context: SessionContext,
  applicationId: string,
  toState: ApplicationState,
  actor: Actor,
) {
  return withSessionContext(context, async (tx) => {
    const [current] = await tx
      .select()
      .from(application)
      .where(eq(application.id, applicationId));

    if (!current) {
      throw new Error(`Application not found: ${applicationId}`);
    }

    const fromState = current.state as ApplicationState;
    assertTransitionAllowed(fromState, toState);

    const [updated] = await tx
      .update(application)
      .set({ state: toState, stateChangedAt: new Date() })
      .where(eq(application.id, applicationId))
      .returning();

    await recordActivityEvent(tx, {
      householdId: current.householdId,
      eventType: "application.state_changed",
      subjectType: "application",
      subjectId: applicationId,
      actorAccountId: actor.accountId,
      actorProfileId: actor.profileId,
      payload: { fromState, toState },
    });

    return updated;
  });
}

// FR-1.9: create, rename, remove — the moderator's room CRUD (manage_rooms).
// G-C (speckit-analyze finding C1): these four functions had no authorization check of their
// own — same class of bug already found and fixed once for `manage_settings` above — relying
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
    const [current] = await tx.select().from(room).where(eq(room.id, roomId));
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
  await assertHasPermission(context, actor.accountId, "manage_rooms");
  return withSessionContext(context, async (tx) => {
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
// FR-1.12: round-lifecycle actions (create/open/manual-add) are gated on `close_round`, the
// permission `data-model.md` already documents for `draft → open` — same G-C fix as createRoom
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
  await assertHasPermission(context, actor.accountId, "close_round");
  return withSessionContext(context, (tx) => insertDraftRoundTx(tx, context, title, roomIds, actor));
}

export class RoundOpenPreconditionError extends Error {}

const LOCKED_ROOM_STATUSES: ReadonlySet<RoomStatus> = new Set(["occupied", "not_available"]);

// FR-1.14/FR-1.15/FR-1.16: draft -> open takes an atomic snapshot of eligible residents into
// RoundParticipation and freezes HouseholdSettings' four locked fields into settings_snapshot —
// both effects or neither, in one transaction. EC-1.1/EC-1.2/EC-1.3 preconditions checked first.
async function openRoundTx(tx: Tx, context: SessionContext, roundId: string, actor: Actor) {
  // EC-1.9: two moderators opening the same draft round simultaneously must produce exactly
  // one opening. `FOR UPDATE` locks this row for the rest of the transaction — a concurrent
  // openRound's own SELECT ... FOR UPDATE blocks here until this transaction commits or rolls
  // back, then re-reads the now-`open` row and correctly fails the status check below, instead
  // of both transactions reading `draft` and both inserting a duplicate snapshot.
  const [round] = await tx.select().from(castingRound).where(eq(castingRound.id, roundId)).for("update");
  if (!round) throw new Error(`CastingRound not found: ${roundId}`);
  if (round.status !== "draft") {
    throw new RoundOpenPreconditionError(`Round ${roundId} is not in draft`);
  }

  // EC-1.1: no rooms selected.
  if (round.roomIds.length === 0) {
    throw new RoundOpenPreconditionError("This round has no rooms selected");
  }

  // EC-1.2: every covered room is already occupied/not_available.
  const coveredRooms = await tx.select().from(room).where(inArray(room.id, round.roomIds));
  const hasAvailableRoom = coveredRooms.some((r) => !LOCKED_ROOM_STATUSES.has(r.status));
  if (!hasAvailableRoom) {
    throw new RoundOpenPreconditionError(
      "Every room this round covers is already occupied or not available",
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
    throw new RoundOpenPreconditionError("There are no eligible residents to snapshot");
  }

  const [settings] = await tx
    .select()
    .from(householdSettings)
    .where(eq(householdSettings.householdId, context.householdId));
  if (!settings) throw new Error(`HouseholdSettings not found for household ${context.householdId}`);

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
  await assertHasPermission(context, actor.accountId, "close_round");
  return withSessionContext(context, (tx) => openRoundTx(tx, context, roundId, actor));
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
  await assertHasPermission(context, actor.accountId, "close_round");
  return withSessionContext(context, async (tx) => {
    const round = await insertDraftRoundTx(tx, context, title, roomIds, actor);
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
  await assertHasPermission(context, actor.accountId, "close_round");
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
export async function getRoundParticipants(context: SessionContext, roundId: string) {
  if (context.profileId === null) return [];
  return withSessionContext(context, (tx) =>
    tx
      .select({ displayName: residentProfile.displayName })
      .from(roundParticipation)
      .innerJoin(residentProfile, eq(residentProfile.id, roundParticipation.residentProfileId))
      .where(and(eq(roundParticipation.roundId, roundId), isNull(roundParticipation.removedAt))),
  );
}

const LOCKED_SETTINGS_FIELDS = [
  "scaleWeights",
  "favoriteBudgetFactor",
  "hideResultsUntilVoted",
  "quorumShare",
] as const;
type LockedSettingsField = (typeof LOCKED_SETTINGS_FIELDS)[number];

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
  // long as no round was open. `manage_settings` is household_admin-implicit (assertHasPermission)
  // and otherwise individually grantable, same shape as manage_rooms/close_round elsewhere.
  if (!actor.accountId) throw new Error("updateHouseholdSettingsWithProcedureLock requires an actor accountId");
  await assertHasPermission(context, actor.accountId, "manage_settings");

  return withSessionContext(context, async (tx) => {
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
  await assertHasPermission(context, accountId, "manage_settings");

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
