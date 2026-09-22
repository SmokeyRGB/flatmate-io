import { afterEach, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { withSessionContext } from "@/db/session-context";
import * as authModule from "@/modules/identity/auth";
import { joinHousehold } from "@/modules/identity/auth";
import { createResidentProfile, issueJoinCode } from "@/modules/identity/repository";
import { membership, residentProfile } from "@/modules/identity/schema";
import { cleanupAll, deleteTestAccount, registerTestHousehold, type TestHousehold } from "../../helpers/identity";

let hh: TestHousehold | undefined;
const accountIds: string[] = [];

afterEach(async () => {
  await cleanupAll(...accountIds.map(deleteTestAccount), hh?.cleanup());
  accountIds.length = 0;
  hh = undefined;
});

// join-by-link design.md Decision 13, "Why this is the security fix and not merely a feature":
// before this group, claiming needed no secret at all — `claimResidentProfile` took whatever
// password was typed and created the account with it, `findPreparedResidentProfile` resolved a
// prepared profile from nothing but (household_id, display_name), and C-1.4 already says the
// household id is "keine Sicherheitsgrenze, nur Zuordnung". A household id plus a prepared
// display name was therefore enough to become that person. THIS is the test that would have
// failed against the pre-group-12 code: it asserts outright that knowing both, with no link,
// claims nothing — spec.md identity/join, "There is no other route to a prepared profile".
describe("No route claims a prepared profile without a link naming it (design.md Decision 13)", () => {
  it("the lookup-by-name mechanism itself no longer exists on the module", () => {
    // Not merely unreachable from a route — the capability that made a household id + a display
    // name sufficient is gone from the module's own exported surface. Kept as a direct assertion
    // rather than inferred only from `/claim`'s deletion, because a future addition of some OTHER
    // route calling a lookup like this would silently reopen exactly the hole this group closes.
    expect(authModule).not.toHaveProperty("findPreparedResidentProfile");
    expect(authModule).not.toHaveProperty("undoClaimResidentProfile");
  });

  it("a never-issued code claims nothing, even though the household id and the exact prepared name are both known", async () => {
    hh = await registerTestHousehold();
    const adminActor = { accountId: hh.accountId, profileId: null };
    const prepared = await createResidentProfile(hh.context, "Sam", adminActor);

    // joinHousehold's ONLY input identifying a household or a person is the code — householdId
    // and displayName are not even parameters it accepts as a lookup key. A garbage/never-issued
    // code is the closest thing to "no link at all": knowing the household's id (not secret,
    // C-1.4) and the exact name administration gave a prepared profile buys nothing without it.
    await expect(
      joinHousehold("NEVER-ISSUED-FOR-SAM", { displayName: "Sam", password: "test-password-not-real-1234" }),
    ).rejects.toMatchObject({ code: "invalid_link" });

    const [untouched] = await withSessionContext(hh.context, (tx) =>
      tx.select().from(residentProfile).where(eq(residentProfile.id, prepared.id)),
    );
    expect(untouched.status).toBe("prepared");
    expect(untouched.movedInOn).toBeNull();

    const memberships = await withSessionContext(hh.context, (tx) =>
      tx.select().from(membership).where(eq(membership.residentProfileId, prepared.id)),
    );
    expect(memberships).toHaveLength(0);
  });

  it("a valid NEUTRAL link — one that does not name Sam — cannot be used to take Sam's prepared profile over either", async () => {
    hh = await registerTestHousehold();
    const adminActor = { accountId: hh.accountId, profileId: null };
    const prepared = await createResidentProfile(hh.context, "Sam", adminActor);

    // A genuine, live link for THIS household — but a NEUTRAL one, naming no profile. Choosing
    // "Sam" as the display name on it collides with the ALREADY-prepared "Sam" (isDisplayNameTaken
    // counts every status except moved_out, repository.ts) rather than silently activating it —
    // a neutral link creates a new profile or nothing; it never reaches into an existing one.
    const neutralLink = await issueJoinCode(hh.context, hh.accountId, { validDays: 7, maxUses: 1 });
    expect(neutralLink.residentProfileId).toBeNull();

    await expect(
      joinHousehold(neutralLink.code, { displayName: "Sam", password: "test-password-not-real-1234" }),
    ).rejects.toMatchObject({ code: "name_taken" });

    const [stillPrepared] = await withSessionContext(hh.context, (tx) =>
      tx.select().from(residentProfile).where(eq(residentProfile.id, prepared.id)),
    );
    expect(stillPrepared.status).toBe("prepared");

    // No RESIDENT account was created for the rejected attempt either — the household's own
    // admin membership (isResident: false, from registerTestHousehold) is the only membership
    // row that exists at all, and it is excluded here explicitly rather than by accident.
    const residentMemberships = await withSessionContext(hh.context, (tx) =>
      tx
        .select()
        .from(membership)
        .where(and(eq(membership.householdId, hh!.householdId), eq(membership.isResident, true))),
    );
    expect(residentMemberships).toHaveLength(0);
  });
});
