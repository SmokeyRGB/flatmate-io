import { sql } from "drizzle-orm";
import { afterEach, describe, expect, it } from "vitest";
import { withSessionContext, type SessionContext } from "@/db/session-context";
import { uuid } from "../../helpers/uuid";

// [G-C7 raw SQL] founding-link-moderator D1: the founding mark's shape and count are enforced by
// the database, for every writer, raw SQL under app_runtime included. The mark decides who becomes
// moderator, so "one per household" and "a neutral join link, never bound, never a reset link"
// cannot rest on the TypeScript that happens to write it today.
//
// No registered household is needed: join_code_issuance is household-scoped by RLS only, and no
// foreign key ties household_id to anything, so a random household uuid is a clean slate with no
// founding link yet (the single-refuser fixture each case below needs). Every row is removed in
// afterEach through the same context.

let context: SessionContext | undefined;

afterEach(async () => {
  if (!context) return;
  const ctx = context;
  context = undefined;
  await withSessionContext(ctx, (tx) =>
    tx.execute(sql`DELETE FROM join_code_issuance WHERE household_id = ${ctx.householdId}::uuid`),
  );
});

function freshContext(): SessionContext {
  context = { accountId: uuid(), householdId: uuid(), profileId: null };
  return context;
}

type PgError = { code?: string; constraint_name?: string };

function pgErrorOf(caught: unknown): PgError {
  const err = caught as PgError & { cause?: PgError };
  // postgres.js sets `.code` itself; drizzle's wrapping sometimes nests it under `.cause`.
  return err.code ? err : (err.cause ?? err);
}

function insertLink(
  ctx: SessionContext,
  over: { founding: boolean; purpose?: "join" | "password_reset"; residentProfileId?: string | null },
) {
  const code = `T${uuid().replace(/-/g, "").slice(0, 10).toUpperCase()}`;
  const profile = over.residentProfileId ?? null;
  return withSessionContext(ctx, (tx) =>
    tx.execute(
      sql`INSERT INTO join_code_issuance
            (household_id, code, expires_at, max_uses, created_by_account_id, purpose, resident_profile_id, is_founding_link)
          VALUES (${ctx.householdId}::uuid, ${code}, now() + interval '7 days', 1, ${ctx.accountId}::uuid,
                  ${over.purpose ?? "join"}::join_code_purpose, ${profile}::uuid, ${over.founding})`,
    ),
  );
}

async function expectRefusedBy(attempt: Promise<unknown>, sqlState: string, constraint: string) {
  let caught: unknown;
  try {
    await attempt;
  } catch (err) {
    caught = err;
  }
  expect(caught).toBeInstanceOf(Error);
  const pg = pgErrorOf(caught);
  // SQLSTATE AND constraint name: proves this constraint refused it, not RLS or another CHECK.
  expect(pg.code).toBe(sqlState);
  expect(pg.constraint_name).toBe(constraint);
}

describe("[G-C7 raw SQL] founding link constraints (drizzle/0034)", () => {
  it("positive control: one neutral founding link inserts fine", async () => {
    const ctx = freshContext();
    await insertLink(ctx, { founding: true });
    const rows = await withSessionContext(ctx, (tx) =>
      tx.execute<{ is_founding_link: boolean }>(
        sql`SELECT is_founding_link FROM join_code_issuance WHERE household_id = ${ctx.householdId}::uuid`,
      ),
    );
    expect(rows.map((r: { is_founding_link: boolean }) => r.is_founding_link)).toEqual([true]);
  });

  it("refuses a second founding link in the same household (join_code_issuance_one_founding_link)", async () => {
    const ctx = freshContext();
    await insertLink(ctx, { founding: true });
    await expectRefusedBy(insertLink(ctx, { founding: true }), "23505", "join_code_issuance_one_founding_link");
  });

  it("still allows ordinary links beside the founding link, and a founding link in another household", async () => {
    const ctx = freshContext();
    await insertLink(ctx, { founding: true });
    await insertLink(ctx, { founding: false });
    await insertLink(ctx, { founding: false });
    const other: SessionContext = { accountId: uuid(), householdId: uuid(), profileId: null };
    try {
      await insertLink(other, { founding: true });
    } finally {
      await withSessionContext(other, (tx) =>
        tx.execute(sql`DELETE FROM join_code_issuance WHERE household_id = ${other.householdId}::uuid`),
      );
    }
  });

  it("refuses a founding link bound to a profile (join_code_issuance_founding_shape)", async () => {
    const ctx = freshContext();
    await expectRefusedBy(
      insertLink(ctx, { founding: true, residentProfileId: uuid() }),
      "23514",
      "join_code_issuance_founding_shape",
    );
  });

  it("refuses a founding link that is a password-reset link (join_code_issuance_founding_shape)", async () => {
    const ctx = freshContext();
    // Names a profile, so join_code_issuance_reset_names_profile is satisfied and cannot be the refuser.
    await expectRefusedBy(
      insertLink(ctx, { founding: true, purpose: "password_reset", residentProfileId: uuid() }),
      "23514",
      "join_code_issuance_founding_shape",
    );
  });
});
