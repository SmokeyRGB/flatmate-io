import { eq } from "drizzle-orm";
import { afterEach, describe, expect, it } from "vitest";
import { withSessionContext } from "@/db/session-context";
import { castVote } from "@/modules/deliberation/repository";
import { vote } from "@/modules/deliberation/schema";
import { residentProfile } from "@/modules/identity/schema";
import { cleanupAll, deleteTestAccount, type TestHousehold } from "../../helpers/identity";
import { claimPlainMember, holdTransaction, insertApplicationAt, setupPipeline, settlesWithin } from "../../helpers/pipeline";
import { pgErrorOf, rawVoteInsertSql, readVotes } from "../../helpers/votes";

// F4 change 1 tasks 6.4 (EC-4.6, design D7): the deterministic concurrency cases, in the pattern of
// tests/integration/policy/revoked-membership-sign-in.test.ts. A real second writer holds an
// UNCOMMITTED transaction while the vote runs, so the wait is caused by a lock, not by the
// Supavisor pooler happening to serialise one-statement transactions. The "did not settle within
// 2 s" half is evidence only together with the database break of task 9.2 (d), which removes the
// FOR SHARE and shows T2 settling early.
const households: TestHousehold[] = [];
const accountIds: string[] = [];

afterEach(async () => {
  await cleanupAll(...accountIds.map(deleteTestAccount), ...households.map((h) => h.cleanup()));
  accountIds.length = 0;
  households.length = 0;
});

describe("castVote concurrency (EC-4.6)", () => {
  it("two casts on one key: the second waits for the first, then wins; exactly one row", async () => {
    const s = await setupPipeline(households);
    const voter = await claimPlainMember(s.hh, "Voter", accountIds);
    const app = await insertApplicationAt(s, "new");

    const held = holdTransaction(voter.context, async (tx) => {
      await tx
        .insert(vote)
        .values({
          householdId: s.hh.householdId,
          roundId: s.roundId,
          applicationId: app.id,
          residentProfileId: voter.profileId,
          stage: "invite",
          value: "good",
        })
        .onConflictDoUpdate({
          target: [vote.applicationId, vote.residentProfileId, vote.stage],
          set: { value: "good", withdrawnAt: null },
        });
    });
    await held.started;
    const second = castVote(voter.context, { roundId: s.roundId, applicationId: app.id, value: "no" });
    expect(await settlesWithin(second, 2000)).toBe(false);

    held.release();
    await held.done;
    await second;

    const rows = await readVotes(voter.context, app.id);
    expect(rows).toHaveLength(1);
    expect(rows[0].value).toBe("no");
  });

  it("a move-out in flight: the vote waits for the profile lock, then is refused vote_voter_eligible", async () => {
    const s = await setupPipeline(households);
    const voter = await claimPlainMember(s.hh, "Voter", accountIds);
    const app = await insertApplicationAt(s, "new");

    const held = holdTransaction(s.hh.context, async (tx) => {
      await tx.update(residentProfile).set({ status: "moved_out" }).where(eq(residentProfile.id, voter.profileId));
    });
    await held.started;
    // A raw insert, not castVote: the held UPDATE has not touched the membership, so castVote
    // would reach the same trigger; a raw insert makes the path explicit.
    const attempt = withSessionContext(voter.context, (tx) =>
      tx.execute(
        rawVoteInsertSql({
          householdId: s.hh.householdId,
          roundId: s.roundId,
          applicationId: app.id,
          residentProfileId: voter.profileId,
        }),
      ),
    ).then(
      () => ({ refused: null as null | ReturnType<typeof pgErrorOf> }),
      (err: unknown) => ({ refused: pgErrorOf(err) }),
    );
    expect(await settlesWithin(attempt, 2000)).toBe(false);

    held.release();
    await held.done;
    const outcome = await attempt;
    expect(outcome.refused?.code).toBe("23514");
    expect(outcome.refused?.constraint_name).toBe("vote_voter_eligible");
  });
});
