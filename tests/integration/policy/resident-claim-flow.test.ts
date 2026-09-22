import { afterEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { withSessionContext } from "@/db/session-context";
import { joinHousehold } from "@/modules/identity/auth";
import {
  ResidentListActionDeniedError,
  createResidentProfile,
  issueJoinCode,
} from "@/modules/identity/repository";
import { residentProfile } from "@/modules/identity/schema";
import {
  cleanupAll,
  deleteTestAccount,
  registerTestHousehold,
  type TestHousehold,
} from "../../helpers/identity";

let hh: TestHousehold | undefined;
let residentAccountId: string | undefined;
let claimedAccountId: string | undefined;

afterEach(async () => {
  await cleanupAll(
    residentAccountId ? deleteTestAccount(residentAccountId) : undefined,
    claimedAccountId ? deleteTestAccount(claimedAccountId) : undefined,
    hh?.cleanup(),
  );
  residentAccountId = undefined;
  claimedAccountId = undefined;
  hh = undefined;
});

// Convergence T082, carried forward by join-by-link design.md Decision 13: the UI path for
// FR-1.5/US1's "create and claim a resident profile" story. G-G1: this file is REWRITTEN, not
// deleted — `/claim` and `findPreparedResidentProfile` (the lookup it used) are both gone, but the
// story itself ("administration prepares a profile; the person who is meant to occupy it becomes
// its resident") still exists, now told entirely through a BOUND join link (design.md Decision 13)
// rather than a household-id-and-name form. `tests/integration/policy/join-bound-link.test.ts`
// covers the same mechanism's refusal/isolation edges; this file keeps Convergence T082's own
// two concerns — creation is admin-only, and claiming activates the RIGHT profile.
describe("Resident profile creation and claim, via a bound link (Convergence T082)", () => {
  it("refuses createResidentProfile for a claimed resident, only allows household_admin (FR-1.3)", async () => {
    hh = await registerTestHousehold();
    const adminActor = { accountId: hh.accountId, profileId: null };

    const prepared = await createResidentProfile(hh.context, "PlainResident", adminActor);
    const link = await issueJoinCode(hh.context, hh.accountId, {
      validDays: 7,
      maxUses: 1,
      residentProfileId: prepared.id,
    });
    const { context: residentContext } = await joinHousehold(link.code, {
      password: "test-password-not-real-1234",
    });
    residentAccountId = residentContext.accountId;

    const residentActor = { accountId: residentContext.accountId, profileId: residentContext.profileId };
    await expect(
      createResidentProfile(hh.context, "AttemptedByResident", residentActor),
    ).rejects.toThrow(ResidentListActionDeniedError);
  });

  it("claims exactly the named profile — its own display name, never a name the visitor chose", async () => {
    hh = await registerTestHousehold();
    const adminActor = { accountId: hh.accountId, profileId: null };

    const prepared = await createResidentProfile(hh.context, "Waiting", adminActor);
    const link = await issueJoinCode(hh.context, hh.accountId, {
      validDays: 7,
      maxUses: 1,
      residentProfileId: prepared.id,
    });

    const result = await joinHousehold(link.code, { password: "test-password-not-real-1234" });
    claimedAccountId = result.context.accountId;

    // The NAMED profile is the one activated — not a second, newly created one.
    expect(result.context.profileId).toBe(prepared.id);

    const [claimedProfile] = await withSessionContext(hh.context, (tx) =>
      tx.select().from(residentProfile).where(eq(residentProfile.id, prepared.id)),
    );
    expect(claimedProfile.status).toBe("active");
    expect(claimedProfile.displayName).toBe("Waiting"); // unchanged — never overwritten by any input

    // No second profile was created alongside it.
    const allProfiles = await withSessionContext(hh.context, (tx) =>
      tx.select().from(residentProfile).where(eq(residentProfile.householdId, hh!.householdId)),
    );
    expect(allProfiles).toHaveLength(1);
  });
});
