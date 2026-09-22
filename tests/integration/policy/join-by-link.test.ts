import { eq } from "drizzle-orm";
import { afterEach, describe, expect, it } from "vitest";
import { withSessionContext } from "@/db/session-context";
import { activityEvent } from "@/modules/audit/schema";
import { joinHousehold } from "@/modules/identity/auth";
import { issueJoinCode, listJoinCodeIssuances } from "@/modules/identity/repository";
import { account, membership, residentProfile } from "@/modules/identity/schema";
import { cleanupAll, deleteTestAccount, registerTestHousehold, type TestHousehold } from "../../helpers/identity";

let hh: TestHousehold | undefined;
let joinerAccountId: string | undefined;

afterEach(async () => {
  await cleanupAll(joinerAccountId ? deleteTestAccount(joinerAccountId) : undefined, hh?.cleanup());
  joinerAccountId = undefined;
  hh = undefined;
});

// FR-2.18/FR-2.6/FR-2.19/EC-2.1: the happy path end to end — two fields, empty email, an account +
// active profile + membership exist, joinedViaIssuanceId points at the link, the link's uses rose
// by exactly one, and one membership.joined event names the profile.
describe("joinHousehold — happy path (FR-2.18/FR-2.6/FR-2.19)", () => {
  it("creates account + active resident profile + membership from two fields and an empty email", async () => {
    hh = await registerTestHousehold();
    const link = await issueJoinCode(hh.context, hh.accountId, { validDays: 7, maxUses: 1 });

    const result = await joinHousehold(link.code, {
      displayName: "Jonas",
      password: "test-password-not-real-1234",
      email: "",
    });
    joinerAccountId = result.context.accountId;

    expect(result.context.householdId).toBe(hh.householdId);
    expect(result.context.profileId).toBeTruthy();

    const [profileRow] = await withSessionContext(hh.context, (tx) =>
      tx.select().from(residentProfile).where(eq(residentProfile.id, result.context.profileId!)),
    );
    expect(profileRow.displayName).toBe("Jonas");
    expect(profileRow.status).toBe("active");
    expect(profileRow.movedInOn).toBe(new Date().toISOString().slice(0, 10));

    const [accountRow] = await withSessionContext(hh.context, (tx) =>
      tx.select().from(account).where(eq(account.id, result.context.accountId)),
    );
    expect(accountRow.email).toBeNull(); // FR-2.11: empty email submitted -> stored as null

    const [membershipRow] = await withSessionContext(hh.context, (tx) =>
      tx.select().from(membership).where(eq(membership.accountId, result.context.accountId)),
    );
    expect(membershipRow.isResident).toBe(true);
    expect(membershipRow.role).toBe("member");
    expect(membershipRow.permissions).toEqual([]);
    expect(membershipRow.joinedViaIssuanceId).toBe(link.id);

    // The link's count rose by exactly one.
    const issuances = await listJoinCodeIssuances(hh.context, hh.accountId);
    const updatedLink = issuances.find((i) => i.id === link.id);
    expect(updatedLink?.uses).toBe(1);
    expect(updatedLink?.joinedResidentNames).toEqual(["Jonas"]);

    // Exactly one membership.joined event, naming the new profile, empty payload.
    const events = await withSessionContext(hh.context, (tx) =>
      tx
        .select()
        .from(activityEvent)
        .where(eq(activityEvent.eventType, "membership.joined")),
    );
    const joinedEvents = events.filter((e) => e.subjectId === result.context.profileId);
    expect(joinedEvents).toHaveLength(1);
    expect(joinedEvents[0].subjectType).toBe("resident_profile");
    expect(joinedEvents[0].actorAccountId).toBe(result.context.accountId);
    expect(joinedEvents[0].actorProfileId).toBe(result.context.profileId);
    expect(joinedEvents[0].payload).toEqual({});
  });

  it("stores a supplied, optional email on account.email — never on the derived Auth address", async () => {
    hh = await registerTestHousehold();
    const link = await issueJoinCode(hh.context, hh.accountId, { validDays: 7, maxUses: 1 });

    const result = await joinHousehold(link.code, {
      displayName: "Lea",
      password: "test-password-not-real-1234",
      email: "lea@example.test",
    });
    joinerAccountId = result.context.accountId;

    const [accountRow] = await withSessionContext(hh.context, (tx) =>
      tx.select().from(account).where(eq(account.id, result.context.accountId)),
    );
    expect(accountRow.email).toBe("lea@example.test");
  });
});
