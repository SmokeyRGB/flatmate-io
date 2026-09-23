import { readFileSync } from "node:fs";
import { join } from "node:path";
import { and, eq, sql } from "drizzle-orm";
import { afterEach, describe, expect, it } from "vitest";
import { withSessionContext } from "@/db/session-context";
import { activityEvent } from "@/modules/audit/schema";
import { claimResidentProfile } from "@/modules/identity/auth";
import {
  createResidentProfile,
  reactivateMember,
  setMovedOut,
} from "@/modules/identity/repository";
import { membership, residentProfile } from "@/modules/identity/schema";
import {
  cleanupAll,
  deleteTestAccount,
  registerTestHousehold,
  type TestHousehold,
} from "../../helpers/identity";

// design.md Decision 8 / task 7.7: the statement under test is read from the migration FILE
// itself, between its own markers — this exercises the real statement that ran (or will run)
// against flatmate-io-dev, not a hand-copied approximation that could silently drift from it.
function readBackfillStatement(): string {
  const migrationPath = join(__dirname, "../../../drizzle/0017_resident_profile_removal_final.sql");
  const text = readFileSync(migrationPath, "utf8");
  const begin = text.indexOf("-- backfill:begin");
  const end = text.indexOf("-- backfill:end");
  if (begin === -1 || end === -1) {
    throw new Error("backfill:begin/backfill:end markers not found in drizzle/0017_...sql");
  }
  return text.slice(begin + "-- backfill:begin".length, end).trim();
}

let hh: TestHousehold | undefined;
const accountIds: string[] = [];

afterEach(async () => {
  await cleanupAll(...accountIds.map(deleteTestAccount), hh?.cleanup());
  accountIds.length = 0;
  hh = undefined;
});

async function statusOf(hh: TestHousehold, profileId: string): Promise<string> {
  const [row] = await withSessionContext(hh.context, (tx) =>
    tx.select({ status: residentProfile.status }).from(residentProfile).where(eq(residentProfile.id, profileId)),
  );
  return row.status;
}

async function membershipRowFor(hh: TestHousehold, accountId: string) {
  const [row] = await withSessionContext(hh.context, (tx) =>
    tx.select().from(membership).where(eq(membership.accountId, accountId)),
  );
  return row;
}

// Simulates the PRE-FIX historical state (before this change): removeMember used to land in
// `moved_out`, revoke the membership, and write `membership.removed_as_intruder`. Written directly
// via raw SQL under the fixture's own session context (RLS-scoped to its household) rather than by
// calling removeMember, because removeMember now correctly lands in `removed` — and the DB trigger
// added by this very migration would then refuse moving it back to `moved_out` to fabricate the
// old bug's shape. This is data setup for a migration test, not a route any real caller can reach.
async function simulateOldBugRemoval(hh: TestHousehold, profileId: string, membershipId: string): Promise<void> {
  await withSessionContext(hh.context, async (tx) => {
    await tx.execute(sql`UPDATE resident_profile SET status = 'moved_out' WHERE id = ${profileId}::uuid`);
    await tx.execute(sql`UPDATE membership SET revoked_at = now() WHERE id = ${membershipId}::uuid`);
    await tx.insert(activityEvent).values({
      householdId: hh.householdId,
      eventType: "membership.removed_as_intruder",
      subjectType: "membership",
      subjectId: membershipId,
      actorAccountId: hh.accountId,
      actorProfileId: null,
      payload: {},
    });
  });
}

async function statusChangedEventsFor(hh: TestHousehold, profileId: string) {
  return withSessionContext(hh.context, (tx) =>
    tx
      .select()
      .from(activityEvent)
      .where(
        and(
          eq(activityEvent.eventType, "resident_profile.status_changed"),
          eq(activityEvent.subjectId, profileId),
        ),
      ),
  );
}

