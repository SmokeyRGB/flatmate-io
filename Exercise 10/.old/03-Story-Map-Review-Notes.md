# Story Map — Review Notes

### What I changed nothing about, what I would push back on, and how the map feeds your roadmap board

> **Status:** V1.0 · 2026-09-03
> **Belongs to:** `Exercise 10/02-User-Story-Map.md`
> **Nothing in `01-Problem-Framing.md`, `02-SRD.md`, `03-PRD.md` or `01-create-story-map-prompt.md` was edited.**

---

## 1. Decisions I made, and why

Three things the prompt left open. You picked all three; recording them so the map can be
re-derived later.

**Language: English.** All source documents are German. The map is English because you said
so. Domain names (`Application`, `Vote`, `CastingNote`) were always going to be English
anyway (ADR-012), so the seam is small.

**Five activities, not four.** Your Miro template has four Theme/Epic columns. The journey
needs five steps to run from joining to move-in without a hole. Adding a column in Miro is
cheap; cutting a journey step to fit a template is not. See section 4 for how the five map
onto the board.

**Journey ends at move-in plus self-redaction.** The prompt says "up to welcoming the person
who moves in". I read self-redaction (S-31) as part of that welcome, because it is the thing
the new flatmate actually experiences on day one. Retention and deletion (S-33) stay out.

---

## 2. One reading I applied without asking

**Moderator work is in the map.** The prompt says end users only, "residents, including
residents acting as moderators", and Lukas "occasionally moderates a round". So the
moderator is a resident wearing a second hat, not a separate persona.

This matters more than it sounds. In `07-Screen-Inventar.md`, 20 of the 41 screens sit on
the Organisation surface, and almost all of them are moderator work: create the round,
capture applications, build the schedule, confirm the appointment, make the offer, record
the reply. Leave those out and the backbone has holes exactly where the as-is process has
its steps 2, 3, 5, 6, 10, 11 and 13.

What I did leave out is the **household admin account** — registering the household,
issuing the join code, appointing moderators, changing the voting method. The prompt
excludes it, and S-50 makes it a genuinely different actor with no casting access at all.

---

## 3. Four things I would challenge

These are product observations, not edits. Nothing was changed in your files.

### 3.1 The prompt forbids MVP slicing; your roadmap template is nothing but slicing

`01-create-story-map-prompt.md` says: no MVP decision, no prioritisation, no scope removed.
Your reference image asks for an impact/effort matrix, quarters, and Now/Next/Later. Those
are opposite instructions.

They are not in conflict if they are two steps rather than one artifact:

1. Baseline story map — done, no line drawn
2. Workshop draws the MVP line on top of it
3. *Then* the roadmap board gets filled

The map is built to survive step 2 untouched, which is why the traceability appendix is
epic-level rather than baked into the stickies.

**My recommendation:** keep them as two Miro frames, not one. If they end up on the same
frame, participants will pre-sort while mapping, and you lose the "what did we cut, and did
we notice?" conversation, which is the whole point of the exercise.

### 3.2 The v1 scope is already cut, so an MVP line will feel like a formality

`02-SRD.md` §5.4 already assigns S-01 to S-51 to v1, and pushes the availability link,
`subject_statement` UI, points budget and text snippets to v1.1. That cut is argued and
documented. Participants who read the SRD will just redraw that line.

**My recommendation:** do not hand out §5.4 before the exercise. Let them draw a line from
the map alone, then reveal §5.4 and compare. The gap between the two is the actual lesson,
and it is more interesting than either line on its own.

### 3.3 The map is linear; the product is not

The resident's real entry point is a task list sorted by time pressure
(`07-Screen-Inventar.md` §2, S-48). A resident can have a note, a slot reaction and two
kinds of vote open at the same time. The left-to-right backbone is a mapping convention, not
how anyone uses the thing.

I flagged this in Appendix D of the map rather than distorting the backbone to match. But it
is worth saying out loud in the session, because a sharp participant will spot it.

### 3.4 The three stickies most likely to get cut wrong

Named in the map's Appendix D, repeated here because they are the facilitation payload:

- **The task list (Epic 1.2).** It is not a feature anyone would name in a pitch, and the
  core metric is participation above 80 percent. It is the most cuttable-looking sticky on
  the board and probably the least cuttable in reality.
- **The feasibility layer under the solver button (Epic 4.2).** "Calculate a proposal" is the
  exciting one. Greying out slots a candidate cannot make is the one that still works when
  the solver is down (`03-PRD.md` §6.2). Participants tend to keep the wrong half.
- **Self-redaction (Epic 5.3).** Looks like polish on a sticky. It is the difference between
  this product and a WhatsApp group, and `02-SRD.md` §5.4 explicitly says it cannot be
  retrofitted because it touches every query.

---

## 4. Mapping the map onto your roadmap board

Your image has four boards. Here is what feeds each, once the MVP line exists.

**Board 2, Feature Themes/Epics — your note says "alle".** Use the five **activities** as
the theme columns, not the fifteen epics. Fifteen columns is unreadable; five is a backbone
someone can hold in their head. Add the fifth column to the template.

- Theme 1: Join the round and know what is on me
- Theme 2: Get every application into one place
- Theme 3: Pick who we invite
- Theme 4: Get everyone to the casting, and everyone informed
- Theme 5: Decide, offer, and welcome the new flatmate

**Board 1, Impact/Effort matrix (optional).** Place **epics**, not stories. Fifteen items is
right for a matrix; seventy-one is not. Impact should be argued against one number only:
does this epic move the participation rate above 80 percent (E-24)? That keeps the
conversation off "it would be cool if".

**Board 3, Roadmap by quarter — or Board 4, Now/Next/Later.** Your note says "entweder 3
oder 4". Take Board 4.

Reason: quarters imply you know how long things take, and nothing in this document chain
gives an estimate. `02-SRD.md` §5.4 names phases (v1, v1.1, v1.2, v2) with dependencies but
no dates, on purpose. Now/Next/Later says the same thing without inventing a calendar. If
you use Board 3 anyway, label the columns v1 / v1.1 / v1.2 / v2 rather than Q1 to Q4 — then
it matches the SRD instead of contradicting it.

**A warning about the fill order.** The template invites you to fill the matrix first. Do
not. Filling impact/effort before the MVP line has been drawn turns the exercise into
estimation, and the participants have not read the spec deeply enough to estimate anything.
Order that works: map, then line, then matrix, then Now/Next/Later.

---

## 5. What is in the map, in numbers

- 5 activities
- 15 epics
- 102 stories, ranging from 5 to 9 per epic
- 0 acceptance criteria, 0 technical stories, 0 MVP decisions

Story counts are derived from each epic's goal, not from a quota. The prompt's "1 to 5 per
epic" cap was lifted on your instruction; the caps on activities (5) and epics per activity
(3) still hold. Sizing rule in map Appendix E.

Coverage against `02-SRD.md` §5.3: every resident-facing scope line from S-03 to S-51 is
represented at epic level. The lines with no sticky are, by design, S-01, S-02, S-04, S-05,
S-33, S-35, S-36, S-37, S-41, S-43, S-50 — household admin, retention automation,
authorisation internals, the data inventory gate, and the v1.1 items. Appendix C of the map
lists these so an AI review does not report them as gaps.
