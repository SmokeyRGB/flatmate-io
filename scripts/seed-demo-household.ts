// Manual/dev tool — NOT part of the app or the test suite. Creates one fixed, memorable demo
// household (a moderator resident, a plain resident, two rooms, one open round) via the same
// repository/auth functions the app itself uses, so there's something real to click through
// instead of hunting through the households automated test runs and ad-hoc UI walkthroughs leave
// behind.
//
// Usage: npm run seed:demo
//
// Not idempotent by design: run it once against a clean(ish) database. Re-running after the demo
// household already exists fails loudly at Supabase Auth's "email already registered" step.
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
  issueJoinCode,
  listJoinCodeIssuances,
  setMemberRole,
} from "@/modules/identity/repository";
import {
  captureApplication,
  createRoom,
  createRound,
  openRound,
  transitionApplication,
} from "@/modules/casting/repository";
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
  const { household, context } = await registerHousehold(DEMO_EMAIL, PASSWORD, "Demo-WG");
  const adminActor = { accountId: context.accountId, profileId: null };

  // Appointed moderator explicitly — setMemberRole stores the moderator's permission set on the
  // membership (docs/domain/identity.md §2.1, design D3); nothing is inferred from being first
  // claimed. A realistic "person who set the WG up and lives there too" for demo purposes. The
  // household account itself runs no rounds (03-PRD.md §4.0.1, S-50/U-20), so Alex creates and
  // opens the round below and captures the demo applications.
  const moderatorProfile = await createResidentProfile(context, "Alex", adminActor);
  const { accountId: moderatorAccountId } = await claimResidentProfile(
    context,
    moderatorProfile.id,
    PASSWORD,
  );
  await setMemberRole(context, context.accountId, moderatorAccountId, "moderator");

  const residentProfile = await createResidentProfile(context, "Sam", adminActor);
  await claimResidentProfile(context, residentProfile.id, PASSWORD);

  // join-screen task 6.1: a PREPARED profile — never claimed — so there is a live BOUND link to
  // walk through (design.md Decision 8's "Hi Robin!" greeting), beside the two already-claimed
  // residents above. Uses the administration account's own context and actor, exactly like Alex
  // and Sam above — #19's assert* helpers refuse an actor whose accountId differs from
  // context.accountId.
  const preparedProfile = await createResidentProfile(context, "Robin", adminActor);

  const roomA = await createRoom(context, "Zimmer 1", adminActor);
  const roomB = await createRoom(context, "Zimmer 2", adminActor);

  // The rooms stay with the household account (manage_rooms); the round is Alex's (manage_rounds).
  const alexContext = {
    accountId: moderatorAccountId,
    householdId: household.id,
    profileId: moderatorProfile.id,
  };
  const alexActor = { accountId: moderatorAccountId, profileId: moderatorProfile.id };
  const round = await createRound(alexContext, "Herbstrunde 2026", [roomA.id, roomB.id], alexActor);
  await openRound(alexContext, round.id, alexActor);

  // Six synthetic applications (G-B1: invented names, @example.test, the fictional 030 23125 range)
  // so O4 (change 3) and F4 can be walked by hand. Captured as Alex through the same repository
  // function the form uses; two are then moved new -> screened.
  const applicationIds: string[] = [];
  const captures = [
    // a name only
    { applicantName: "Testbewerbung Mia", collectedFrom: "data_subject" },
    // a full one
    {
      applicantName: "Testbewerbung Noah",
      age: 27,
      contacts: ["noah.test@example.test", "+49 30 23125 0101", "Portal: noah-test"],
      messageRaw: "Hallo, ich suche ab November ein Zimmer und koche gern für alle.",
      attributes: [{ label: "Beruf", value: "Tischler" }],
      collectedFrom: "data_subject",
    },
    // two third-party captures
    {
      applicantName: "Testbewerbung Lea",
      contacts: ["+49 30 23125 0102"],
      collectedFrom: "third_party",
    },
    {
      applicantName: "Testbewerbung Jonas",
      contacts: ["Messenger: jonas-test"],
      messageRaw: "Über eine Kollegin empfohlen worden.",
      collectedFrom: "third_party",
    },
    // one with attributes
    {
      applicantName: "Testbewerbung Yara",
      age: 31,
      attributes: [
        { label: "Beruf", value: "Hebamme" },
        { label: "Einzug", value: "ab sofort" },
        { label: "Haustiere", value: "keine" },
      ],
      collectedFrom: "data_subject",
    },
    // one with a long message
    {
      applicantName: "Testbewerbung Ben",
      messageRaw: "Ich stelle mich kurz vor. ".repeat(60),
      collectedFrom: "data_subject",
    },
  ];
  for (const capture of captures) {
    const created = await captureApplication(alexContext, { roundId: round.id, ...capture });
    applicationIds.push(created.id);
  }
  // Alex is a moderator, so holds change_application_state; the actor comes from the context.
  await transitionApplication(alexContext, applicationIds[0], "screened");
  await transitionApplication(alexContext, applicationIds[1], "screened");

  // join-by-link: registerHousehold already mints a founding link, but it is single-use by default
  // (FR-2.4: max_uses 1) — enough to walk the join path exactly once and then only the used-up
  // refusal. A second, multi-use link is what makes the path repeatable by hand without re-seeding,
  // so both are issued and both are printed: the reusable one for the happy path, the founding
  // single-use one for AC-2.8's "the cap is enforced" refusal once it has been spent.
  const reusableLink = await issueJoinCode(context, context.accountId, { validDays: 7, maxUses: 5 });
  // join-screen task 6.1: a BOUND link for the prepared profile above — issueJoinCode forces
  // maxUses to 1 for any link naming a residentProfileId, regardless of what is passed here.
  const boundLink = await issueJoinCode(context, context.accountId, {
    validDays: 7,
    maxUses: 1,
    residentProfileId: preparedProfile.id,
  });
  const allLinks = await listJoinCodeIssuances(context, context.accountId);
  const foundingLink = allLinks.find((link) => link.id !== reusableLink.id && link.id !== boundLink.id);

  const BASE_URL = process.env.DEMO_BASE_URL ?? "http://localhost:3000";

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
  // Counts only: nothing personal is printed (the applicants are synthetic, but the habit counts).
  console.log(`${applicationIds.length} synthetic applications captured (2 of them screened).\n`);

  console.log("Join by link (open in a clean browser profile — signed out):");
  console.log(`  Reusable link (5 uses):  ${BASE_URL}/join/${reusableLink.code}`);
  console.log(`  Code to type by hand:    ${reusableLink.code}`);
  console.log(`  Bound link (Robin, 1 use): ${BASE_URL}/join/${boundLink.code}`);
  console.log('    ^ greets "Hi Robin!" and asks only for a password (design.md Decision 13)');
  if (foundingLink) {
    console.log(`  Founding link (1 use):   ${BASE_URL}/join/${foundingLink.code}`);
    console.log("    ^ spend it once, then re-open it to see the used-up refusal (AC-2.8)");
  }
  console.log(`\nEnter any of the above by hand at ${BASE_URL}/join instead of opening the link.`);
  console.log("\nBoth links are also listed on the Mitglieder screen (O16) when signed in as");
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