describe("[raw SQL] the migration's own backfill statement (drizzle/0017, design.md Decision 8)", () => {
  it("promotes only a moved_out profile whose LATEST event is membership.removed_as_intruder", async () => {
    hh = await registerTestHousehold();
    const actor = { accountId: hh.accountId, profileId: null };
    const backfillSql = readBackfillStatement();

    // Fixture A: an old-bug hard removal — SHOULD be promoted to `removed`.
    const profileA = await createResidentProfile(hh.context, "OldBugRemoval", actor);
    const { accountId: accountA } = await claimResidentProfile(hh.context, profileA.id, "test-password-not-real-1234");
    accountIds.push(accountA);
    const membershipA = await membershipRowFor(hh, accountA);
    await simulateOldBugRemoval(hh, profileA.id, membershipA.id);

    // Fixture B: a genuine move-out — latest event is membership.revoked. Must NOT be promoted.
    const profileB = await createResidentProfile(hh.context, "GenuineMoveOut", actor);
    const { accountId: accountB } = await claimResidentProfile(hh.context, profileB.id, "test-password-not-real-1234");
    accountIds.push(accountB);
    await setMovedOut(hh.context, hh.accountId, accountB);

    // Fixture C: old-bug removal, then reactivated, then moved out for real — latest event is
    // membership.revoked (from the final setMovedOut), not membership.removed_as_intruder. Must
    // NOT be promoted (proposal.md: "otherwise every intruder removed before this change stays
    // reactivatable" / "a member marked moved out, or reactivated after an earlier removal, SHALL
    // be left as they are").
    const profileC = await createResidentProfile(hh.context, "RemovedThenReactivatedThenMovedOut", actor);
    const { accountId: accountC } = await claimResidentProfile(hh.context, profileC.id, "test-password-not-real-1234");
    accountIds.push(accountC);
    const membershipC = await membershipRowFor(hh, accountC);
    await simulateOldBugRemoval(hh, profileC.id, membershipC.id);
    await reactivateMember(hh.context, hh.accountId, accountC);
    await setMovedOut(hh.context, hh.accountId, accountC);

    // Run the migration's own statement once.
    await withSessionContext(hh.context, (tx) => tx.execute(sql.raw(backfillSql)));

    expect(await statusOf(hh, profileA.id)).toBe("removed");
    expect(await statusOf(hh, profileB.id)).toBe("moved_out");
    expect(await statusOf(hh, profileC.id)).toBe("moved_out");

    // Each profile also already carries an earlier "prepared -> active"
    // resident_profile.status_changed event from claimResidentProfile — filter down to the
    // BACKFILL's own event (payload.toStatus === "removed") rather than assuming it's the only one.
    const promotionEventsA = (await statusChangedEventsFor(hh, profileA.id)).filter(
      (e) => (e.payload as { toStatus?: string }).toStatus === "removed",
    );
    expect(promotionEventsA).toHaveLength(1);
    expect(promotionEventsA[0].payload).toEqual({ fromStatus: "moved_out", toStatus: "removed" });
    // Attributed to the ORIGINAL remover (this fixture's simulated actor), not to the migration.
    expect(promotionEventsA[0].actorAccountId).toBe(hh.accountId);

    const promotionEventsB = (await statusChangedEventsFor(hh, profileB.id)).filter(
      (e) => (e.payload as { toStatus?: string }).toStatus === "removed",
    );
    const promotionEventsC = (await statusChangedEventsFor(hh, profileC.id)).filter(
      (e) => (e.payload as { toStatus?: string }).toStatus === "removed",
    );
    expect(promotionEventsB).toHaveLength(0);
    expect(promotionEventsC).toHaveLength(0);

    // Run it again: re-runnable, no-op the second time.
    await withSessionContext(hh.context, (tx) => tx.execute(sql.raw(backfillSql)));
    expect(await statusOf(hh, profileA.id)).toBe("removed");
    const promotionEventsAfterRerun = (await statusChangedEventsFor(hh, profileA.id)).filter(
      (e) => (e.payload as { toStatus?: string }).toStatus === "removed",
    );
    expect(promotionEventsAfterRerun).toHaveLength(1); // still exactly one
  });
});
