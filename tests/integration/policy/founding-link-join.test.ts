import { and, eq } from "drizzle-orm";
import { afterEach, describe, expect, it } from "vitest";
import { withSessionContext, type SessionContext } from "@/db/session-context";
import { activityEvent } from "@/modules/audit/schema";
import { createAndOpenRound, createRoom } from "@/modules/casting/repository";
import { joinHousehold, signIn } from "@/modules/identity/auth";
import {
  appointedPermissions,
  getLiveFoundingLinkPath,
  isHouseholdAccount,
  issueJoinCode,
  listJoinCodeIssuances,
  setMemberRole,
} from "@/modules/identity/repository";
import { membership, RESIDENT_PERMISSIONS, session } from "@/modules/identity/schema";
import {
  cleanupAll,
  createNonResidentModerator,
  deleteTestAccount,
  registerTestHousehold,
  type TestHousehold,
} from "../../helpers/identity";
import { uuid } from "../../helpers/uuid";

// founding-link-moderator D2/D3: whoever redeems the household's founding link becomes moderator,
// stored exactly as an appointment stores it, and the household account may redeem its own
// founding link in one submit, ending its session in the join transaction.

const PASSWORD = "test-password-not-real-1234";

let hh: TestHousehold | undefined;
const accountIds: string[] = [];

afterEach(async () => {
  await cleanupAll(...accountIds.map(deleteTestAccount), hh?.cleanup());
  accountIds.length = 0;
  hh = undefined;
});

// A unique, synthetic name per join: names are unique per household, and nothing here is real.
function testName(prefix: string): string {
  return `${prefix} ${uuid().slice(0, 8)}`;
}

async function foundingLinkOf(household: TestHousehold) {
  const issuances = await listJoinCodeIssuances(household.context, household.accountId);
  const founding = issuances.filter((i) => i.isFoundingLink);
  expect(founding).toHaveLength(1);
  return founding[0];
}

async function membershipOf(household: TestHousehold, accountId: string) {
  const [row] = await withSessionContext(household.context, (tx) =>
    tx.select().from(membership).where(eq(membership.accountId, accountId)),
  );
  return row;
}

async function sessionRow(household: TestHousehold, sessionId: string) {
  const [row] = await withSessionContext(household.context, (tx) =>
    tx.select().from(session).where(eq(session.id, sessionId)),
  );
  return row;
}

async function eventsOf(household: TestHousehold, eventType: string) {
  return withSessionContext(household.context, (tx) =>
    tx.select().from(activityEvent).where(eq(activityEvent.eventType, eventType)),
  );
}

// A real household session row (registerTestHousehold's context has none).
async function householdSession(household: TestHousehold) {
  const result = await signIn({ kind: "household", email: household.email, password: PASSWORD });
  return { sessionId: result.session.id, context: result.context };
}

const sorted = (values: readonly string[]) => [...values].sort();

