import { sql, type SQL } from "drizzle-orm";
import { afterEach, describe, expect, it } from "vitest";
import { withSessionContext, type SessionContext } from "@/db/session-context";
import { createAndOpenRound, createRoom } from "@/modules/casting/repository";
import { cleanupAll, createTestModerator, registerTestHousehold, type TestHousehold } from "../../helpers/identity";

// drizzle/0026 (PR #39, Copilot): a round that applications belong to cannot be deleted or
// re-homed, by any writer. The trigger function casting_round_keeps_applications is SECURITY
// DEFINER because a profile-less session cannot see applications under the RESTRICTIVE policy of
// drizzle/0018 and would otherwise delete a round whose applications it cannot see.
//
// The catalog test passes on any database that has the function; the behaviour tests pass only
// once 0026 has been run by a human on flatmate-io-dev (the harness refuses SECURITY DEFINER).
const households: TestHousehold[] = [];

afterEach(async () => {
  await cleanupAll(...households.map((h) => h.cleanup()));
  households.length = 0;
});

type PgError = { code?: string; constraint_name?: string };
function pgErrorOf(caught: unknown): PgError {
  const err = caught as PgError & { cause?: PgError };
  return err.code ? err : (err.cause ?? err);
}

async function expectKept(context: SessionContext, statement: SQL) {
  let caught: unknown;
  try {
    await withSessionContext(context, (tx) => tx.execute(statement));
  } catch (err) {
    caught = err;
  }
  expect(caught, "the statement should have been refused").toBeInstanceOf(Error);
  const pg = pgErrorOf(caught);
  expect(pg.code).toBe("23503");
  expect(pg.constraint_name).toBe("casting_round_keeps_applications");
}

async function roundWithApplication() {
  const hh = await registerTestHousehold();
  households.push(hh);
  const moderator = await createTestModerator(hh);
  const room = await createRoom(hh.context, "Room A", { accountId: hh.accountId, profileId: null });
  const round = await createAndOpenRound(moderator.context, "Round", [room.id], {
    accountId: moderator.accountId,
    profileId: moderator.profileId,
  });
  const [inserted] = await withSessionContext(moderator.context, (tx) =>
    tx.execute<{ id: string }>(sql`
      INSERT INTO application (household_id, round_id, state, applicant_name, source, collected_from,
                               created_by_account_id, created_by_profile_id)
      VALUES (${hh.householdId}::uuid, ${round.id}::uuid, 'new'::application_state, ${"Testbewerbung Runde"},
              'manual_form'::application_source, 'data_subject'::application_collected_from,
              ${moderator.accountId}::uuid, ${moderator.profileId}::uuid)
      RETURNING id`),
  );
  expect(inserted.id).toBeTruthy();
  return { hh, moderator, roundId: round.id };
}

describe("[G-C7 raw SQL] casting_round_keeps_applications (drizzle/0026)", () => {
  it("is SECURITY DEFINER and pins its search_path (catalog)", async () => {
    const f = await roundWithApplication();
    const rows = await withSessionContext(f.moderator.context, (tx) =>
      tx.execute<{ prosecdef: boolean; proconfig: string[] | null }>(
        sql`SELECT prosecdef, proconfig FROM pg_proc WHERE oid = 'casting_round_keeps_applications()'::regprocedure`,
      ),
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].prosecdef).toBe(true);
    expect((rows[0].proconfig ?? []).some((c: string) => c.startsWith("search_path="))).toBe(true);
  });

  it("refuses deleting a round with an application in a resident session", async () => {
    const f = await roundWithApplication();
    await expectKept(f.moderator.context, sql`DELETE FROM casting_round WHERE id = ${f.roundId}::uuid`);
  });

  it("refuses it in a PROFILE-LESS session of the same household too (the reason it is DEFINER)", async () => {
    const f = await roundWithApplication();
    const profileless: SessionContext = { ...f.hh.context, profileId: null };
    await expectKept(profileless, sql`DELETE FROM casting_round WHERE id = ${f.roundId}::uuid`);
  });

  it("refuses changing the id of a round that applications belong to", async () => {
    const f = await roundWithApplication();
    await expectKept(
      f.moderator.context,
      sql`UPDATE casting_round SET id = gen_random_uuid() WHERE id = ${f.roundId}::uuid`,
    );
  });

  it("refuses re-homing such a round to another household (RLS or the trigger, whichever comes first)", async () => {
    const f = await roundWithApplication();
    let caught: unknown;
    try {
      await withSessionContext(f.moderator.context, (tx) =>
        tx.execute(sql`UPDATE casting_round SET household_id = gen_random_uuid() WHERE id = ${f.roundId}::uuid`),
      );
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(Error);
    expect(["42501", "23503"]).toContain(pgErrorOf(caught).code);
  });

  it("still deletes a round that has no application", async () => {
    const f = await roundWithApplication();
    const room2 = await createRoom(f.hh.context, "Room B", { accountId: f.hh.accountId, profileId: null });
    const bare = await createAndOpenRound(f.moderator.context, "Bare", [room2.id], {
      accountId: f.moderator.accountId,
      profileId: f.moderator.profileId,
    });
    await withSessionContext(f.moderator.context, (tx) =>
      tx.execute(sql`DELETE FROM casting_round WHERE id = ${bare.id}::uuid`),
    );
  });

  // Deliberate break (ARGUED, not run: 0026 is a human hand-off and the agent cannot drop the
  // trigger): with the trigger absent, every DELETE/UPDATE above succeeds, `caught` is undefined
  // and toBeInstanceOf(Error) fails. With an invoker-rights function the profile-less case alone
  // fails, because the RESTRICTIVE policy hides the application from it.
});
