import { randomUUID } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import { afterEach, describe, expect, it } from "vitest";
import { withSessionContext } from "@/db/session-context";
import { claimResidentProfile } from "@/modules/identity/auth";
import { createResidentProfile, setMovedOut } from "@/modules/identity/repository";
import { joinCodeIssuance, membership } from "@/modules/identity/schema";
import { cleanupAll, deleteTestAccount, registerTestHousehold, type TestHousehold } from "../../helpers/identity";

const PASSWORD = "test-password-not-real-1234";

let hhA: TestHousehold | undefined;
let hhB: TestHousehold | undefined;
const accountIds: string[] = [];

afterEach(async () => {
  await cleanupAll(...accountIds.map(deleteTestAccount), hhA?.cleanup(), hhB?.cleanup());
  accountIds.length = 0;
  hhA = undefined;
  hhB = undefined;
});

// Every insert below goes straight into join_code_issuance, bypassing issuePasswordResetLink
// entirely (G-C7's whole point: this is the raw-SQL half, exercising resolve_join_code/
// claim_join_code as app_runtime would see them, unmediated by the TypeScript layer that
// otherwise enforces every invariant asserted here).
async function insertResetIssuance(household: TestHousehold, residentProfileId: string, code: string) {
  await withSessionContext(household.context, (tx) =>
    tx.insert(joinCodeIssuance).values({
      householdId: household.householdId,
      code,
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      maxUses: 1,
      uses: 0,
      createdByAccountId: household.accountId,
      residentProfileId,
      purpose: "password_reset",
    }),
  );
}

async function activeResidentNoEmail(household: TestHousehold, name: string) {
  const profile = await createResidentProfile(household.context, name, {
    accountId: household.accountId,
    profileId: null,
  });
  const { accountId } = await claimResidentProfile(household.context, profile.id, PASSWORD);
  accountIds.push(accountId);
  return { profileId: profile.id, accountId };
}

let codeCounter = 0;
function freshCode(): string {
  codeCounter += 1;
  return `RESET${codeCounter}-TESTX`;
}

