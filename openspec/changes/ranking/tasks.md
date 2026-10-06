> **Read first:** proposal.md, design.md (D1–D9, Risks), the four delta specs, and
> `.claude/rules/implementation-hazards.md`. The plan's Part 1 (findings F-1…F-28) and its review
> rounds are in `~/.claude/plans/f5-ranking-hidden-until-you-vote.md`.
>
> **Conventions:**
> - Branch `feat/ranking`.
> - Code, comments and commits are in English. `docs/0x`, `docs/domain/*`, `docs/screens/*` and
>   `docs/review-log.md` are in German. `docs/backlog/**` is in English.
> - Never add AI attribution to commits.
> - Read only PRD excerpts (§4.1.6 around l.681–725, §4.2.3–4.2.5 around l.1170–1215), never the
>   whole file.
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
> - A claimed active resident joins every open round, through the snapshot plus auto-join. Build a
>   non-participant with `insertTestRound` and no participation rows.
> - Cast votes through `castVote` in each voter's own context.
> - `vote.withdrawn_at` can only be set in the voter's own context while the round is open
>   (own-profile UPDATE policy plus `vote_guard`).
> - A vote at stage `offer` needs `rawVoteInsertSql`. `vote_guard` checks it like any vote.
> - A move-out uses the real path the existing `screening-pass.test.ts` moved-out case uses.

## 1. Packet V1.1 and spec corrections (first commit, docs only)

- [ ] 1.1 `docs/backlog/requirements/F5-requirements.md` → **V1.1 · 2026-10-05**. Each change whose
  meaning differs gets a one-line "(V1.1: …)" note:
  - **F-1:** FR-5.4, FR-5.6 and FR-5.15 read `round.settings_snapshot` keys `scaleWeights`,
    `quorumShare`, `hideResultsUntilVoted`.
  - **F-3 / Q-7:** EC-5.5 and EC-5.6 add "share outside (0, 1]" and "hide flag not boolean".
    EC-5.8: 1.0 is permitted, and the warning belongs in the settings form, later.
  - **F-4:** FR-5.29 and AC-5.24 read "linked to any resident profile of the viewer's account".
  - **F-5:** EC-5.11 reads "absent; an emptied ranking shows the same empty state as any other,
    never a reason".
  - **F-7:** C-5.12 and C-5.13 apply to V-1/V-2 only. V-4 is enforced in the read
    (`invarianten.md` §5.5).
  - **F-8:** FR-5.16 adds "a withdrawn vote hides again" and "who may not vote does not wait".
  - **F-10:** FR-5.19a's "round" is the round's `invite` stage.
  - **Q-3:** FR-5.10 and AC-5.9 read "one scoreboard: unscored rows at its bottom, oldest first, with
    count and threshold, no score; hidden rows greyed below it".
  - **Q-6 / R-4:** FR-5.8 and EC-5.14 say votes count only while their voter is in the
    denominator. Moved out or removed, the vote leaves score, numerator and denominator;
    reactivation restores it. Delete A-5.1. Rewrite §7 "Deferred behaviour" to match.
  - **Q-9:** strike FR-5.31, FR-5.32, AC-5.26 and US-5.10. An own application is refused like a
    missing one.
  - **Q-5:** FR-5.19b and AC-5.19b say names are v0.2, and a per-application count follows with
    the detail card.
  - **Q-10:** FR-5.20 and AC-5.20 put the distribution on the detail card only.
  - **F-25:** define `round_half_up` as "x.5 rounds up, computed exactly".
  - **F-26:** C-5.14 cites G-C6/G-D5, G-D7, G-D6. Re-point `04-Domaenenmodell.md` §8.1 citations
    to `domain/rechenmodelle.md`.
  - **R-6:** add the top-N highlight as FR-5.13a with an AC.
  - Bump the header status line.
- [ ] 1.2 `docs/02-SRD.md` S-32: amend per Q-6. „Die Stimme eines ehemaligen Mitglieds zählt nicht
  mehr — weder im Score noch in Zähler und Nenner; bei Reaktivierung zählt sie wieder" (human
  decision 2026-10-05). Keep the marker as v0.2. Leave the old reasoning as a dated
  „Vormals:"-note, so the change is traceable. The commit message records the human decision.
