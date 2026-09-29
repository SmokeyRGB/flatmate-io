import { readFileSync } from "node:fs";
import { join } from "node:path";
import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { withSessionContext } from "@/db/session-context";
import { uuid } from "../../helpers/uuid";

// drizzle/0027 (F3 change 3, design D8; Copilot, PR #41): the backfill and its precondition, run
// against the PRE-0027 state. That state (a live moderator without reverse_application_state) is
// refused by the CHECKs 0027 itself adds, which are live on every database this suite reaches. So
// the statements run against a temporary copy of `membership` (LIKE, without its constraints),
// seeded with pre-0027 rows. The statements are read from the migration FILE, split on its own
// breakpoints, and only the table name is rewritten: this exercises the real statements that ran,
// not a hand-copied approximation (the removal-backfill.test.ts precedent). drizzle/0027 is
// applied history and is never edited for this test.
function statementsOf0027(): { precondition: string; backfill: string } {
  const text = readFileSync(join(__dirname, "../../../drizzle/0027_reverse_application_state.sql"), "utf8");
  const statements = text
    .split("--> statement-breakpoint")
    .map((s) => s.replace(/^\s*--.*$/gm, "").trim())
    .filter((s) => s !== "");
  const precondition = statements.find((s) => s.startsWith("DO $$"));
  const backfill = statements.find((s) => s.startsWith('UPDATE "membership"'));
  if (!precondition || !backfill) throw new Error("0027: precondition or backfill statement not found");
  const onCopy = (s: string) => s.replaceAll('"membership"', "membership_pre0027");
  return { precondition: onCopy(precondition), backfill: onCopy(backfill) };
}

const FOUR = ["change_application_state", "close_round", "create_application", "manage_rooms"];

type Tx = Parameters<Parameters<typeof withSessionContext>[1]>[0];

// Runs `body` inside one transaction that owns a pre-0027 copy of membership, dropped at the end
// (ON COMMIT DROP; the transaction always rolls back here, so nothing reaches the real table).
async function withPre0027Copy<T>(body: (tx: Tx) => Promise<T>): Promise<T> {
  const context = { accountId: uuid(), householdId: uuid(), profileId: null };
  let result: T | undefined;
  const rollback = new Error("rollback");
  try {
    await withSessionContext(context, async (tx) => {
      await tx.execute(
        sql.raw("CREATE TEMP TABLE membership_pre0027 (LIKE membership INCLUDING DEFAULTS) ON COMMIT DROP"),
      );
      result = await body(tx);
      throw rollback;
    });
  } catch (err) {
    if (err !== rollback) throw err;
  }
  return result as T;
}

async function seed(
  tx: Tx,
  row: { key: string; role: "member" | "moderator" | "household_admin"; permissions: string[]; revoked?: boolean },
) {
  const hh = uuid();
  const resident = row.role !== "household_admin";
  await tx.execute(sql`
    INSERT INTO membership_pre0027 (household_id, account_id, resident_profile_id, is_resident, role, permissions, revoked_at)
    VALUES (${hh}::uuid, ${uuid()}::uuid, ${resident ? uuid() : null}::uuid, ${resident},
            ${row.role}::membership_role, ${`{${row.permissions.join(",")}}`}::text[],
            ${row.revoked ? sql`now()` : sql`NULL`})`);
  return { key: row.key, householdId: hh };
}

async function permissionsByHousehold(tx: Tx): Promise<Map<string, string[]>> {
  const rows = await tx.execute<{ household_id: string; permissions: string[] }>(
    sql.raw("SELECT household_id, permissions FROM membership_pre0027"),
  );
  return new Map((rows as { household_id: string; permissions: string[] }[]).map((r) => [r.household_id, r.permissions]));
}

describe("[raw SQL] drizzle/0027 backfill against the pre-0027 state", () => {
  // Breaks, each seen failing 2026-09-29: drop `AND role = 'moderator'` from the backfill's WHERE
  // (the member and the admin gain the permission); replace the union with a plain assignment of
  // the one value (the moderators lose their four). Dropping `revoked_at IS NULL` does NOT fail,
  // and cannot: 0024's membership_revoked_holds_nothing makes every revoked row a member with no
  // permission, so the role filter already excludes it. That condition is defensive, and no legal
  // pre-0027 row tells it apart; the revoked row below only proves it is left alone.
  it("gives every live moderator reverse_application_state, keeps every prior permission, and touches nobody else", async () => {
    const after = await withPre0027Copy(async (tx) => {
      const rows = [
        await seed(tx, { key: "moderator", role: "moderator", permissions: FOUR }),
        await seed(tx, { key: "moderatorWithGrant", role: "moderator", permissions: [...FOUR, "manage_settings"] }),
        await seed(tx, { key: "memberWithGrant", role: "member", permissions: ["change_application_state"] }),
        await seed(tx, { key: "admin", role: "household_admin", permissions: ["manage_rooms", "manage_settings"] }),
        await seed(tx, { key: "revoked", role: "member", permissions: [], revoked: true }),
      ];
      await tx.execute(sql.raw(statementsOf0027().backfill));
      const byHousehold = await permissionsByHousehold(tx);
      return Object.fromEntries(rows.map((r) => [r.key, byHousehold.get(r.householdId)]));
    });

    expect(after.moderator).toEqual([...FOUR, "reverse_application_state"].sort());
    expect(after.moderatorWithGrant).toEqual([...FOUR, "manage_settings", "reverse_application_state"].sort());
    expect(after.memberWithGrant).toEqual(["change_application_state"]);
    expect(after.admin).toEqual(["manage_rooms", "manage_settings"]);
    expect(after.revoked).toEqual([]);
  });

  it("is idempotent: a second run changes nothing", async () => {
    const [first, second] = await withPre0027Copy(async (tx) => {
      await seed(tx, { key: "moderator", role: "moderator", permissions: FOUR });
      await tx.execute(sql.raw(statementsOf0027().backfill));
      const once = [...(await permissionsByHousehold(tx)).values()];
      await tx.execute(sql.raw(statementsOf0027().backfill));
      const twice = [...(await permissionsByHousehold(tx)).values()];
      return [once, twice];
    });
    expect(second).toEqual(first);
  });

  // Break: drop the `role <> 'moderator'` condition from the precondition, and the second case
  // (a moderator already holding it) is refused too.
  it("the precondition stops the migration when a non-moderator already holds the permission, and only then", async () => {
    const refused = await withPre0027Copy(async (tx) => {
      await seed(tx, { key: "member", role: "member", permissions: ["reverse_application_state"] });
      return tx.execute(sql.raw(statementsOf0027().precondition)).then(
        () => null,
        (err: unknown) => err,
      );
    });
    expect(refused).toBeInstanceOf(Error);
    expect(JSON.stringify(refused, Object.getOwnPropertyNames(refused))).toContain(
      "a non-moderator membership already holds reverse_application_state",
    );

    const passed = await withPre0027Copy(async (tx) => {
      await seed(tx, { key: "moderator", role: "moderator", permissions: [...FOUR, "reverse_application_state"] });
      await tx.execute(sql.raw(statementsOf0027().precondition));
      return true;
    });
    expect(passed).toBe(true);
  });
});
