import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { eq } from "drizzle-orm";
import { afterEach, describe, expect, it } from "vitest";
import { withSessionContext } from "@/db/session-context";
import {
  claimResidentProfile,
  joinAttemptSourceHash,
  SignInError,
  signInAttemptSourceHash,
  signInResidentByHouseholdCode,
  type SignInResult,
} from "@/modules/identity/auth";
import {
  createResidentProfile,
  getHouseholdSignInCode,
  issueJoinCode,
  normalizeHouseholdSignInCode,
  recordJoinAttempt,
  recordSignInAttempt,
  SIGN_IN_ATTEMPT_LIMIT,
} from "@/modules/identity/repository";
import { session } from "@/modules/identity/schema";
import { sql } from "drizzle-orm";
import {
  cleanupAll,
  deleteTestAccount,
  registerTestHousehold,
  type TestHousehold,
} from "../../helpers/identity";
import { joinTestClientIp } from "../../helpers/join-client-ip";
import { injectProviderFault } from "../../helpers/provider-fault";

// household-sign-in-code D4/D5 (identity/sign-in): the resident name path by household sign-in
// code. Households, names and source addresses are random per run (flatmate-io-dev is shared).
// Several tests need resolve_household_sign_in_code (drizzle/0033, applied by the human) and fail
// with "function ... does not exist" until it is run.
const PASSWORD = "test-password-not-real-1234";
const TWELVE_HOURS_MS = 12 * 60 * 60 * 1000;
const NINETY_DAYS_MS = 90 * 24 * 60 * 60 * 1000;
const TOLERANCE_MS = 60 * 1000;

function serviceRoleClient() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

const households: TestHousehold[] = [];
const accountIds: string[] = [];
const hashesToClean: string[] = [];

afterEach(async () => {
  const hashes = hashesToClean.splice(0);
  await cleanupAll(
    ...accountIds.splice(0).map(deleteTestAccount),
    ...households.splice(0).map((h) => h.cleanup()),
    // Best effort, like join-rate-limit.test.ts: against flatmate-io-dev the Data API answers
    // "Invalid schema: public" to this delete, so the rows age out by record_join_attempt's own
    // 24 h retention instead. Random per-run sources mean they never collide with another run.
    hashes.length > 0
      ? Promise.resolve(serviceRoleClient().from("join_attempt").delete().in("source_hash", hashes))
      : undefined,
  );
});

async function householdWithResident(): Promise<{ hh: TestHousehold; name: string; profileId: string; accountId: string; code: string }> {
  const hh = await registerTestHousehold();
  households.push(hh);
  const name = `Sic-${randomUUID().slice(0, 8)}`;
  const profile = await createResidentProfile(hh.context, name, { accountId: hh.accountId, profileId: null });
  const { accountId } = await claimResidentProfile(hh.context, profile.id, PASSWORD);
  accountIds.push(accountId);
  const code = await getHouseholdSignInCode(hh.context);
  if (!code) throw new Error("household has no sign-in code");
  return { hh, name, profileId: profile.id, accountId, code };
}

// Every call counts against a bucket, so each one registers its own hash for teardown.
async function attempt(
  input: { householdCode: string; displayName: string; password: string },
  options: { rememberMe?: boolean; sourceIp?: string | null } = {},
): Promise<SignInResult> {
  const sourceIp = options.sourceIp === undefined ? joinTestClientIp() : options.sourceIp;
  hashesToClean.push(signInAttemptSourceHash(sourceIp, normalizeHouseholdSignInCode(input.householdCode)));
  return signInResidentByHouseholdCode(input, { ...options, sourceIp });
}

async function codeOf(error: Promise<unknown>): Promise<string | undefined> {
  const caught = await error.then(
    () => undefined,
    (err: unknown) => err,
  );
  expect(caught).toBeInstanceOf(SignInError);
  return (caught as SignInError).code;
}

async function sessionRowsFor(hh: TestHousehold, accountId: string) {
  return withSessionContext(hh.context, (tx) => tx.select().from(session).where(eq(session.accountId, accountId)));
}

function pathTemplate(url: string): string {
  return new URL(url).pathname.replace(/\/admin\/users\/[0-9a-f-]{36}/, "/admin/users/:id");
}

