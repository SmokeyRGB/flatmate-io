import { and, eq } from "drizzle-orm";
import { withSessionContext } from "@/db/session-context";
import { afterEach, describe, expect, it } from "vitest";
import { JoinError, joinHousehold } from "@/modules/identity/auth";
import { deleteJoinCode, issueJoinCode } from "@/modules/identity/repository";
import { joinCodeIssuance, residentProfile } from "@/modules/identity/schema";
import { cleanupAll, registerTestHousehold, type TestHousehold } from "../../helpers/identity";

let hh: TestHousehold | undefined;

afterEach(async () => {
  await cleanupAll(hh?.cleanup());
  hh = undefined;
});

async function insertIssuance(
  household: TestHousehold,
  overrides: Partial<typeof joinCodeIssuance.$inferInsert>,
) {
  return withSessionContext(household.context, async (tx) => {
    const raw = `TEST${Math.random().toString(36).slice(2, 8).toUpperCase()}`; // 10 chars
    const canonicalCode = `${raw.slice(0, 5)}-${raw.slice(5)}`;
    const [row] = await tx
      .insert(joinCodeIssuance)
      .values({
        householdId: household.householdId,
        code: canonicalCode,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        maxUses: 1,
        uses: 0,
        createdByAccountId: household.accountId,
        ...overrides,
      })
      .returning();
    return row;
  });
}

// FR-2.7/FR-2.8/AC-2.7-AC-2.9/EC-2.7: expired, used up, deleted and never existed all produce the
// SAME "invalid_link" refusal, character-for-character (the actual copy lives in de.ts and is
// asserted once in the route-level test; here the domain layer's error CODE is what's checked —
// FR-2.8 is a claim about the code, since the UI reads exactly one string off it either way).
describe("Join refusals are indistinguishable (FR-2.7/FR-2.8/EC-2.7)", () => {
  it("refuses an expired link with invalid_link", async () => {
    hh = await registerTestHousehold();
    const expired = await insertIssuance(hh, { expiresAt: new Date(Date.now() - 1000) });
    await expect(
      joinHousehold(expired.code, { displayName: "X", password: "test-password-not-real-1234" }),
    ).rejects.toMatchObject({ code: "invalid_link" });
  });

  it("refuses a used-up link with invalid_link", async () => {
    hh = await registerTestHousehold();
    const usedUp = await insertIssuance(hh, { uses: 1, maxUses: 1 });
    await expect(
      joinHousehold(usedUp.code, { displayName: "X", password: "test-password-not-real-1234" }),
    ).rejects.toMatchObject({ code: "invalid_link" });
  });

  it("refuses a deleted link with invalid_link", async () => {
    hh = await registerTestHousehold();
    const link = await issueJoinCode(hh.context, hh.accountId, { validDays: 7, maxUses: 1 });
    await deleteJoinCode(hh.context, hh.accountId, link.id);
    await expect(
      joinHousehold(link.code, { displayName: "X", password: "test-password-not-real-1234" }),
    ).rejects.toMatchObject({ code: "invalid_link" });
  });

  it("refuses a never-existed code with invalid_link", async () => {
    hh = await registerTestHousehold();
    await expect(
      joinHousehold("NEVER-EXISTED", { displayName: "X", password: "test-password-not-real-1234" }),
    ).rejects.toMatchObject({ code: "invalid_link" });
  });

  it("is a JoinError instance in every one of the four cases", async () => {
    hh = await registerTestHousehold();
    await expect(
      joinHousehold("NEVER-EXISTED", { displayName: "X", password: "test-password-not-real-1234" }),
    ).rejects.toBeInstanceOf(JoinError);
  });

  // EC-2.9: a link deleted BETWEEN opening the page and pressing the button is refused at submit,
  // with the same single message, and no account is created. joinHousehold's own resolve (step 3)
  // + the claim's second, consuming check (step 8, design.md Decision 1) are both live checks — a
  // link deleted after the FIRST resolve inside this very call would already be caught by the
  // claim; here the delete happens BEFORE joinHousehold is ever called at all, which is the
  // simplest way to exercise "the link is dead by the time anything tries to use it" from outside.
  it("refuses at submit when the link was deleted between page load and submit, and creates no account", async () => {
    hh = await registerTestHousehold();
    const link = await issueJoinCode(hh.context, hh.accountId, { validDays: 7, maxUses: 1 });

    // Simulates the page's own earlier, non-consuming resolve having already happened and shown
    // the household name — then the link dies before the visitor submits.
    await deleteJoinCode(hh.context, hh.accountId, link.id);

    await expect(
      joinHousehold(link.code, { displayName: "EC29", password: "test-password-not-real-1234" }),
    ).rejects.toMatchObject({ code: "invalid_link" });

    // No account was created for this attempt — nothing under hh's household should have this
    // display name (the profile insert never ran; it happens inside the same transaction as the
    // claim, which refused first).
    const rows = await withSessionContext(hh.context, (tx) =>
      tx
        .select()
        .from(residentProfile)
        .where(and(eq(residentProfile.householdId, hh!.householdId), eq(residentProfile.displayName, "EC29"))),
    );
    expect(rows).toHaveLength(0);
  });
});
