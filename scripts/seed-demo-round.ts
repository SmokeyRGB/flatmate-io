// Manual/dev tool — NOT part of the app or the test suite. Re-creates the demo's casting round on
// the EXISTING Demo-WG after scripts/reset-demo-household.sql (run as owner in the Supabase SQL
// editor) has removed its rooms, rounds, applications and votes. The household id, WG-Kennung,
// accounts, profiles and join links stay as they are. Exported app functions only, no raw SQL.
//
// Usage: DEMO_PASSWORD=<the password the original seed printed> npm run seed:demo-round
//
// Refuses without DEMO_PASSWORD, and refuses while the household still has any round (it never
// stacks rounds). The round itself is seeded by scripts/demo/seed-round.ts, shared with
// scripts/seed-demo-household.ts. Prints counts only, never applicant data.
//
// Env vars come from `--env-file=.env.local` (see package.json), for the reason given in
// scripts/seed-demo-household.ts.

import { claimResidentProfile, signIn } from "@/modules/identity/auth";
import type { SignInResult } from "@/modules/identity/auth";
import { createResidentProfile, getHouseholdSignInCode, getResidentList, revokeSession } from "@/modules/identity/repository";
import { listRoundsForSession } from "@/modules/casting/repository";
import { getRanking } from "@/modules/deliberation/repository";
import { db } from "@/db/client";
import { assertSafeSupabaseEnv } from "./env-guard";
import { seedDemoRound } from "./demo/seed-round";

assertSafeSupabaseEnv(process.env, "seed");

// Must match DEMO_EMAIL in scripts/seed-demo-household.ts and the SQL scripts.
const DEMO_EMAIL = "demo-household@example.test";

class DemoRoundError extends Error {}

// The household account's one sign-in (it proves DEMO_PASSWORD). Ended in the final handler below
// so a run leaves no session row behind.
let householdSession: SignInResult | null = null;

async function main() {
  const envPassword = process.env.DEMO_PASSWORD;
  if (!envPassword) {
    throw new DemoRoundError(
      "DEMO_PASSWORD is required: the password the original seed printed (shared by the household account and the residents).",
    );
  }
  const password: string = envPassword;

  let household: SignInResult;
  try {
    household = await signIn({ kind: "household", email: DEMO_EMAIL, password });
  } catch (err) {
    throw new DemoRoundError(
      `Could not sign in as the household account (${DEMO_EMAIL}): ${err instanceof Error ? err.message : String(err)}`,
    );
  }
  householdSession = household;
  const context = household.context;
  const adminActor = { accountId: context.accountId, profileId: null };

  if ((await listRoundsForSession(context)).length > 0) {
    throw new DemoRoundError(
      "The household still has a round. Run scripts/reset-demo-household.sql first (as owner, in the Supabase SQL editor). Nothing was changed.",
    );
  }

  // Residents come from the household account's own list. Kim and Jule are claimed only when
  // missing; Alex and Sam were part of the original seed and are never created here. "Present"
  // means active with an account: a prepared profile of that name is claimed rather than
  // duplicated (the active-name index would refuse a second one), and a moved-out one has
  // released its name, so a fresh profile is created.
  const { members } = await getResidentList(context, context.accountId);
  const claimed = new Map<string, { accountId: string; profileId: string }>();
  for (const m of members) {
    if (m.status === "active" && m.accountId !== null && !claimed.has(m.displayName)) {
      claimed.set(m.displayName, { accountId: m.accountId, profileId: m.id });
    }
  }
  for (const name of ["Kim", "Jule"]) {
    if (claimed.has(name)) continue;
    const prepared = members.find((m) => m.displayName === name && m.status === "prepared");
    const profileId = prepared ? prepared.id : (await createResidentProfile(context, name, adminActor)).id;
    const { accountId } = await claimResidentProfile(context, profileId, password);
    claimed.set(name, { accountId, profileId });
    console.log(`Claimed missing resident ${name}.`);
  }

  // No resident signs in: the casting and voting functions authorise through the stored
  // membership, so a context built from the resident list is enough and leaves no session row.
  function residentContext(displayName: string) {
    const resident = claimed.get(displayName);
    if (!resident) {
      throw new DemoRoundError(
        `Resident ${displayName} is missing from the household (no active, claimed profile). Nothing after it ran.`,
      );
    }
    return {
      accountId: resident.accountId,
      householdId: context.householdId,
      profileId: resident.profileId,
    };
  }
  const alexContext = residentContext("Alex");
  const kimContext = residentContext("Kim");
  const juleContext = residentContext("Jule");

  const { round, applicationCount, seededVotes } = await seedDemoRound({
    household: context,
    adminActor,
    alex: {
      context: alexContext,
      accountId: alexContext.accountId,
      profileId: alexContext.profileId,
    },
    kim: { context: kimContext },
    jule: { context: juleContext },
  });

  // Counts only: the board read as Alex gives the voter count and the quorum the round froze.
  const board = await getRanking(alexContext, round.id);
  const signInCode = await getHouseholdSignInCode(context);

  console.log("\nDemo round seeded on the existing Demo-WG.\n");
  console.log(`  WG-Kennung: ${signInCode}`);
  console.log(`  Round "${round.title}" is open with 2 rooms open.`);
  console.log(`  ${applicationCount} synthetic applications captured, ${seededVotes} votes cast by Alex, Kim and Jule,`);
  console.log("  1 application invited.");
  if (board.kind === "board") {
    const { denominator, needed } = board.rules;
    console.log(`  Voters: ${denominator}. Quorum: ${needed} votes.`);
    if (3 + 1 < needed) {
      console.log(
        `  WARNING: 3 seeded votes plus the presenter's 1 are below the quorum of ${needed}: the scoreboard will show no scored rows. The household has more residents than the demo expects.`,
      );
    }
  } else {
    console.log(`  Could not read the board to report the quorum (${board.kind}).`);
  }
  console.log("\nWhat to show:");
  console.log("  1. Sign in as Sam: Start shows the applications waiting, and Casting opens the pass.");
  console.log("  2. Rate every card. The scoreboard shows rings in order, highlighted rows, one row");
  console.log('     without a score under "Punktwert", and the invited one under "Eingeladen".');
  console.log('  3. Tap "(?)" for the weights, the formula and the quorum rule.\n');
}

main()
  .catch((err) => {
    if (err instanceof DemoRoundError) console.error(`\n${err.message}`);
    else console.error("\nSeeding the demo round failed:", err);
    process.exitCode = 1;
  })
  .finally(async () => {
    try {
      if (householdSession) await revokeSession(householdSession.context, householdSession.session.id);
    } catch (err) {
      console.error("Could not end the household sign-in session:", err instanceof Error ? err.message : err);
    }
    await db.$client.end({ timeout: 5 });
  });
