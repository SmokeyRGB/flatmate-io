import { afterEach, describe, expect, it } from "vitest";
import { JoinError, joinHousehold } from "@/modules/identity/auth";
import { issueJoinCode } from "@/modules/identity/repository";
import { cleanupAll, deleteTestAccount, registerTestHousehold, type TestHousehold } from "../../helpers/identity";

let hh: TestHousehold | undefined;
const accountIds: string[] = [];

afterEach(async () => {
  await cleanupAll(...accountIds.map(deleteTestAccount), hh?.cleanup());
  accountIds.length = 0;
  hh = undefined;
});

// AC-2.17/EC-2.11: a taken display name is refused inline, with a way forward; the name is
// trimmed before comparison, and letter case is NOT folded (this is the one deliberate exception —
// EC-2.15/AC-2.24 folds case for the CODE, never for a display name).
describe("Join name collision (AC-2.17/EC-2.11)", () => {
  it("refuses a second join with an already-taken display name, with name_taken", async () => {
    hh = await registerTestHousehold();
    const linkA = await issueJoinCode(hh.context, hh.accountId, { validDays: 7, maxUses: 5 });

    const first = await joinHousehold(linkA.code, {
      displayName: "Jonas",
      password: "test-password-not-real-1234",
    });
    accountIds.push(first.context.accountId);

    await expect(
      joinHousehold(linkA.code, { displayName: "Jonas", password: "test-password-not-real-1234" }),
    ).rejects.toMatchObject({ code: "name_taken" });
  });

  it("is a JoinError instance for the name_taken refusal", async () => {
    hh = await registerTestHousehold();
    const link = await issueJoinCode(hh.context, hh.accountId, { validDays: 7, maxUses: 5 });
    const first = await joinHousehold(link.code, {
      displayName: "Jonas",
      password: "test-password-not-real-1234",
    });
    accountIds.push(first.context.accountId);

    await expect(
      joinHousehold(link.code, { displayName: "Jonas", password: "test-password-not-real-1234" }),
    ).rejects.toBeInstanceOf(JoinError);
  });

  it("treats a surrounding-whitespace name as a collision with the trimmed name", async () => {
    hh = await registerTestHousehold();
    const link = await issueJoinCode(hh.context, hh.accountId, { validDays: 7, maxUses: 5 });
    const first = await joinHousehold(link.code, {
      displayName: "Jonas",
      password: "test-password-not-real-1234",
    });
    accountIds.push(first.context.accountId);

    await expect(
      joinHousehold(link.code, { displayName: " Jonas ", password: "test-password-not-real-1234" }),
    ).rejects.toMatchObject({ code: "name_taken" });
  });

  it("does NOT fold case — 'jonas' is a different name from 'Jonas' and is not refused for collision", async () => {
    hh = await registerTestHousehold();
    const link = await issueJoinCode(hh.context, hh.accountId, { validDays: 7, maxUses: 5 });
    const first = await joinHousehold(link.code, {
      displayName: "Jonas",
      password: "test-password-not-real-1234",
    });
    accountIds.push(first.context.accountId);

    const second = await joinHousehold(link.code, {
      displayName: "jonas",
      password: "test-password-not-real-1234",
    });
    accountIds.push(second.context.accountId);
    expect(second.context.profileId).not.toBe(first.context.profileId);
  });
});
