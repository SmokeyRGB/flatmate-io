import { sql } from "drizzle-orm";
import { afterEach, describe, expect, it } from "vitest";
import { withSessionContext } from "@/db/session-context";
import { createResidentProfile, issueJoinCode } from "@/modules/identity/repository";
import { cleanupAll, registerTestHousehold, type TestHousehold } from "../../helpers/identity";

let hhA: TestHousehold | undefined;
let hhB: TestHousehold | undefined;

afterEach(async () => {
  await cleanupAll(hhA?.cleanup(), hhB?.cleanup());
  hhA = undefined;
  hhB = undefined;
});

// C-2.10/G-C7, raw SQL half: the SAME scoping claim as the policy-layer test
// (tests/integration/policy/join-code-isolation.test.ts), issued as a raw SQL string under the
// application role with session context set — bypassing this repo's own query-builder entirely.
describe("Join code issuance household isolation — raw SQL (C-2.10)", () => {
  it("returns zero rows of another household via a raw, unscoped SELECT", async () => {
    hhA = await registerTestHousehold();
    hhB = await registerTestHousehold();
    const linkA = await issueJoinCode(hhA.context, hhA.accountId, { validDays: 7, maxUses: 1 });
    const linkB = await issueJoinCode(hhB.context, hhB.accountId, { validDays: 7, maxUses: 1 });

    type IssuanceRow = { id: string; household_id: string; code: string };
    const rowsSeenByA: IssuanceRow[] = await withSessionContext(hhA.context, (tx) =>
      tx.execute<IssuanceRow>(sql`SELECT id, household_id, code FROM join_code_issuance`), // deliberately no WHERE clause
    );

    const ids = rowsSeenByA.map((r: IssuanceRow) => r.id);
    expect(ids).toContain(linkA.id);
    expect(ids).not.toContain(linkB.id);
    expect(rowsSeenByA.every((r: IssuanceRow) => r.household_id === hhA!.householdId)).toBe(true);
  });

  // Decision 13 + PR #17 review: a bound link names a prepared profile, and both SECURITY DEFINER
  // functions LEFT JOIN resident_profile to return that profile's id and display name. The join
  // carries a household predicate, so a binding pointing at ANOTHER household's profile discloses
  // nothing — the bound columns come back null, exactly as for a neutral link.
  //
  // This is not a hypothetical worth skipping: there are no foreign keys in this schema, the
  // functions run past RLS by design, and they answer an unauthenticated caller. issueJoinCodeTx
  // refuses to create such a binding, which is why the corruption has to be forged here — and
  // forging it is the point. An invariant that holds only while the application layer is right is
  // not the invariant G-C asks for (ADR-004).
  it("a binding pointing at another household's profile discloses nothing (G-C)", async () => {
    hhA = await registerTestHousehold();
    hhB = await registerTestHousehold();

    // A prepared profile in household B, and a link in household A.
    const profileB = await createResidentProfile(hhB.context, "Eindringling", {
      accountId: hhB.accountId,
      profileId: null,
    });
    const linkA = await issueJoinCode(hhA.context, hhA.accountId, { validDays: 7, maxUses: 1 });

    // Forge the corrupt binding. RLS permits this: the row belongs to A, and the policy checks
    // household_id, not what resident_profile_id points at — which is precisely the gap the
    // function-level predicate closes.
    await withSessionContext(hhA.context, (tx) =>
      tx.execute(
        sql`UPDATE join_code_issuance SET resident_profile_id = ${profileB.id} WHERE id = ${linkA.id}`,
      ),
    );

    const rows = await withSessionContext(hhB.context, (tx) =>
      tx.execute<Record<string, unknown>>(sql`SELECT * FROM resolve_join_code(${linkA.code})`),
    );

    expect(rows).toHaveLength(1);
    expect(rows[0].bound_resident_profile_id).toBeNull();
    expect(rows[0].bound_resident_display_name).toBeNull();
    // And nothing of B's profile reached the caller by any other column either.
    expect(Object.values(rows[0])).not.toContain(profileB.id);
    expect(Object.values(rows[0])).not.toContain("Eindringling");
  });

  // design.md Decision 2: resolve_join_code/claim_join_code are the one deliberate hole in the RLS
  // wall for this capability — this asserts they leak nothing beyond their declared five columns,
  // even called for a code belonging to a household the caller's own session isn't scoped to
  // (the functions are SECURITY DEFINER precisely because a code-presenting caller has no
  // session/household yet at all).
  describe("resolve_join_code / claim_join_code leak nothing beyond their declared columns (Decision 2)", () => {
    it("resolve_join_code returns exactly its five declared columns, bound ones null for a neutral link", async () => {
      hhA = await registerTestHousehold();
      const link = await issueJoinCode(hhA.context, hhA.accountId, { validDays: 7, maxUses: 1 });

      // A session for an unrelated household (or no real session at all) can still call the
      // function — that is the point of the bootstrap exception — but must get back only the
      // declared columns, nothing else about the household or the row.
      //
      // join-by-link Decision 13 widened the declared set from three to five: a link may be BOUND
      // to a prepared profile, and a bound link's resolution carries that profile's id and display
      // name. The exactness of this assertion is the point of the test, so it tracks the new set
      // rather than being loosened to "contains" — and the link issued here is NEUTRAL, so both new
      // columns must come back null. A neutral link disclosing a profile would be the leak this
      // test exists to catch.
      hhB = await registerTestHousehold();
      const rows = await withSessionContext(hhB.context, (tx) =>
        tx.execute<Record<string, unknown>>(sql`SELECT * FROM resolve_join_code(${link.code})`),
      );

      expect(rows).toHaveLength(1);
      expect(Object.keys(rows[0]).sort()).toEqual([
        "bound_resident_display_name",
        "bound_resident_profile_id",
        "household_id",
        "household_name",
        "issuance_id",
      ]);
      expect(rows[0].bound_resident_profile_id).toBeNull();
      expect(rows[0].bound_resident_display_name).toBeNull();
      expect(rows[0].household_id).toBe(hhA.householdId);
      expect(rows[0].issuance_id).toBe(link.id);
      expect(rows[0].household_name).toBe("WG");
    });

    it("claim_join_code returns exactly its five declared columns, bound ones null for a neutral link", async () => {
      hhA = await registerTestHousehold();
      const link = await issueJoinCode(hhA.context, hhA.accountId, { validDays: 7, maxUses: 1 });

      hhB = await registerTestHousehold();
      const rows = await withSessionContext(hhB.context, (tx) =>
        tx.execute<Record<string, unknown>>(sql`SELECT * FROM claim_join_code(${link.code})`),
      );

      expect(rows).toHaveLength(1);
      expect(Object.keys(rows[0]).sort()).toEqual([
        "bound_resident_display_name",
        "bound_resident_profile_id",
        "household_id",
        "household_name",
        "issuance_id",
      ]);
      expect(rows[0].bound_resident_profile_id).toBeNull();
      expect(rows[0].bound_resident_display_name).toBeNull();
      expect(rows[0].household_id).toBe(hhA.householdId);
      expect(rows[0].issuance_id).toBe(link.id);
    });
  });
});
