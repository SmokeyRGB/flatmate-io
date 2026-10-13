import { afterEach, describe, expect, it } from "vitest";
import { withSessionContext } from "@/db/session-context";
import { castVote, withdrawVote } from "@/modules/deliberation/repository";
import { cleanupAll, deleteTestAccount, type TestHousehold } from "../../helpers/identity";
import {
  claimPlainMember,
  holdTransaction,
  insertApplicationAt,
  setupPipeline,
  settlesWithin,
} from "../../helpers/pipeline";
import { pgErrorOf, readVotes } from "../../helpers/votes";

// F4 change 2 (vote-withdrawal-and-audit) tasks 3.3: drizzle/0028's lock-order obligation. A held
// uncommitted `application FOR UPDATE` stands in for deleteApplication (F3 change 4). withdrawVote
// must block on the application BEFORE it locks the vote row, so a probe on the vote row still
// gets its lock. A plain UPDATE of the vote row would lock it first and fail the probe with 55P03.
// Pattern of tests/integration/policy/revoked-membership-sign-in.test.ts: a real second writer.
const households: TestHousehold[] = [];
const accountIds: string[] = [];

afterEach(async () => {
  await cleanupAll(...accountIds.map(deleteTestAccount), ...households.map((h) => h.cleanup()));
  accountIds.length = 0;
  households.length = 0;
});

describe("withdrawVote lock order (drizzle/0028)", () => {
  it("waits for the application lock before it takes the vote row lock", async () => {
    const s = await setupPipeline(households);
    const voter = await claimPlainMember(s.hh, "Voter", accountIds);
    const app = await insertApplicationAt(s, "new");
    await castVote(voter.context, { roundId: s.roundId, applicationId: app.id, value: "good" });
    const [row] = await readVotes(voter.context, app.id);

    // Under a context WITH a profile: under the household context drizzle/0018 hides application
    // rows, so FOR UPDATE would lock none and the whole test would pass vacuously.
    let appRowsLocked = -1;
    const held = holdTransaction(s.moderator.context, async (tx) => {
      const locked = await tx.execute(`SELECT id FROM application WHERE id = '${app.id}'::uuid FOR UPDATE`);
      appRowsLocked = locked.length;
    });
    await held.started;

    const withdrawal = withdrawVote(voter.context, { applicationId: app.id }).then(
      () => null as null | unknown,
      (e: unknown) => e,
    );
    const settledWhileHeld = await settlesWithin(withdrawal, 2000);

    // The probe runs under the voter's own context (the own-profile UPDATE policy makes FOR UPDATE
    // match nothing for anyone else), in its own short transaction.
    const probe = await withSessionContext(voter.context, (tx) =>
      tx.execute(`SELECT id FROM vote WHERE id = '${row.id}'::uuid FOR UPDATE NOWAIT`),
    ).then(
      (rows) => ({ rows: rows.length, code: null as string | null }),
      (e: unknown) => ({ rows: -1, code: pgErrorOf(e).code ?? "unknown" }),
    );

    // Release first and assert after, so a failed assertion cannot leave the uncommitted lock
    // blocking afterEach cleanup.
    held.release();
    await held.done;
    const outcome = await withdrawal;

    expect(appRowsLocked).toBe(1);
    expect(settledWhileHeld).toBe(false);
    expect(probe).toEqual({ rows: 1, code: null });
    expect(outcome).toBeNull();
    expect((await readVotes(voter.context, app.id))[0].withdrawnAt).not.toBeNull();
  });
});