describe("A join through the founding link makes a moderator (D2)", () => {
  // (a)
  it("stores role moderator with the appointment's permission set, and records both events", async () => {
    hh = await registerTestHousehold();
    const founding = await foundingLinkOf(hh);

    const result = await joinHousehold(founding.code, { displayName: testName("Frieda"), password: PASSWORD });
    accountIds.push(result.context.accountId);

    const row = await membershipOf(hh, result.context.accountId);
    expect(row.role).toBe("moderator");
    expect(sorted(row.permissions)).toEqual(sorted(appointedPermissions(["vote"])));
    expect(row.isResident).toBe(true);
    expect(row.joinedViaIssuanceId).toBe(founding.id);

    const after = (await listJoinCodeIssuances(hh.context, hh.accountId)).find((i) => i.id === founding.id);
    expect(after?.uses).toBe(1);

    const joined = (await eventsOf(hh, "membership.joined")).filter(
      (e) => e.subjectId === result.context.profileId,
    );
    expect(joined).toHaveLength(1);
    const changed = (await eventsOf(hh, "membership.role_changed")).filter((e) => e.subjectId === row.id);
    expect(changed).toHaveLength(1);
    expect(changed[0].payload).toEqual({ fromRole: "member", toRole: "moderator" });
    expect(changed[0].subjectType).toBe("membership");
    for (const event of [joined[0], changed[0]]) {
      expect(event.actorAccountId).toBe(result.context.accountId);
      expect(event.actorProfileId).toBe(result.context.profileId);
      expect(JSON.stringify(event)).not.toContain(founding.code);
    }
  });

  // (b) F5's invite checks change_application_state on the stored set, never the role.
  it("holds manage_rounds and change_application_state and can open a round right away", async () => {
    hh = await registerTestHousehold();
    const founding = await foundingLinkOf(hh);
    const result = await joinHousehold(founding.code, { displayName: testName("Frieda"), password: PASSWORD });
    accountIds.push(result.context.accountId);

    const row = await membershipOf(hh, result.context.accountId);
    expect(row.permissions).toContain("manage_rounds");
    expect(row.permissions).toContain("change_application_state");

    const actor = { accountId: result.context.accountId, profileId: result.context.profileId };
    const room = await createRoom(result.context, "Room A", actor);
    const round = await createAndOpenRound(result.context, "Round", [room.id], actor);
    expect(round.id).toBeTruthy();
  });

  // (c)
  it("an ordinary neutral link of the same household still gives role member and exactly vote", async () => {
    hh = await registerTestHousehold();
    const ordinary = await issueJoinCode(hh.context, hh.accountId, { validDays: 7, maxUses: 1 });
    const result = await joinHousehold(ordinary.code, { displayName: testName("Max"), password: PASSWORD });
    accountIds.push(result.context.accountId);

    const row = await membershipOf(hh, result.context.accountId);
    expect(row.role).toBe("member");
    expect(row.permissions).toEqual([...RESIDENT_PERMISSIONS]);
    expect(await eventsOf(hh, "membership.role_changed")).toHaveLength(0);
  });

  // (d) the helper and setMemberRole's SQL cannot drift.
  it("appointedPermissions equals, as a set, what setMemberRole stores for a freshly joined member", async () => {
    hh = await registerTestHousehold();
    const ordinary = await issueJoinCode(hh.context, hh.accountId, { validDays: 7, maxUses: 1 });
    const result = await joinHousehold(ordinary.code, { displayName: testName("Max"), password: PASSWORD });
    accountIds.push(result.context.accountId);

    await setMemberRole(hh.context, hh.accountId, result.context.accountId, "moderator");
    const row = await membershipOf(hh, result.context.accountId);
    expect(sorted(row.permissions)).toEqual(sorted(appointedPermissions(["vote"])));
  });

  // (e) INVARIANT GUARD, not a regression test: joinHousehold's transaction is internal and cannot
  // be held open, and the Supavisor pooler can serialise the two by accident. It records that the
  // single admission (claim_join_code's conditional UPDATE) holds for the founding link too.
  it("[invariant guard] two concurrent founding joins yield exactly one moderator; the loser is refused", async () => {
    hh = await registerTestHousehold();
    const founding = await foundingLinkOf(hh);

    const attempts = await Promise.allSettled([
      joinHousehold(founding.code, { displayName: testName("Anna"), password: PASSWORD }),
      joinHousehold(founding.code, { displayName: testName("Bert"), password: PASSWORD }),
    ]);
    for (const a of attempts) if (a.status === "fulfilled") accountIds.push(a.value.context.accountId);

    const winners = attempts.filter((a) => a.status === "fulfilled");
    const losers = attempts.filter((a): a is PromiseRejectedResult => a.status === "rejected");
    expect(winners).toHaveLength(1);
    expect(losers).toHaveLength(1);
    expect(losers[0].reason).toMatchObject({ code: "invalid_link" });

    const joiners = await withSessionContext(hh.context, (tx) =>
      tx
        .select()
        .from(membership)
        .where(and(eq(membership.householdId, hh!.householdId), eq(membership.joinedViaIssuanceId, founding.id))),
    );
    expect(joiners).toHaveLength(1);
    expect(joiners[0].role).toBe("moderator");
  });
});

