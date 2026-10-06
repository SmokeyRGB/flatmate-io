> **Read first:** proposal.md, design.md (D1–D9, Non-Goals, Risks), the four delta specs, and
> `.claude/rules/implementation-hazards.md`. The plan's Part 1 (findings F-1…F-28) and its review
> rounds are in `~/.claude/plans/f5-ranking-hidden-until-you-vote.md`.
>
> **Conventions:**
> - Branch `feat/ranking`.
> - Code, comments and commits are in English. `docs/0x`, `docs/domain/*`, `docs/screens/*` and
>   `docs/review-log.md` are in German. `docs/backlog/**` and `docs/COVERAGE.md` are in English.
> - Never add AI attribution to commits.
> - Read only PRD excerpts (§4.1.6 around l.681–725, §4.2.3–4.2.5 around l.1170–1215), never the
>   whole file.
> - The TypeScript target is ES2017: **no BigInt literals** (`10n` fails `tsc` with TS2737). Use
>   `BigInt(…)`.
>
> **Order matters.**
> - Group 1 is its own commit, before any code.
> - There is no migration and no database hand-off, except the demo reset in group 9, which the
>   human runs.
> - Every test task names a break. Make the break, run the one test file, see it fail, revert,
>   and report the failure text.
> - A break may be argued instead of run only where a task says "invariant guard".
>
> **Fixtures:**
> - Use `tests/helpers/pipeline.ts` `setupPipeline` and `claimPlainMember`, and
>   `tests/helpers/votes.ts` (`setRoundStatus`, `setRemoved`, `addParticipation`,
>   `rawVoteInsertSql`, `votableApplication`).
> - `setupPipeline` gives one `planned` room. A round over several rooms needs `createRoom` per room
>   plus `createAndOpenRound` by hand.
> - A claimed active resident joins every open round, through the snapshot plus auto-join. Build a
>   non-participant with `insertTestRound` and no participation rows.
> - Cast votes through `castVote` in each voter's own context.
> - `vote.withdrawn_at` can only be set in the voter's own context while the round is open
>   (own-profile UPDATE policy plus `vote_guard`).
> - Move-out, removal and reactivation go through the real identity paths (`setMovedOut`,
>   `removeMember`, `reactivateMember` in `identity/repository.ts`).
> - Each Auth claim costs seconds on dev. Build the multi-voter fixtures once per `describe` and
>   keep each test under the 60 s timeout. Teardown goes in `afterEach`/`afterAll`, never in a
>   `finally`.

## 1. Packet V1.1 and spec corrections (first commit, docs only)

- [x] 1.1 `docs/backlog/requirements/F5-requirements.md` → **V1.1 · 2026-10-05**. Each change whose
  meaning differs gets a one-line "(V1.1: …)" note:
  - **F-1:** FR-5.4, FR-5.6 and FR-5.15 read `round.settings_snapshot` keys `scaleWeights`,
    `quorumShare`, `hideResultsUntilVoted`.
  - **F-3 / Q-7:** EC-5.5 and EC-5.6 add "share outside (0, 1]", "a value not readable as a plain
    decimal" and "hide flag not boolean". EC-5.8: 1.0 is permitted, and the warning belongs in the
    settings form, later.
  - **F-4:** FR-5.29 and AC-5.24 read "linked to any resident profile of the viewer's account".
  - **F-5:** EC-5.11 reads "absent; an emptied ranking shows the same empty state as any other,
    never a reason".
  - **F-7:** C-5.12 and C-5.13 apply to V-1/V-2 only. V-4 is enforced in the read
    (`invarianten.md` §5.5).
  - **F-8:** FR-5.16 adds "a withdrawn vote hides again".
  - **F-10 / Q-2:** FR-5.19a and AC-5.19a are met by the redirect: the Casting tab leads to the pass
    while anything in an open round awaits the viewer, so the scoreboard is reachable only once
    nothing does, and no hint is needed on it. The "round" means the round's `invite` stage.
  - **Q-3:** FR-5.10 and AC-5.9 read "one scoreboard: unscored rows at its bottom, oldest first, with
    count and threshold, no score; hidden rows greyed below it".
  - **Q-6 / R-4:** FR-5.8 and EC-5.14 say votes count only while their voter is in the
    denominator. Moved out or removed, the vote leaves score, numerator and denominator;
    reactivation restores it. Mark A-5.1 struck. Rewrite §7 "Deferred behaviour" to match.
  - **Q-9:** mark FR-5.31, FR-5.32, AC-5.26 and US-5.10 as **"struck (V1.1, human decision Q-9)"**.
    IDs are permanent, so never delete them. An own application is refused like a missing one.
    Also resolve §8 item 1, the open question about FR-5.31/5.32's wording.
  - **Q-5:** FR-5.19b and AC-5.19b say names are v0.2, and a per-application count follows with
    the detail card.
  - **Q-10:** FR-5.20 and AC-5.20 put the distribution on the detail card only.
  - **F-25:** define `round_half_up` as "x.5 rounds up, computed exactly".
  - **F-26:** C-5.14 cites G-C6/G-D5, G-D7, G-D6. Re-point `04-Domaenenmodell.md` §8.1 citations
    to `domain/rechenmodelle.md`.
  - **R-6:** add the top-N highlight as FR-5.13a with an AC.
  - Bump the header status line.
