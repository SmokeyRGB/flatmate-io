import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { afterEach, describe, expect, it } from "vitest";
import { withSessionContext } from "@/db/session-context";
import { recordActivityEvent } from "@/modules/audit/repository";
import { application } from "@/modules/casting/schema";
import { registerTestHousehold, type TestHousehold } from "../../helpers/identity";
import { uuid } from "../../helpers/uuid";

let hh: TestHousehold | undefined;
// The '' test's dedicated raw client. Ended in afterEach, not in a `finally` inside the test:
// a timeout aborts before `finally` runs (CLAUDE.md), which would leave the connection open.
let rawClient: ReturnType<typeof postgres> | undefined;

afterEach(async () => {
  if (rawClient) await rawClient.end();
  rawClient = undefined;
  if (hh) await hh.cleanup();
  hh = undefined;
});

// [GUARDED] G-D15 (raw SQL) — GUARDRAIL: G-D15 — siehe GUARDRAILS.md / ADR-014.
// openspec application-requires-resident-profile, design Decisions 1/3/7: the raw-SQL half of
// G-D15 for `application` itself, run under app_runtime, bypassing the repository entirely.
// **Deliberate break:** run against the PRE-migration database (before drizzle/0018 is applied),
// both count assertions below fail — they read 2, not 0 — because only the household-scoped
// PERMISSIVE policy exists yet and a profile-less session can still see everything in its own
// household. Seen failing this way before 3.3 applied the migration; passing after.
describe("[GUARDED] G-D15: no Application is visible or writable without a resident profile (raw SQL)", () => {
  it("count/insert/update/delete under app_runtime, without a profile, all refuse or match nothing", async () => {
    hh = await registerTestHousehold();
    const residentProfileId = uuid();
    const residentContext = { ...hh.context, profileId: residentProfileId };
    const householdId = hh.householdId;

    const seeded = await withSessionContext(residentContext, (tx) =>
      tx
        .insert(application)
        .values([
          {
            householdId,
            state: "new" as const,
            createdByAccountId: hh!.accountId,
            createdByProfileId: residentProfileId,
          },
          {
            householdId,
            state: "new" as const,
            createdByAccountId: hh!.accountId,
            createdByProfileId: residentProfileId,
          },
        ])
        .returning(),
    );
    expect(seeded).toHaveLength(2);

    // Resident-context control: the household really does have two applications.
    const residentCount = await withSessionContext(residentContext, (tx) =>
      tx.execute<{ count: string }>(sql`SELECT count(*) FROM application WHERE household_id = ${householdId}::uuid`),
    );
    expect(Number(residentCount[0].count)).toBe(2);

    // hh.context.profileId is already null (a household-account session).
    const householdCount = await withSessionContext(hh.context, (tx) =>
      tx.execute<{ count: string }>(sql`SELECT count(*) FROM application WHERE household_id = ${householdId}::uuid`),
    );
    expect(Number(householdCount[0].count)).toBe(0);

    // Insert: rejected outright (WITH CHECK fails) — assert the Postgres error code, not just
    // "throws" (CLAUDE.md, "Tests that can fail" — a refusal by the wrong path looks identical).
    let insertError: unknown;
    try {
      await withSessionContext(hh.context, (tx) =>
        tx.execute(
          sql`INSERT INTO application (household_id, state, created_by_account_id, created_by_profile_id)
              VALUES (${householdId}::uuid, 'new', ${hh!.accountId}::uuid, ${uuid()}::uuid)`,
        ),
      );
    } catch (err) {
      insertError = err;
    }
    expect(insertError).toBeInstanceOf(Error);
    expect((insertError as Error & { cause?: { code?: string } }).cause?.code).toBe("42501");

    // Update: matches zero rows (USING hides them) and reports no error.
    const updateResult = await withSessionContext(hh.context, (tx) =>
      tx.execute(sql`UPDATE application SET state = 'screened' WHERE household_id = ${householdId}::uuid`),
    );
    expect((updateResult as unknown as { count: number }).count).toBe(0);

    // Delete: same shape.
    const deleteResult = await withSessionContext(hh.context, (tx) =>
      tx.execute(sql`DELETE FROM application WHERE household_id = ${householdId}::uuid`),
    );
    expect((deleteResult as unknown as { count: number }).count).toBe(0);

    // Both rows are still present and unchanged, read back under a resident context.
    const afterAttempts = await withSessionContext(residentContext, (tx) =>
      tx.select().from(application).where(sql`household_id = ${householdId}::uuid`),
    );
    expect(afterAttempts).toHaveLength(2);
    for (const row of afterAttempts) {
      expect(row.state).toBe("new");
    }
  });

  // The `''` case (design Risks / Decision 1): a reused pooled connection whose earlier
  // transaction set app.profile_id reads it back as '', not NULL, on a later transaction that
  // leaves it unset. A predicate using bare `IS NOT NULL` (no `nullif`) would treat '' as "present"
  // and wrongly admit this session — this test pins that distinction directly, and proves the
  // applied policy is not fooled by it.
  it("the count stays zero when app.profile_id reads as '' rather than unset", async () => {
    hh = await registerTestHousehold();
    const residentProfileId = uuid();
    const residentContext = { ...hh.context, profileId: residentProfileId };
    const householdId = hh.householdId;

    await withSessionContext(residentContext, (tx) =>
      tx.insert(application).values([
        {
          householdId,
          state: "new" as const,
          createdByAccountId: hh!.accountId,
          createdByProfileId: residentProfileId,
        },
        {
          householdId,
          state: "new" as const,
          createdByAccountId: hh!.accountId,
          createdByProfileId: residentProfileId,
        },
      ]),
    );

    // A dedicated raw client, not the app's shared `db` — this test drives SET LOCAL itself
    // (allowed here: scripts/lint/session-context.ts scans src/ only, and
    // tests/integration/raw-sql/pool-reuse.test.ts is the existing precedent for tests doing this).
    rawClient = postgres(process.env.DATABASE_URL!, { prepare: false });
    const rawDb = drizzle(rawClient);

    const { precondition, isNotNullOnly, withNullif, count } = await rawDb.transaction(async (tx) => {
      await tx.execute(sql.raw(`SET LOCAL app.household_id = '${householdId}'`));

      // Nested transaction = SAVEPOINT: sets app.profile_id, then throws to roll back — so the
      // OUTER transaction never itself set app.profile_id, but the setting was touched on this
      // physical connection during the outer transaction's lifetime.
      try {
        await tx.transaction(async (savepointTx) => {
          await savepointTx.execute(sql.raw(`SET LOCAL app.profile_id = '${uuid()}'`));
          throw new Error("deliberate-savepoint-rollback");
        });
      } catch (err) {
        if (!(err instanceof Error) || err.message !== "deliberate-savepoint-rollback") throw err;
      }

      const [{ value: precondition }] = await tx.execute<{ value: string | null }>(
        sql`SELECT current_setting('app.profile_id', true) AS value`,
      );

      const [{ is_not_null: isNotNullOnly, with_nullif: withNullif }] = await tx.execute<{
        is_not_null: boolean;
        with_nullif: boolean;
      }>(
        sql`SELECT
              current_setting('app.profile_id', true) IS NOT NULL AS is_not_null,
              nullif(current_setting('app.profile_id', true), '') IS NOT NULL AS with_nullif`,
      );

      const [{ count }] = await tx.execute<{ count: string }>(
        sql`SELECT count(*) FROM application WHERE household_id = ${householdId}::uuid`,
      );

      return { precondition, isNotNullOnly, withNullif, count };
    });

    // Precondition: the setting reads as '' here, per design's stated risk, not NULL. If this
    // ever reads NULL instead, the savepoint route does not reproduce the pooled-connection
    // case and the two-transaction max:1 method (pool-reuse.test.ts) would be needed instead —
    // reported rather than silently assumed.
    expect(precondition).toBe("");

    // Pins the reason a predicate must use `nullif`: a bare `current_setting(...) IS NOT NULL`
    // reads '' as present (true) and would wrongly admit this session; `nullif(…, '') IS NOT
    // NULL` correctly reads false. Neither assertion loosens the applied policy.
    expect(isNotNullOnly).toBe(true);
    expect(withNullif).toBe(false);

    // The database's own applied policy, not fooled by the '' value.
    expect(Number(count)).toBe(0);
  });

  // [GUARDED] G-D15 (raw SQL): application-subject activity_event rows are equally invisible to a
  // profile-less session — same leak, sibling path (design Decision 3). Other subject types stay
  // visible.
  describe("application-subject activity_event rows", () => {
    it("count is zero for application-subject events, while other events stay visible", async () => {
      hh = await registerTestHousehold();
      const residentProfileId = uuid();
      const residentContext = { ...hh.context, profileId: residentProfileId };
      const householdId = hh.householdId;

      const [seededApplication] = await withSessionContext(residentContext, (tx) =>
        tx
          .insert(application)
          .values({
            householdId,
            state: "new",
            createdByAccountId: hh!.accountId,
            createdByProfileId: residentProfileId,
          })
          .returning(),
      );

      await withSessionContext(residentContext, (tx) =>
        recordActivityEvent(tx, {
          householdId,
          eventType: "application.state_changed",
          subjectType: "application",
          subjectId: seededApplication.id,
          actorAccountId: hh!.accountId,
          actorProfileId: residentProfileId,
          payload: { fromState: "new", toState: "screened" },
        }),
      );

      await withSessionContext(residentContext, (tx) =>
        recordActivityEvent(tx, {
          householdId,
          eventType: "household_settings.changed",
          subjectType: "household_settings",
          subjectId: householdId,
          actorAccountId: hh!.accountId,
          actorProfileId: residentProfileId,
          payload: { field: "quorumShare" },
        }),
      );

      // hh.context.profileId is already null (a household-account session).
      const applicationEventCount = await withSessionContext(hh.context, (tx) =>
        tx.execute<{ count: string }>(
          sql`SELECT count(*) FROM activity_event WHERE household_id = ${householdId}::uuid AND subject_type = 'application'`,
        ),
      );
      expect(Number(applicationEventCount[0].count)).toBe(0);

      const otherEvents = await withSessionContext(hh.context, (tx) =>
        tx.execute<{ subject_type: string }>(
          sql`SELECT subject_type FROM activity_event WHERE household_id = ${householdId}::uuid AND subject_type = 'household_settings'`,
        ),
      );
      expect(otherEvents).toHaveLength(1);
    });
  });
});
