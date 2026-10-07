import { and, eq, sql } from "drizzle-orm";
import { afterEach, describe, expect, it } from "vitest";
import { withSessionContext } from "@/db/session-context";
import { activityEvent } from "@/modules/audit/schema";
import { claimResidentProfile } from "@/modules/identity/auth";
import { createResidentProfile, PermissionDeniedError, setMovedOut } from "@/modules/identity/repository";
import { membership, residentProfile } from "@/modules/identity/schema";
import { cleanupAll, createTestModerator, deleteTestAccount, registerTestHousehold, type TestHousehold } from "../../helpers/identity";
import { holdTransaction, settlesWithin } from "../../helpers/pipeline";

let hh: TestHousehold | undefined;
const accountIds: string[] = [];

afterEach(async () => {
  await cleanupAll(...accountIds.map(deleteTestAccount), hh?.cleanup());
  accountIds.length = 0;
  hh = undefined;
});

// F3 change 2b (identity/member-administration, "Losing a right takes effect at once, on every
// route"; design D4), modelled on application-capture.test.ts 6.8: a mutator checks its permission
// INSIDE the transaction that performs its write, against the caller's live membership read FOR
// SHARE. A demotion of the caller that is in flight is waited for, and once it commits the action is
// refused. The wait is caused by a real lock held by a real second writer, not by the pooler
// happening to serialise one-statement transactions.
describe("a demotion of the caller committed while its action waits refuses the action", () => {
  it("setMovedOut waits for the held demotion of the moderator, then is refused manage_members and changes nothing", async () => {
    hh = await registerTestHousehold();
    const moderator = await createTestModerator(hh, "SoonDemoted");
    const actor = { accountId: hh.accountId, profileId: null };
    const profile = await createResidentProfile(hh.context, "TargetX", actor);
    const { accountId: targetAccountId } = await claimResidentProfile(
      hh.context,
      profile.id,
      "test-password-not-real-1234", "de",
    );
    accountIds.push(targetAccountId);

    // Tx A stands in for the household's demotion (setMemberRole's statement shape: role and
    // permissions in one UPDATE on the moderator's row), held uncommitted.
    const demoting = holdTransaction(hh.context, async (tx) => {
      await tx
        .update(membership)
        .set({
          role: "member",
          permissions: sql`CASE WHEN ${membership.isResident} THEN ARRAY['vote']::text[] ELSE '{}'::text[] END`,
        })
        .where(eq(membership.accountId, moderator.accountId));
    });
    await demoting.started;

    // Started outside A's callback chain (a nested session context would be refused).
    const attempt = setMovedOut(moderator.context, moderator.accountId, targetAccountId).then(
      () => "resolved" as const,
      (e: unknown) => e,
    );
    const settledWhileHeld = await settlesWithin(attempt, 2000);
    demoting.release();
    await demoting.done;
    const outcome = await attempt;

    expect(settledWhileHeld).toBe(false);
    expect(outcome).toBeInstanceOf(PermissionDeniedError);
    expect((outcome as PermissionDeniedError).message).toContain("manage_members");

    // nothing changed: X's profile is still active, X's membership live, no revocation event
    const [profileRow] = await withSessionContext(hh.context, (tx) =>
      tx.select().from(residentProfile).where(eq(residentProfile.id, profile.id)),
    );
    expect(profileRow.status).toBe("active");
    const [membershipRow] = await withSessionContext(hh.context, (tx) =>
      tx.select().from(membership).where(eq(membership.accountId, targetAccountId)),
    );
    expect(membershipRow.revokedAt).toBeNull();
    const events = await withSessionContext(hh.context, (tx) =>
      tx
        .select()
        .from(activityEvent)
        .where(and(eq(activityEvent.subjectId, membershipRow.id), eq(activityEvent.eventType, "membership.revoked"))),
    );
    expect(events).toHaveLength(0);
    // Deliberate break: move setMovedOut's check back before its transaction (assertHasPermission,
    // which reads in its own transaction without a lock) and the move-out succeeds against the OLD
    // committed membership while A is uncommitted: \`settledWhileHeld\` is true, the outcome is
    // "resolved", and this test fails. To run after 0029 is applied to dev.
  }, 30_000);
});
