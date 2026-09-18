import { afterEach, describe, expect, it } from "vitest";
import { claimResidentProfile } from "@/modules/identity/auth";
import { createResidentProfile } from "@/modules/identity/repository";
import {
  cleanupAll,
  deleteTestAccount,
  registerTestHousehold,
  type TestHousehold,
} from "../../helpers/identity";

let hh: TestHousehold | undefined;
let firstAccountId: string | undefined;
let secondAccountId: string | undefined;

afterEach(async () => {
  await cleanupAll(
    firstAccountId ? deleteTestAccount(firstAccountId) : undefined,
    secondAccountId ? deleteTestAccount(secondAccountId) : undefined,
    hh?.cleanup(),
  );
  firstAccountId = undefined;
  secondAccountId = undefined;
  hh = undefined;
});

// spec.md Assumptions: the household account's own (first) resident profile holds close_round
// initially; a later profile does not get it by default.
describe("Founding resident's default close_round permission", () => {
  it("grants close_round to the first claimed resident profile, not to a later one", async () => {
    hh = await registerTestHousehold();
    const actor = { accountId: hh.accountId, profileId: null };

    const first = await createResidentProfile(hh.context, "Founder", actor);
    const { accountId: firstAcc, membership: firstMembership } = await claimResidentProfile(
      hh.context,
      first.id,
      "test-password-not-real-1234",
    );
    firstAccountId = firstAcc;
    expect(firstMembership.permissions).toContain("close_round");

    const second = await createResidentProfile(hh.context, "SecondResident", actor);
    const { accountId: secondAcc, membership: secondMembership } = await claimResidentProfile(
      hh.context,
      second.id,
      "test-password-not-real-1234",
    );
    secondAccountId = secondAcc;
    expect(secondMembership.permissions).not.toContain("close_round");
  });
});
