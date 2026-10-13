## Why

F4's screening pass (change 1, `screening-pass`) records votes, but nothing can withdraw one yet,
and no vote change leaves a trace in the activity log. F5 change 4 `candidate-revise` puts the
withdraw control on the D2 card and needs the function underneath first. The pass also still
lacks digit shortcuts, and finishing it gets no reward moment beyond Start's single sentence.
This change is the last piece before F5 change 4 (`~/.claude/plans/f4-screen-and-vote.md`,
Part 3 §2).

## What Changes

- **Withdrawal (FR-4.14, AC-4.15).** A new repository function `withdrawVote` marks the caller's
  live `invite` vote on an application as withdrawn and never deletes it. It goes through the same
  database guard (`vote_guard`) and takes the same locks in the same order as `castVote`. A
  closed round, a non-participant, the voter's own application and an application that is no
  longer `new`/`screened` are refused with typed codes. Rating again clears the mark (already
  true, D3 of change 1). This change has **no UI entry**: C1 gets no withdraw control (C1 decision
  2026-09-15), and D2's control is F5 change 4.
- **Vote events (PRD §4.2, F-18).** `vote.cast`, `vote.revised` and `vote.withdrawn` are written
  in the vote's own transaction through audit's one write path. The subject is the application.
  The payload is `{stage}` only and never the value (G-D7). Re-rating with the same value writes
  nothing and records no event. **Behaviour change:** before this change, a same-value re-rate
  bumped `updated_at`; now it leaves the row untouched.
- **Digit keys 1–4 on C1 (F-17, FR-4.20).** On desktop, the digit keys rate the current card with
  the scale's four values, in the buttons' order. They are ignored inside a text field, with a
  modifier, while the weights pop-over or any dialog is open, and while a rating is pending.
- **Completion praise (B1, human decision 2026-09-30).** After a pass in which the resident rated
  at least one card, the Casting tab shows a celebratory toast („Geschafft! Deine Stimmen sind
  drin."). Start's existing acknowledgement becomes the Design System's celebratory banner, with a
  heading and the decided body text. The condition when it shows is unchanged.
- **Telemetry `vote_cast`: no change.** The register row already exists (`docs/review-log.md`,
  „Telemetrie `vote_cast`", open until a sink is decided).

Sources, quoted from `docs/backlog/requirements/F4-requirements.md`:
- FR-4.14: *"Withdrawing a rating shall be recorded as a withdrawal, not by removing the record.
  (V1.1: a later rating of the same application updates that row and clears `withdrawn_at`.)"*
- AC-4.15: *"Given I withdraw a rating, when the record is inspected, then the rating still exists
  marked as withdrawn."*
- EC-4.7: *"A resident rates, then their eligibility is withdrawn — The rating stands."*
- FR-4.20: *"The pass shall be fully operable by keyboard."*

From `docs/03-PRD.md` §5.1, the telemetry event `vote_cast` (*"`round_stage`, Stufe, ob Änderung
einer bestehenden `Vote`"*) stays out of scope. From `docs/GUARDRAILS.md`, G-D7: *"Ein
Beratungsereignis darf **nur Referenzen und Zähler** tragen — … `{value: "no"}` und jeder Freitext
sind es nicht."* From `screens/B-start.md` B1: *„der Moment nach der letzten eigenen Stimme wird
anerkannt, nicht nur gemeldet."*

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `deliberation/vote-recording`: a same-value re-rate changes nothing. Adds withdrawal and the
  three vote events.
- `deliberation/screening-pass`: adds the digit keys. Completion adds the toast.
- `start/next-action`: the acknowledgement becomes a banner with a heading and body. Adds a
  scenario where a withdrawal takes it away.

## Guardrails touched

- **G-C (authorization):** `withdrawVote` is a new mutator. It checks the stored `vote`
  permission inside its transaction, as `castVote` does, and `vote_guard` decides the rest. The
  authorization-matrix test classifies it as refusing a non-participant with a code.
- **G-D7 (no value in an event payload):** the three new event types are registered with keys
  *and* value rules. `stage` is the only key, and it must be a `vote_stage` value.
- **G-D15 / V-1, V-4:** these are unchanged and relied on. The toast and banner reveal nothing
  about other residents' votes.
- **G-L (P-5):** not touched.

## Assumptions (for human review)

1. **A re-rate after a withdrawal is `vote.cast`, not `vote.revised`.** The vote becomes live
   again. `vote.revised` means a live vote changed value. F5's "changed since your vote" marker
   may later read these events.
2. **Withdrawing when there is no live vote is refused as `not_found`.** That covers no vote at
   all and a vote that is already withdrawn. It is not a silent success, so a non-participant
   gets a refusal with a code (authorization matrix).
3. **Start's banner condition needs no new count.** The plan proposed extending
   `getAwaitingVoteCounts` with a rated count. That is unnecessary: the condition built in F5
   change 1 (may vote, something open for voting, an explicit 0 awaiting) already implies at
   least one live vote. A withdrawal makes that candidate await the resident again, so the
   banner disappears.
4. **The banner heading keeps today's string** („Stark gemacht — du hast für alle Bewerbungen
   gevotet!"). The plan and the current spec say „… alle Bewerbungen bewertet!". The wording is
   confirmed by the human in review (2026-10-12): the code's string stays.
5. The toast follows an earlier pass that rated at least one card, through `?rated=1` on
   `/casting`, the pattern `SavedToast` already uses. A hand-typed URL shows the toast too. That
   is harmless, since it reveals nothing.

## Impact

- `src/modules/deliberation/repository.ts`: `withdrawVote`, plus `castVote`'s conditional
  upsert and its events.
- `src/modules/audit/repository.ts`: three allowlist entries with value rules.
- `src/app/(resident)/casting/screening/screening-deck.tsx`: digit keys, and the `?rated=1`
  hand-off.
- `src/app/(resident)/casting/page.tsx`: the toast. `src/ui/success-toast.tsx`: a celebratory
  variant. `src/app/globals.css`: the check mark and stars, with a reduced-motion fallback.
- `src/app/(resident)/dashboard/page.tsx`: the banner. `src/ui/strings/de.ts` and `en.ts`: the
  new strings, as twins.
- Tests under `tests/integration/deliberation/`, `tests/unit/audit/`, the authorization matrix,
  and unit tests for the deck and the dashboard view.
- **No migration**: `withdrawn_at` ships in 0028, and `event_type` is `text`. There is no
  dependency change.
