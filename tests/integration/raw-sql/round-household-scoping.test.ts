import { sql } from "drizzle-orm";
import { afterEach, describe, expect, it } from "vitest";
import { withSessionContext } from "@/db/session-context";
import { createRoom, createRound } from "@/modules/casting/repository";
import { cleanupAll, createTestModerator, registerTestHousehold, type TestHousehold } from "../../helpers/identity";

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
    // Setup only (design D13): rounds are created by a moderator of each household.
    const modA = await createTestModerator(a);
    const roundA = await createRound(modA.context, "Round A", [roomA.id], {
      accountId: modA.accountId,
      profileId: modA.profileId,
    });
    const roomB = await createRoom(b.context, "Room B", actorB);
    const modB = await createTestModerator(b);
    const roundB = await createRound(modB.context, "Round B", [roomB.id], {
      accountId: modB.accountId,
      profileId: modB.profileId,
    });

    const rows = await withSessionContext(a.context, (tx) =>
      tx.execute<Row>(sql`SELECT id, household_id FROM casting_round`),
    );

    expect(rows.map((r: Row) => r.id)).toContain(roundA.id);
    expect(rows.map((r: Row) => r.id)).not.toContain(roundB.id);
    expect(rows.every((r: Row) => r.household_id === a.householdId)).toBe(true);
  });
});
