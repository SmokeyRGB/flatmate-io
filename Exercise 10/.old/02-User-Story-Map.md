# User Story Map — Flatmate.io

### Baseline map, resident perspective · Workshop artifact for Exercise 10

> **Status:** V1.3 · 2026-09-03
> **Change vs V1.2 — correction pass against the German source chain, see
> `Exercise 10/06-Correction-Pass-Findings.md` for the full record.** Two stories deleted for
> crossing the persona boundary (join-link sharing in Epic 1.1, the second-pass on/off toggle in
> Epic 3.2 — both are household/moderator-permission actions the map's own Appendix C already
> excludes). One story moved (push-notification timing, Epic 1.3 → Epic 1.1, it serves onboarding
> sequencing, not "what happened while I was away"). Fourteen further wording fixes for
> mistranslated mechanisms, a fabricated number, dropped branch detail, and misattributed
> citations. Total 102 → 100. Epic 3.2 now runs to 4 stories, under this map's own stated 5–9
> range — a deliberate, undisguised consequence of the deletion above, left for the facilitator
> rather than papered over with an invented story (see Appendix E).
> **Change vs V1.1:** every epic's story set re-derived from its goal instead of filled to a
> quota. Counts now run 5 to 9 per epic (was a flat 4–5); total 71 → 102. Epic 5.3 renamed and
> widened to cover departures as well as arrivals. Two stories removed from Epic 1.3 that did
> not serve its goal.
> **Deliberate divergence from `Exercise 10/01-create-story-map-prompt.md`:** the prompt caps
> stories at "1–5 per epic". That cap is lifted on the author's instruction — an epic carries
> what its goal needs. The cap on activities (5) and epics per activity (3) still holds.
> **Change vs V1.0:** all 15 epic names rewritten to be readable on a board without the stories
> underneath them; each epic carries a one-line gloss.
> **Source of truth:** `01-Problem-Framing.md` · `02-SRD.md` · `03-PRD.md`
> **Companion:** `Exercise 10/03-Story-Map-Review-Notes.md` (challenges, roadmap-board mapping) ·
> `Exercise 10/06-Correction-Pass-Findings.md` (spec fact-check record for this version)

---

## How to read this map

Three levels, nothing more:

- **User Activity** — the big thing a resident is trying to achieve. Read left to right; this is the journey.
- **Epic** — a goal, plus everything that has to happen to reach it. Named so it stands alone on a board, with a one-line gloss underneath. Described from the resident's side, never technical.
- **Story** — one lightweight sticky. Every story is implicitly "As a resident, I want ...", so each line starts with "..." to keep the sticky short.

**Persona.** Lukas, resident. Lives in a seven-person WG in Tuebingen. Votes, occasionally moderates a round. Not the household admin account, not an applicant.

**This is a baseline map.** No MVP line, no prioritisation, no scope removed. Drawing the line is the workshop's job, not this document's.

**Counts:** 5 activities, 15 epics, 100 stories. Epic story counts run from 4 to 9 — see
Appendix E for why Epic 3.2 is the one exception to the 5–9 range.

---

## Backbone — the five activities

1. Join the round and know what is on me
2. Get every application into one place
3. Pick who we invite
4. Get everyone to the casting, and everyone informed
5. Decide, offer, and welcome the new flatmate

---

## Activity 1 — Join the round and know what is on me

### Epic 1.1 — Link to first vote in one minute

*One link, a name, a password. No email, no install, no waiting.*

**Goal:** someone who gets the link registers within a minute, on whatever device they own.

... open the link and see which WG I am joining before I confirm

... join with just a name and a password

... get to my first vote without an email address

... not be asked to install anything before my first vote

... add an email later so I can get back in if I lose my password

... turn on push notifications after my first vote, not before

### Epic 1.2 — What is next, and who is waiting on me

*One task at the top with the reason beside it: "4 others are waiting on your note."*

**Goal:** after three days away, I know the one thing to do next and why, without thinking.

... see one screen that tells me what to do next

... see exactly one main action, not a list I have to sort myself

... read why each task is first — "4 others are waiting on your note"

... see how much time is left when the round has a deadline

... still be able to act after a deadline has passed

... see "5 of 7 have voted" so I know whether the group is waiting on me

... see where the round stands, not a blank screen, when nothing is open

... never be asked to vote on my own application

... keep moderation work out of my personal task list

### Epic 1.3 — What happened while I was away

*One feed and one digest, instead of piecing it together from the WhatsApp history.*

**Goal:** I can reconstruct what the WG decided while I was offline, in one screen.

