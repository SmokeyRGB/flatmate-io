import { afterEach, describe, expect, it } from "vitest";
import { claimResidentProfile, joinHousehold, signIn, SignInError } from "@/modules/identity/auth";
import {
  createResidentProfile,
  DuplicateDisplayNameError,
  issueJoinCode,
  removeMember,
  transitionResidentProfileStatus,
} from "@/modules/identity/repository";
import {
  cleanupAll,
  deleteTestAccount,
  registerTestHousehold,
  type TestHousehold,
} from "../../helpers/identity";

let hh: TestHousehold | undefined;
const accountIds: string[] = [];

afterEach(async () => {
  await cleanupAll(...accountIds.map(deleteTestAccount), hh?.cleanup());
  accountIds.length = 0;
  hh = undefined;
});

// AC-1.3/AC-1.4, FR-1.4: unique among status != moved_out profiles within a household.
describe("ResidentProfile display_name uniqueness", () => {
  it("refuses a second active profile with the same name (AC-1.3)", async () => {
    hh = await registerTestHousehold();
    const actor = { accountId: hh.accountId, profileId: null };

    await createResidentProfile(hh.context, "Jonas", actor);

    await expect(createResidentProfile(hh.context, "Jonas", actor)).rejects.toThrow(
      DuplicateDisplayNameError,
    );
  });

  it("allows a new profile once the only same-named one is moved_out (AC-1.4)", async () => {
    hh = await registerTestHousehold();
    const actor = { accountId: hh.accountId, profileId: null };

    const first = await createResidentProfile(hh.context, "Jonas", actor);
    await transitionResidentProfileStatus(hh.context, first.id, "moved_out", actor);

    await expect(createResidentProfile(hh.context, "Jonas", actor)).resolves.toMatchObject({
      displayName: "Jonas",
      status: "prepared",
    });
  });

  // FR-1.4 as amended 2026-09-22: a removed member's name is free again too, not only a
  // moved-out one's.
  it("allows a new profile once the only same-named one is removed", async () => {
    hh = await registerTestHousehold();
    const actor = { accountId: hh.accountId, profileId: null };

    const first = await createResidentProfile(hh.context, "Removable", actor);
    const { accountId } = await claimResidentProfile(hh.context, first.id, "test-password-not-real-1234");
    accountIds.push(accountId);
    await removeMember(hh.context, hh.accountId, accountId, "Removable");

    await expect(createResidentProfile(hh.context, "Removable", actor)).resolves.toMatchObject({
      displayName: "Removable",
      status: "prepared",
    });
  });

  it("allows a join to take a removed member's name", async () => {
    hh = await registerTestHousehold();
    const actor = { accountId: hh.accountId, profileId: null };

    const first = await createResidentProfile(hh.context, "RemovedThenRejoined", actor);
    const { accountId } = await claimResidentProfile(hh.context, first.id, "test-password-not-real-1234");
    accountIds.push(accountId);
    await removeMember(hh.context, hh.accountId, accountId, "RemovedThenRejoined");

    const link = await issueJoinCode(hh.context, hh.accountId, { validDays: 7, maxUses: 1 });
    const result = await joinHousehold(link.code, {
      displayName: "RemovedThenRejoined",
      password: "test-password-not-real-1234",
      email: "",
    });
    accountIds.push(result.context.accountId);

    expect(result.context.profileId).toBeTruthy();
    expect(result.context.profileId).not.toBe(first.id); // a NEW profile, not the removed one
  });

  // FR-1.4/design.md Decision 4: the display-name sign-in lookup must never resolve to a removed
  // profile — a removed member's old credentials must not work, and a same-named NEW profile
  // (once one exists) is the only thing the name can now mean.
  it("display-name sign-in does not resolve to a removed member's profile", async () => {
    hh = await registerTestHousehold();
    const actor = { accountId: hh.accountId, profileId: null };

    const first = await createResidentProfile(hh.context, "GoneForGood", actor);
    const { accountId } = await claimResidentProfile(hh.context, first.id, "test-password-not-real-1234");
    accountIds.push(accountId);
    await removeMember(hh.context, hh.accountId, accountId, "GoneForGood");

    let caught: unknown;
    try {
      await signIn({
        kind: "resident",
        householdId: hh.householdId,
        displayName: "GoneForGood",
        password: "test-password-not-real-1234",
      });
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(SignInError);
    expect((caught as SignInError).code).toBe("invalid_credentials");
  });
});
