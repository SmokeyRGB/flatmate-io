import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterEach, describe, expect, it } from "vitest";
import { withSessionContext, type SessionContext } from "@/db/session-context";
import {
  ClaimError,
  RegistrationError,
  claimResidentProfile,
  deriveResidentEmail,
  registerHousehold,
} from "@/modules/identity/auth";
import { createResidentProfile } from "@/modules/identity/repository";
import { membership, residentProfile } from "@/modules/identity/schema";
import {
  adminClient,
  cleanupAll,
  cleanupHousehold,
  registerTestHousehold,
  testEmail,
  type TestHousehold,
} from "../../helpers/identity";

// No transaction spans Postgres and Supabase Auth (CLAUDE.md). registerHousehold and
// claimResidentProfile both create the Auth user before their transaction; when the transaction
// then fails, the Auth user has to be deleted again, or the address stays taken and every retry
// fails at createUser as a duplicate. Each failure is provoked by a real constraint inside the
// transaction, after createUser has succeeded — nothing is mocked.

const PASSWORD = "test-password-not-real-1234";

type PgError = { code?: string };

// Same shape as membership-uniqueness.test.ts's pgErrorOf: postgres.js sets `.code` itself,
// drizzle's wrapping sometimes nests the driver error under `.cause`.
function pgErrorOf(caught: unknown): PgError {
  const err = caught as { code?: string; cause?: PgError };
  return err.code ? err : (err.cause ?? err);
}

// The admin API has no lookup by address, so this pages through listUsers. Used both as the
// assertion (is the address free again?) and in teardown, where a broken implementation would
// otherwise leave the orphan this test is about.
async function findAuthUserIdByEmail(email: string): Promise<string | null> {
  const perPage = 1000;
  for (let page = 1; ; page++) {
    const { data, error } = await adminClient().auth.admin.listUsers({ page, perPage });
    if (error) throw error;
    const match = data.users.find((u) => u.email?.toLowerCase() === email.toLowerCase());
    if (match) return match.id;
    if (data.users.length < perPage) return null;
  }
}

async function deleteAuthUserByEmail(email: string): Promise<void> {
  const id = await findAuthUserIdByEmail(email);
  if (id) await adminClient().auth.admin.deleteUser(id);
}

let hh: TestHousehold | undefined;
const registered: SessionContext[] = [];
const emails: string[] = [];

afterEach(async () => {
  await cleanupAll(
    hh?.cleanup(),
    ...registered.map((context) => cleanupHousehold(context, context.householdId)),
    ...emails.map(deleteAuthUserByEmail),
  );
  hh = undefined;
  registered.length = 0;
  emails.length = 0;
});

describe("A provider user created before a failing transaction is deleted again", () => {
  it("registerHousehold: the transaction fails after createUser, the address is free for a retry", async () => {
    const email = testEmail();
    emails.push(email);

    // A NUL byte passes trim() and the emptiness check, and is never sent to Auth, but Postgres
    // rejects it in a text column (SQLSTATE 22021) — so the household insert fails after
    // createUser has already succeeded.
    let caught: unknown;
    try {
      await registerHousehold(email, PASSWORD, "Test\u0000WG");
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(Error);
    expect(caught).not.toBeInstanceOf(RegistrationError); // reached the transaction, not createUser
    expect(pgErrorOf(caught).code).toBe("22021");

    expect(await findAuthUserIdByEmail(email)).toBeNull();

    const retried = await registerHousehold(email, PASSWORD, "Test-WG");
    registered.push(retried.context);
    expect(retried.household.contactEmail).toBe(email);
  });

  it("claimResidentProfile: the transaction fails after createUser, the profile stays claimable", async () => {
    hh = await registerTestHousehold();
    const profile = await createResidentProfile(hh.context, "Compensated", {
      accountId: hh.accountId,
      profileId: null,
    });
    const derivedEmail = deriveResidentEmail(profile.id);
    emails.push(derivedEmail);

    // A stray membership already holds this profile's slot, so claim's own membership insert hits
    // membership_resident_profile_id_unique (drizzle/0021) — inside the transaction, after
    // createUser. The profile itself is still `prepared`, so the pre-check lets it through.
    await withSessionContext(hh.context, (tx) =>
      tx.insert(membership).values({
        householdId: hh!.householdId,
        accountId: randomUUID(),
        residentProfileId: profile.id,
        isResident: true,
        role: "member",
        permissions: [],
      }),
    );

    let caught: unknown;
    try {
      await claimResidentProfile(hh.context, profile.id, PASSWORD);
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(Error);
    expect(caught).not.toBeInstanceOf(ClaimError); // reached the transaction, not createUser
    expect(pgErrorOf(caught).code).toBe("23505");

    expect(await findAuthUserIdByEmail(derivedEmail)).toBeNull();
    const [rolledBack] = await withSessionContext(hh.context, (tx) =>
      tx.select().from(residentProfile).where(eq(residentProfile.id, profile.id)),
    );
    expect(rolledBack.status).toBe("prepared");
    expect(rolledBack.movedInOn).toBeNull();

    await withSessionContext(hh.context, (tx) =>
      tx.delete(membership).where(eq(membership.residentProfileId, profile.id)),
    );

    const claimed = await claimResidentProfile(hh.context, profile.id, PASSWORD);
    expect(claimed.membership.residentProfileId).toBe(profile.id);
  });

  it("claimResidentProfile: a profile removed between pre-check and write is refused, and its Auth user deleted", async () => {
    hh = await registerTestHousehold();
    const profile = await createResidentProfile(hh.context, "Overtaken", {
      accountId: hh.accountId,
      profileId: null,
    });
    const derivedEmail = deriveResidentEmail(profile.id);
    emails.push(derivedEmail);

    // Deterministic, not timing-based: an uncommitted removal holds the profile's row lock. The
    // claim's pre-check (a plain SELECT) still reads the committed `prepared`, createUser runs, and
    // the conditional UPDATE then waits on the lock and re-reads `removed` once it is released.
    let release!: () => void;
    const released = new Promise<void>((resolve) => (release = resolve));
    let markRemoved!: () => void;
    const removed = new Promise<void>((resolve) => (markRemoved = resolve));
    const holder = withSessionContext(hh.context, async (tx) => {
      await tx.update(residentProfile).set({ status: "removed" }).where(eq(residentProfile.id, profile.id));
      markRemoved();
      await released;
    });
    await removed;

    const claim = claimResidentProfile(hh.context, profile.id, PASSWORD);
    let settled = false;
    claim.then(
      () => (settled = true),
      () => (settled = true),
    );
    // The Auth user existing means the pre-check already passed.
    const deadline = Date.now() + 30_000;
    while (!settled && Date.now() < deadline && (await findAuthUserIdByEmail(derivedEmail)) === null) {
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
    release();
    await holder;

    await expect(claim).rejects.toBeInstanceOf(ClaimError);
    await expect(claim).rejects.toMatchObject({ code: "not_prepared" });
    expect(await findAuthUserIdByEmail(derivedEmail)).toBeNull();

    const [profileRow, memberships] = await withSessionContext(hh.context, async (tx) => [
      (await tx.select().from(residentProfile).where(eq(residentProfile.id, profile.id)))[0],
      await tx.select().from(membership).where(eq(membership.residentProfileId, profile.id)),
    ]);
    expect(profileRow.status).toBe("removed");
    expect(memberships).toHaveLength(0);
  });
});