... read one feed that answers "what happened while I was away"

... see outcomes highlighted in that feed

... jump from a feed entry straight to the thing it is about

... never see a feed entry for something I am not allowed to open

... get one digest instead of a message per application

---

## Activity 2 — Get every application into one place

### Epic 2.1 — Open a round: which rooms, by when, who votes

*Three rooms, a soft deadline that nudges but never blocks, and a snapshot of voters taken at the start.*

**Goal:** a round that matches reality and survives rooms being filled one at a time.

... open a round for the rooms we are actually casting for

... set a soft deadline so people know when to act

... have that deadline nudge without ever blocking a decision

... see who is taking part in this round

... keep the round running for the other rooms when one is taken

... reopen a closed round when an accepted applicant pulls out

### Epic 2.2 — Paste it or type it, same card either way

*WhatsApp, email, portal or spoken at the door. One record, however it arrived.*

**Goal:** every application becomes the same record regardless of channel, with a human always confirming.

... type an application into a form when it arrived by word of mouth, not a pasteable message

... paste a message and have name, age, contact and text pulled out

... confirm or correct every field the parser guessed before it is saved

... get the form with my pasted text still in it, not an error, when the parser finds nothing

... save an application with nothing but a name

... link a person's earlier application to their new one

### Epic 2.3 — Know where the data came from

*Applicant or third party, the notice duty that follows, and an export when they ask.*

**Goal:** for any applicant we can say where the data came from, what we owe them, and hand it over.

... record whether the details came from the applicant or from someone else

... be told about the one-month notice duty when the data came from a third party

... get a ready text to send when that notice is due

... drop a paragraph of a pasted message before the record is created

... delete a single application without touching the rest of the round

... produce a data export for one applicant when they ask what we hold

---

## Activity 3 — Pick who we invite

### Epic 3.1 — Card by card, four ratings, two minutes

*No · Rather not · Like · Must have — one rating per applicant. What each is worth is shown before you use it.*

**Goal:** every resident gets through all open applications in one sitting and knows what their vote meant.

> **The scale, exactly** (E-07, S-10): one rating per applicant, not a sequence of steps.
> German UI labels `Nein` · `Eher nicht` · `Finde gut` · `Unbedingt`, worth **0 · 1 · 3 · 5**.
> Non-linear on purpose — the decision boundary sits between `Eher nicht` and `Finde gut`.
> Score is the **mean**, scaled 0–100, so different vote counts stay comparable. `Unbedingt`
> doubles as the favourite signal, which is why there is no separate shortlisting pass and
> why it is what Epic 3.2 counts.

... go through the open applications card by card in one sitting

... pick one of four ratings for each applicant

... see what each rating is worth before I use it

... change my vote while the round is still open

... pick up the new arrivals next time, without the deck shifting under me

... see "nothing is waiting for you" when I am done

### Epic 3.2 — Too many "must haves" get a second pass

*Only your own must-have cards, same deck, skippable, never a forced downgrade.*

**Goal:** when my votes do not differentiate, I get one short chance to fix that — never a forced one.

> **The budget, exactly** (E-08, S-11, PRD §4.1.5): `budget = max(1, ceil(open rooms × 1,5))`.
> Three open rooms give a budget of 5, so the second pass appears from the **sixth** own
> `Unbedingt` and never at five or fewer. It counts the **still-open** rooms, not the round's
> original room count — a round with a room already taken has a lower budget. The floor of 1
> exists so a round with no open rooms left does not forbid `Unbedingt` entirely. The second
> pass can be switched off in `HouseholdSettings`, and like every voting-procedure setting it
> is locked while a round is open (S-35).

... be shown a short second pass only when I have given more "must have" ratings than the round's favourite budget allows

... rate my own shortlist with the same cards I already know

... leave the second pass without changing any of my votes

... be told my votes differentiate little, even when the second pass is switched off

### Epic 3.3 — A ranking I can check, an invite I can send

*A score you can recompute, under-quorum candidates kept separate, a ready text to paste.*

**Goal:** the group's votes become a ranking nobody can dispute, and the top of it becomes a real invitation.

... see a candidate's score only after I have voted on that candidate

... see how the score is worked out, not just the number

... see candidates with too few votes in a separate "waiting for votes" section

... see how the four ratings split for one candidate, not only the average

... see when a vote came from someone who has since moved out

... mark a candidate as invited

... get a ready text with the data-protection notice to paste into any channel

... see every candidate's current stage in one place

---

## Activity 4 — Get everyone to the casting, and everyone informed

### Epic 4.1 — "Tuesdays from 16:00" becomes a real time window

