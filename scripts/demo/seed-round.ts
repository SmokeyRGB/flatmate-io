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
  inviteApplication,
  openRound,
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
      applicantName: "Tim Müller",
      age: 27,
      contacts: ["tim.mueller@example.test", "+49 30 23125 0100", "Portal: WG-Gesucht"],
      messageRaw: "Hi zusammen, ich bin Tim, 27, Grafikdesigner und seit zwei Jahren in Berlin. Meine aktuelle WG muss ich verlassen, weil sich ein Mitbewohner verkracht hat – kein großer Stress, aber das Klima war nicht mehr so gut wie vorher. Ich bin tagsüber oft im Studio unterwegs, schätze aber Abende in guter Gesellschaft. Koche gerne asiatisch, trinke jeden Morgen einen zu starken Kaffee und habe eine kleine Pflanzensammlung, die ums Überleben kämpft. Nichtraucher, gelegentlich Besuch (meist Freunde vom Fußballverein). Suche ein WG-Zimmer zum Einziehen ab nächstem Monat.",
      collectedFrom: "data_subject",
    },
    // a full one
    {
      applicantName: "Sarah Chen",
      age: 23,
      contacts: ["sarah.chen@example.test", "+49 30 23125 0101", "Portal: WG-Gesucht"],
      messageRaw: "Hallo liebe WG! Ich bin Sarah, 23, Masterstudentin in Biologie und wohne aktuell noch bei meinen Eltern, da meine Uni-Bewerbung für dieses Semester erst läuft. Ich suche ein kleines refugium für die nächsten 1-2 Jahre. Morgens früh auf, abends eher nachtfalke wenn ich an Lernphasen dranbinde. Rauche nicht, brauche dafür aber auch keine Extra-Signale. Liebe gute Gespräche beim Kochen, bin aber auch zufrieden wenn wir einfach nebeneinander her leben können. Haustiere? Leider nein, allergisch gegen alles was Fell hat. Freue mich auf eure Rückmeldung!",
      collectedFrom: "data_subject",
    },
    // two third-party captures
    {
      applicantName: "Marcel Kowalski",
      age: 31,
      contacts: ["+49 30 23125 0102", "Portal: WhatsApp"],
      messageRaw: "Servus, Marcel hier, 31, Handwerker mit eigener Firma. Ziehe aus meiner jetzigen 1-Zimmer-Wohnung raus, weil mir einfach die Fläche fehlt und ich Lust auf Gemeinschaft hab. Bin beruflich viel unterwegs (Montage bis mittwochs), aber dann auch daheim. Musik laut ok, aber bitte Rücksicht nehmen nach 22 Uhr. Kochte selbst meistens, bin kein Profi aber es schmeckt. Gäste eher am Wochenende, nicht häufig. Rauche draußen. Suche eine ruhige WG ohne Partystimmung, aber auch nicht komplett isoliert. Flexibel beim Einzugsdatum.",
      attributes: [{ label: "Beruf", value: "Handwerker"}],
      collectedFrom: "third_party",
    },
    {
      applicantName: "Jonas Keller",
      contacts: ["Messenger: jonas-keller"],
      age: 28,
      messageRaw: "Hey WG, ich bin Jonas, Masterstudent in Physik und habe von Lena (meine Kommilitonin aus dem dritten Semester) von eurem Casting gehört. Ich muss meine aktuelle Unterkunft wechseln, weil mein aktueller Mitbewohner nach München zieht und sich nun eine neue Konstellation ergeben hat. Ich studiere Vollzeit, bin aber selten bis gar nicht anwesend – zwischen Bibliothek, Labor und Vorlesungen bleibt wenig Zeit für Zuhause. Wenn ich doch mal da bin, koche ich gerne etwas für alle oder bringe einfach eine Pizza mit. Nichtraucher, besuche die Familie alle paar Wochen am Wochenende. Musik höre ich mit Kopfhörern, wenn ich lerne. Lena hat mir erzählt, dass ihr Wert auf ein entspanntes Miteinander legt – das klingt nach meinem Ding. Würde mich freuen, euch kennenzulernen und vielleicht einmal vorbei zukommen. \n\n Beste Grüße Jonas",
      collectedFrom: "third_party",
    },
    // one with attributes
    {
      applicantName: "Lisa Berger",
      age: 25,
      contacts: ["lisa.berger@example.test"],
      attributes: [
        { label: "Beruf", value: "Psychologin" },
        { label: "Einzug", value: "ab sofort" },
        { label: "Haustiere", value: "keine" },
      ],
      messageRaw: "Hey WG, Lisa hier! 25, Psychologin in Weiterbildung, arbeite in einer Praxis. Meine jetzige Unterkunft wird zu klein (neue Mitbewohnerin kam dazu, plötzlich ist niemand mehr privat). Ich bin ein morgentypischer Mensch, gehe joggen, lese viel und schätze einen offenen Umgangston. Nicht rauchend, trinke wenig Alkohol, bin vegan aber koche für andere mit. Habe mal einen Hamster gehabt – der war leider schon lange weg als ich ihn adoptierte. Besuche meine Familie regelmäßig am Wochenende. Würde mich sehr freuen Teil eures Alltags zu werden!",
      collectedFrom: "data_subject",
    },
    // one with a long message, and no other resident will vote on it
    {
      applicantName: "Ahmed Hassan",
      contacts: ["ahmed.hassan@example.test"],
      messageRaw: "Hallo zusammen, ich bin Ahmed, 29, Projektmanager in der IT-Branche. Umzüge waren meine Vergangenheit – 5 mal in 6 Jahren durch diverse Städte. Jetzt möchte ich etwas Bleibendes finden. Meine jetzige WG-Konstellation zerbröckelt langsam, jeder zieht seinen eigenen Weg. Ich bin tagsüber im Homeoffice, schätze Struktur aber auch Flexibilität. Kochte gerne orientalische Küche, teile immer gerne mitbekommen. Nichtraucher, Gäste selten aber kommen vor. Sport macht mir Spaß (Badminton, Laufen). Bin offen für gemeinsame Aktivitäten aber respektiere auch Ruhezeiten. Einzugszeitraum: flexibel innerhalb 4 Wochen.\n\nBeste Grüße\nAhmed",
      collectedFrom: "data_subject",
    },
    // the one that ends up invited
    {
      applicantName: "Carla Neumann",
      age: 26,
      contacts: ["carla.neumann@example.test", "+49 30 23125 0103"],
      messageRaw: "Hi ihr Lieben, Carla hier! 26, Journalistin und arbeite hauptsächlich im Redaktionsbüro meiner lokalen Zeitung. Ich muss meine aktuelle Wohnung verlassen, weil der Vermieter verkaufen möchte – typisches Berliner Glücksspiel halt. Bin ein sehr sozialer Mensch, liebe gemeinsames Frühstück am Sonntag und spontane Kinoabende. Nicht rauchend, trinke ab und zu ein Glas Wein. Kochen gehört für mich zum Entspannen, probiere gerne neue Rezepte aus. Meine einzige Regel: Geschirr wird am selben Tag weggeräumt. Gäste sind willkommen, aber immer mit Ankündigung. Suche eine WG mit Herz und offenem Ohr, nicht nur vier Wände. Freue mich sehr auf euer Feedback! \n\nLiebe Grüße\nCarla",
      attributes: [{ label: "Beruf", value: "Journalistin" }],
      collectedFrom: "data_subject",
    },
  ];
  for (const capture of captures) {
    const created = await captureApplication(alexContext, { roundId: round.id, ...capture });
    applicationIds.push(created.id);
  }
  // Alex is a moderator, so holds change_application_state; the actor comes from the context.
  // Nothing is left in `screened` (human decision 2026-10-06): `screened` is hidden in v0.1, and the
  // invited application is invited below through inviteApplication, the path the app's „Einladen"
  // uses, which passes through `screened` inside one transaction.

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
  //   - the seventh carries three other votes, then is invited below (new -> screened -> invited in
  //     one transaction). Nobody can vote on it any more, so every participant sees it, scored,
  //     under "Eingeladen" and never highlighted (design D10). The presenter's pass holds only the
  //     six `new` cards, so after rating them the board has no hidden row: "Verdeckt" appears only
  //     for a candidate still open for voting that the viewer has not rated (e.g. in a paused
  //     round).
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
  await inviteApplication(alexContext, { roundId: round.id, applicationId: applicationIds[6] });

  return { round, applicationCount: applicationIds.length, seededVotes };
}
