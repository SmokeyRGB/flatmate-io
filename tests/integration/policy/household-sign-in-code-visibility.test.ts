import { sql } from "drizzle-orm";
import { afterEach, describe, expect, it } from "vitest";
import { withSessionContext } from "@/db/session-context";
import { signIn } from "@/modules/identity/auth";
import { getHouseholdSignInCode, resolveSessionContext } from "@/modules/identity/repository";
import { cleanupAll, registerTestHousehold, type TestHousehold } from "../../helpers/identity";

// household-sign-in-code D7 / G-C7 (both sides): a household reads its own sign-in code and never
// another's, through the repository and as raw SQL as app_runtime under its own context.
const PASSWORD = "test-password-not-real-1234";
const households: TestHousehold[] = [];

afterEach(async () => {
  await cleanupAll(...households.splice(0).map((h) => h.cleanup()));
});

async function pair(): Promise<[TestHousehold, TestHousehold]> {
  const a = await registerTestHousehold();
  households.push(a);
  const b = await registerTestHousehold();
  households.push(b);
  return [a, b];
}

describe("household sign-in code visibility (identity/household-sign-in-code)", () => {
  it("through the repository: a session of household A reads A's code and never B's", async () => {
    const [a, b] = await pair();

    const codeA = await getHouseholdSignInCode(a.context);
    const codeB = await getHouseholdSignInCode(b.context);

    expect(codeA).toMatch(/^[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}$/);
    expect(codeB).toMatch(/^[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}$/);
    expect(codeA).not.toBe(codeB);
    // A's reading equals what A's row holds, B's equals B's: neither crosses over.
    const rawA = await withSessionContext(a.context, (tx) =>
      tx.execute<{ sign_in_code: string }>(sql`SELECT sign_in_code FROM household`),
    );
    expect(rawA.map((r: { sign_in_code: string }) => r.sign_in_code)).toEqual([codeA]);
  });

  it("as raw SQL under A's context, B's household row is invisible (G-C7, the other side)", async () => {
    const [a, b] = await pair();
    const codeB = await getHouseholdSignInCode(b.context);

    const byId = await withSessionContext(a.context, (tx) =>
      tx.execute(sql`SELECT id FROM household WHERE id = ${b.householdId}::uuid`),
    );
    const byCode = await withSessionContext(a.context, (tx) =>
      tx.execute(sql`SELECT id FROM household WHERE sign_in_code = ${codeB}`),
    );

    expect(byId).toHaveLength(0);
    expect(byCode).toHaveLength(0);
  });

  it("resolveSessionContext returns the session's own remember_me and household code", async () => {
    const [a, b] = await pair();
    const codeA = await getHouseholdSignInCode(a.context);
    const cleared = await signIn({ kind: "household", email: a.email, password: PASSWORD }, { rememberMe: false });
    const kept = await signIn({ kind: "household", email: a.email, password: PASSWORD }, { rememberMe: true });

    expect(await resolveSessionContext(cleared.session.id, a.householdId)).toMatchObject({
      context: cleared.context,
      householdSignInCode: codeA,
      rememberMe: false,
    });
    expect(await resolveSessionContext(kept.session.id, a.householdId)).toMatchObject({
      context: kept.context,
      householdSignInCode: codeA,
      rememberMe: true,
    });

    // Another household's session id presented with A's household id resolves to nothing, and B's
    // own read carries B's code, never A's.
    const bSession = await signIn({ kind: "household", email: b.email, password: PASSWORD });
    expect(await resolveSessionContext(bSession.session.id, a.householdId)).toBeNull();
    const own = await resolveSessionContext(bSession.session.id, b.householdId);
    expect(own?.householdSignInCode).toBe(await getHouseholdSignInCode(b.context));
    expect(own?.householdSignInCode).not.toBe(codeA);
  });
});
