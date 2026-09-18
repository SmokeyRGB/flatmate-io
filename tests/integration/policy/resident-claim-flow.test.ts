import { afterEach, describe, expect, it } from "vitest";
import { claimResidentProfile, findPreparedResidentProfile } from "@/modules/identity/auth";
import { createResidentProfile, ResidentListActionDeniedError } from "@/modules/identity/repository";
import { deleteTestAccount, registerTestHousehold, type TestHousehold } from "../../helpers/identity";

let hh: TestHousehold | undefined;
let residentAccountId: string | undefined;
let claimedAccountId: string | undefined;

afterEach(async () => {
  if (residentAccountId) await deleteTestAccount(residentAccountId);
  if (claimedAccountId) await deleteTestAccount(claimedAccountId);
  residentAccountId = undefined;
  claimedAccountId = undefined;
  if (hh) await hh.cleanup();
  hh = undefined;
});

// Convergence T082: the UI path for FR-1.5/US1's "create and claim a resident profile" story —
// createResidentProfile is administration-only (FR-1.3), and findPreparedResidentProfile is the
// lookup the /claim route needs before it can call claimResidentProfile.
describe("Resident profile creation and claim (Convergence T082)", () => {
  it("refuses createResidentProfile for a claimed resident, only allows household_admin (FR-1.3)", async () => {
    hh = await registerTestHousehold();
    const adminActor = { accountId: hh.accountId, profileId: null };

    const residentProfile = await createResidentProfile(hh.context, "PlainResident", adminActor);
    const { accountId: residentAccount } = await claimResidentProfile(
      hh.context,
      residentProfile.id,
      "test-password-not-real-1234",
    );
    residentAccountId = residentAccount;

    const residentActor = { accountId: residentAccount, profileId: residentProfile.id };
    await expect(
      createResidentProfile(hh.context, "AttemptedByResident", residentActor),
    ).rejects.toThrow(ResidentListActionDeniedError);
  });

  it("finds a prepared profile by (household, display_name), not an already-claimed one", async () => {
    hh = await registerTestHousehold();
    const actor = { accountId: hh.accountId, profileId: null };

    const prepared = await createResidentProfile(hh.context, "Waiting", actor);
    const found = await findPreparedResidentProfile(hh.householdId, "Waiting");
    expect(found?.id).toBe(prepared.id);

    expect(await findPreparedResidentProfile(hh.householdId, "NoSuchName")).toBeNull();

    const { accountId } = await claimResidentProfile(
      hh.context,
      prepared.id,
      "test-password-not-real-1234",
    );
    claimedAccountId = accountId;

    // Now active, not prepared — no longer findable as a profile waiting to be claimed.
    expect(await findPreparedResidentProfile(hh.householdId, "Waiting")).toBeNull();
  });
});
