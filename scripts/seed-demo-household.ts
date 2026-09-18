// Manual/dev tool — NOT part of the app or the test suite. Creates one fixed, memorable demo
// household (a moderator resident, a plain resident, two rooms, one open round) via the same
// repository/auth functions the app itself uses, so there's something real to click through
// instead of hunting through the households automated test runs and ad-hoc UI walkthroughs leave
// behind.
//
// Usage: npm run seed:demo
//
// Not idempotent by design: run it once against a clean(ish) database. Re-running after the demo
// household already exists fails loudly at Supabase Auth's "email already registered" step —
// purge the old demo household (or the whole database) first, rather than layering another one
// on top of it.

// Env vars come from `--env-file=.env.local` (see package.json's "seed:demo" script), not a
// dotenv.config() call here: ES module imports are hoisted and evaluated in dependency order
// before this file's own top-level code runs, so a same-file config() call would run too late —
// src/db/client.ts already read process.env.DATABASE_URL (as `undefined`) by then. Node's native
// --env-file loads the vars before any module evaluation starts, sidestepping the ordering
// hazard entirely. (tests/setup.ts's dotenv.config() call works because vitest's `setupFiles`
// genuinely run as a separate phase before test modules import anything — not the case here.)

import { claimResidentProfile, registerHousehold } from "@/modules/identity/auth";
import { createResidentProfile, setMemberRole } from "@/modules/identity/repository";
import { createRoom, createRound, openRound } from "@/modules/casting/repository";
import { db } from "@/db/client";

// G-B1: synthetic-only data — @example.test is this project's fixed test-email convention
// (tests/helpers/identity.ts's testEmail() uses the same domain).
const DEMO_EMAIL = "demo-household@example.test";
const PASSWORD = "demo-password-not-real-1234";

async function main() {
  const { household, context } = await registerHousehold(DEMO_EMAIL, PASSWORD);
  const adminActor = { accountId: context.accountId, profileId: null };

  // Claimed first, so auth.ts's founding-resident rule also grants it close_round — a realistic
  // "person who set the WG up and lives there too" for demo purposes.
  const moderatorProfile = await createResidentProfile(context, "Alex", adminActor);
  const { accountId: moderatorAccountId } = await claimResidentProfile(
    context,
    moderatorProfile.id,
    PASSWORD,
  );
  await setMemberRole(context, context.accountId, moderatorAccountId, "moderator");

  const residentProfile = await createResidentProfile(context, "Sam", adminActor);
  await claimResidentProfile(context, residentProfile.id, PASSWORD);

  const roomA = await createRoom(context, "Zimmer 1", adminActor);
  const roomB = await createRoom(context, "Zimmer 2", adminActor);

  const round = await createRound(context, "Herbstrunde 2026", [roomA.id, roomB.id], adminActor);
  await openRound(context, round.id, adminActor);

  console.log("\nDemo household seeded.\n");
  console.log("Sign in as administration (tab: Household):");
  console.log(`  Email:    ${DEMO_EMAIL}`);
  console.log(`  Password: ${PASSWORD}\n`);
  console.log("Sign in as a resident (tab: Resident):");
  console.log(`  Household: ${household.id}`);
  console.log(`  Name:      Alex   (moderator)`);
  console.log(`  Name:      Sam    (plain resident)`);
  console.log(`  Password:  ${PASSWORD}\n`);
  console.log(`Round "${round.title}" is open with both residents as participants.`);
}

// No explicit process.exit(): on this environment, forcing exit while @supabase/supabase-js's
// underlying HTTP client still has handles open crashes the process with a native libuv
// assertion (harmless — output already printed — but ugly and non-zero-exit). Closing the
// postgres.js pool and letting Node drain naturally avoids it and still exits promptly.
main()
  .catch((err) => {
    console.error("\nSeeding failed:", err);
    console.error(
      `\nIf this is "email already registered", a demo household already exists — sign in with ` +
        `${DEMO_EMAIL} / ${PASSWORD} directly, or purge it first before re-seeding.`,
    );
    process.exitCode = 1;
  })
  .finally(() => db.$client.end({ timeout: 5 }));