- [ ] 1.3 `docs/03-PRD.md`:
  - §4.1.6: replace the separate „Warten auf Stimmen" section and its AC with Q-3's one-scoreboard
    shape. The AC „0/20/60/100" becomes „bei Standardgewichten" (F-25). „5 von 7" moves per
    application to the Einzelansicht (Q-5). `reveal_before_own_vote` stays as a name (F-2,
    register only).
  - §4.2.3 and the line around l.1177: former members per Q-6.
  - §4.2.5: strike the own-application view (Q-9). The screen layer corrects the PRD by human
    decision.
- [ ] 1.4 `docs/domain/invarianten.md` §5.3: `score_votes` counts only voters in the denominator,
  per Q-6/R-4. Amend the „Auszug während einer offenen Runde — entschieden" block with the human's
  decision and date, keeping the earlier reasoning visible as „vormals". §5.1 gets a note that
  `membership_account_id_unique` (0021) currently makes `redaction_subjects` a single profile
  (design D5).
- [ ] 1.5 `docs/domain/rechenmodelle.md` §8.3:
  - pending sort `(a.created_at, a.id)`, on the board's bottom rather than a separate section
    (Q-3);
  - define `round_half_up` (F-25);
  - former members per Q-6;
  - the top-N highlight with its tie rule (Q-15).
- [ ] 1.6 `docs/screens/D-casting-tab.md`:
  - D1: one scoreboard, progress ring, unscored rows at the bottom, hidden rows greyed below with
    eye-off and the two R-7 notices, top-N highlight, screen-level „(?)", and the empty state per
    design (human-approved 2026-10-06);
  - D2: distribution, arithmetic and „5 von 7" go here (changes 2 and 3);
  - D3: struck (Q-9). Fix D2's „Selbst-Redaktion greift" row.
  - Do **not** touch `07-Screen-Inventar.md` (frozen).
- [ ] 1.7 `docs/domain/casting.md`: name the snapshot keys `scaleWeights`, `favoriteBudgetFactor`,
  `hideResultsUntilVoted`, `quorumShare` (string from `numeric`) as stored (F-1).
