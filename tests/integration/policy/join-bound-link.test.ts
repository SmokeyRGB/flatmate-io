import { afterEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { withSessionContext } from "@/db/session-context";
import { JoinError, joinHousehold } from "@/modules/identity/auth";
import {
  ResidentProfileNotEligibleForBindingError,
  createResidentProfile,
  deleteJoinCode,
  issueJoinCode,
} from "@/modules/identity/repository";
import { residentProfile } from "@/modules/identity/schema";
import { cleanupAll, deleteTestAccount, registerTestHousehold, type TestHousehold } from "../../helpers/identity";

let hh: TestHousehold | undefined;
let otherHh: TestHousehold | undefined;
const accountIds: string[] = [];

afterEach(async () => {
  await cleanupAll(...accountIds.map(deleteTestAccount), hh?.cleanup(), otherHh?.cleanup());
  accountIds.length = 0;
  hh = undefined;
  otherHh = undefined;
});

// join-by-link design.md Decision 13 / spec.md identity/join "A link bound to a prepared profile
// claims it instead of creating one" and identity/join-code "A link may name the person it was
// issued for". This is the security fix's own test — before this group, a household id plus a
// prepared display name was enough to become that person (no link at all required); afterwards
// there is exactly one way to claim a prepared profile, and it is a link naming it.
describe("A bound join link claims the named profile (design.md Decision 13)", () => {
  it("claims the named profile and creates no second one", async () => {
    hh = await registerTestHousehold();
    const adminActor = { accountId: hh.accountId, profileId: null };
    const prepared = await createResidentProfile(hh.context, "Sam", adminActor);

    const link = await issueJoinCode(hh.context, hh.accountId, {
      validDays: 7,
      maxUses: 5, // deliberately requested — issueJoinCodeTx forces a bound link to 1 anyway
      residentProfileId: prepared.id,
    });
    expect(link.maxUses).toBe(1); // design.md Decision 13: always forced to 1 for a bound link
    expect(link.residentProfileId).toBe(prepared.id);

    const result = await joinHousehold(link.code, { password: "test-password-not-real-1234" });
    accountIds.push(result.context.accountId);

    expect(result.context.profileId).toBe(prepared.id);
    const profiles = await withSessionContext(hh.context, (tx) =>
      tx.select().from(residentProfile).where(eq(residentProfile.householdId, hh!.householdId)),
    );
    expect(profiles).toHaveLength(1);
    expect(profiles[0]!.status).toBe("active");
  });

  it("a neutral link still creates a new profile, exactly as before this change", async () => {
    hh = await registerTestHousehold();
    const link = await issueJoinCode(hh.context, hh.accountId, { validDays: 7, maxUses: 1 });
    expect(link.residentProfileId).toBeNull();

    const result = await joinHousehold(link.code, {
      displayName: "Neutral Joiner",
      password: "test-password-not-real-1234",
    });
    accountIds.push(result.context.accountId);

    const [profile] = await withSessionContext(hh.context, (tx) =>
      tx.select().from(residentProfile).where(eq(residentProfile.id, result.context.profileId!)),
    );
    expect(profile.displayName).toBe("Neutral Joiner");
  });

  it("a spent bound link refuses with the SAME message as any other spent link (FR-2.8)", async () => {
    hh = await registerTestHousehold();
    const adminActor = { accountId: hh.accountId, profileId: null };
    const prepared = await createResidentProfile(hh.context, "OnceOnly", adminActor);
    const link = await issueJoinCode(hh.context, hh.accountId, {
      validDays: 7,
      maxUses: 1,
      residentProfileId: prepared.id,
    });

    const first = await joinHousehold(link.code, { password: "test-password-not-real-1234" });
    accountIds.push(first.context.accountId);

    // Proposal Assumption 0b / design.md Decision 13: no bespoke wording for a spent BOUND link —
    // the identical invalid_link refusal an ordinary exhausted neutral link produces, never a
    // second, distinguishable message the way screens/A-zugang.md A4 deliberately does for the
    // unrelated v0.2 ApplicationInviteToken.
    await expect(
      joinHousehold(link.code, { password: "test-password-not-real-1234" }),
    ).rejects.toMatchObject({ code: "invalid_link" });
    await expect(joinHousehold(link.code, { password: "x" })).rejects.toBeInstanceOf(JoinError);
  });

  it("cannot name a profile of another household", async () => {
    hh = await registerTestHousehold();
    otherHh = await registerTestHousehold();
    const otherAdminActor = { accountId: otherHh.accountId, profileId: null };
    const otherProfile = await createResidentProfile(otherHh.context, "NotYours", otherAdminActor);

    await expect(
      issueJoinCode(hh.context, hh.accountId, {
        validDays: 7,
        maxUses: 1,
        residentProfileId: otherProfile.id,
      }),
    ).rejects.toBeInstanceOf(ResidentProfileNotEligibleForBindingError);
  });

  it("cannot name a profile that is not prepared (already active)", async () => {
    hh = await registerTestHousehold();
    const adminActor = { accountId: hh.accountId, profileId: null };
    const prepared = await createResidentProfile(hh.context, "AlreadyIn", adminActor);
    const firstLink = await issueJoinCode(hh.context, hh.accountId, {
      validDays: 7,
      maxUses: 1,
      residentProfileId: prepared.id,
    });
    const claimed = await joinHousehold(firstLink.code, { password: "test-password-not-real-1234" });
    accountIds.push(claimed.context.accountId);

    // The profile is active now — a second link cannot be bound to it.
    await expect(
      issueJoinCode(hh.context, hh.accountId, {
        validDays: 7,
        maxUses: 1,
        residentProfileId: prepared.id,
      }),
    ).rejects.toBeInstanceOf(ResidentProfileNotEligibleForBindingError);
  });

  it("deleting an unredeemed bound link leaves its profile prepared, and a fresh invitation can be issued", async () => {
    hh = await registerTestHousehold();
    const adminActor = { accountId: hh.accountId, profileId: null };
    const prepared = await createResidentProfile(hh.context, "Reissuable", adminActor);
    const link = await issueJoinCode(hh.context, hh.accountId, {
      validDays: 7,
      maxUses: 1,
      residentProfileId: prepared.id,
    });

    await deleteJoinCode(hh.context, hh.accountId, link.id);

    const [afterDelete] = await withSessionContext(hh.context, (tx) =>
      tx.select().from(residentProfile).where(eq(residentProfile.id, prepared.id)),
    );
    expect(afterDelete.status).toBe("prepared");

    // Confirms it really is still eligible — issuing a fresh invitation for it succeeds.
    const secondLink = await issueJoinCode(hh.context, hh.accountId, {
      validDays: 7,
      maxUses: 1,
      residentProfileId: prepared.id,
    });
    expect(secondLink.residentProfileId).toBe(prepared.id);

    const result = await joinHousehold(secondLink.code, { password: "test-password-not-real-1234" });
    accountIds.push(result.context.accountId);
    expect(result.context.profileId).toBe(prepared.id);
  });
});
