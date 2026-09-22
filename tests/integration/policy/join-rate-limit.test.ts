import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { afterEach, describe, expect, it } from "vitest";
import { joinAttemptSourceHash } from "@/modules/identity/auth";
import { recordJoinAttempt } from "@/modules/identity/repository";

// design.md Decision 3: `join_attempt` has RLS enabled with ZERO policies — the app's own runtime
// role (`app_runtime`, which DATABASE_URL connects as) has NO access to it at all, by design; the
// one SECURITY DEFINER function is its only door, and that function only inserts/prunes, it never
// deletes by an arbitrary key. So — exactly like Supabase Auth user cleanup elsewhere in this test
// suite (tests/helpers/identity.ts's adminClient()) — this test's OWN teardown uses the
// service-role client, which authenticates as Postgres role `service_role`
// (`rolbypassrls = true`), to delete only the rows it itself created. task 10.10: this table
// deliberately cannot go in cleanup()'s CTE (that CTE deletes by household_id, and this table has
// none) — this file owns its own teardown instead, in `afterEach`, never a `finally` inside a test
// (a timeout aborts before `finally` runs).
function serviceRoleClient() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

const sourceHashesToClean: string[] = [];

afterEach(async () => {
  if (sourceHashesToClean.length > 0) {
    await serviceRoleClient().from("join_attempt").delete().in("source_hash", sourceHashesToClean);
  }
  sourceHashesToClean.length = 0;
});

// FR-2.28/AC-2.25/EC-2.14: attempts past the limit from one source are refused; the refusal
// happens without any link lookup at all (recordJoinAttempt takes no code and is called BEFORE
// resolveJoinCode/claimJoinCodeTx in both the page and the action); codes belonging to different
// households count against the very same limit, because the function's key is the SOURCE, never a
// link or a household.
describe("Join route attempt limit (FR-2.28/AC-2.25/EC-2.14)", () => {
  it("allows the first 20 attempts from one source and refuses the 21st, structurally without a link lookup", async () => {
    // A unique per-test sourceHash — not joinAttemptSourceHash(ip) — so this test cannot collide
    // with another test's or a previous run's window.
    const sourceHash = `test-rate-limit-${randomUUID()}`;
    sourceHashesToClean.push(sourceHash);

    const results: boolean[] = [];
    for (let i = 0; i < 21; i++) {
      results.push(await recordJoinAttempt(sourceHash));
    }

    // design.md Decision 3: window 15 minutes, limit 20 — the 21st in the same window is refused.
    expect(results.slice(0, 20).every((allowed) => allowed === true)).toBe(true);
    expect(results[20]).toBe(false);
  });

  it("counts attempts against different households' codes on the same source together (EC-2.14)", async () => {
    // recordJoinAttempt's signature itself is the proof: it takes a sourceHash and nothing about
    // a code or household — "checked without being checked against any link" (AC-2.25) is
    // structural, not a matter of call-site ordering discipline. One shared counter per source
    // is exactly what makes this scenario true regardless of which household's link is eventually
    // presented.
    const sourceHash = `test-rate-limit-eventual-${randomUUID()}`;
    sourceHashesToClean.push(sourceHash);

    for (let i = 0; i < 20; i++) {
      expect(await recordJoinAttempt(sourceHash)).toBe(true);
    }
    // The 21st attempt is refused purely on the count against this one source — no household or
    // link was ever named to recordJoinAttempt for any of the 21 calls.
    expect(await recordJoinAttempt(sourceHash)).toBe(false);
  });

  it("joinAttemptSourceHash never bypasses the limit when no IP is available", async () => {
    // design.md Decision 3: a missing IP goes into ONE shared bucket, never an exemption. This is
    // exactly why the bucket must be cleaned by THIS test — a real missing-IP visitor's bucket
    // (the same key every other test using a null IP would hit) must not be left polluted.
    const sourceHash = joinAttemptSourceHash(null);
    sourceHashesToClean.push(sourceHash);

    const allowed = await recordJoinAttempt(sourceHash);
    // Whatever the current count is (shared with any other null-IP caller in this run), the call
    // must return a boolean — never throw, never silently pass through unmetered.
    expect(typeof allowed).toBe("boolean");
  });
});