- [ ] 1.8 `docs/review-log.md` §Offene-Punkte-Register, rows:
  - U-27 („aus Punktestand auszunehmen") confirmed by Q-6;
  - V-1 database half: due before the first real household (change 4), noting D5's dependency on
    0021's indexes;
  - telemetry for hidden results (F-28), no sink;
  - suggested G-D16 (NO_SCORE/0 pair) and G-D17 (V-4 server-side) for a later human decision
    (F-27);
  - the dangling „§7.13" in `rahmenwerk.md` §6 and `A-zugang.md` (F-6);
  - `reveal_before_own_vote` vs `hide_results_until_voted`, the domain name being authoritative
    (F-2);
  - closing a round must freeze the denominator and the former-member basis (F-12, R-4);
  - the top-N highlight (R-6) as a human decision;
  - the Casting tab may later need sub-tabs by stage, because an application's standing is
    individual (one invited or moved in while others still wait, and later several voting rounds):
    each applicant would be shown under their own stage. Human idea 2026-10-06, open, no owner yet.
- [ ] 1.9 Run `node tools/check-refs.ts` (all 7 rules), plus `node tools/check-refs.ts --scope docs`.
  No line under `docs/` may point into `openspec/`. Commit as `docs(f5): packet V1.1 and chain
  amendments for the ranking (human decisions Q-3, Q-6, Q-9, R-6)`.

## 2. Frozen-rules parser (design D2)

- [ ] 2.1 Rename `src/modules/deliberation/scale-weights.ts` → `round-rules.ts` (`git mv`). Update
  the imports in `deliberation/repository.ts` and `casting/screening/screening-deck.tsx` (type
  only).
- [ ] 2.2 In `round-rules.ts`, add the exact-decimal reader used by D1:
  - `toScaled(value): { units: bigint; scale: number } | null` reads a number via `String()`, or a
    string as given;
  - plain decimal only, ≤ 6 fraction digits, ≥ 0;
  - exponent notation, NaN, ±Infinity, a negative value or anything else gives `null`.
- [ ] 2.3 `parseScaleWeights` additionally refuses when every weight is 0, or when any weight fails
  `toScaled`. `4.5` stays valid.
- [ ] 2.4 Add `parseRoundRules(snapshot: unknown)`. It returns `{ weights, quorumShare: { units,
  scale }, hideResultsUntilVoted }`, or `null` when any of these holds: weights invalid; share not
  readable; share ≤ 0 or > 1; hide flag not a boolean; snapshot not an object.
- [ ] 2.5 Move `tests/unit/deliberation/scale-weights.test.ts` → `round-rules.test.ts`, and add
  cases:
  - all-zero weights;
  - `1e-7`;
  - 7 fraction digits;
  - share `"0.5"`, `0.5`, `"1"`, `"0"`, `"1.01"`, `"abc"`, `null`;
  - hide flag `"true"`.
  Break: drop the max > 0 check; the all-zero case must fail.
- [ ] 2.6 The pass now refuses all-zero weights (modified `screening-pass` spec). In
  `tests/integration/deliberation/screening-pass.test.ts`, add the "All weights zero" scenario by
  writing an all-zero `settings_snapshot.scaleWeights` (the existing malformed-snapshot case shows
  how). Break: revert 2.3's check; the test must fail.

## 3. Pure ranking module (design D1)

- [ ] 3.1 Create `src/modules/deliberation/ranking.ts`, pure with no imports beyond
  `vote-values.ts` and `round-rules.ts` types.
  - `computeRanking({ weights, quorumShare, denominator, openRoomCount, candidates })` returns
    `{ scored, unscored }` as D1 describes.
  - The comparator is the 7-key tuple with a constant-0 `vetoPenalty` first.
  - `score` and `needed` use BigInt per D1.
  - `leading` is set on the first `min(openRoomCount, scored.length)` rows.
  - `unscored` is ordered `createdAt, id`. Compare ids as strings; `createdAt` by `getTime()`.
  - Header comment cites `rechenmodelle.md` §8.1/§8.3 and FR-5.1/5.6/5.11.
- [ ] 3.2 Create `tests/unit/deliberation/ranking.test.ts`. One `it` per item:
  - AC-5.1 (55), AC-5.2 (100), AC-5.3 (0 is a score), AC-5.4 (no `score` key);
  - AC-5.7 and AC-5.8 (needed at 7 and 6);
  - EC-5.1, EC-5.2, EC-5.3;
  - AC-5.11–5.14, each tie key isolated;
  - a 54.5 → 55 case, built from fractional weights so that floats would misround (find one and
    assert the float version differs, as proof);
  - share `0.1` × 30 → 3, not 4;
  - N = 0, N > rows, and a tie at the boundary (exactly N lead);
  - determinism: shuffled input gives the same output.
  Breaks:
  - swap keys 3 and 4 → AC-5.11/5.12 fail;
  - replace BigInt with `Math.round` → the 54.5 or 0.1 × 30 case fails;
  - return `0` for no votes → AC-5.4 fails.

## 4. Casting ports (design D3)

- [ ] 4.1 `src/modules/casting/repository.ts` `listVoteCandidatesTx`:
  - the options become `{ fields: "ids" | "names" | "cards"; states?: readonly ApplicationState[] }`,
    with `states` defaulting to `["new", "screened"]`;
  - add `state` to `VoteCandidate`;
  - `"names"` selects `applicant_name` only, into `card.applicantName`. Or add a separate
    `applicantName` field — pick one and keep `VoteCandidateCard` honest about which columns were
    read;
  - update the three call sites in `deliberation/repository.ts` (`withCard: false` → `"ids"`,
    `true` → `"cards"`);
  - extend the port's header comment with design D3's widening justification.
- [ ] 4.2 In the same file, add `getRoundTallyBasisTx(tx, context, roundId)` per D3.
  - It throws `ProfileRequiredError` when the profile is null, and returns `null` for a non-UUID or
    when the viewer is not an active voting participant with an active profile (the same predicate
    as `listVoterRoundsTx`).
  - Otherwise it returns `{ countedVoterIds, openRoomCount }`.
  - Every join carries `household_id`.
  - Add it to the port comment block.
- [ ] 4.3 `tests/integration/policy/authorization-matrix.test.ts`:
  - add `getRoundTallyBasisTx` to the casting port classification (beside `listVoteCandidatesTx`,
    around l.117–125), with its visibility tested in `ranking.test.ts`;
  - extend the "no caller outside casting and deliberation's repository" assertion (around
    l.261) to the new port.
  Break: import the port in any `src/app` file; the assertion must fail.

## 5. `getRanking` (design D4, D5)

- [ ] 5.1 First, confirm that no `src/` code updates `membership.resident_profile_id` after insert
  (`grep -rn "residentProfileId" src/modules/identity` around updates and sets). If one exists,
  **stop and report**: design D5's equivalence fails.
- [ ] 5.2 `src/modules/deliberation/repository.ts`: add `getRanking(context, roundId: string |
  null): Promise<Ranking>`, with the `Ranking` union and the `ScoredRow`, `UnscoredRow` and
  `HiddenRow` types.
  - Follow D4 steps 1–10 exactly, in one `withSessionContext`, with no nested context.
  - `HiddenRow` is `{ applicationId, applicantName, state, canStillVote }` and nothing more.
  - Scored and unscored rows carry `applicationId`, `applicantName`, `state`, plus the module's
    fields.
  - `awaitingVoteTx` is called with the new `fields` option.
  - The comment cites the matrix decision: a read, `vote` permission first.
- [ ] 5.3 `authorization-matrix.test.ts`: classify `getRanking` in `NOT_APPLICABLE_DELIBERATION`
  as "read; visibility tested in tests/integration/deliberation/ranking.test.ts". Break: remove
  the entry; the "every exported function" test must fail.

## 6. Integration tests: `tests/integration/deliberation/ranking.test.ts`

Teardown goes in `afterEach`. Assert result kinds and reason codes, not only lengths.

- [ ] 6.1 **Frozen rules** (AC-5.5, F-1). After opening, change `scaleWeights.good` to 4,
  `quorumShare` to `"1"` and `hideResultsUntilVoted` to `false` via `updateHouseholdSettings`
  (allowed while open since 2026-10-05). Scores, needed and hiding still follow the snapshot.
  Break: read the weights from `household_settings` in `getRanking`; the test must fail.
- [ ] 6.2 **Broken rules** (EC-5.5/5.6, Q-7). Write the snapshot through the same mechanism the
  pass's malformed-snapshot test uses, and expect `refused: rules_invalid` for:
  - all-zero weights;
  - share `0`, `"1.5"`, `"x"`;
  - hide flag `"yes"`.
  Break: skip `parseRoundRules`; the test must fail.
- [ ] 6.3 **V-4** (AC-5.15–5.19, EC-5.12). With hiding on:
  - unvoted A lands in `hidden`, and `Object.keys` of the row equals exactly `applicationId,
    applicantName, state, canStillVote` (AC-5.16);
  - after `castVote` on A, A is visible (AC-5.17);
  - voted A but not B: A visible, B hidden (AC-5.18);
  - a raw-SQL `offer` vote only leaves it hidden (AC-5.19);
  - withdrawing in the voter's own context hides it again (EC-5.12);
  - with hiding off, everything is visible.
  Break: treat any vote row of the viewer, regardless of stage, as a reveal; the AC-5.19 case must
  fail.
- [ ] 6.4 **R-7 notices.** A candidate moved to `invited` before the viewer voted is hidden with
  `canStillVote: false`. In a paused round, an unvoted `new` candidate gives `canStillVote: false`.
  In an open round, `true`. Break: drop the status check; the paused case must fail.
- [ ] 6.5 **V-1** (AC-5.24/5.25/5.27, EC-5.11). Set `became_resident_id` by raw SQL to the
  viewer's profile, and give that application four counted votes at quorum. It must be absent
  from `scored`, `unscored` and `hidden`, it must not count in `needed`, `denominator` or the
  `leading` slots, and `awaitingCount` must not include it. Check this in an open and a paused
  round, with hiding on and off. Another resident sees it scored. Break: drop the port's
  `IS DISTINCT FROM` predicate; the test must fail. (No "earlier profile of the same account"
  case: design D5, the unique index refuses it.)
- [ ] 6.6 **V-2 / G-D15:**
  - non-participant by address → `refused: not_eligible`, with no title in the result;
  - malformed id → the same;
  - a `draft` or `closed` round by address → `round_not_available` with its status;
  - no round → `{ kind: "none" }`;
  - household account → `ProfileRequiredError`, with no query issued (spy on `withSessionContext`
    as the start-overview test does);
  - a resident without `vote` (grant stripped via `grantPermissions`) → `not_eligible`.
  Break: skip the port's participation guard in `getRoundTallyBasisTx`; the non-participant case
  must reach the basis and fail its assertion. If step 3 already refuses it, assert that the port
  itself returns `null` for a non-participant in a direct port test.
- [ ] 6.7 **G-D2 and Q-6** (former members).
  - Four voters, with quorum 2 at share 0.5. Move one voter out through the real path. Their vote
    leaves score, n and numerator, and the denominator drops to 3, giving a different `needed` if
    you choose the numbers so it changes.
  - Repeat with `removed`.
  - Unscored → scored → unscored by withdrawing a vote (EC-5.12).
  - Reactivation: if a permitted path to set a profile `active` again exists, show the vote counts
    again. If none exists, record this case as an **invariant guard** covered by the filter in 5.2.
  Break: count every non-withdrawn vote regardless of `countedVoterIds`; the test must fail.
- [ ] 6.8 **Highlight N** (Q-15). The round covers three rooms. Move two to `open` via
  `transitionRoomStatus`; exactly two rows lead. Make one `promised`; one leads. Delete a room
  (`removeRoom`, if allowed in that state); it stops counting. Break: count `planned` rooms too;
  the test must fail.
- [ ] 6.9 `test/guarded.manifest.json` G-D2 **stays `pending`** (human decision 2026-10-06). Do not
  touch the manifest. The header of `ranking.test.ts` states that 6.7 covers G-D2's open-round half
  and that the closed-round half follows in the finalization of F3, once a round can be closed.

## 7. The screen (design D7)

- [ ] 7.1 Extract the weights list from `casting/screening/screening-deck.tsx` (the `<ul>` over
  `VOTE_VALUES` with `t.points` and the favourite note) into
  `src/app/(resident)/casting/weights-list.tsx`. The deck uses it unchanged. The render output must
  be identical; check with the existing deck render test, if any, or a quick snapshot.
- [ ] 7.2 `src/ui/strings/de.ts` `casting`: replace `rankingBody` with the board's copy:
  - `scoreOf(n)` „aus {n} Stimmen";
  - `ringLabel(score, n)` „{score} von 100 Punkten, aus {n} Stimmen";
  - `unscored(needed, n)` „Noch kein Punktwert — für ein faires Bild braucht es mindestens {needed}
    Stimmen (bisher {n})." (singular „1 Stimme" where it applies);
  - `hiddenCanVote` „Verdeckt, bis du selbst abgestimmt hast";
  - `hiddenCannotVote` „Verdeckt — du hast hier nicht abgestimmt";
  - `hiddenHeading`;
  - `leadingLabel(n)` „Unter den {n} höchsten Punktwerten — {n} Zimmer frei" (singular for 1);
  - `hint(n)` „Ergebnisse siehst du, sobald du abgestimmt hast. Noch {n} Bewerbungen warten auf
    deine Stimme." and `hintAction` „Jetzt bewerten";
  - `rulesHeading`, `formula` (mean of the weights ÷ highest weight × 100, x,5 rounded up), and
    `quorumRule(needed, d)` „{needed} von {d} Stimmen reichen";
  - `stateLabel` reuses `de.status.application.invited` if that exists;
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
  - the hint when `awaitingCount > 0`, linking to `/casting/screening?round=<id>`;
  - a native popover „(?)" with `WeightsList`, the formula and the quorum rule;
  - no rank numbers anywhere.
