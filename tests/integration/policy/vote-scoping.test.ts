import { eq, sql } from "drizzle-orm";
import { afterEach, describe, expect, it } from "vitest";
import { withSessionContext, type SessionContext } from "@/db/session-context";
import { castVote } from "@/modules/deliberation/repository";
import { vote } from "@/modules/deliberation/schema";
import { cleanupAll, deleteTestAccount, type TestHousehold } from "../../helpers/identity";
import { claimPlainMember, insertApplicationAt, setupPipeline } from "../../helpers/pipeline";
import { pgErrorOf, rawVoteInsertSql, thrownBy } from "../../helpers/votes";

// [G-C7 policy layer] vote_via_policy, F4 change 1 tasks 6.3: household isolation and the
// RESTRICTIVE resident-profile policy (G-D15 (b)) on `vote`, seen through the repository and the
// query builder. The raw-SQL side is tests/integration/raw-sql/vote-scoping.test.ts; a pass on one
// never substitutes for the other. The profile-less INSERT is held by the trigger vote_guard (step
// 5, `vote_application_paired`), which answers BEFORE the policy's WITH CHECK (design D6, "Ordering
// against RLS"); the policy's own test is the count(*).
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

const countVotes = (context: SessionContext) =>
  withSessionContext(context, async (tx) => {
    const [row] = await tx.select({ n: sql<number>`count(*)::int` }).from(vote);
    return row.n;
  });

describe("[G-C7 policy] vote household isolation", () => {
  it("another household's votes are invisible and count(*) counts only one's own", async () => {
    const a = await householdWithOneVote();
    const b = await householdWithOneVote();
    expect(await countVotes(a.voter.context)).toBe(1);
    expect(await countVotes(b.voter.context)).toBe(1);
    const seenByB = await withSessionContext(b.voter.context, (tx) =>
      tx.select().from(vote).where(eq(vote.applicationId, a.app.id)),
    );
    expect(seenByB).toHaveLength(0);
  });
});

describe("[G-C7 policy] vote requires a resident profile (G-D15 (b))", () => {
  it("a profile-less session of the same household counts and reads no vote", async () => {
    const a = await householdWithOneVote();
    const profileless: SessionContext = { ...a.s.hh.context, profileId: null };
    expect(await countVotes(profileless)).toBe(0);
    const rows = await withSessionContext(profileless, (tx) => tx.select().from(vote));
    expect(rows).toHaveLength(0);
  });

  it("a profile-less insert is refused, by the trigger (vote_application_paired), not by the policy", async () => {
    const a = await householdWithOneVote();
    const app2 = await insertApplicationAt(a.s, "new");
    const profileless: SessionContext = { ...a.s.hh.context, profileId: null };
    const err = await thrownBy(() =>
      withSessionContext(profileless, (tx) =>
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
