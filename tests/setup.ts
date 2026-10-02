import { config } from "dotenv";
import { afterEach } from "vitest";
import { assertSafeSupabaseEnv } from "../scripts/env-guard";
import { JOIN_TEST_CLIENT_IP_HEADER } from "./helpers/join-client-ip";
import { withLostResponseDeadline } from "./helpers/lost-response-fetch";

// `quiet: true` suppresses dotenv's own stdout "tip" advertisements (confirmed in its source,
// node_modules/dotenv/lib/main.js) — not a security concern, just noise in test output.
config({ path: ".env.local", quiet: true });

// G-B1: the suite creates real households, real Supabase Auth users and real rows, and its
// cleanup is best-effort. activity_event is append-only (FR-0.13), so rows written against the
// wrong project can never be removed. Until 2026-09-18 there was no check here and the suite
// ran against production. scripts/env-guard.ts allowlists flatmate-io-dev (override with
// ALLOWED_SUPABASE_REFS) and CI's loopback stack, and refuses anything else before the dynamic
// ./helpers/identity import below can open a connection.
assertSafeSupabaseEnv(process.env, "tests");

// A Supabase request whose response never comes gets a deadline and, where that is safe, a
// second copy, instead of hanging until the 60s test timeout (tests/helpers/lost-response-fetch.ts
// has the measurements). 8s is six times the slowest request GoTrue logged, and three attempts
// (24s) leave most of a test's 60s budget for the test itself, even one already slow under load. Installed before any test module creates a Supabase client, which
// captures the global fetch when it is created.
//
// The application's own deadline (src/modules/identity/auth-provider.ts, default 5s) sits ABOVE
// this wrapper and passes its signal down, so at 5s it would abort every lost request before this
// wrapper's 8s deadline could resend it, quietly turning this resend off for all application
// calls. So the suite runs the application with a deadline longer than all three attempts here
// (24s): this wrapper resends first, and the application's deadline only ends a request the
// wrapper has already given up on. Set on every file, not `??=`, because a fault-injection test
// sets 3000 at module load (auth-provider-deadline design.md D12) and process.env outlives a test
// file within a worker.
process.env.AUTH_PROVIDER_DEADLINE_MS = "30000";
// Join tests must not share record_join_attempt's null-IP bucket (limit 20 per 15 minutes on one
// key). The header name is fixed for the suite; a test that builds request Headers puts a fresh
// address in it (tests/helpers/join-client-ip.ts). Restored after every test because
// join-attempt-trusted-ip.test.ts clears the variable to prove the unset case.
process.env.JOIN_ATTEMPT_TRUSTED_IP_HEADER = JOIN_TEST_CLIENT_IP_HEADER;
if (process.env.NEXT_PUBLIC_SUPABASE_URL) {
  globalThis.fetch = withLostResponseDeadline(globalThis.fetch, {
    origin: new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).origin,
    deadlineMs: 8000,
    attempts: 3,
  });
}

// A net beneath each file's own afterEach, not a replacement for it. If this ever ran before a
// test file's own teardown instead of after, nothing would leak — cleanup() deregisters and is
// idempotent — but every per-file afterEach would become a dead no-op and cleanup failures would
// be misattributed to the sweep instead of the test that caused them. The assertion in
// tests/integration/policy/sweep-abandoned-household.test.ts ("the sweep is a net, not the
// primary cleanup path") detects that directly, rather than this comment asserting an ordering as
// an unverified fact. It only catches a household whose registerTestHousehold() call is still in
// flight when its test is abandoned (proposal.md) — a registration a test's own afterEach has
// already cleaned up is deregistered and this is a no-op for it (design.md D2).
//
// Imported dynamically, after config() above has run: a static top-of-file import would execute
// before this file's own body, pulling in ./helpers/identity.ts and, through it, src/db/client.ts
// — which reads process.env.DATABASE_URL at module load — before dotenv has populated it.
afterEach(async () => {
  process.env.JOIN_ATTEMPT_TRUSTED_IP_HEADER = JOIN_TEST_CLIENT_IP_HEADER;
  const { sweepAbandonedHouseholds } = await import("./helpers/identity");
  await sweepAbandonedHouseholds();
});