describe("signInResidentByHouseholdCode (identity/sign-in)", () => {
  it("(a) a lower-case, unhyphenated code with name and password signs in as that profile", async () => {
    const r = await householdWithResident();
    const typed = r.code.toLowerCase().replace(/-/g, "");
    expect(typed).not.toBe(r.code);

    const result = await attempt({ householdCode: `  ${typed} `, displayName: r.name, password: PASSWORD });

    expect(result.context).toEqual({ accountId: r.accountId, householdId: r.hh.householdId, profileId: r.profileId });
  });

  it("(b) an unknown well-formed code with a name and password valid elsewhere is invalid_credentials and creates no session", async () => {
    const r = await householdWithResident();
    const before = (await sessionRowsFor(r.hh, r.accountId)).length;

    const code = await codeOf(
      attempt({ householdCode: "ZZZZ-ZZZZ-ZZZZ", displayName: r.name, password: PASSWORD }),
    );

    expect(code).toBe("invalid_credentials");
    expect((await sessionRowsFor(r.hh, r.accountId)).length).toBe(before);
  });

  it("(c) a deleted household's code is invalid_credentials", async () => {
    const r = await householdWithResident();
    // Seed the deleted household first, so the lookup's deleted_at predicate is what refuses.
    await withSessionContext(r.hh.context, (tx) =>
      tx.execute(sql`UPDATE household SET deleted_at = now() WHERE id = ${r.hh.householdId}::uuid`),
    );

    const code = await codeOf(attempt({ householdCode: r.code, displayName: r.name, password: PASSWORD }));

    expect(code).toBe("invalid_credentials");
  });

  it("(d) a household UUID and a join code are refused as malformed (invalid_household)", async () => {
    const r = await householdWithResident();
    const join = await issueJoinCode(r.hh.context, r.hh.accountId, { validDays: 7, maxUses: 1 });

    // join_attempt is RLS-closed to app_runtime, so there is no row to assert on here.
    expect(
      await codeOf(attempt({ householdCode: r.hh.householdId, displayName: r.name, password: PASSWORD })),
    ).toBe("invalid_household");
    expect(
      await codeOf(attempt({ householdCode: join.code, displayName: r.name, password: PASSWORD })),
    ).toBe("invalid_household");
  });

  it("(e) rememberMe: false gives remember_me = false and the 12 h row, with every column insertSessionTx writes", async () => {
    const r = await householdWithResident();
    const before = Date.now();

    const result = await attempt(
      { householdCode: r.code, displayName: r.name, password: PASSWORD },
      { rememberMe: false },
    );

    const [row] = await withSessionContext(result.context, (tx) =>
      tx.select().from(session).where(eq(session.id, result.session.id)),
    );
    expect(row.householdId).toBe(r.hh.householdId);
    expect(row.accountId).toBe(r.accountId);
    expect(row.actingProfileId).toBe(r.profileId);
    expect(row.rememberMe).toBe(false);
    expect(row.tokenHash).toMatch(/^[0-9a-f]{64}$/);
    const lifetime = row.expiresAt.getTime() - before;
    expect(lifetime).toBeGreaterThan(TWELVE_HOURS_MS - TOLERANCE_MS);
    expect(lifetime).toBeLessThan(TWELVE_HOURS_MS + TOLERANCE_MS);
    expect(row.revokedAt).toBeNull();
  });

  it("(e2) without a choice the session is the long one (remember_me = true, 90 days)", async () => {
    const r = await householdWithResident();
    const before = Date.now();

    const result = await attempt({ householdCode: r.code, displayName: r.name, password: PASSWORD });

    const [row] = await withSessionContext(result.context, (tx) =>
      tx.select().from(session).where(eq(session.id, result.session.id)),
    );
    expect(row.rememberMe).toBe(true);
    const lifetime = row.expiresAt.getTime() - before;
    expect(lifetime).toBeGreaterThan(NINETY_DAYS_MS - TOLERANCE_MS);
    expect(lifetime).toBeLessThan(NINETY_DAYS_MS + TOLERANCE_MS);
  });

  // auth-provider-deadline D11, extended (reuses tests/unit/identity/sign-in-enumeration.test.ts's
  // provider recorder, tests/helpers/provider-fault.ts): the provider's own traffic must not show
  // whether the CODE exists either.
  it("(f) an unknown code and a known code with an unknown name send the provider the same requests", async () => {
    const r = await householdWithResident();
    const run = async (householdCode: string, displayName: string) => {
      const injector = injectProviderFault([
        { method: "GET", path: /.*/, mode: "record" },
        { method: "POST", path: /.*/, mode: "record" },
      ]);
      try {
        await attempt({ householdCode, displayName, password: "irrelevant-password" }).catch(() => {});
        return injector.seen.map((s) => `${s.method} ${pathTemplate(s.url)}`);
      } finally {
        injector.restore();
      }
    };

    const unknownCode = await run("ZZZZ-ZZZZ-ZZZZ", r.name);
    const knownCodeUnknownName = await run(r.code, `Nobody-${randomUUID().slice(0, 8)}`);

    expect(unknownCode).toEqual(["GET /auth/v1/admin/users/:id", "POST /auth/v1/token"]);
    expect(knownCodeUnknownName).toEqual(unknownCode);
  });

  // INVARIANT GUARD for the concurrent overshoot (design D5): record_join_attempt's burst
  // behaviour is unchanged and accepted in join-by-link D3. The bucket is filled by calling the
  // counter directly: 20 real sign-ins from one test run would trip Supabase Auth's own per-IP
  // limit on shared dev.
  it("(g) [invariant guard] once a code's bucket is full the attempt is refused before any provider call; other buckets are unaffected", async () => {
    const r = await householdWithResident();
    const ip = joinTestClientIp();
    const hashA = signInAttemptSourceHash(ip, r.code);
    hashesToClean.push(hashA, joinAttemptSourceHash(ip));
    for (let i = 0; i < SIGN_IN_ATTEMPT_LIMIT; i++) {
      expect(await recordSignInAttempt(hashA)).toBe(true);
    }

    const injector = injectProviderFault([
      { method: "GET", path: /.*/, mode: "record" },
      { method: "POST", path: /.*/, mode: "record" },
    ]);
    let refused: string | undefined;
    try {
      refused = await codeOf(
        signInResidentByHouseholdCode(
          { householdCode: r.code, displayName: r.name, password: PASSWORD },
          { sourceIp: ip },
        ),
      );
      expect(injector.seen).toEqual([]);
    } finally {
      injector.restore();
    }
    expect(refused).toBe("rate_limited");

    // Code B from the same source still proceeds (it reaches the lookup and is refused as a wrong
    // credential, not as a rate limit).
    const codeB = await codeOf(
      attempt({ householdCode: "ZZZZ-ZZZZ-ZZZZ", displayName: r.name, password: PASSWORD }, { sourceIp: ip }),
    );
    expect(codeB).toBe("invalid_credentials");

    // A join-route attempt from the same source is unaffected: its own bucket.
    expect(await recordJoinAttempt(joinAttemptSourceHash(ip))).toBe(true);
  });
});
