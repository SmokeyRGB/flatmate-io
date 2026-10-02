## Why

F4 (screen C1, scope lines S-09/S-10) is the product's most frequent action and has no code yet:
`/casting/screening` is a placeholder and there is no `vote` table. The packet's own scope line is
*"An eligible resident works through every open application of the round, one card at a time,
giving each exactly one of four ratings whose weights are shown before use"*
(`docs/backlog/requirements/F4-requirements.md` §1). This change is the pitch path: it has to make
C1 presentable on the Demo-WG next week. The plan behind it, including the human's review round
of 2026-09-30, is `~/.claude/plans/f4-screen-and-vote.md` (Part 3 §1).

## What Changes

- **Packet V1.1 and spec corrections (first commit, docs only).** The F4 packet predates F2 and F3.
  The corrections, from the plan's Part 1:
  - define "open for screening" (F-1);
  - cite the frozen weights by field (F-2, `settings_snapshot.scaleWeights`);
  - v0.1's `stage_open` (F-3), the own-application link (F-4) and the card fields (F-5);
  - `household_id` on `Vote` in `docs/domain/deliberation.md` (F-6);
  - reword EC-4.12 to the 2026-09-15 C1 decision (F-7);
  - after the last card, a D1 shell (F-8);
  - EC-4.3 under V-2 (F-9);
  - AC-4.9 through the audited override (F-10);
  - AC-4.8 aligned with PRD §4.1.4, "abrufbar ohne den Bildschirm zu verlassen" (F-11, human
    decision Q-3);
  - German labels (F-12) and the DB half of FR-4.3 (F-13);
  - the C1 access line (F-14), dependencies (F-15), offline buffer out of scope (F-16);
  - a11y (F-17), nothing extra during the pass (F-19), re-pointed citations (F-20).

  Register rows in `docs/review-log.md`: V-2's RLS deferred and due before the first real
  household (Q-1), the vote read and delete policy until F5 / F3 change 4, telemetry `vote_cast`,
  and the camelCase snapshot key.
- **Migration `0028`**: the `vote` table (C-4.5 uniqueness), its two enums, household isolation,
  the RESTRICTIVE profile policy (G-D15 (b)), a RESTRICTIVE own-profile write policy, and a
  non-definer trigger `vote_guard`. The trigger refuses in the database what FR-4.15 and FR-4.2
  refuse:
  - a round that is not `open`;
  - a voter without an active, voting participation;
  - an application that is not votable or not paired with the round;
  - the voter's own application.

  A second non-definer trigger, `application_keeps_votes`, refuses moving a voted application to
  another round or household. This is the parent side of the pairing.
- **New module `src/modules/deliberation/`** (ADR-001, `docs/domain/kontextgrenzen.md` §4): the vote
  schema and repository, and a pure scale-weights parser. It reads casting data only through query
  ports that casting exports. SQL never joins across the two contexts.
- **"Awaiting my vote" gets one definition.** It is the round's applications in `new`/`screened`,
  minus the viewer's own, minus those holding the viewer's non-withdrawn `invite` vote. The deck
  and Start's T-5 count both use it. The `notVotedByViewer()` stub in casting is deleted, and
  Start's count moves to deliberation. **BREAKING (internal):** `StartOpenRound.voteCount` leaves
  casting's `getStartOverview`.
- **C1 replaces the placeholder at `/casting/screening`:**
  - a card deck with name, age, message and attributes, and no contact field (Q-2);
  - four rating buttons with symbol and label, and a small „(?)" that shows the round's frozen
    weights (Q-3);
  - progress „n von N" and an empty state;
  - navigation: swipe on touch, a back chevron on mobile, „Zurück" and ←/→ on desktop, and forward
    never passes an unrated card (Q-5 addendum);
  - a CSS-only deck animation with a reduced-motion crossfade.
- **`/casting` becomes a D1 shell** (heading „Rangliste" and one sentence, no scores). The last card
  leads there (Q-6). The redirect to C1 while votes are pending stays.
- Inventory and test plumbing: `data-inventory.yml`, cleanup set, the manifest's visibility pair,
  an authorization-matrix block for deliberation, `drizzle.config.ts`.

Not in this change: withdrawal, vote ActivityEvents, digit shortcuts, B1's acknowledgement (change
2); deletion during a pass (F3 change 4); V-2 RLS (F3 change 6); ranking, D2, hidden results (F5).

## Capabilities

### New Capabilities
- `deliberation/vote-recording`: what a vote is at the data level. It covers one rating per
  application, resident and stage, the refusals the database enforces regardless of caller,
  household isolation, and the household account.
- `deliberation/screening-pass`: the C1 screen. It covers the deck and its stability, the four
  ratings and the weights shown for them, navigation, progress, completion and the refusal states.

### Modified Capabilities
- `start/next-action`: T-5 counts only applications the viewer has not yet rated (non-withdrawn
  `invite` vote), and each round's task leads to that round's pass.
- `ui/resident-frame`: the screening step is no longer a placeholder, and the Casting tab shows the
  D1 shell instead of "arrives in a later slice".

## Impact

- **Guardrails touched:**
  - **G-C** (visibility and authorization). The deck is the first surface that shows applicant
    data to residents. V-2 is enforced in the repository and the trigger, and its RLS half is
    deferred by human decision Q-1 and recorded as open.
  - **G-C7**: vote table policy tests, both sides.
  - **G-D15**: vote rows require a resident profile.
  - **G-D** manifest: a new `vote_via_policy`/`vote_via_raw_sql` pair. G-D11 stays `pending`.
  - **G-F1/G-F3**: data inventory.
  - **G-J4**: nothing stored beyond the declared schema, and the client-held deck stores nothing.
  - **G-L/P-5**: untouched; no AI anywhere in the pass.
- **Code:** `drizzle/0028_vote.sql`, `drizzle.config.ts`, `src/modules/deliberation/*`,
  `src/modules/casting/repository.ts` (query ports, `getStartOverview`), `src/app/(resident)/casting/**`,
  `src/app/(resident)/dashboard/*`, `src/ui/strings/de.ts`, `data-inventory.yml`,
  `tests/helpers/identity.ts`, `scripts/cleanup-demo-household.sql`, `test/guarded.manifest.json`,
  `tests/integration/policy/authorization-matrix.test.ts`, `src/modules/identity/repository.ts` (a
  comment).
- **Docs:** `docs/backlog/requirements/F4-requirements.md` → V1.1, `docs/domain/deliberation.md`,
  `docs/domain/casting.md`, `docs/screens/C-beteiligung.md`, `docs/review-log.md`. No frozen file.
- **Dev DB:** `0028` is applied by the agent (no definer, no DROP COLUMN), and only after
  confirming that no other migration-carrying branch is in flight. F3 change 4's migration becomes
  `0029` or later. Production stays at `0012`.
- **No new dependency.** Gestures use Pointer Events, and the animation is CSS.

## Assumptions (recorded, not silently resolved)

- One pass covers one round. When several open rounds await the viewer's vote, each Start task
  carries its round, and `/casting/screening` without a round picks the newest one that still
  awaits the viewer.
- Rating sends the vote, and advances only once the server confirms (no optimistic advance). The
  pending state is shown on the tapped button.
- The deck's order is `created_at, id`, oldest first and the same for everyone (Q-7).
- A reload is a new pass (FR-4.4: fixed at pass start). The deck lives in the client only.
