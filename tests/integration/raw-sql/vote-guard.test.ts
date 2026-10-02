import { sql } from "drizzle-orm";
import { afterEach, describe, expect, it } from "vitest";
import { withSessionContext, type SessionContext } from "@/db/session-context";
import { castVote } from "@/modules/deliberation/repository";
import { setMovedOut } from "@/modules/identity/repository";
import { insertTestRound } from "../../helpers/applications";
import { cleanupAll, deleteTestAccount, type TestHousehold } from "../../helpers/identity";
import { claimPlainMember, insertApplicationAt, setupPipeline, type PipelineSetup } from "../../helpers/pipeline";
import { pgErrorOf, rawVoteInsertSql, setRoundStatus, thrownBy, addParticipation } from "../../helpers/votes";

// [G-C7 raw SQL] F4 change 1 tasks 6.2: the vote rules hold for a writer that never passes through
// castVote. Every statement runs as app_runtime with a resident profile set, straight against
// `vote` and `application`; the trigger `vote_guard` (drizzle/0028) answers with SQLSTATE 23514 and
// a named constraint. DB-side breaks (drop the trigger, remove a step) run as owner, task group 9.
const households: TestHousehold[] = [];
const accountIds: string[] = [];

afterEach(async () => {
  await cleanupAll(...accountIds.map(deleteTestAccount), ...households.map((h) => h.cleanup()));
  accountIds.length = 0;
  households.length = 0;
});

async function fixture() {
  const s = await setupPipeline(households);
  const voter = await claimPlainMember(s.hh, "Voter", accountIds);
  return { s, voter };
}

function insertAs(s: PipelineSetup, context: SessionContext, roundId: string, applicationId: string, profileId: string) {
  return withSessionContext(context, (tx) =>
    tx.execute(
      rawVoteInsertSql({ householdId: s.hh.householdId, roundId, applicationId, residentProfileId: profileId }),
    ),
  );
}

async function expectGuard(promise: Promise<unknown>, constraint: string, code = "23514") {
  const err = await thrownBy(() => promise);
  const pg = pgErrorOf(err);
  expect(pg.code).toBe(code);
  expect(pg.constraint_name).toBe(constraint);
}

describe("[G-C7 raw SQL] vote_guard refuses a raw INSERT (drizzle/0028)", () => {
  it("the voter's own application", async () => {
    const { s, voter } = await fixture();
    const own = await insertApplicationAt(s, "screened", { becameResidentId: voter.profileId });
    await expectGuard(insertAs(s, voter.context, s.roundId, own.id, voter.profileId), "vote_not_own_application");
  });

  it("a paused round, naming the state in DETAIL", async () => {
    const { s, voter } = await fixture();
    const app = await insertApplicationAt(s, "new");
    await setRoundStatus(s, s.roundId, "paused");
    const err = await thrownBy(() => insertAs(s, voter.context, s.roundId, app.id, voter.profileId));
    const pg = pgErrorOf(err);
    expect(pg.code).toBe("23514");
    expect(pg.constraint_name).toBe("vote_round_open");
    expect(pg.detail).toBe("paused");
  });

  it("a non-participant (a round built without their participation)", async () => {
    const { s, voter } = await fixture();
    const round = await withSessionContext(s.moderator.context, (tx) => insertTestRound(tx, s.hh.householdId, "open"));
    const app = await insertApplicationAt(s, "new", {}, round);
    await expectGuard(insertAs(s, voter.context, round, app.id, voter.profileId), "vote_voter_eligible");
  });

  it("a cross-round pairing, the voter participating in both rounds", async () => {
    const { s, voter } = await fixture();
    const other = await withSessionContext(s.moderator.context, (tx) => insertTestRound(tx, s.hh.householdId, "open"));
    await addParticipation(s.hh, other, voter.profileId);
    const app = await insertApplicationAt(s, "new"); // in s.roundId
    await expectGuard(insertAs(s, voter.context, other, app.id, voter.profileId), "vote_application_paired");
  });

  it("under a moved-out profile's context, the participation still active (step 4)", async () => {
    const { s, voter } = await fixture();
    const app = await insertApplicationAt(s, "new");
    await setMovedOut(s.hh.context, s.hh.accountId, voter.accountId);
    await expectGuard(insertAs(s, voter.context, s.roundId, app.id, voter.profileId), "vote_voter_eligible");
  });

  it("an invited application", async () => {
    const { s, voter } = await fixture();
    const app = await insertApplicationAt(s, "invited");
    await expectGuard(insertAs(s, voter.context, s.roundId, app.id, voter.profileId), "vote_application_votable");
  });
});

