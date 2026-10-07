// Manual/dev tool — NOT part of the app or the test suite. Creates one fixed, memorable demo
// household (a moderator, three plain residents, one prepared profile, two open rooms, one open
// round, seven synthetic applications with the other residents' votes already cast) via the same
// repository/auth functions the app itself uses, so there's something real to click through
// instead of hunting through the households automated test runs and ad-hoc UI walkthroughs leave
// behind.
//
// The seeded state is the pitch path (F5 change 1, human decision Q-12): sign in as Sam (or claim
// Robin), rate every card in the pass, and the scoreboard shows scored rows, one unscored row and
// one `invited` row under its own heading. See the robustness note above the votes.
//
// Usage: npm run seed:demo
//
// The rooms, round, applications, votes and invite come from scripts/demo/seed-round.ts, shared
// with scripts/seed-demo-round.ts, which re-creates a round on an existing household.
//
// Not idempotent by design: run it once against a clean(ish) database. Re-running after the demo
// household already exists fails loudly at Supabase Auth's "email already registered" step, so
// run scripts/cleanup-demo-household.sql (as owner, in the Supabase SQL editor) first.
// The password is random per run unless DEMO_PASSWORD is set, and it is printed once on success.
// Cleanup matches the fixed demo email (scripts/cleanup-demo-household.sql).

// Env vars come from `--env-file=.env.local` (see package.json's "seed:demo" script), not a
// dotenv.config() call here: ES module imports are hoisted and evaluated in dependency order
// before this file's own top-level code runs, so a same-file config() call would run too late —
// src/db/client.ts already read process.env.DATABASE_URL (as `undefined`) by then. Node's native
// --env-file loads the vars before any module evaluation starts, sidestepping the ordering
// hazard entirely. (tests/setup.ts's dotenv.config() call works because vitest's `setupFiles`
// genuinely run as a separate phase before test modules import anything — not the case here.)

import { randomBytes } from "node:crypto";
import { claimResidentProfile, registerHousehold } from "@/modules/identity/auth";
import {
  createResidentProfile,
  getHouseholdSignInCode,
  issueJoinCode,
  setMemberRole,
} from "@/modules/identity/repository";
import { seedDemoRound } from "./demo/seed-round";
import { db } from "@/db/client";
import { assertSafeSupabaseEnv } from "./env-guard";

// Same refusal as the test suite: this script writes real households and Auth users, and
// activity_event is append-only, so a .env.local pointing at the wrong project must stop it
// before the first query. The imports above only construct clients (postgres.js connects
// lazily), so this top-level check still runs before anything reaches the database.
assertSafeSupabaseEnv(process.env, "seed");

// G-B1: synthetic-only data — @example.test is this project's fixed test-email convention
// (tests/helpers/identity.ts's testEmail() uses the same domain).
const DEMO_EMAIL = "demo-household@example.test";
const PASSWORD = process.env.DEMO_PASSWORD ?? randomBytes(18).toString("base64url");