// resident-settings design.md Decision 4 (G-C7, raw side): resolve_join_code/claim_join_code
// exercised directly as SQL, calling both by name (definer-coverage.ts requires it).
describe("resolve_join_code / claim_join_code — the password_reset branch, raw SQL (G-C7)", () => {
  // (a) a reset link for an active profile without an email resolves with purpose =
  // 'password_reset' and the display name.
  it("(a) resolves a reset link for an active, email-less profile, with purpose and display name", async () => {
    hhA = await registerTestHousehold();
    const resident = await activeResidentNoEmail(hhA, "ResetCandidate");
    const code = freshCode();
    await insertResetIssuance(hhA, resident.profileId, code);

    const rows = await withSessionContext(hhA.context, (tx) =>
      tx.execute<Record<string, unknown>>(sql`SELECT * FROM resolve_join_code(${code})`),
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].purpose).toBe("password_reset");
    expect(rows[0].bound_resident_profile_id).toBe(resident.profileId);
    expect(rows[0].bound_resident_display_name).toBe("ResetCandidate");
  });

  // (b) the same, after account.email is set, resolves to nothing.
  it("(b) resolves to nothing once the account has an email", async () => {
    hhA = await registerTestHousehold();
    const resident = await activeResidentNoEmail(hhA, "GapClosedByEmail");
    const code = freshCode();
    await insertResetIssuance(hhA, resident.profileId, code);

    await withSessionContext(hhA.context, (tx) =>
      tx.execute(sql`UPDATE account SET email = 'closed-the-gap@example.test' WHERE id = ${resident.accountId}`),
    );

    const rows = await withSessionContext(hhA.context, (tx) =>
      tx.execute<Record<string, unknown>>(sql`SELECT * FROM resolve_join_code(${code})`),
    );
    expect(rows).toHaveLength(0);
  });

  // (c) after the profile is set to moved_out, nothing.
  it("(c) resolves to nothing once the profile is moved_out", async () => {
    hhA = await registerTestHousehold();
    const resident = await activeResidentNoEmail(hhA, "MovedOutGap");
    const code = freshCode();
    await insertResetIssuance(hhA, resident.profileId, code);

    await setMovedOut(hhA.context, hhA.accountId, resident.accountId);

    const rows = await withSessionContext(hhA.context, (tx) =>
      tx.execute<Record<string, unknown>>(sql`SELECT * FROM resolve_join_code(${code})`),
    );
    expect(rows).toHaveLength(0);
  });

  // (d) after membership.revoked_at is set, nothing.
  it("(d) resolves to nothing once the membership is revoked", async () => {
    hhA = await registerTestHousehold();
    const resident = await activeResidentNoEmail(hhA, "RevokedMembershipGap");
    const code = freshCode();
    await insertResetIssuance(hhA, resident.profileId, code);

    // Revoked directly, without also moving the profile out of `active` — isolates the membership
    // predicate from the profile-status one (c) already covers.
    await withSessionContext(hhA.context, (tx) =>
      tx.update(membership).set({ revokedAt: new Date() }).where(eq(membership.accountId, resident.accountId)),
    );

    const rows = await withSessionContext(hhA.context, (tx) =>
      tx.execute<Record<string, unknown>>(sql`SELECT * FROM resolve_join_code(${code})`),
    );
    expect(rows).toHaveLength(0);
  });

  // (e) a CORRUPT binding: a reset link in household A naming an active profile of household B —
  // resolves to nothing, and cannot be claimed either.
  it("(e) a corrupt binding to another household's active profile discloses and claims nothing", async () => {
    hhA = await registerTestHousehold();
    hhB = await registerTestHousehold();
    const residentB = await activeResidentNoEmail(hhB, "OtherHouseholdTarget");
    const code = freshCode();
    // The link itself belongs to A; RLS permits this write (the row's household_id is A's), but
    // the profile it names is B's — exactly the corruption the function-level predicate must
    // refuse defensively, since nothing else in this schema (no foreign keys) stops it.
    await insertResetIssuance(hhA, residentB.profileId, code);

    const resolved = await withSessionContext(hhA.context, (tx) =>
      tx.execute<Record<string, unknown>>(sql`SELECT * FROM resolve_join_code(${code})`),
    );
    expect(resolved).toHaveLength(0);

    const claimRows = await withSessionContext(hhA.context, (tx) =>
      tx.execute<Record<string, unknown>>(sql`SELECT * FROM claim_join_code(${code}, 'password_reset')`),
    );
    expect(claimRows).toHaveLength(0);
    const [issuanceRow] = await withSessionContext(hhA.context, (tx) =>
      tx.select().from(joinCodeIssuance).where(eq(joinCodeIssuance.code, code)),
    );
    expect(issuanceRow.uses).toBe(0);
  });

  // (f) a corrupt membership row whose OWN household_id differs from the link's — the scenario
  // this case was written to construct, so the EXISTS subquery's household predicate on `m` (not
  // only the LEFT JOIN's predicate on `rp`, already covered by (e)) could be shown to hold
  // independently. Copilot review round 2 (PR #23), CLAUDE.md "The relationship a predicate joins
  // through must itself be enforced": drizzle/0021 added a UNIQUE index on
  // membership.resident_profile_id (partial: WHERE NOT NULL) covering EVERY row for that profile,
  // live or revoked, for all time, not only per household — so the second, corrupt INSERT below
  // (a second membership row naming the SAME resident_profile_id, attempted under household B's
  // session after the profile's own legitimate row in A was revoked) is now REJECTED by the
  // database itself, before resolve_join_code's SQL predicate ever gets a chance to matter. This
  // is a STRONGER guarantee than the one this test originally exercised, not a weaker one — the
  // corruption this predicate defended against is now structurally impossible to construct at
  // all, in any household, which is why the assertion below is a rejected INSERT (SQLSTATE 23505)
  // rather than an empty resolve_join_code result. The SQL predicate itself is unchanged and still
  // stands as defense in depth against a database that somehow lacks this index (a restore from an
  // older backup, say) — see the file-level comment at the bottom for that argument, which no
  // longer has an executable case in this file to point at.
  it("(f) a second membership row for the same profile — REJECTED by drizzle/0021's unique index, not merely refused by the SQL predicate", async () => {
    hhA = await registerTestHousehold();
    hhB = await registerTestHousehold();
    const resident = await activeResidentNoEmail(hhA, "CorruptMembershipHousehold");
    const code = freshCode();
    await insertResetIssuance(hhA, resident.profileId, code);

    await withSessionContext(hhA.context, (tx) =>
      tx.execute(sql`UPDATE membership SET revoked_at = now() WHERE account_id = ${resident.accountId}`),
    );

    let caught: unknown;
    try {
      await withSessionContext(hhB.context, (tx) =>
        tx.execute(sql`
          INSERT INTO membership (household_id, account_id, resident_profile_id, is_resident, role, permissions)
          VALUES (${hhB!.householdId}::uuid, ${randomUUID()}::uuid, ${resident.profileId}::uuid, true, 'member', '{}')
        `),
      );
    } catch (err) {
      caught = err;
    }
    const pgErr = caught as { code?: string; cause?: { code?: string } } | undefined;
    expect((pgErr?.code ?? pgErr?.cause?.code)).toBe("23505");

    // The link still resolves normally against the profile's own (revoked) legitimate row — this
    // corruption attempt changed nothing.
    const rows = await withSessionContext(hhA.context, (tx) =>
      tx.execute<Record<string, unknown>>(sql`SELECT * FROM resolve_join_code(${code})`),
    );
    expect(rows).toHaveLength(0); // the legitimate row is revoked, so still correctly no match
  });

  // (g) claim_join_code(code, 'join') on a reset link matches nothing and leaves `uses`
  // unchanged, and claim_join_code(joinCode, 'password_reset') likewise (the reverse purpose).
  it("(g) a purpose mismatch never spends the other purpose's link", async () => {
    hhA = await registerTestHousehold();
    const resident = await activeResidentNoEmail(hhA, "PurposeMismatch");
    const resetCode = freshCode();
    await insertResetIssuance(hhA, resident.profileId, resetCode);

    const joinAttempt = await withSessionContext(hhA.context, (tx) =>
      tx.execute<Record<string, unknown>>(sql`SELECT * FROM claim_join_code(${resetCode}, 'join')`),
    );
    expect(joinAttempt).toHaveLength(0);

    const prepared = await createResidentProfile(hhA.context, "PreparedForJoinLink", {
      accountId: hhA.accountId,
      profileId: null,
    });
    const joinCode = freshCode();
    await withSessionContext(hhA.context, (tx) =>
      tx.insert(joinCodeIssuance).values({
        householdId: hhA!.householdId,
        code: joinCode,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        maxUses: 1,
        uses: 0,
        createdByAccountId: hhA!.accountId,
        residentProfileId: prepared.id,
        purpose: "join",
      }),
    );

    const resetAttempt = await withSessionContext(hhA.context, (tx) =>
      tx.execute<Record<string, unknown>>(sql`SELECT * FROM claim_join_code(${joinCode}, 'password_reset')`),
    );
    expect(resetAttempt).toHaveLength(0);

    const [resetRow] = await withSessionContext(hhA.context, (tx) =>
      tx.select().from(joinCodeIssuance).where(eq(joinCodeIssuance.code, resetCode)),
    );
    expect(resetRow.uses).toBe(0);
    const [joinRow] = await withSessionContext(hhA.context, (tx) =>
      tx.select().from(joinCodeIssuance).where(eq(joinCodeIssuance.code, joinCode)),
    );
    expect(joinRow.uses).toBe(0);
  });

  // (h) inserting a password_reset row with a null resident_profile_id violates the CHECK.
  it("(h) a password_reset row naming no profile violates the CHECK constraint", async () => {
    hhA = await registerTestHousehold();
    await expect(
      withSessionContext(hhA.context, (tx) =>
        tx.execute(sql`
          INSERT INTO join_code_issuance
            (household_id, code, expires_at, max_uses, uses, created_by_account_id, resident_profile_id, purpose)
          VALUES
            (${hhA!.householdId}::uuid, ${freshCode()}, now() + interval '7 days', 1, 0, ${hhA!.accountId}::uuid, NULL, 'password_reset')
        `),
      ),
    ).rejects.toThrow();
  });

  // (i) the one-argument claim_join_code(text) no longer exists.
  it("(i) the one-argument claim_join_code(text) no longer exists", async () => {
    hhA = await registerTestHousehold();
    const resident = await activeResidentNoEmail(hhA, "OneArgGone");
    const code = freshCode();
    await insertResetIssuance(hhA, resident.profileId, code);

    await expect(
      withSessionContext(hhA.context, (tx) =>
        tx.execute(sql`SELECT * FROM claim_join_code(${code})`),
      ),
    ).rejects.toThrow();
  });
});

