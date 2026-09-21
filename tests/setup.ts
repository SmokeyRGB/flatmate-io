import { config } from "dotenv";
import { afterEach } from "vitest";

// `quiet: true` suppresses dotenv's own stdout "tip" advertisements (confirmed in its source,
// node_modules/dotenv/lib/main.js) — not a security concern, just noise in test output.
config({ path: ".env.local", quiet: true });

// G-B1: the suite creates real households, real Supabase Auth users and real rows, and its
// cleanup is best-effort — a test that fails mid-way leaves its rows behind, and activity_event
// is append-only by design (FR-0.13) so those rows can never be removed at all.
//
// Until 2026-09-18 there was no check of any kind here, and the suite ran against whatever
// .env.local happened to name. It named the production project, which accumulated ~15k
// activity_event rows, 1.9k rooms and 69 households called "WG" in two days.
//
// The `flatmate-io-dev` project exists for this. Refuse to run against production rather than
// trusting whoever edits .env.local next.
const PRODUCTION_PROJECT_REF = "cjinhzzvjryojvhngjjn";

for (const [name, value] of [
  ["DATABASE_URL", process.env.DATABASE_URL],
  ["NEXT_PUBLIC_SUPABASE_URL", process.env.NEXT_PUBLIC_SUPABASE_URL],
] as const) {
  if (value?.includes(PRODUCTION_PROJECT_REF)) {
    throw new Error(
      `Refusing to run the test suite against the production Supabase project.\n` +
        `  ${name} points at ${PRODUCTION_PROJECT_REF} (flatmate-io).\n` +
        `  Point .env.local at flatmate-io-dev instead — see .env.example.`,
    );
  }
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
  const { sweepAbandonedHouseholds } = await import("./helpers/identity");
  await sweepAbandonedHouseholds();
});
