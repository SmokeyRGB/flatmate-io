import { eq } from "drizzle-orm";
import { afterEach, describe, expect, it } from "vitest";
import { withSessionContext } from "@/db/session-context";
import { JoinError, joinHousehold } from "@/modules/identity/auth";
import { issueJoinCode } from "@/modules/identity/repository";
import { residentProfile } from "@/modules/identity/schema";
import { cleanupAll, deleteTestAccount, registerTestHousehold, type TestHousehold } from "../../helpers/identity";

let hhA: TestHousehold | undefined;
let hhB: TestHousehold | undefined;
let extraAccountId: string | undefined;

afterEach(async () => {
  await cleanupAll(extraAccountId ? deleteTestAccount(extraAccountId) : undefined, hhA?.cleanup(), hhB?.cleanup());
  extraAccountId = undefined;
  hhA = undefined;
  hhB = undefined;
});

// EC-2.4/EC-2.5/A-2.4 (design.md Decision 9): a visitor already signed in gets no second
// identity. Same household -> already_member, no new profile created. Different household ->
// other_household, deliberately NOT the invalid-link message (the link is fine).
describe("Joining while already signed in (EC-2.4/EC-2.5)", () => {
  it("refuses with already_member and creates no second profile for a session of THIS household", async () => {
    hhA = await registerTestHousehold();
    const link = await issueJoinCode(hhA.context, hhA.accountId, { validDays: 7, maxUses: 5 });

    // hhA.context itself is a live session context for household A (the household-account
    // session created at registration) — exactly EC-2.4's "a session for this household".
    await expect(
      joinHousehold(
        link.code,
        { displayName: "Should Not Exist", password: "test-password-not-real-1234" },
        { currentSession: hhA.context },
      ),
    ).rejects.toMatchObject({ code: "already_member" });

    const rows = await withSessionContext(hhA.context, (tx) =>
      tx.select().from(residentProfile).where(eq(residentProfile.displayName, "Should Not Exist")),
    );
    expect(rows).toHaveLength(0);
  });

  it("is a JoinError instance for already_member", async () => {
    hhA = await registerTestHousehold();
    const link = await issueJoinCode(hhA.context, hhA.accountId, { validDays: 7, maxUses: 5 });
    await expect(
      joinHousehold(
        link.code,
        { displayName: "X", password: "test-password-not-real-1234" },
        { currentSession: hhA.context },
      ),
    ).rejects.toBeInstanceOf(JoinError);
  });

  it("refuses with other_household (not invalid_link) for a session of a DIFFERENT household", async () => {
    hhA = await registerTestHousehold();
    hhB = await registerTestHousehold();
    const linkA = await issueJoinCode(hhA.context, hhA.accountId, { validDays: 7, maxUses: 5 });

    // hhB.context is a live session for a DIFFERENT household attempting to join hhA's link.
    await expect(
      joinHousehold(
        linkA.code,
        { displayName: "X", password: "test-password-not-real-1234" },
        { currentSession: hhB.context },
      ),
    ).rejects.toMatchObject({ code: "other_household" });
  });

  it("proceeds normally with no currentSession at all (the ordinary, unauthenticated path)", async () => {
    hhA = await registerTestHousehold();
    const link = await issueJoinCode(hhA.context, hhA.accountId, { validDays: 7, maxUses: 5 });
    // No currentSession passed — matches how the route calls this when getCurrentSession() is null.
    const result = await joinHousehold(link.code, {
      displayName: "Ordinary",
      password: "test-password-not-real-1234",
    });
    extraAccountId = result.context.accountId;

    const rows = await withSessionContext(hhA.context, (tx) =>
      tx.select().from(residentProfile).where(eq(residentProfile.displayName, "Ordinary")),
    );
    expect(rows).toHaveLength(1);
  });
});