// The functions themselves are human-applied (drizzle/0019 steps 4-6), and the agent harness
// refuses SECURITY DEFINER statements — so the predicate-removal breaks tasks.md 6.1 asks for
// cannot be executed here, and a non-definer scratch copy would run under RLS and prove nothing
// (it would silently see only its own household's rows regardless of the predicate under test).
// Argued instead, one per predicate, naming which case above would fail without it:
//
// - The household predicate on the membership join (`m.household_id = jci.household_id`, inside
//   the EXISTS in both functions' password_reset branch): case (f) USED to construct this directly
//   (a second membership row for the same profile, in the wrong household) and show the predicate
//   refusing it; as of drizzle/0021's unique index on resident_profile_id, that construction is
//   itself rejected by the database (case (f) now asserts the 23505, not an empty resolve), so the
//   predicate's OWN behaviour on this exact shape of corruption is no longer independently
//   demonstrable here — argued instead: without the predicate, a membership row that DID somehow
//   carry the wrong household_id (a restore from a backup taken before drizzle/0021, a manual
//   `COPY` into a fresh database bypassing the index, or any other path outside this application's
//   own writers) would still satisfy `m.resident_profile_id = rp.id` and the EXISTS would find it
//   via a join on the WRONG household_id, disclosing another household's display name — the
//   predicate is defense in depth against exactly that, independent of whether the unique index
//   also happens to hold.
// - The household predicate on the account join (`a.household_id = jci.household_id`, alongside
//   `a.id = m.account_id`): unaffected by drizzle/0021 (which constrains membership, not account) —
//   without it, a corrupted ACCOUNT row pointing at the wrong household would let a reset link
//   resolve `a.email IS NULL` against an account of the WRONG household, again disclosing a name
//   that predicate exists to withhold. No case in this file constructs this directly (account has
//   no analogous uniqueness constraint blocking the construction, but nor does any case here need
//   one); argued the same way as the membership predicate above.
// - `a.email IS NULL`: without it, case (b) would resolve and claim successfully even after the
//   resident added an email — the exact gap O-16 says "closes itself", left open.
// - `rp.status = 'active'`: without it, case (c) (moved_out) would still resolve — a
//   moved-out profile's reset link would stay usable.
// - `m.revoked_at IS NULL`: without it, case (d) would still resolve after the membership was
//   revoked.
// - `p_purpose` in `claim_join_code`'s own `WHERE purpose = p_purpose`: without it, case (g)'s
//   FIRST assertion (`claim_join_code(resetCode, 'join')` returning no row) would instead spend
//   the reset-purpose row through the join-purpose call, and the second assertion (a join link
//   spent through a `'password_reset'` call) would likewise succeed — either direction of the
//   cross-purpose spend tasks.md 6.1(g) names.
