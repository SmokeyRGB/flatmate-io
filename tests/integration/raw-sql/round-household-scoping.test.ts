import { sql } from "drizzle-orm";
import { afterEach, describe, expect, it } from "vitest";
import { withSessionContext } from "@/db/session-context";
import { createRoom, createRound } from "@/modules/casting/repository";
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
describe("casting_round household isolation — raw SQL", () => {
  it("household A sees none of household B's rounds", async () => {
    hhA = await registerTestHousehold();
    hhB = await registerTestHousehold();
    const a = hhA;
    const b = hhB;
    const actorA = { accountId: a.accountId, profileId: null };
    const actorB = { accountId: b.accountId, profileId: null };

    const roomA = await createRoom(a.context, "Room A", actorA);
    const roundA = await createRound(a.context, "Round A", [roomA.id], actorA);
    const roomB = await createRoom(b.context, "Room B", actorB);
    const roundB = await createRound(b.context, "Round B", [roomB.id], actorB);

    const rows = await withSessionContext(a.context, (tx) =>
      tx.execute<Row>(sql`SELECT id, household_id FROM casting_round`),
    );

    expect(rows.map((r: Row) => r.id)).toContain(roundA.id);
    expect(rows.map((r: Row) => r.id)).not.toContain(roundB.id);
    expect(rows.every((r: Row) => r.household_id === a.householdId)).toBe(true);
  });
});
