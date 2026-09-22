import { eq, sql } from "drizzle-orm";
import { afterEach, describe, expect, it } from "vitest";
import { withSessionContext } from "@/db/session-context";
import { claimJoinCode, resolveJoinCode } from "@/modules/identity/repository";
import { joinCodeIssuance } from "@/modules/identity/schema";
import { cleanupAll, registerTestHousehold, type TestHousehold } from "../../helpers/identity";

let hh: TestHousehold | undefined;

afterEach(async () => {
  await cleanupAll(hh?.cleanup());
  hh = undefined;
});

// Every registered household already gets one founding link (auth.ts's registerHousehold), so
// tests below insert directly into join_code_issuance for the specific state (expired/used
// up/deleted) they need rather than going through issueJoinCode's random-code generation.
async function insertIssuance(
  household: TestHousehold,
  overrides: Partial<typeof joinCodeIssuance.$inferInsert>,
) {
  // join-by-link (EC-2.15/AC-2.24): normalizeJoinCode re-inserts the hyphen at position 5 for any
  // 10-character input, so a fixture code must already carry it in the canonical shape (like a
  // real generateJoinCode() output) or resolveJoinCode's normalisation step will no longer match
  // what's actually stored — normalisation "corrects" a hyphen-less 10-char code, it doesn't skip it.
  const raw = `TEST${Math.random().toString(36).slice(2, 8).toUpperCase()}`; // 10 chars
  const canonicalCode = `${raw.slice(0, 5)}-${raw.slice(5)}`;
  return withSessionContext(household.context, async (tx) => {
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

// FR-2.3/FR-2.7/FR-2.8: a valid link resolves; every refusal reason collapses to the same
// outcome — null — and the four are indistinguishable from the caller's point of view.
describe("Join code validation (FR-2.3/FR-2.7/FR-2.8)", () => {
  it("resolves a valid link to its household", async () => {
    hh = await registerTestHousehold();
    const issuance = await insertIssuance(hh, {});

    const resolved = await resolveJoinCode(issuance.code);
    expect(resolved).not.toBeNull();
    expect(resolved?.householdId).toBe(hh.householdId);
    expect(resolved?.issuanceId).toBe(issuance.id);
    expect(resolved?.householdName).toBe("WG");
  });

  it("refuses an expired, a used-up, a deleted and a never-existing code identically (null)", async () => {
    hh = await registerTestHousehold();

    const expired = await insertIssuance(hh, { expiresAt: new Date(Date.now() - 1000) });
    const usedUp = await insertIssuance(hh, { uses: 1, maxUses: 1 });
    const deleted = await insertIssuance(hh, { deletedAt: new Date() });

    const outcomes = await Promise.all([
      resolveJoinCode(expired.code),
      resolveJoinCode(usedUp.code),
      resolveJoinCode(deleted.code),
      resolveJoinCode("NEVER-EXISTED"),
    ]);

    for (const outcome of outcomes) {
      expect(outcome).toBeNull();
    }

    // claim_join_code refuses identically for the same four reasons (EC-2.7: no precedence rule
    // needed when a link is both expired and used up).
    const claimOutcomes = await Promise.all([
      claimJoinCode(expired.code),
      claimJoinCode(usedUp.code),
      claimJoinCode(deleted.code),
      claimJoinCode("NEVER-EXISTED"),
    ]);
    for (const outcome of claimOutcomes) {
      expect(outcome).toBeNull();
    }
  });

  // EC-2.8: a maximum of zero closes the link on arrival — no special-cased branch, just
  // uses (0) < max_uses (0) being false from the very first check.
  it("refuses a link issued with maxUses = 0 from the start (EC-2.8)", async () => {
    hh = await registerTestHousehold();
    const closed = await insertIssuance(hh, { maxUses: 0, uses: 0 });

    expect(await resolveJoinCode(closed.code)).toBeNull();
    expect(await claimJoinCode(closed.code)).toBeNull();
  });

  // spec.md "Every link is stored with a maximum, on every path": the column itself refuses a
  // null max_uses/expires_at, rather than treating an absent value as "unlimited" — asserted here
  // via raw SQL (bypassing Drizzle's own compile-time NOT NULL typing) since that is the only way
  // to actually attempt the forbidden insert.
  it("rejects a NULL max_uses or expires_at at the column level — there is no unlimited state", async () => {
    hh = await registerTestHousehold();

    await expect(
      withSessionContext(hh.context, (tx) =>
        tx.execute(sql`
          INSERT INTO join_code_issuance (household_id, code, expires_at, max_uses, uses, created_by_account_id)
          VALUES (${hh!.householdId}::uuid, 'NULLMAXUSES', now() + interval '7 days', ${null}, 0, ${hh!.accountId}::uuid)
        `),
      ),
    ).rejects.toThrow();

    await expect(
      withSessionContext(hh.context, (tx) =>
        tx.execute(sql`
          INSERT INTO join_code_issuance (household_id, code, expires_at, max_uses, uses, created_by_account_id)
          VALUES (${hh!.householdId}::uuid, 'NULLEXPIRES', ${null}, 1, 0, ${hh!.accountId}::uuid)
        `),
      ),
    ).rejects.toThrow();
  });

  // FR-2.9: looking at a link (resolveJoinCode) must never spend one of its uses, however often
  // it's called — the household's name has to be shown before any input (the actual join) is
  // requested.
  it("never increments uses via resolveJoinCode, however often it's called", async () => {
    hh = await registerTestHousehold();
    const issuance = await insertIssuance(hh, { maxUses: 5, uses: 0 });

    for (let i = 0; i < 10; i++) {
      const resolved = await resolveJoinCode(issuance.code);
      expect(resolved).not.toBeNull();
    }

    const [row] = await withSessionContext(hh.context, (tx) =>
      tx.select().from(joinCodeIssuance).where(eq(joinCodeIssuance.id, issuance.id)),
    );
    expect(row.uses).toBe(0);
  });

  // AC-2.24/EC-2.15: a live link's code, presented lower-case with a space and without the
  // hyphen, still resolves to that link — normalisation happens inside resolveJoinCode itself.
  it("resolves a live link's code presented lower-case, spaced, and without the hyphen (AC-2.24)", async () => {
    hh = await registerTestHousehold();
    const issuance = await insertIssuance(hh, {});
    const [group1, group2] = issuance.code.split("-");

    const resolved = await resolveJoinCode(` ${group1.toLowerCase()} ${group2.toLowerCase()}`);
    expect(resolved).not.toBeNull();
    expect(resolved?.householdId).toBe(hh.householdId);
    expect(resolved?.issuanceId).toBe(issuance.id);
  });
});