describe("The household account redeems its own founding link (D3)", () => {
  // (f)
  it("ends the household session in the join, signs the founder in as a resident and moderator", async () => {
    hh = await registerTestHousehold();
    const founding = await foundingLinkOf(hh);
    const current = await householdSession(hh);
    const before = await sessionRow(hh, current.sessionId);
    expect(before.revokedAt).toBeNull();

    const result = await joinHousehold(
      founding.code,
      { displayName: testName("Frieda"), password: PASSWORD },
      { currentSession: current },
    );
    accountIds.push(result.context.accountId);

    const after = await sessionRow(hh, current.sessionId);
    expect(after.revokedAt).not.toBeNull();
    // Only revoked_at changes on the household session row.
    expect({ ...after, revokedAt: null }).toEqual({ ...before, revokedAt: null });

    const resident = await sessionRow(hh, result.session.id);
    expect(resident.revokedAt).toBeNull();
    expect(resident.accountId).toBe(result.context.accountId);
    expect((await membershipOf(hh, result.context.accountId)).role).toBe("moderator");
  });

  // (g)
  it("refuses an ordinary link of its own household with already_member and leaves the session live", async () => {
    hh = await registerTestHousehold();
    const ordinary = await issueJoinCode(hh.context, hh.accountId, { validDays: 7, maxUses: 1 });
    const current = await householdSession(hh);
    const name = testName("Nobody");

    await expect(
      joinHousehold(ordinary.code, { displayName: name, password: PASSWORD }, { currentSession: current }),
    ).rejects.toMatchObject({ code: "already_member" });

    expect((await sessionRow(hh, current.sessionId)).revokedAt).toBeNull();
    const memberships = await withSessionContext(hh.context, (tx) =>
      tx.select().from(membership).where(eq(membership.householdId, hh!.householdId)),
    );
    expect(memberships).toHaveLength(1); // only the administering membership; the refusal is pre-Auth
    const after = (await listJoinCodeIssuances(hh.context, hh.accountId)).find((i) => i.id === ordinary.id);
    expect(after?.uses).toBe(0);
  });

  // (h) INVARIANT GUARD: an in-transaction refusal needs a race, and a spent link is refused
  // pre-Auth. Either outcome of the race is valid; the end state must be consistent with it.
  it("[invariant guard] two concurrent founding joins, one from the household session: exactly one succeeds, and a losing household session stays live", async () => {
    hh = await registerTestHousehold();
    const founding = await foundingLinkOf(hh);
    const current = await householdSession(hh);

    const attempts = await Promise.allSettled([
      joinHousehold(
        founding.code,
        { displayName: testName("Anna"), password: PASSWORD },
        { currentSession: current },
      ),
      joinHousehold(founding.code, { displayName: testName("Bert"), password: PASSWORD }),
    ]);
    for (const a of attempts) if (a.status === "fulfilled") accountIds.push(a.value.context.accountId);

    expect(attempts.filter((a) => a.status === "fulfilled")).toHaveLength(1);
    const householdSessionRow = await sessionRow(hh, current.sessionId);
    if (attempts[0].status === "rejected") {
      expect(attempts[0].reason).toMatchObject({ code: "invalid_link" });
      expect(householdSessionRow.revokedAt).toBeNull();
    } else {
      expect(householdSessionRow.revokedAt).not.toBeNull();
    }
  });

  // (i)
  it("a resident session of the same household on the founding link is refused with already_member", async () => {
    hh = await registerTestHousehold();
    const ordinary = await issueJoinCode(hh.context, hh.accountId, { validDays: 7, maxUses: 1 });
    const resident = await joinHousehold(ordinary.code, { displayName: testName("Max"), password: PASSWORD });
    accountIds.push(resident.context.accountId);
    const founding = await foundingLinkOf(hh);
    const asResident: { sessionId: string; context: SessionContext } = {
      sessionId: resident.session.id,
      context: resident.context,
    };

    await expect(
      joinHousehold(
        founding.code,
        { displayName: testName("Zoe"), password: PASSWORD },
        { currentSession: asResident },
      ),
    ).rejects.toMatchObject({ code: "already_member" });
    expect((await sessionRow(hh, resident.session.id)).revokedAt).toBeNull();
  });
});