- [ ] 7.5 `src/app/(resident)/casting/page.tsx`: keep the redirect. Parse `?round=` like the pass
  does, call `getRanking`, and render the heading „Rangliste" plus the board or the
  empty/refusal states. Update the file's header comment.
- [ ] 7.6 `src/app/(resident)/casting/loading.tsx`: the skeleton becomes a heading plus three row
  shapes (a circle plus two text lines) from `@/ui/skeletons`. If a circle shape is missing, add it
  there. The `pending-feedback.ts` lint must stay green.
- [ ] 7.7 Create `tests/unit/casting/ranking-board.test.ts` (`renderToStaticMarkup`, a `.test.ts`
  file per the repo convention):
  - an unscored row contains no digit other than those in its notice, and no ring;
  - a hidden row contains no digit at all;
  - the hint is absent at `awaitingCount: 0` and present at 2;
  - exactly the `leading` rows carry the highlight class, and the sr text names N;
  - under N = 0 there is no highlight;
  - the ring label carries score and n.
  Breaks:
  - render `score ?? 0` for unscored rows → the no-digit case fails;
  - render the hint unconditionally → the 0 case fails.

## 8. Demo seed (design D8)

- [ ] 8.1 `scripts/seed-demo-household.ts`:
  - claim Kim and Jule beside Alex and Sam **before** the round opens;
  - keep Robin prepared with the bound link;
  - move both rooms `planned → open` as the household account (`transitionRoomStatus`);
  - replace the six „Testbewerbung" captures with about seven realistic synthetic ones (G-B1:
    invented names, `@example.test`, the 030 23125 range, varied age/message/attributes, both
    `collectedFrom` values);
  - as Alex, Kim and Jule, cast votes through `castVote` so that ≥ 3 applications have all three
    others' votes with varied values, one has none, and one more gets all three and is then moved
    `new → screened → invited` by Alex.
  - Robustness argument in a comment: the presenter adds at most 1 vote, quorum is 2 (4 voters) or
    3 (Robin claimed), so the scored, unscored and hidden rows hold either way.
  - Print the WG-Kennung (`household.signInCode`), the resident names, the links and a short
    "What to show" list. Counts only, no applicant data.
  - Update the header comment. Keep the "not idempotent, run cleanup first" note.
