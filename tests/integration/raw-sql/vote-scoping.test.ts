import { sql } from "drizzle-orm";
import { afterEach, describe, expect, it } from "vitest";
import { withSessionContext, type SessionContext } from "@/db/session-context";
import { castVote } from "@/modules/deliberation/repository";
import { cleanupAll, deleteTestAccount, type TestHousehold } from "../../helpers/identity";
import { claimPlainMember, insertApplicationAt, setupPipeline } from "../../helpers/pipeline";
import { pgErrorOf, rawVoteInsertSql, thrownBy } from "../../helpers/votes";

// [G-C7 raw SQL] vote_via_raw_sql, F4 change 1 tasks 6.3: the same isolation as
// tests/integration/policy/vote-scoping.test.ts, asserted by raw statements as app_runtime that
// never pass through the repository. The profile-less INSERT case is held by the trigger
// (`vote_application_paired`), not by the policy; the policy's own test is the count(*), for an
// unset AND an empty `app.profile_id` (a pooled connection reads back '' rather than NULL).
const households: TestHousehold[] = [];
const accountIds: string[] = [];

afterEach(async () => {
  await cleanupAll(...accountIds.map(deleteTestAccount), ...households.map((h) => h.cleanup()));
  accountIds.length = 0;
  households.length = 0;
});

async function householdWithOneVote() {
  const s = await setupPipeline(households);
  const voter = await claimPlainMember(s.hh, "Voter", accountIds);
  const app = await insertApplicationAt(s, "new");
  await castVote(voter.context, { roundId: s.roundId, applicationId: app.id, value: "good" });
  return { s, voter, app };
}

const rawCount = (context: SessionContext) =>
  withSessionContext(context, async (tx) => {
    const rows = await tx.execute<{ n: number }>(sql`SELECT count(*)::int AS n FROM vote`);
    return rows[0].n;
  });

describe("[G-C7 raw SQL] vote household isolation", () => {
  it("count(*) sees only one's own household's votes; another household's row is invisible", async () => {
    const a = await householdWithOneVote();
    const b = await householdWithOneVote();
    expect(await rawCount(a.voter.context)).toBe(1);
    expect(await rawCount(b.voter.context)).toBe(1);
    const rows = await withSessionContext(b.voter.context, (tx) =>
      tx.execute(sql`SELECT id FROM vote WHERE application_id = ${a.app.id}::uuid`),
    );
    expect(rows).toHaveLength(0);
  });
});

describe("[G-C7 raw SQL] vote requires a resident profile (G-D15 (b))", () => {
  it("count(*) is 0 with no profile set", async () => {
    const a = await householdWithOneVote();
    expect(await rawCount({ ...a.s.hh.context, profileId: null })).toBe(0);
  });

  it("count(*) is 0 with app.profile_id set to the empty string", async () => {
    const a = await householdWithOneVote();
    const n = await withSessionContext(a.voter.context, async (tx) => {
      await tx.execute(sql`SELECT set_config('app.profile_id', '', true)`);
      const rows = await tx.execute<{ n: number }>(sql`SELECT count(*)::int AS n FROM vote`);
      return rows[0].n;
    });
    expect(n).toBe(0);
  });

  it("a profile-less raw insert is refused by the trigger, vote_application_paired", async () => {
    const a = await householdWithOneVote();
    const app2 = await insertApplicationAt(a.s, "new");
    const err = await thrownBy(() =>
      withSessionContext({ ...a.s.hh.context, profileId: null }, (tx) =>
        tx.execute(
          rawVoteInsertSql({
            householdId: a.s.hh.householdId,
            roundId: a.s.roundId,
            applicationId: app2.id,
            residentProfileId: a.voter.profileId,
          }),
        ),
      ),
    );
    const pg = pgErrorOf(err);
    expect(pg.code).toBe("23514");
    expect(pg.constraint_name).toBe("vote_application_paired");
  });
});
