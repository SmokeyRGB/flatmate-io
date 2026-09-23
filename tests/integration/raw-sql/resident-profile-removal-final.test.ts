import { sql } from "drizzle-orm";
import { afterEach, describe, expect, it } from "vitest";
import { withSessionContext } from "@/db/session-context";
import { claimResidentProfile } from "@/modules/identity/auth";
import { createResidentProfile, removeMember } from "@/modules/identity/repository";
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

// design.md Decision 2/design.md Decision 10 (G-C7 raw-SQL side): drizzle/0017's
// reject_resident_profile_unremoval trigger must refuse a direct UPDATE under app_runtime, not
// only calls that go through transitions.ts — the same reasoning drizzle/0006's session trigger
// comment gives: a guarantee that holds only while every caller goes through application code is
// not the guarantee G-C7 asks for.
describe("[G-C7 raw SQL] a removed resident_profile cannot leave `removed`, even via raw SQL", () => {
  async function makeRemovedProfile(name: string): Promise<{ hh: TestHousehold; profileId: string }> {
    const household = await registerTestHousehold();
    const actor = { accountId: household.accountId, profileId: null };
    const profile = await createResidentProfile(household.context, name, actor);
    const { accountId } = await claimResidentProfile(household.context, profile.id, "test-password-not-real-1234");
    accountIds.push(accountId);
    await removeMember(household.context, household.accountId, accountId, name);
    return { hh: household, profileId: profile.id };
  }

  it("rejects a raw SQL UPDATE moving a removed profile to active", async () => {
    const made = await makeRemovedProfile("RawSqlActive");
    hh = made.hh;

    let caught: unknown;
    try {
      await withSessionContext(hh.context, (tx) =>
        tx.execute(sql`UPDATE resident_profile SET status = 'active' WHERE id = ${made.profileId}::uuid`),
      );
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(Error);
    const message = [(caught as Error).message, (caught as { cause?: Error }).cause?.message]
      .filter(Boolean)
      .join(" | ");
    expect(message).toMatch(/is removed; removal is final/);
  });

  it("rejects a raw SQL UPDATE moving a removed profile to moved_out", async () => {
    const made = await makeRemovedProfile("RawSqlMovedOut");
    hh = made.hh;

    let caught: unknown;
    try {
      await withSessionContext(hh.context, (tx) =>
        tx.execute(sql`UPDATE resident_profile SET status = 'moved_out' WHERE id = ${made.profileId}::uuid`),
      );
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(Error);
    const message = [(caught as Error).message, (caught as { cause?: Error }).cause?.message]
      .filter(Boolean)
      .join(" | ");
    expect(message).toMatch(/is removed; removal is final/);
  });

  it("does NOT block updating a different column of a removed row (the trigger is narrow)", async () => {
    const made = await makeRemovedProfile("RawSqlRoomChange");
    hh = made.hh;

    // No `rooms` fixture needed — any uuid proves the UPDATE itself isn't refused by the trigger;
    // FK-less schema (project_supabase_dev_split) means nothing else validates this id either.
    const roomId = "11111111-1111-1111-1111-111111111111";
    await expect(
      withSessionContext(hh!.context, (tx) =>
        tx.execute(sql`UPDATE resident_profile SET room_id = ${roomId}::uuid WHERE id = ${made.profileId}::uuid`),
      ),
    ).resolves.toBeDefined();
  });

  it("does NOT block an active -> moved_out raw SQL update (the trigger only guards `removed`)", async () => {
    hh = await registerTestHousehold();
    const actor = { accountId: hh.accountId, profileId: null };
    const profile = await createResidentProfile(hh.context, "RawSqlSoftTier", actor);
    const { accountId } = await claimResidentProfile(hh.context, profile.id, "test-password-not-real-1234");
    accountIds.push(accountId);

    await expect(
      withSessionContext(hh!.context, (tx) =>
        tx.execute(sql`UPDATE resident_profile SET status = 'moved_out' WHERE id = ${profile.id}::uuid`),
      ),
    ).resolves.toBeDefined();
  });
});