- [ ] 8.2 `scripts/cleanup-demo-household.sql`: confirm that it deletes from every table declared in
  any `schema.ts` except `activity_event` (design D8 counted 14). Add a comment naming this change
  as the last check. Change nothing else unless a table is missing.

## 9. Verify, demo reset, walkthrough

- [ ] 9.1 `npm run verify` green (eslint, tsc, the nine lints, check-refs, the full suite on dev).
  Report the counts.
- [ ] 9.2 **Human hand-off (owner SQL):** the human runs `scripts/cleanup-demo-household.sql` in the
  Supabase SQL editor for `flatmate-io-dev`, or explicitly lets the agent run it through the
  Supabase MCP. Never production. Afterwards, check by query that no `household` row with the
  demo email's account remains. If one remains, **stop**; do not infer that the cleanup is merely
  pending.
- [ ] 9.3 `npm run seed:demo`. Record the new household id and WG-Kennung in the plan file, not in
  the repo.
- [ ] 9.4 Walkthrough = pitch rehearsal (localhost, seed credentials, the browser pane):
  - sign in as Sam with the WG-Kennung; B1 shows N awaiting, and Casting redirects to the pass;
  - rate every card; the scoreboard shows rings in order, two highlighted rows, unscored rows at
    the bottom, and the hidden `invited` row greyed with „Verdeckt — du hast hier nicht
    abgestimmt";
  - check „(?)";
  - reduced motion (emulated) gives a static tint;
  - as Alex, same scores for rows both see;
  - the household account cannot reach `/casting`;
  - the dev log holds no applicant data.
  Screenshot the board.
- [ ] 9.5 Optionally, claim Robin through the bound link, rate, and confirm the board still shows
  all three row kinds (quorum now 3).