- [x] 1.2 `docs/02-SRD.md` S-32: amend per Q-6. „Die Stimme eines ehemaligen Mitglieds zählt nicht
  mehr — weder im Score noch in Zähler und Nenner; bei Reaktivierung zählt sie wieder" (human
  decision 2026-10-05). Keep the marker as v0.2. Leave the old reasoning as a dated
  „Vormals:"-note, so the change is traceable. The commit message records the human decision. If
  S-31's row names the own-application view, strike that part too (Q-9).
- [x] 1.3 `docs/03-PRD.md`:
  - §4.1.6: replace the separate „Warten auf Stimmen" section and its AC with Q-3's one-scoreboard
    shape. The AC „0/20/60/100" becomes „bei Standardgewichten" (F-25). „5 von 7" moves per
    application to the Einzelansicht (Q-5). The AC „Die verdeckte Darstellung nennt den Grund und
    führt mit einer Handlung in den Durchlauf" is met by the redirect (Q-2); say so.
    `reveal_before_own_vote` stays as a name (F-2, register only).
  - §4.2.3 and the line around l.1177: former members per Q-6.
  - §4.2.5: strike the own-application view (Q-9). The screen layer corrects the PRD by human
    decision.
- [x] 1.4 `docs/domain/invarianten.md`:
  - §5.3: `score_votes` counts only voters in the denominator, per Q-6/R-4. Amend the „Auszug
    während einer offenen Runde — entschieden" block with the human's decision and date, keeping
    the earlier reasoning visible as „vormals".
  - §5.4: the disjunct `¬ can_vote(session, round_of(application), stage)` must not reveal results
    to a voter who merely can no longer vote (paused round, application left `new`/`screened`).
    Human decision R-7: those rows stay hidden („Verdeckt — du hast hier nicht abgestimmt"). The
    exemption keeps its purpose — whoever is not a voter of the round at all — and in v0.1 such a
    session sees no ranking (V-2). Reword the predicate and detail 1 accordingly.
  - §5.1: add a note that `membership_account_id_unique` (0021) currently makes `redaction_subjects`
    a single profile, checked at runtime by the live-membership read (design D5).
- [x] 1.5 `docs/domain/rechenmodelle.md` §8.3:
  - pending sort `(a.created_at, a.id)`, on the board's bottom rather than a separate section
    (Q-3);
  - define `round_half_up` (F-25);
  - former members per Q-6;
  - the top-N highlight with its tie rule (Q-15).
- [x] 1.6 `docs/screens/D-casting-tab.md`:
  - D1: one scoreboard, progress ring, unscored rows at the bottom, hidden rows greyed below with
    eye-off and the one notice „Verdeckt — du hast hier nicht abgestimmt", top-N highlight,
    screen-level „(?)", and the empty state per design (human-approved 2026-10-06). The state
    „Eigene Stimme fehlt" is handled by the redirect to C1 (Q-2).
  - D2: distribution, arithmetic and „5 von 7" go here (changes 2 and 3).
  - D3: struck (Q-9). Fix D2's „Selbst-Redaktion greift" row.
  - Do **not** touch `07-Screen-Inventar.md` (frozen).
- [x] 1.7 `docs/domain/casting.md`: name the snapshot keys `scaleWeights`, `favoriteBudgetFactor`,
  `hideResultsUntilVoted`, `quorumShare` (string from `numeric`) as stored (F-1).
- [x] 1.8 `docs/review-log.md` §Offene-Punkte-Register. Each human decision gets its text and date
  here, so the citations in `openspec/` resolve inside the repo:
  - the decisions Q-2, Q-3, Q-5, Q-6, Q-7, Q-9, Q-10, Q-12, Q-15, R-4, R-6 and R-7 of 2026-10-05,
    one line each, as decided;
  - U-27 („aus Punktestand auszunehmen") confirmed by Q-6;
  - V-1 database half: due before the first real household (change 4), noting D5's dependency on
    0021's indexes;
  - telemetry for hidden results (F-28), no sink;
  - suggested G-D16 (NO_SCORE/0 pair) and G-D17 (V-4 server-side) for a later human decision
    (F-27);
  - the dangling „§7.13" in `rahmenwerk.md` §6 and `A-zugang.md` (F-6);
  - `reveal_before_own_vote` vs `hide_results_until_voted`, the domain name being authoritative
    (F-2);
  - closing a round must freeze the denominator and the former-member basis (F-12, R-4), and G-D2's
    closed-round half becomes testable then (stays `pending`, human 2026-10-06, F3 finalization);
  - the settings write path validates neither `quorum_share` nor the weights. A bad value frozen
    into a round makes that round `rules_invalid` for good (Q-7, plan change 5);
  - the Casting tab may later need sub-tabs by stage, because an application's standing is
    individual (one invited or moved in while others still wait, and later several voting rounds):
    each applicant would be shown under their own stage. Human idea 2026-10-06, open, no owner yet.
- [x] 1.9 Fix the ranges that name the struck IDs, in the same commit:
  - `docs/COVERAGE.md` l.36 and l.84 („FR-5.29–FR-5.32; AC-5.24–AC-5.27");
  - `docs/backlog/stubs/EP-E-3-zu-und-abgaenge.md` l.30.
  Then `grep -rn "FR-5.3[12]\|AC-5.26\|US-5.10" docs/` shows only the struck entries themselves.
- [x] 1.10 Run `node tools/check-refs.ts` (all 7 rules), plus `node tools/check-refs.ts --scope docs`.
  No line under `docs/` may point into `openspec/`. Commit as `docs(f5): packet V1.1 and chain
  amendments for the ranking (human decisions Q-2, Q-3, Q-6, Q-9, R-6, R-7)`.

## 2. Frozen-rules parser (design D2)

- [x] 2.1 Rename `src/modules/deliberation/scale-weights.ts` → `round-rules.ts` (`git mv`). Update
  the imports in `deliberation/repository.ts` and `casting/screening/screening-deck.tsx` (type
  only).
- [x] 2.2 In `round-rules.ts`, add the exact-decimal reader used by D1:
  - `toScaled(value): { units: bigint; scale: number } | null` reads a number via `String()`, or a
    string as given;
  - plain decimal only (`/^\d+(\.\d+)?$/`), any number of fraction digits, ≥ 0 by construction;
  - exponent notation, NaN, ±Infinity, a sign, whitespace or anything else gives `null`;
  - export a helper that brings several scaled values to one common scale (the largest `scale`),
    so D1 never adds values of different scales.
- [x] 2.3 `parseScaleWeights` additionally refuses when every weight is 0, or when any weight fails
  `toScaled`. `4.5` stays valid. The return type stays `ScaleWeights` (plain numbers, for the
  pass's popover). D1 re-reads them with `toScaled`.
- [x] 2.4 Add `parseRoundRules(snapshot: unknown)`. It returns `{ weights, quorumShare: { units,
  scale }, hideResultsUntilVoted }`, or `null` when any of these holds: weights invalid; share not
  readable; share ≤ 0 or > 1; hide flag not a boolean; snapshot not an object.
- [x] 2.5 Move `tests/unit/deliberation/scale-weights.test.ts` → `round-rules.test.ts`, and add
  cases:
  - all-zero weights;
  - `1e-7`;
  - `0.30000000000000004` reads exactly (17 digits);
  - share `"0.5"`, `"0.50"`, `0.5`, `"1"`, `"0"`, `"1.01"`, `"abc"`, `" 0.5"`, `null`;
  - hide flag `"true"`.
  Break: drop the max > 0 check; the all-zero case must fail.
- [x] 2.6 The pass now refuses all-zero weights (modified `screening-pass` spec). In
  `tests/integration/deliberation/screening-pass.test.ts`, add the "All weights zero" scenario by
  writing an all-zero `settings_snapshot.scaleWeights` (the existing malformed-snapshot case shows
  how), and assert `refused` with reason `rules_invalid`. Break: revert 2.3's check; the test must
  fail.

## 3. Pure ranking module (design D1)

- [ ] 3.1 Create `src/modules/deliberation/ranking.ts`, pure with no imports beyond
  `vote-values.ts` and `round-rules.ts`.
  - `computeRanking({ weights, quorumShare, denominator, openRoomCount, candidates })` returns
    `{ scored, unscored }` as D1 describes.
  - The comparator is the 7-key tuple with a constant-0 `vetoPenalty` first.
  - Bring all weights to one common scale first. Then
    `score = floor((2·Σw·100 + n·max) / (2·n·max))` and `needed = ceil(units·d / 10^scale)`, all
    in BigInt via `BigInt(…)` (no literals).
  - `leading` is set on the first `min(openRoomCount, scored.length)` rows.
  - `unscored` is ordered `createdAt, id`. Compare ids as strings; `createdAt` by `getTime()`.
  - An unscored row has **no** `score` key at all.
  - Header comment cites `rechenmodelle.md` §8.1/§8.3 and FR-5.1/5.6/5.11.
- [ ] 3.2 Create `tests/unit/deliberation/ranking.test.ts`. One `it` per item:
  - AC-5.1 (55), AC-5.2 (100), AC-5.3 (0 is a score);
  - AC-5.4 / C-5.1: for an unscored row, `"score" in row` is false and `JSON.stringify(row)`
    contains no `score`;
  - AC-5.7 and AC-5.8 (needed at 7 and 6);
  - EC-5.1, EC-5.2, EC-5.3;
  - AC-5.11–5.14, each tie key isolated;
  - a 54.5 → 55 case built from fractional weights so that floats misround (find one and assert
    the float version differs, as proof);
  - mixed scales: weights `{0, 1, 4.5, 5}` give the hand-computed score;
  - share `0.1` × 30 → 3, not 4;
  - N = 0, N > rows, and a tie at the boundary (exactly N lead);
  - determinism: shuffled input gives the same output.
  Breaks:
  - swap keys 3 and 4 → AC-5.11/5.12 fail;
  - replace the score's BigInt with `Math.round` on floats → the 54.5 case fails;
  - replace `needed` with `Math.ceil(share * d)` on floats → the 0.1 × 30 case fails;
  - give unscored rows `score: 0` → the AC-5.4 case fails.

## 4. Casting ports (design D3)

- [ ] 4.1 `src/modules/casting/repository.ts` `listVoteCandidatesTx`:
  - the options become `{ scope: "votable" | "board"; fields: "ids" | "names" | "cards" }`, typed
    so that `scope: "board"` with `fields: "cards"` does not compile;
  - the state lists are fixed inside casting: `votable` = `new`/`screened`, `board` =
    `new`/`screened`/`invited`;
  - add `state` to `VoteCandidate`;
  - `"names"` selects `applicant_name` only, returned as a top-level `applicantName`; `card` stays
    for `"cards"` only;
  - extract the active-voter condition (participation of the round not removed, `can_vote`,
    profile `active`, every join household-matched) into one private SQL fragment, used by this
    port's `EXISTS` and by 4.2 (DRY, design D3);
  - rewrite the comments that state the old narrowness, around l.55–57, l.76, l.248 and the port's
    header, with design D3's widening justification.
- [ ] 4.2 In the same file, add `getRoundTallyBasisTx(tx, context, roundId)` per D3:
  - it throws `ProfileRequiredError` when the profile is null, before any query;
  - it returns `null` for a non-UUID;
  - one query reads the counted voters (the shared fragment) and one the open-room count;
  - it returns `null` when `context.profileId` is not among the counted voters (its own guard);
  - otherwise it returns `{ countedVoterIds, openRoomCount }`;
  - every join carries `household_id`;
  - add it to the port comment block.
- [ ] 4.3 Update every caller of the old `{ withCard }` option:
  - the three in `deliberation/repository.ts` (`withCard: false` → `{ scope: "votable", fields:
    "ids" }`, `true` → `"cards"`);
  - `tests/integration/deliberation/screening-pass.test.ts` around l.178, 188, 192, 263, 277;
  - `tests/integration/policy/vote-household-account.test.ts` around l.64.
  The key-set assertion in `screening-pass.test.ts` (around l.265) gains `state`, on purpose. Then
  `grep -rn "withCard" src tests` is empty.
- [ ] 4.4 Direct port tests:
  - in `screening-pass.test.ts` (or a new `ranking.test.ts` block), call `getRoundTallyBasisTx`
    for a non-participant and expect `null`, and for a participant expect their id among
    `countedVoterIds`. Break: drop the own-result guard; the non-participant case must fail;
  - in `listVoteCandidatesTx`, `scope: "votable"` never returns an `invited` row, and `"board"`
    never returns a `rejected_by_household` or `withdrawn` row. Break: add `invited` to `votable`;
    the deck case must fail.
- [ ] 4.5 `tests/integration/policy/vote-household-account.test.ts` (registered for G-D15): add
  `getRoundTallyBasisTx` to "the two casting ports throw ProfileRequiredError", following that
  file's `vi.mock("@/db/session-context")` pattern. Break: move the profile check below the first
  query; the test must fail.
- [ ] 4.6 `tests/integration/policy/authorization-matrix.test.ts`:
  - add `getRoundTallyBasisTx` to the casting port classification (beside `listVoteCandidatesTx`,
    around l.117–125), with its visibility tested in `ranking.test.ts`;
  - extend the "no caller outside casting and deliberation's repository" assertion (around
    l.261) to the new port.
  Break: import the port in any `src/app` file; the assertion must fail.

## 5. `getRanking` (design D4, D5)

- [ ] 5.1 `src/modules/deliberation/repository.ts`: add `getRanking(context, roundId: string |
  null): Promise<Ranking>`, with the `Ranking` union and the `ScoredRow`, `UnscoredRow` and
  `HiddenRow` types.
  - Follow D4 steps 1–9 exactly, in one `withSessionContext`, with no nested context.
  - `assertHasPermissionTx` keeps its default `FOR SHARE` lock (design Non-Goals).
  - `HiddenRow` is `{ applicationId, applicantName, state }` and nothing more, ordered `createdAt,
    id`.
  - Scored and unscored rows carry `applicationId`, `applicantName`, `state`, plus the module's
    fields.
  - `null` from `getRoundTallyBasisTx` → `refused: not_eligible` (D4 step 6). Never throw, never
    `rules_invalid` for it.
  - No awaiting count, no hint data (design Non-Goals).
  - The comment cites the matrix decision: a read, `vote` permission first.
- [ ] 5.2 `authorization-matrix.test.ts`: classify `getRanking` in `NOT_APPLICABLE_DELIBERATION`
  as "read; visibility tested in tests/integration/deliberation/ranking.test.ts". Break: remove
  the entry; the "every exported function" test must fail.
- [ ] 5.3 `vote-household-account.test.ts`: `getRanking` with a profile-less context throws
  `ProfileRequiredError` and issues zero queries, in that file's mock pattern. Break: move the
  check inside `withSessionContext`; the zero-query assertion must fail.

## 6. Integration tests: `tests/integration/deliberation/ranking.test.ts`

Header comment: G-D2 stays `pending` (human decision 2026-10-06). 6.6 covers its open-round half,
and the closed-round half follows in the finalization of F3. `guarded-tests.ts` checks only
`implemented` entries, so deleting this file turns nothing red until then. Assert result kinds and
reason codes, not only lengths.

- [ ] 6.1 **Frozen rules** (AC-5.5, F-1). After opening, change `scaleWeights.good` to 4,
  `quorumShare` to `"1"` and `hideResultsUntilVoted` to `false` via `updateHouseholdSettings`
  (allowed while open since 2026-10-05). Scores, needed and hiding still follow the snapshot.
  Break: read the weights from `household_settings` in `getRanking`; the test must fail.
- [ ] 6.2 **Broken rules** (EC-5.5/5.6, Q-7). Write the snapshot through the same mechanism the
  pass's malformed-snapshot test uses, and expect `refused` with reason `rules_invalid` for:
  - all-zero weights;
  - share `0`, `"1.5"`, `"x"`;
  - hide flag `"yes"`.
  Break: skip `parseRoundRules`; the test must fail.
- [ ] 6.3 **V-4** (AC-5.15–5.19, EC-5.12). With hiding on:
  - unvoted A lands in `hidden`, and `Object.keys` of the row equals exactly `applicationId,
    applicantName, state` (AC-5.16);
  - after `castVote` on A, A is visible (AC-5.17);
  - voted A but not B: A visible, B hidden (AC-5.18);
  - an `offer`-stage vote alone leaves it hidden (AC-5.19). Extend `RawVote` in
    `tests/helpers/votes.ts` with an optional `stage` (default `invite`), because
    `rawVoteInsertSql` hardcodes `'invite'::vote_stage` today;
  - withdrawing in the voter's own context hides it again (EC-5.12);
  - with hiding off, everything is visible;
  - hidden rows come back ordered `createdAt, id`.
  Break: treat any vote row of the viewer, regardless of stage, as a reveal; the AC-5.19 case must
  fail.
- [ ] 6.4 **Hidden after voting closed** (R-7). A candidate moved to `invited` before the viewer
  voted on it stays hidden. So does an unvoted `new` candidate in a paused round. Break: reveal
  when the viewer can no longer vote (the old §5.4 disjunct); both cases must fail.
- [ ] 6.5 **V-1** (AC-5.24/5.25/5.27, EC-5.11). Set `became_resident_id` by raw SQL to the
  viewer's profile, and give that application enough counted votes to reach quorum. It must be
  absent from `scored`, `unscored` and `hidden`, and it must not take a `leading` slot. Check this
  in an open and a paused round, with hiding on and off. Another resident sees it scored. Break:
  drop the port's `IS DISTINCT FROM` predicate; the test must fail. (There is no "earlier profile
  of the same account" case: design D5, the unique index refuses it.)
- [ ] 6.6 **G-D2 open-round half and Q-6** (former members).
  - Four voters at share 0.5 (quorum 2). Move one voter out via `setMovedOut`. Their vote leaves
    score, n and numerator, and the denominator drops to 3. Choose votes so that the candidate
    visibly changes, e.g. from scored to unscored.
  - Repeat with `removeMember` (`removed`).
  - Reactivate the moved-out voter via `reactivateMember`; their vote counts again.
  - Unscored → scored → unscored by withdrawing a vote (EC-5.12).
  Break: count every non-withdrawn vote regardless of `countedVoterIds`; the test must fail.
- [ ] 6.7 **Highlight N** (Q-15). Build a round over three rooms (`createRoom` ×3, then
  `createAndOpenRound`). Move two rooms `planned → open` via `transitionRoomStatus`; exactly two
  rows lead. Put one `on_hold`; one leads. Move it `open → not_available`; it stays excluded.
  (`promised` and `deleted_at` cannot be reached through real paths for a room in an open round:
  `removeRoom` refuses it and `open → promised` is not F1-reachable. Both are **invariant guards**
  covered by the `status = 'open' AND deleted_at IS NULL` predicate, so build no raw-SQL
  workaround.) Break: count `planned` rooms too; the test must fail.
- [ ] 6.8 **V-2 and a stale context.**
  - non-participant by address → `refused: not_eligible`, with no title in the result;
  - malformed id → the same;
  - a `draft` or `closed` round by address → `round_not_available` with its status;
  - no open or paused round → `{ kind: "none" }`;
  - a resident without `vote` (stripped via `grantPermissions`) → `not_eligible`;
  - a context whose membership was revoked after the context was built → `not_eligible` (design D5:
    the live-membership read refuses it).
  Break: skip step 2's permission check; the stripped-`vote` and revoked cases must fail.
- [ ] 6.9 `test/guarded.manifest.json` G-D2 **stays `pending`** (human decision 2026-10-06). Do not
  touch the manifest.

## 7. The screen (design D7)

- [ ] 7.1 Extract the weights list from `casting/screening/screening-deck.tsx` (the `<ul>` over
  `VOTE_VALUES` with `t.points` and the favourite note) into
  `src/app/(resident)/casting/weights-list.tsx`. The deck uses it unchanged.
  `tests/unit/.../screening-deck.test.ts` pins the popover markup and must stay green unchanged.
- [ ] 7.2 `src/ui/strings/de.ts` `casting`: replace `rankingBody` with the board's copy:
  - `scoreOf(n)` „aus {n} Stimmen" (singular „aus 1 Stimme");
  - `ringLabel(score, n)` „{score} von 100 Punkten, aus {n} Stimmen";
  - `unscored(needed, n)` „Noch kein Punktwert — für ein faires Bild braucht es mindestens {needed}
    Stimmen (bisher {n})." (singular „1 Stimme" where it applies);
  - `hidden` „Verdeckt — du hast hier nicht abgestimmt" and `hiddenHeading`;
  - `leadingLabel(n)` „Unter den {n} höchsten Punktwerten — {n} Zimmer frei" (singular for 1);
  - `rulesHeading`, `formula` (mean of the weights ÷ highest weight × 100, x,5 rounded up),
    `quorumRule(needed, d)` „{needed} von {d} Stimmen reichen";
  - `stateLabel` reuses `de.status.application.invited`;
  - `empty(title)`, `refusal.notEligible`, `refusal.rulesInvalid`, `refusal.notAvailable(status)`.
  Copy rules: nothing evaluative about a person (C-10, AC-5.28), and no „Gewinner".
- [ ] 7.3 `src/app/globals.css`: `.score-ring`, the `.ranking-leading` gradient drift (keyframes on
  `background-position`, `--accent` → `--card`, slow, both themes through tokens), a
  `@media (prefers-reduced-motion: reduce)` static tint, and `.ranking-hidden` (muted). No layout
  property animates.
- [ ] 7.4 Create `src/app/(resident)/casting/ranking-board.tsx`, a server component and a pure
  render of a `Ranking` result per D7:
  - the ring is an inline SVG, `role="img"`, `aria-label` = `ringLabel`;
  - leading rows carry the sr-only `leadingLabel(openRoomCount)`;
  - the `invited` label;
  - hidden rows below a separator with lucide `EyeOff` (`aria-hidden`) and the notice;
  - a native popover „(?)" with `WeightsList`, the formula and the quorum rule; the trigger is
    `<button type="button">`;
  - no rank numbers anywhere, and no hint.
- [ ] 7.5 `src/app/(resident)/casting/page.tsx`: keep the redirect exactly as it is. Parse `?round=`
  like the pass does, call `getRanking`, and render the heading „Rangliste" plus the board or the
  empty/refusal states. Update the file's header comment, including that the redirect wins over
  `?round=` (design D7).
- [ ] 7.6 `src/app/(resident)/casting/loading.tsx`: the skeleton becomes a heading plus three row
  shapes (a circle plus two text lines) from `@/ui/skeletons`. If a circle shape is missing, add it
  there. The `pending-feedback.ts` lint must stay green.
- [ ] 7.7 Create `tests/unit/casting/ranking-board.test.ts` (`renderToStaticMarkup`, a `.test.ts`
  file per the repo convention). Use digit-free synthetic names:
  - an unscored row has no `role="img"` ring, and its only digits are exactly those of
    `unscored(needed, n)`;
  - a hidden row contains no digit at all;
  - exactly the `leading` rows carry the highlight class, and the sr text names N;
  - under N = 0 there is no highlight;
  - the ring label carries score and n;
  - the popover trigger is `type="button"`.
  Breaks:
  - render a ring for unscored rows → the no-ring case fails;
  - mark every scored row leading → the highlight case fails.

## 8. Demo seed (design D8)

- [ ] 8.1 `scripts/seed-demo-household.ts`:
  - claim Kim and Jule beside Alex and Sam **before** the round opens;
  - keep Robin prepared with the bound link;
  - move both rooms `planned → open` as the household account (`transitionRoomStatus`);
  - replace the six „Testbewerbung" captures with exactly seven realistic synthetic ones (G-B1:
    invented names, `@example.test`, the 030 23125 range, varied age/message/attributes, both
    `collectedFrom` values);
  - as Alex, Kim and Jule, cast votes through `castVote`. Five applications get all three others'
    votes with varied values, one gets none, and one more gets all three and is then moved
    `new → screened → invited` by Alex. No application gets one or two other votes (design D8);
  - robustness argument in a comment: the presenter (Sam, or Robin after claiming) adds at most 1
    vote, and quorum is 2 (4 voters) or 3 (Robin claimed), so the scored, unscored and hidden rows
    hold either way. For Alex, Kim and Jule the invited row is visible, not hidden;
  - print the WG-Kennung (`household.signInCode`), the resident names, the links and a short
    "What to show" list naming Sam as the presenter. Counts only, no applicant data;
  - update the header comment. Keep the "not idempotent, run cleanup first" note.
- [ ] 8.2 `scripts/cleanup-demo-household.sql`: the pre-mortem confirmed it covers every declared
  table (12 deleted, `join_attempt` emptied, `activity_event` kept by design). Add a one-line
  comment naming this change as the last check. Change nothing else.

## 9. Verify, demo reset, walkthrough

- [ ] 9.1 `npm run verify` green (eslint, tsc, the nine lints, check-refs, the full suite on dev).
  Report the counts.
- [ ] 9.2 **Human hand-off (owner SQL):** the human runs `scripts/cleanup-demo-household.sql` in the
  Supabase SQL editor for `flatmate-io-dev`, or explicitly lets the agent run it through the
  Supabase MCP. Never production. Afterwards, check by query that no account with the demo email
  remains. If one remains, **stop**; do not infer that the cleanup is merely pending.
- [ ] 9.3 `npm run seed:demo`. Record the new household id and WG-Kennung in the plan file, not in
  the repo.
- [ ] 9.4 Walkthrough = pitch rehearsal (localhost, seed credentials, the browser pane):
  - sign in as Sam with the WG-Kennung; B1 shows the awaiting count, and Casting redirects to the
    pass;
  - rate every card; the scoreboard shows rings in order, two highlighted rows, an unscored row at
    the bottom, and the hidden `invited` row greyed with „Verdeckt — du hast hier nicht
    abgestimmt";
  - check „(?)";
  - reduced motion (emulated) gives a static tint;
  - as Alex, the shared rows have the same scores (the invited row is visible for Alex);
  - the household account cannot reach `/casting`;
  - the dev log holds no applicant data.
  Screenshot the board.
- [ ] 9.5 Optionally, claim Robin through the bound link, rate, and confirm the board still shows
  all three row kinds (quorum now 3).
