import { sql } from "drizzle-orm";
import { afterEach, describe, expect, it } from "vitest";
import { withSessionContext } from "@/db/session-context";
import { signIn } from "@/modules/identity/auth";
import { cleanupAll, registerTestHousehold, type TestHousehold } from "../../helpers/identity";

type Row = { id: string; household_id: string };

let hhA: TestHousehold | undefined;
let hhB: TestHousehold | undefined;

afterEach(async () => {
  await cleanupAll(hhA?.cleanup(), hhB?.cleanup());
  hhA = undefined;
  hhB = undefined;
});

// G-C7, the same scenario as the policy-layer test, bypassing it via raw SQL.
describe("session isolation — raw SQL", () => {
  it("household A sees only its own Session rows", async () => {
    hhA = await registerTestHousehold();
    hhB = await registerTestHousehold();
    const a = hhA;
    const b = hhB;

    const { session: sessionA } = await signIn({
      kind: "household",
      email: a.email,
      password: "test-password-not-real-1234",
    });
    const { session: sessionB } = await signIn({
      kind: "household",
      email: b.email,
      password: "test-password-not-real-1234",
    });

    const rows = await withSessionContext(a.context, (tx) =>
      tx.execute<Row>(sql`SELECT id, household_id FROM session`),
    );

    expect(rows.map((r: Row) => r.id)).toContain(sessionA.id);
    expect(rows.map((r: Row) => r.id)).not.toContain(sessionB.id);
    expect(rows.every((r: Row) => r.household_id === a.householdId)).toBe(true);
  });
});
