// Manual/dev tool — NOT part of the app or the test suite. Creates one fixed, memorable demo
// household (a moderator, three plain residents, one prepared profile, two open rooms, one open
// round, seven synthetic applications with the other residents' votes already cast) via the same
// repository/auth functions the app itself uses, so there's something real to click through
// instead of hunting through the households automated test runs and ad-hoc UI walkthroughs leave
// behind.
//
// The seeded state is the pitch path (F5 change 1, human decision Q-12): sign in as Sam (or claim
// Robin), rate every card in the pass, and the scoreboard shows scored rows, one unscored row and
// one hidden `invited` row. See the robustness note above the votes.
//
// Usage: npm run seed:demo
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
  transitionRoomStatus,
} from "@/modules/casting/repository";
import { castVote } from "@/modules/deliberation/repository";
import type { VoteValue } from "@/modules/deliberation/vote-values";
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
  //
  // Alex, Sam, Kim and Jule are all claimed BEFORE the round opens, so its snapshot holds four
  // voters and quorum (share 0.5) needs 2 votes. Robin stays prepared, below.
  async function claim(displayName: string) {
    const profile = await createResidentProfile(context, displayName, adminActor);
    const { accountId } = await claimResidentProfile(context, profile.id, PASSWORD);
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

  const roomA = await createRoom(context, "Zimmer 1", adminActor);
  const roomB = await createRoom(context, "Zimmer 2", adminActor);

  // The rooms stay with the household account (manage_rooms); the round is Alex's (manage_rounds).
  const alexContext = alex.context;
  const alexActor = { accountId: alex.accountId, profileId: alex.profileId };
  const round = await createRound(alexContext, "Herbstrunde 2026", [roomA.id, roomB.id], alexActor);
  await openRound(alexContext, round.id, alexActor);
  // Both rooms are open, so the scoreboard highlights its first two rows (N = 2, R-6). Rooms are
  // created `planned`; moving them is the household account's right (manage_rooms).
  await transitionRoomStatus(context, roomA.id, "open", adminActor);
  await transitionRoomStatus(context, roomB.id, "open", adminActor);

  // Seven synthetic applications (G-B1: invented names, @example.test, the fictional 030 23125
  // range) so the pass, O4 and the scoreboard can be walked by hand. Captured as Alex through the
  // same repository function the form uses; both `collectedFrom` values occur.
  const applicationIds: string[] = [];
  const captures = [
    // a name, an age and a short message
    {
      applicantName: "Mia Hofmann",
      age: 24,
      messageRaw: "Ich bin Studentin und suche ein ruhiges Zimmer ab Dezember.",
      collectedFrom: "data_subject",
    },
    // a full one
    {
      applicantName: "Noah Brandt",
      age: 27,
      contacts: ["noah.brandt@example.test", "+49 30 23125 0101", "Portal: noah-brandt"],
      messageRaw: "Hallo, ich suche ab November ein Zimmer und koche gern für alle.",
      attributes: [{ label: "Beruf", value: "Tischler" }],
      collectedFrom: "data_subject",
    },
    // two third-party captures
    {
      applicantName: "Lea Winter",
      age: 29,
      contacts: ["+49 30 23125 0102"],
      collectedFrom: "third_party",
    },
    {
      applicantName: "Jonas Keller",
      contacts: ["Messenger: jonas-keller"],
      messageRaw: "Über eine Kollegin empfohlen worden.",
      collectedFrom: "third_party",
    },
    // one with attributes
    {
      applicantName: "Yara Demir",
      age: 31,
      contacts: ["yara.demir@example.test"],
      attributes: [
        { label: "Beruf", value: "Hebamme" },
        { label: "Einzug", value: "ab sofort" },
        { label: "Haustiere", value: "keine" },
      ],
      collectedFrom: "data_subject",
    },
    // one with a long message, and no other resident will vote on it
    {
      applicantName: "Ben Schäfer",
      messageRaw: "Ich stelle mich kurz vor. ".repeat(60),
      collectedFrom: "data_subject",
    },
    // the one that ends up invited
    {
      applicantName: "Carla Neumann",
      age: 26,
      contacts: ["carla.neumann@example.test", "+49 30 23125 0103"],
      messageRaw: "Ich arbeite im Home-Office und bin tagsüber meist zu Hause.",
      attributes: [{ label: "Beruf", value: "Grafikerin" }],
      collectedFrom: "data_subject",
    },
  ];
  for (const capture of captures) {
    const created = await captureApplication(alexContext, { roundId: round.id, ...capture });
    applicationIds.push(created.id);
  }
  // Alex is a moderator, so holds change_application_state; the actor comes from the context.
  await transitionApplication(alexContext, applicationIds[1], "screened");
  await transitionApplication(alexContext, applicationIds[3], "screened");

  // The other residents' votes, cast through castVote in each voter's own context (the same write
  // path the app uses). Each application gets ZERO or ALL THREE other votes, never one or two: one
  // or two other votes plus the presenter's would sit exactly on the quorum line and flip between
  // scored and unscored when Robin is claimed (quorum 2 -> 3).
  //
  // Robustness: the presenter (Sam, or Robin after claiming) adds at most one vote per application.
  //   - five applications carry three other votes: 3 + 1 >= quorum 2 (four voters) and >= quorum 3
  //     (five voters), so they are scored either way;
  //   - the sixth carries none: the presenter's single vote stays below quorum 2 or 3, so it is
  //     unscored either way;
  //   - the seventh carries three other votes, then moves new -> screened -> invited below. The
  //     presenter never voted on it and now cannot, so it is hidden from them (V-4). For Alex, Kim
  //     and Jule it is visible, because they did vote on it: their walkthrough checks shared
  //     scores only.
  const voters = [alex.context, kim.context, jule.context];
  const votesByApplication: Record<number, [VoteValue, VoteValue, VoteValue] | null> = {
    0: ["definitely", "good", "definitely"],
    1: ["good", "good", "rather_not"],
    2: ["definitely", "definitely", "good"],
    3: ["rather_not", "no", "rather_not"],
    4: ["good", "definitely", "good"],
    5: null,
    6: ["good", "good", "definitely"],
  };
  let seededVotes = 0;
  for (const [index, values] of Object.entries(votesByApplication)) {
    if (values === null) continue;
    for (const [voterIndex, value] of values.entries()) {
      await castVote(voters[voterIndex], { roundId: round.id, applicationId: applicationIds[Number(index)], value });
      seededVotes += 1;
    }
  }
  await transitionApplication(alexContext, applicationIds[6], "screened");
  await transitionApplication(alexContext, applicationIds[6], "invited");

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
  console.log(`  WG-Kennung: ${household.signInCode}`);
  console.log("  Name:       Alex   (moderator)");
  console.log("  Name:       Sam    (plain resident, the presenter)");
  console.log("  Name:       Kim    (plain resident)");
  console.log("  Name:       Jule   (plain resident)");
  console.log(`  Password:   ${PASSWORD}\n`);
  console.log(`Round "${round.title}" is open with four residents as participants (quorum: 2 votes).`);
  // Counts only: nothing personal is printed (the applicants are synthetic, but the habit counts).
  console.log(
    `${applicationIds.length} synthetic applications captured, ${seededVotes} votes cast by Alex, Kim and Jule,`,
  );
  console.log("2 rooms open, 1 application invited.\n");
  console.log("What to show:");
  console.log("  1. Sign in as Sam: Start shows the applications waiting, and Casting opens the pass.");
  console.log("  2. Rate every card. The scoreboard then shows rings in order, two highlighted rows,");
  console.log('     one row without a score at the bottom, and one greyed row "Verdeckt" (invited).');
  console.log('  3. Tap "(?)" for the weights, the formula and the quorum rule.');
  console.log("  4. Claim Robin through the bound link below, rate, and look again: the same three");
  console.log("     kinds of row remain (quorum is now 3).\n");

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