// D4: the organisation screen's read. The code is a secret, so only a caller holding
// manage_join_codes gets the path, and only while the link can still be used.
describe("getLiveFoundingLinkPath (D4)", () => {
  it("gives the household account the path, a plain resident null, and nobody the path once it is spent", async () => {
    hh = await registerTestHousehold();
    const founding = await foundingLinkOf(hh);
    const ordinary = await issueJoinCode(hh.context, hh.accountId, { validDays: 7, maxUses: 1 });
    const resident = await joinHousehold(ordinary.code, { displayName: testName("Max"), password: PASSWORD });
    accountIds.push(resident.context.accountId);

    expect(await getLiveFoundingLinkPath(hh.context)).toBe(`/join/${founding.code}`);
    expect(await getLiveFoundingLinkPath(resident.context)).toBeNull();

    const founder = await joinHousehold(founding.code, { displayName: testName("Frieda"), password: PASSWORD });
    accountIds.push(founder.context.accountId);
    expect(await getLiveFoundingLinkPath(hh.context)).toBeNull();
  });
});

// R1 (Copilot round, PR #56): "the household account" is the membership holding the household-only
// permissions, not "a session with no profile". A non-resident moderator has no profile either.
describe("isHouseholdAccount and the founding join (R1)", () => {
  it("is true for the household account, false for a resident, false for a non-resident moderator", async () => {
    hh = await registerTestHousehold();
    const ordinary = await issueJoinCode(hh.context, hh.accountId, { validDays: 7, maxUses: 1 });
    const resident = await joinHousehold(ordinary.code, { displayName: testName("Max"), password: PASSWORD });
    accountIds.push(resident.context.accountId);
    const nonResidentModerator = await createNonResidentModerator(hh);

    expect(await isHouseholdAccount(hh.context)).toBe(true);
    expect(await isHouseholdAccount(resident.context)).toBe(false);
    expect(nonResidentModerator.context.profileId).toBeNull(); // same session shape as the household account
    expect(await isHouseholdAccount(nonResidentModerator.context)).toBe(false);
  });

  it("refuses the founding join from a profile-less moderator session with already_member, creating nothing", async () => {
    hh = await registerTestHousehold();
    const founding = await foundingLinkOf(hh);
    const moderator = await createNonResidentModerator(hh);
    // createNonResidentModerator makes no session row; give it a live one to assert on.
    const [sessionInserted] = await withSessionContext(moderator.context, (tx) =>
      tx
        .insert(session)
        .values({
          householdId: hh!.householdId,
          accountId: moderator.accountId,
          actingProfileId: null,
          tokenHash: uuid(),
          expiresAt: new Date(Date.now() + 60 * 60 * 1000),
        })
        .returning({ id: session.id }),
    );
    const before = await withSessionContext(hh.context, (tx) =>
      tx.select().from(membership).where(eq(membership.householdId, hh!.householdId)),
    );

    await expect(
      joinHousehold(
        founding.code,
        { displayName: testName("Zoe"), password: PASSWORD },
        { currentSession: { sessionId: sessionInserted.id, context: moderator.context } },
      ),
    ).rejects.toMatchObject({ code: "already_member" });

    expect((await sessionRow(hh, sessionInserted.id)).revokedAt).toBeNull();
    const after = await withSessionContext(hh.context, (tx) =>
      tx.select().from(membership).where(eq(membership.householdId, hh!.householdId)),
    );
    expect(after).toHaveLength(before.length); // no account or membership created
    const link = (await listJoinCodeIssuances(hh.context, hh.accountId)).find((i) => i.id === founding.id);
    expect(link?.uses).toBe(0);
  });
});