async function main() {
  const { household, context } = await registerHousehold(DEMO_EMAIL, PASSWORD, "Demo-WG", "de");
  const adminActor = { accountId: context.accountId, profileId: null };

  // Appointed moderator explicitly — setMemberRole stores the moderator's permission set on the
  // membership (docs/domain/identity.md §2.1, design D3); nothing is inferred from being first
  // claimed. A realistic "person who set the WG up and lives there too" for demo purposes. The
  // household account itself runs no rounds (03-PRD.md §4.0.1, S-50/U-20), so Alex creates and
  // opens the round below and captures the demo applications.
  //
  // Alex, Sam, Kim and Jule are all claimed BEFORE the round opens, so its snapshot holds four
  // voters and quorum (share 0.5) needs 2 votes. Robin stays prepared, below.
  async function claim(displayName: string) {
    const profile = await createResidentProfile(context, displayName, adminActor);
    const { accountId } = await claimResidentProfile(context, profile.id, PASSWORD, "de");
    return {
      accountId,
      profileId: profile.id,
      context: { accountId, householdId: household.id, profileId: profile.id },
    };
  }
  const alex = await claim("Alex");
  await setMemberRole(context, context.accountId, alex.accountId, "moderator");
  await claim("Sam"); // the presenter: rates live, so the seeded votes below are never Sam's
  const kim = await claim("Kim");
  const jule = await claim("Jule");

  // join-screen task 6.1: a PREPARED profile — never claimed — so there is a live BOUND link to
  // walk through (design.md Decision 8's "Hi Robin!" greeting), beside the two already-claimed
  // residents above. Uses the administration account's own context and actor, exactly like Alex
  // and Sam above — #19's assert* helpers refuse an actor whose accountId differs from
  // context.accountId.
  const preparedProfile = await createResidentProfile(context, "Robin", adminActor);

  const { round, applicationCount, seededVotes } = await seedDemoRound({
    household: context,
    adminActor,
    alex,
    kim,
    jule,
  });

  // join-by-link: a multi-use link makes the path repeatable by hand without re-seeding, and a
  // separately issued single-use link serves AC-2.8's "the cap is enforced" refusal once it has
  // been spent. registerHousehold's own founding link is NOT used for that demo any more:
  // founding-link-moderator (2026-10-06) makes whoever redeems it a moderator, so a presenter
  // spending it would appoint a moderator by accident.
  const reusableLink = await issueJoinCode(context, context.accountId, { validDays: 7, maxUses: 5 });
  // join-screen task 6.1: a BOUND link for the prepared profile above — issueJoinCode forces
  // maxUses to 1 for any link naming a residentProfileId, regardless of what is passed here.
  const boundLink = await issueJoinCode(context, context.accountId, {
    validDays: 7,
    maxUses: 1,
    residentProfileId: preparedProfile.id,
  });
  const singleUseLink = await issueJoinCode(context, context.accountId, { validDays: 7, maxUses: 1 });

  const BASE_URL = process.env.DEMO_BASE_URL ?? "http://localhost:3000";

  console.log("\nDemo household seeded.\n");
  console.log("Sign in as administration (tab: Household):");
  console.log(`  Email:    ${DEMO_EMAIL}`);
  console.log(`  Password: ${PASSWORD}\n`);
  // household-sign-in-code: the resident tab takes the WG-Kennung, never the internal id.
  const signInCode = await getHouseholdSignInCode(context);
  console.log("Sign in as a resident (tab: Resident):");
  console.log(`  WG-Kennung: ${signInCode}`);
  console.log("  Name:       Alex   (moderator)");
  console.log("  Name:       Sam    (plain resident, the presenter)");
  console.log("  Name:       Kim    (plain resident)");
  console.log("  Name:       Jule   (plain resident)");
  console.log(`  Password:   ${PASSWORD}\n`);
  console.log(`Round "${round.title}" is open with four residents as participants (quorum: 2 votes).`);
  // Counts only: nothing personal is printed (the applicants are synthetic, but the habit counts).
  console.log(
    `${applicationCount} synthetic applications captured, ${seededVotes} votes cast by Alex, Kim and Jule,`,
  );
  console.log("2 rooms open, 1 application invited.\n");
  console.log("What to show:");
  console.log("  1. Sign in as Sam: Start shows the applications waiting, and Casting opens the pass.");
  console.log("  2. Rate every card. The scoreboard then shows rings in order, two highlighted rows,");
  console.log('     one row without a score at the bottom of "Score", and the invited one under "Eingeladen".');
  console.log('  3. Tap "(?)" for the weights, the formula and the quorum rule.');
  console.log("  4. Claim Robin through the bound link below, rate, and look again: the same three");
  console.log("     groups remain (quorum is now 3).\n");

  console.log("Join by link (open in a clean browser profile — signed out):");
  console.log(`  Reusable link (5 uses):  ${BASE_URL}/join/${reusableLink.code}`);
  console.log(`  Code to type by hand:    ${reusableLink.code}`);
  console.log(`  Bound link (Robin, 1 use): ${BASE_URL}/join/${boundLink.code}`);
  console.log('    ^ greets "Hi Robin!" and asks only for a password (design.md Decision 13)');
  console.log(`  Single-use link (1 use): ${BASE_URL}/join/${singleUseLink.code}`);
  console.log("    ^ spend it once, then re-open it to see the used-up refusal (AC-2.8)");
  console.log("  The household's founding link (Mitglieder screen) is not printed here: whoever joins");
  console.log("  through it becomes moderator, so it is for the founder only, not for this demo.");
  console.log(`\nEnter any of the above by hand at ${BASE_URL}/join instead of opening the link.`);
  console.log("\nThese links are also listed on the Mitglieder screen (O16) when signed in as");
  console.log("administration or as Alex (moderator), together with who joined through each.\n");
  // Not `psql "$DATABASE_URL" -f ...`: DATABASE_URL connects as app_runtime, and under RLS every
  // statement in that script would match zero rows and report success. It has its own guard that
  // refuses to run as app_runtime, but the instruction should be right in the first place.
  console.log("When you are done, run scripts/cleanup-demo-household.sql in the Supabase SQL");
  console.log("editor for flatmate-io-dev — it must run as postgres, not as app_runtime.\n");
}

// No explicit process.exit(): on this environment, forcing exit while @supabase/supabase-js's
// underlying HTTP client still has handles open crashes the process with a native libuv
// assertion (harmless — output already printed — but ugly and non-zero-exit). Closing the
// postgres.js pool and letting Node drain naturally avoids it and still exits promptly.
main()
  .catch((err) => {
    console.error("\nSeeding failed:", err);
    console.error(
      "\nIf this is \"email already registered\", a demo household already exists: " +
        "run scripts/cleanup-demo-household.sql in the Supabase SQL editor for flatmate-io-dev (as postgres), then re-seed.",
    );
    process.exitCode = 1;
  })
  .finally(() => db.$client.end({ timeout: 5 }));
