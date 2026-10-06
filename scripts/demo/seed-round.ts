// Shared by scripts/seed-demo-household.ts (fresh household) and scripts/seed-demo-round.ts (the
// existing demo household after scripts/reset-demo-household.sql): the ONE place the rooms, round,
// applications, votes and invite of the demo are seeded. Exported app functions only, no raw SQL.
//
// Callers pass contexts they already hold: the household account's (rooms, room status) and the
// voters Alex, Kim and Jule (Alex is a moderator and runs the round). Alex, Sam, Kim and Jule must
// be claimed BEFORE this runs, so the round's snapshot holds them all as voters.

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
import type { SessionContext } from "@/db/session-context";

type Actor = { accountId: string; profileId: string | null };

export interface SeedRoundInput {
  household: SessionContext;
  adminActor: Actor;
  alex: { context: SessionContext; accountId: string; profileId: string };
  kim: { context: SessionContext };
  jule: { context: SessionContext };
}

export async function seedDemoRound({ household: context, adminActor, alex, kim, jule }: SeedRoundInput) {
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

  return { round, applicationCount: applicationIds.length, seededVotes };
}
