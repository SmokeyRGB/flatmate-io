# Correction Pass — Prompt for a Fresh Conversation

> Paste everything below the line into a new Claude Code conversation opened at the repo root
> (`Ideas/Flatmate.io/`). Written to be run by a different model than the one that produced the
> artifacts, so it assumes no shared memory of how they were built.

---

## ROLE

You are a **specification auditor**. Your job is to fact-check a workshop artifact against the
specification chain it claims to be derived from, and to report every place where the artifact
says something the specification does not.

You are not a reviewer of taste. Do not comment on naming, structure, tone, or whether the
groupings are good. Those were decided by the author and are out of scope.

## CONTEXT

`Flatmate.io` is a documented product concept: a web app that consolidates the 13-step process
a shared flat (WG) goes through when casting a new flatmate. The specification chain is written
in **German**. A User Story Map was derived from it in **English** for a teaching workshop.

The translation seam is where the errors are. Every finding so far has been a case of English
prose quietly asserting something the German source does not say.

## SOURCE OF TRUTH — read these, never edit them

- `01-Problem-Framing.md` — problem statement, the 13 as-is steps, design principles **P-1…P-5**, framing decisions **E-01…E-27**
- `02-SRD.md` — scope lines **S-01…S-51** (§5.3), phases (§5.4), metrics, risks
- `03-PRD.md` — user groups (§4.0.1), main flow with branch columns (§4.0.2), screen specs (§4.1.x), business logic (§4.2.x), settings (§4.3), content rules (§4.6)
- `07-Screen-Inventar.md` — task model (§2), phase display (§3), the 41-screen catalogue (§7–8)
- `04-Domaenenmodell.md`, `05-ADRs.md`, `06-Compliance-Anhang.md` — consult when a claim touches data model, architecture or law

**Absolute rule: do not modify any file in the list above.** If a source is wrong or two
sources disagree, report it. Never fix it.

## ARTIFACT UNDER AUDIT

- `Exercise 10/02-User-Story-Map.md` — 5 activities, 15 epics, **102 stories**. This is the primary target.
- `Exercise 10/04-Feature-Themes-Board-Example.html` — a board rendering of the same 15 epics. Must stay consistent with the map.
- `Exercise 10/03-Story-Map-Review-Notes.md` — commentary and counts. Check its numbers only.
- `Exercise 10/01-create-story-map-prompt.md` — the brief the map was built from. **Read-only**, and note that the map deliberately diverges from its "1–5 stories per epic" cap; that divergence is authorised and is not a finding.

## THE TASK

Take **every one of the 102 stories, all 15 epic names, all 15 glosses, all 15 goal lines, and
all 5 activity names** and verify each against the sources.

For each, answer two questions:

1. **Is it true?** Does a source actually say this, and does the English say the same thing the German says?
2. **Can you point at it?** Give `file:line` and quote the German. If you cannot find a source, that is a finding — say "no source found", do not reason backwards to a plausible one.

Also verify:

- **Numbers.** Story counts per epic, per activity, and the total appear in the map header, in each epic, in `03-Story-Map-Review-Notes.md` §5, and in the HTML board (`<span>N stories</span>`, `col-sub`, the meta line, the "MOVE 3" text). Recount from the actual stories and check every occurrence agrees.
- **Traceability.** Map Appendix A cites `S-` lines only. Several stories derive from `E-` decisions, from PRD branch columns, or from Screen-Inventar edge-state rows instead. List every story whose real source is not an `S-` line.
- **Persona boundary.** The map covers residents, including residents acting as moderators. It must contain **no** story that only the household admin account can perform (see PRD §4.0.1 Rechtematrix and S-50), no applicant-only story, and no system-internal story (solver internals, notification delivery, retention jobs).

## KNOWN ERROR CLASSES — use these to calibrate

Six real errors have already been found and fixed. They are listed so you know what to hunt
for, not so you re-report them. Assume more of each class remain.

**1. Mistranslation that changes the mechanism.**
`vierstufige Skala` was rendered "four steps", which reads in English as a four-step process.
It is a four-**point** rating scale: one rating per applicant. Every domain term crossing the
language seam is suspect — check `Stufe`, `Runde`, `Durchlauf`, `Slot`/`Termin`,
`Frist`/`Deadline`, `Vorschlag`, `Schwelle`, `Budget`, `Quorum`, `Anzeige` vs `Sperre`.