*Grid or plain text — plain text always confirmed by a human before it is saved.*

**Goal:** everyone's real availability is in the system as structured windows, without anyone being forced through a link.

... enter when I can and cannot in a grid on my phone

... write "Tuesdays from 16:00" and confirm what the app understood

... never have a guessed time window saved without me confirming it

... enter an applicant's preferred times by hand when no link was used

... see all slots treated as available, marked as an assumption, when an applicant has given no times

### Epic 4.2 — "Tue 17:00 — 5 of 7 can make it"

*A heatmap, impossible slots greyed out, and a computed proposal that shows its working.*

**Goal:** the group lands on a time that works and can see why it works — including when the solver is unavailable.

... see a heatmap of how many of us can make each slot

... see slots greyed out that this applicant cannot make anyway

... place slots by hand when I would rather not compute anything

... set our house rules once — "not before 18:00", "at most N a day"

... press "calculate a proposal" and read why those slots were picked

... watch hard constraints get relaxed one at a time until told exactly who or when blocked it, instead of seeing an error

... get the best answer found so far when the calculation hits its time limit, clearly labelled as found under time pressure

... react to a single slot with a thumbs up or "I can't"

### Epic 4.3 — Lock the date, then tell the ones who were not there

*Confirm the slot, then a prompted note so the absentees can still decide.*

**Goal:** the people who could not attend can decide as if they had been there. This is the central pain point of the whole product.

... confirm one slot as the casting appointment for everyone

... confirm it even when not everyone has reacted

... correct my own attendance by cancelling shortly before the casting, so only the people who were really there get asked for a note

... be reminded after the casting to write a few sentences for the others

... answer structured prompts instead of staring at an empty text box

... see "write as if the person could read it" while I am writing the note

... read the notes even though I was not there

... see "no notes yet" instead of an empty field when nobody has written

---

## Activity 5 — Decide, offer, and welcome the new flatmate

### Epic 5.1 — Round two, with a veto that ranks instead of deletes

*The same four ratings after meeting them. One strong no, with a reason, that does not block the group.*

**Goal:** the group decides on an offer, and one person can say a strong no without blocking everyone.

... vote on the people we actually met, with the same four ratings

... see the round-two ranking the same way I saw the first

... place a veto with a reason when I strongly disagree

... see that my veto ranks a candidate low but does not delete them

... see the veto counter once I am close to using it up

... be told honestly that an anonymous veto in a WG of five is not anonymous

... not be able to veto once an offer has already gone out

### Epic 5.2 — Make the offer, and survive a no after a yes

*Room and move-in date recorded, a ready copy-paste text for the offer, a status you can take back.*

**Goal:** an offer goes out, the answer comes back into the system, and the process survives every way it can go wrong.

... make an offer and record the room and the planned move-in date

... record a move-in date that is still provisional

... get a ready copy-paste text for the offer

... record the applicant's answer, whether it is yes or no

... see the status branch back to offer-pending or declined when someone pulls out after accepting, audited either way

... see who did what and when, on every status change

... see all casting appointments and move-in dates in one calendar

### Epic 5.3 — People come and go, the round does not leak

*Self-redaction from day one for the person arriving, a clean exit for the person leaving, and votes that still count either way.*

**Goal:** the round survives its own membership changing, without anyone reading what they should not.

... see "X is moving into room 2 on the 15th" reach everyone, not just whoever was online

... send one invite link that lets an accepted applicant become a flatmate on their own

... see the new flatmate join the running round for the other rooms

... see the history about other candidates, even though I joined late

... never read a vote, veto or note that was written about me

... see only the factual part of my own application, with an honest note why

... lose access to the round the day I move out

... know my votes still count after I have gone

... close the round once every room is taken

---

## Appendix A — Traceability

Epic level only, so the stickies stay clean. Every epic points back at the scope lines it
serves. Use this when the AI-challenge step claims something is missing or invented.

