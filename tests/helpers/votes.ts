import { and, eq, sql } from "drizzle-orm";
import { withSessionContext, type SessionContext } from "@/db/session-context";
import { castingRound, roundParticipation } from "@/modules/casting/schema";
import { vote } from "@/modules/deliberation/schema";
import { insertApplicationAt, type PipelineSetup } from "./pipeline";
import type { TestHousehold } from "./identity";

// Shared fixtures for F4 change 1's vote tests. G-B1: synthetic data only.
//
// A claimed active resident is a participant of every open round (snapshot at open, or the
// auto-join trigger afterwards), so a "non-participant" is built by a round created WITHOUT their
// participation (tests/helpers/applications.ts insertTestRound), never assumed. `app_runtime`
// under the household or a moderator context may UPDATE casting_round.status and
// round_participation.can_vote / removed_at (permissive household policy), which is how the
// unreachable states below are built.

type RoundStatus = (typeof castingRound.$inferInsert)["status"];

export async function setRoundStatus(s: PipelineSetup, roundId: string, status: RoundStatus) {
  await withSessionContext(s.moderator.context, (tx) =>
    tx.update(castingRound).set({ status }).where(eq(castingRound.id, roundId)),
  );
}

export async function setCanVote(
  hh: TestHousehold,
  roundId: string,
  residentProfileId: string,
  canVote: boolean,
) {
  await withSessionContext(hh.context, (tx) =>
    tx
      .update(roundParticipation)
      .set({ canVote })
      .where(
        and(eq(roundParticipation.roundId, roundId), eq(roundParticipation.residentProfileId, residentProfileId)),
      ),
  );
}

export async function setRemoved(hh: TestHousehold, roundId: string, residentProfileId: string) {
  await withSessionContext(hh.context, (tx) =>
    tx
      .update(roundParticipation)
      .set({ removedAt: new Date() })
      .where(
        and(eq(roundParticipation.roundId, roundId), eq(roundParticipation.residentProfileId, residentProfileId)),
      ),
  );
}

// A voting participation in a round the profile is not in yet (a second round, say).
export async function addParticipation(hh: TestHousehold, roundId: string, residentProfileId: string) {
  await withSessionContext(hh.context, (tx) =>
    tx.insert(roundParticipation).values({
      roundId,
      householdId: hh.householdId,
      residentProfileId,
      source: "added_manually",
      canVote: true,
    }),
  );
}

// The rows of `vote` visible to a resident of the household, optionally for one application.
export async function readVotes(context: SessionContext, applicationId?: string) {
  return withSessionContext(context, (tx) =>
    tx.select().from(vote).where(applicationId ? eq(vote.applicationId, applicationId) : undefined),
  );
}

export interface PgErrorFields {
  code?: string;
  constraint_name?: string;
  detail?: string;
}

// The postgres driver's error is on `cause` for a Drizzle-wrapped one, or the error itself.
export function pgErrorOf(caught: unknown): PgErrorFields {
  const err = caught as PgErrorFields & { cause?: PgErrorFields };
  return err.code ? err : (err.cause ?? err);
}

// Runs the callback and returns what it threw; fails the test if it did not throw.
export async function thrownBy(fn: () => Promise<unknown>): Promise<unknown> {
  try {
    await fn();
  } catch (err) {
    return err;
  }
  throw new Error("expected the call to be refused, but it succeeded");
}

export interface RawVote {
  householdId: string;
  roundId: string;
  applicationId: string;
  residentProfileId: string;
  value?: "no" | "rather_not" | "good" | "definitely";
}

// A raw INSERT of an `invite` vote, bypassing castVote. Extra column names/values (timestamps,
// withdrawn_at) can be supplied as SQL fragments.
export function rawVoteInsertSql(v: RawVote, extra: { columns?: string; values?: ReturnType<typeof sql> } = {}) {
  const columns = sql.raw(
    `household_id, round_id, application_id, resident_profile_id, stage, value${extra.columns ? `, ${extra.columns}` : ""}`,
  );
  return sql`INSERT INTO vote (${columns}) VALUES (${v.householdId}::uuid, ${v.roundId}::uuid, ${v.applicationId}::uuid,
    ${v.residentProfileId}::uuid, 'invite'::vote_stage, ${v.value ?? "good"}::vote_value${extra.values ? sql`, ${extra.values}` : sql``})`;
}

// A votable application (state `new`) in the fixture's round, inserted through the moderator.
export function votableApplication(s: PipelineSetup, roundId = s.roundId) {
  return insertApplicationAt(s, "new", {}, roundId);
}