**2. A formula compressed into a false claim.**
"when my must-have votes outnumber the rooms" was written for
`budget = max(1, ceil(open rooms × 1,5))` (PRD §4.1.5). With 3 rooms the budget is 5, so 4
must-haves trigger nothing. **Find every place the map states a threshold, count, or
comparison in prose and check it against the actual formula.** Candidates: the quorum
(`quorum_share = 0,5`, `Zähler ≥ ceil(0,5 × Nenner)` — "at least half", not "more than half"),
the veto budget (default 1), the retention window (180 days, 14-day warning), scale weights
(0/1/3/5), the score (mean scaled to 0–100, not a sum), the join-code expiry (7 days) and use
limit.

**3. Reading the wrong branch of a spec.**
"a pre-filled form when the parser finds nothing" — but PRD §4.1.3 says the nothing-found case
gives an **empty** form with the pasted text in the free-text field. "Pre-filled" is the
*success* branch. Check every story describing an error, empty, or fallback state against the
detailed §4.1.x section, not the summary table.

**4. A story sitting in an epic whose goal it does not serve.**
"stop hearing about the round once I have moved out" sat under an epic about catching up on
what happened while away. It is a membership-change story. Test each story against its epic's
stated **Goal** line.

**5. A supporting detail promoted to a story.**
"choose which events notify me" is a settings preference, not part of any epic's goal.

**6. A claim with no citable source.**
Report as "no source found". Do not invent one.

## KNOWN SOURCE CONTRADICTIONS — do not fix, extend the list

These are disagreements **inside the specification chain**, found during the build:

- **Parser finds nothing.** `03-PRD.md:239` (§4.0.2 branch column) and `07-Screen-Inventar.md:929` (screen O3) both say *"vorbelegtes Formular ohne Fehlermeldung"*. `03-PRD.md:453` (§4.1.3) says *"ein **leeres** Formular mit dem Text im Freitextfeld"*. The map follows §4.1.3.
- **Second-pass threshold configurability.** `03-PRD.md:1066` lists *"Feinschliff-Schwelle"* among voting-procedure settings that are locked during an open round, implying the threshold value is changeable. `03-PRD.md:1153` (§4.3) exposes only an on/off toggle for the second pass, no threshold field. Unresolved.

Report any further contradictions you find in the same shape: both locations, both wordings,
and which one the artifact currently follows.

## OUTPUT

Produce a findings report as a markdown file at
`Exercise 10/06-Correction-Pass-Findings.md`. One row per finding:

- **ID** — F-01, F-02, …
- **Location** — file and the exact line or story text in the artifact
- **Class** — one of the six above, or "source contradiction", or "count mismatch"
- **Severity** — `wrong` (states something false) · `unsourced` (no source found) · `imprecise` (true but misleading) · `misplaced` (wrong epic)
- **Source** — `file:line` plus the German quote
- **Proposed wording** — the corrected English, or "delete", or "move to Epic X.Y"

Order the findings **most severe first**. End with:

- the recomputed counts (per epic, per activity, total)
- the list of stories whose source is not an `S-` line
- any new source contradictions
- a one-paragraph statement of what you checked and what you could not check

**Then stop.** Do not apply any correction until the author has read the report and told you
which findings to fix. When they do, apply fixes only to files under `Exercise 10/`, and keep
`02-User-Story-Map.md` and `04-Feature-Themes-Board-Example.html` in sync with each other.

## RULES

- Verify by reading the source, not by judging plausibility. A story that sounds sensible and has no source is a finding.
- Quote the German. A finding without a quote is not a finding.
- Do not restructure, rename, re-group, or re-prioritise anything. Not your call.
- Do not add stories. If the map is missing something the spec requires, note it in the closing paragraph as an observation, not as a fix.
- The map deliberately excludes: household-admin work, applicant-only screens, system internals, and retention/deletion (see map Appendix C). Absence of those is not a finding.
- If a source genuinely does not settle a question, say so plainly. Do not pick the reading that makes the artifact correct.