- **Epic 1.1** — S-03 (one-step join, email optional) · S-45 (nothing between join and first vote) · S-49 (link expiry and use limit) · P-2
- **Epic 1.2** — S-48 (task precedence rule) · S-44 (soft phase deadline, blocks nothing) · S-29 (participation loop) · S-31 (no vote task for your own application) · U-5 (moderation bridge kept separate)
- **Epic 1.3** — S-27 (activity feed, outcome events) · S-28 (channel resolution, digest default) · S-31 (invisible target means no feed entry at all)
- **Epic 2.1** — S-06 (round, participation snapshot, reopen) · S-07 (room as own entity) · S-44
- **Epic 2.2** — S-08 (form plus paste parser, human confirms, name-only minimum) · S-40 (link earlier applications)
- **Epic 2.3** — S-38 (Art. 13 vs 14 switch and notice period) · S-39 (discard paragraphs) · S-33 (manual per-application delete) · S-34 (data export per application)
- **Epic 3.1** — S-09 (card screening pass, fixed deck per run) · S-10 (four-point scale, weights shown, revisable)
- **Epic 3.2** — S-11 (budget threshold, abortable, switchable) · S-47 (same card pattern, no separate compare screen) · E-08 ("your votes differentiate little" hint when switched off)
- **Epic 3.3** — S-12 (score and spread) · S-13 (quorum split) · S-14 (hidden results) · S-15 (pipeline, stage visibility) · S-16 (copy-paste text) · S-32 (former member's vote marked)
- **Epic 4.1** — S-17 (availability windows, manual path complete, freetext parser, confirmation always required)
- **Epic 4.2** — S-18 (heatmap, feasibility without solver, manual slots) · S-19 (solver port, household constraints) · S-20 (explainability, relaxation, time-limit answer) · S-21 (slot reactions)
- **Epic 4.3** — PRD §4.0.2 row 13 / Screen-Inventar O10 (moderator confirms without full agreement) · S-51 (attendance assumed, self-cancel) · S-22 (structured prompts, "write as if they could read it") · S-46 (note reminder)
- **Epic 5.1** — S-23 (round 2, same scale) · S-24 (veto ranks low, budget counter, anonymity honesty, phase lock)
- **Epic 5.2** — S-25 (room and move-in details, provisional allowed) · S-15 (audited backward transitions) · S-26 (calendar) · S-27 (who did what)
- **Epic 5.3** — S-27 (factual news reaches everyone) · S-42 (invite token) · S-31 (visibility invariant) · E-13 (explicit add to running round) · S-32 (immediate access loss, votes stay counted)

**The 13 as-is process steps** from `01-Problem-Framing.md`, mapped to activities:

- Steps 1 to 3 (posting, applications arriving, copying into the chat) — Activity 2
- Step 4 (voting on who to invite) — Activity 3
- Step 5 (telling applicants they are invited) — Activity 3, Epic 3.3
- Step 6 (finding a time) — Activity 4, Epics 4.1 and 4.2
- Step 7 (the casting itself) — Activity 4, Epic 4.3
- Step 8 (informing those who were absent) — Activity 4, Epic 4.3
- Step 9 (voting on the offer) — Activity 5, Epic 5.1
- Steps 10 to 12 (messaging the applicant, their answer, telling everyone) — Activity 5, Epics 5.2 and 5.3
- Step 13 (communicating the move-in date) — Activity 5, Epics 5.2 and 5.3

---

## Appendix B — Non-negotiables check

Each of the five must-holds from `01-Problem-Framing.md`, and where this map shows it.

**P-1 Channel neutrality.** Nothing in the map requires a link. Applications can be typed
(Epic 2.2). Availability can be entered by hand for residents and for applicants (Epic 4.1).
Slots can be placed by hand when the solver is absent (Epic 4.2). No story assumes an
applicant has an account.

**P-2 Device neutrality.** Joining takes a name and a password (Epic 1.1), and nothing may be
installed before the first vote. Every voting, reaction and note story is phone-sized.

**P-3 Explainable over optimal.** Weights are shown before use (Epic 3.1). The score is
readable, not just the number (Epic 3.3). The proposal states why, an unsolvable case names
the constraint, and a timed-out calculation returns its best answer labelled as such
(Epic 4.2). The deadline and the quorum display, never block (Epics 1.2 and 2.1). Every
status change carries who did it and when (Epic 5.2).

**P-4 Reversibility.** Votes change while the round is open (Epic 3.1). A status can be taken
back and that is recorded (Epic 5.2). A closed round can be reopened (Epic 2.1). A veto ranks
low instead of deleting (Epic 5.1).

**P-5 No AI judging people.** No story asks for a recommendation, a shortlist, a summary of a
person, or a ranking produced by anything other than the residents' own votes. The parser
extracts fields and a human confirms every one (Epic 2.2); a guessed time window is never
saved unconfirmed (Epic 4.1).

**Self-redaction on visibility.** Epic 5.3 carries it as an experience, not a setting, and
Epic 1.2 carries its quietest consequence: your own application never generates a task for
you.

---

## Appendix C — What this map deliberately leaves out

So the AI-challenge step does not report these as gaps.

- **Household admin account work** — registering the household, issuing the join code,
  appointing moderators, changing the voting method. Out of persona.
- **Applicant-only screens** — the availability token page. The applicant has no account, and
  that page is v1.1 anyway.
- **System internals** — the solver itself, notification delivery and channel fallback
  mechanics, the retention deletion job, the row-level-security layer, the data inventory
  CI gate.
- **Retention and deletion** — the 14-day warning and the extend/delete/archive decision.
  This sits after the journey's end and is moderation-heavy. Deliberate scope choice, not an
  oversight. The two compliance actions that *are* in the map are the per-applicant data
  export and the per-application delete (Epic 2.3), because a resident is the one who gets
  asked.
- **Notification event preferences** — removed from Epic 1.3 in V1.2. It supports the epic
  but is not part of catching up; it is a settings detail, and settings screens are not epics.
- **Acceptance criteria** — they live in `03-PRD.md`. A story map is not the place.

---

## Appendix D — Facilitation notes

**One honest thing about the shape.** A story map is linear by construction. The real
product is not: a resident opens the app and gets a task list sorted by time pressure
(`07-Screen-Inventar.md` §2), not step 1 of 5. The left-to-right reading is a teaching
device. Say so out loud, or a participant will spot it and be right.

**Where the MVP line will get interesting.** Three places, worth watching:

- **Epic 1.2 versus Epic 3.1.** The task list is not a feature the product sells, but the
  core metric is participation above 80 percent. Cutting the task list to ship the voting
  cards is the most tempting cut on the board and probably the wrong one. Note that 1.2 is
  now the second-largest epic on the map — that is not padding, it is where the metric lives.
- **Epic 4.2.** The solver button is the shiniest sticky. The feasibility layer underneath it
  and the by-hand slot placement are what carry the day when the solver is missing.
  Participants tend to cut the wrong half.
- **Epic 5.3.** Self-redaction looks like a nice-to-have on a sticky and is the thing that
  separates the product from a WhatsApp group. It is also the hardest to retrofit, and it is
  the largest epic on the map for a reason.

**Suggested slicing question** instead of "what is MVP": *which stickies does one real WG
need to run one complete round without switching back to WhatsApp?* That is the v1 goal
already written in `02-SRD.md` §5.4.

---

## Appendix E — How epics are named and sized

Applied in V1.1 and V1.2, so later additions stay consistent.

### Naming

An epic name has to survive being read alone, pinned to a wall, by someone who has not read
the stories. Three tests:

1. **Does it name a thing, not a feeling?** "See what is expected of me right now" fails.
   "What is next, and who is waiting on me" passes.
2. **Could it be a screen name?** If yes, it is too technical. "Ranking page" fails;
   "A ranking I can check, an invite I can send" passes.
3. **Could it be a single story?** If yes, it is too small. The gloss line carries the detail
   so the name does not have to.

Where the product already has a good phrase, use it verbatim. "Tue 17:00 — 5 of 7 can make
it" is lifted from `02-SRD.md` S-20, and it explains the whole epic faster than any
paraphrase.

### Sizing

**An epic is not a fixed-size box.** Write the goal first, then ask what has to happen to
reach it, and let the count fall where it falls. This map runs from 4 stories (Epic 3.2) to 9
(Epic 1.2, 5.3).

Two signals that the grouping is off, not the count:

- **Fewer than four stories.** The goal is probably a story wearing an epic's name. Either it
  belongs inside a neighbouring epic, or the goal was written too narrowly.
- **A story that does not serve the goal.** Not a sizing problem — a placement problem. Move
  it to the epic whose goal it does serve, or drop it. Two examples from V1.1, both fixed in
  V1.2: "choose which events notify me" was a settings preference sitting in an epic about
  catching up, and "stop hearing about the round once I have moved out" was a membership
  change sitting in the same place. The first was dropped, the second moved to Epic 5.3 —
  which is what forced 5.3 to be renamed, because its goal had been drawn too narrowly around
  arrivals.

**Epic 3.2's drop to 4, V1.3.** The correction pass against the German source chain
(`Exercise 10/06-Correction-Pass-Findings.md`) found "... turn the second pass off for our
WG" crossing the persona boundary — changing the voting procedure needs a household or
individually-granted moderator permission the map's own Appendix C already excludes — and
removed it. That leaves Epic 3.2 sitting exactly on the "fewer than four" line without
crossing it, which is a real signal, not a rounding artefact: the goal may need widening to
admit a legitimately-sourced sixth story, or a 4-story epic may simply be the honest size of
"only ever a short chance to fix five-plus must-haves." Left for the facilitator — the audit
that found the problem does not get to invent the fix.