describe("[G-C7 raw SQL] vote_guard on the rest of the row", () => {
  it("a raw UPDATE that changes application_id -> vote_identity_immutable", async () => {
    const { s, voter } = await fixture();
    const a = await insertApplicationAt(s, "new");
    const b = await insertApplicationAt(s, "new");
    await castVote(voter.context, { roundId: s.roundId, applicationId: a.id, value: "good" });
    await expectGuard(
      withSessionContext(voter.context, (tx) =>
        tx.execute(sql`UPDATE vote SET application_id = ${b.id}::uuid WHERE application_id = ${a.id}::uuid`),
      ),
      "vote_identity_immutable",
    );
  });

  it("timestamps and withdrawn_at supplied on INSERT are stored as normalised by step 0", async () => {
    const { s, voter } = await fixture();
    const app = await insertApplicationAt(s, "new");
    await withSessionContext(voter.context, (tx) =>
      tx.execute(
        rawVoteInsertSql(
          {
            householdId: s.hh.householdId,
            roundId: s.roundId,
            applicationId: app.id,
            residentProfileId: voter.profileId,
          },
          { columns: "created_at, updated_at, withdrawn_at", values: sql`'2000-01-01T00:00:00Z'::timestamptz, '2000-01-01T00:00:00Z'::timestamptz, now()` },
        ),
      ),
    );
    const rows = await withSessionContext(voter.context, (tx) =>
      tx.execute<{ created_at: string; updated_at: string; withdrawn_at: string | null }>(
        sql`SELECT created_at, updated_at, withdrawn_at FROM vote WHERE application_id = ${app.id}::uuid`,
      ),
    );
    expect(rows).toHaveLength(1);
    expect(new Date(rows[0].created_at).getFullYear()).toBeGreaterThan(2020);
    expect(rows[0].updated_at).toEqual(rows[0].created_at);
    expect(rows[0].withdrawn_at).toBeNull();
  });
});

describe("[G-C7 raw SQL] the own-profile policies (drizzle/0028)", () => {
  it("a raw INSERT naming another ELIGIBLE profile -> 42501 (the trigger passes, the policy refuses)", async () => {
    const { s, voter } = await fixture();
    const app = await insertApplicationAt(s, "new");
    // A policy violation carries no constraint name: the SQLSTATE alone is asserted.
    const err = await thrownBy(() => insertAs(s, voter.context, s.roundId, app.id, s.moderator.profileId));
    expect(pgErrorOf(err).code).toBe("42501");
  });

  it("a raw UPDATE of another resident's vote changes 0 rows and leaves the value", async () => {
    const { s, voter } = await fixture();
    const app = await insertApplicationAt(s, "new");
    await castVote(s.moderator.context, { roundId: s.roundId, applicationId: app.id, value: "good" });
    const changed = await withSessionContext(voter.context, (tx) =>
      tx.execute(sql`UPDATE vote SET value = 'no' WHERE application_id = ${app.id}::uuid RETURNING id`),
    );
    expect(changed).toHaveLength(0);
    const rows = await withSessionContext(s.moderator.context, (tx) =>
      tx.execute<{ value: string }>(sql`SELECT value FROM vote WHERE application_id = ${app.id}::uuid`),
    );
    expect(rows.map((r: { value: string }) => r.value)).toEqual(["good"]);
  });
});

describe("[G-C7 raw SQL] application_keeps_votes (drizzle/0028)", () => {
  it("refuses moving a voted application to another round, while an unvoted one moves", async () => {
    const { s, voter } = await fixture();
    const other = await withSessionContext(s.moderator.context, (tx) => insertTestRound(tx, s.hh.householdId, "open"));
    const voted = await insertApplicationAt(s, "new");
    const unvoted = await insertApplicationAt(s, "new");
    await castVote(voter.context, { roundId: s.roundId, applicationId: voted.id, value: "good" });

    await expectGuard(
      withSessionContext(s.moderator.context, (tx) =>
        tx.execute(sql`UPDATE application SET round_id = ${other}::uuid WHERE id = ${voted.id}::uuid`),
      ),
      "application_keeps_votes",
    );
    const moved = await withSessionContext(s.moderator.context, (tx) =>
      tx.execute(sql`UPDATE application SET round_id = ${other}::uuid WHERE id = ${unvoted.id}::uuid RETURNING id`),
    );
    expect(moved).toHaveLength(1);
  });
});
