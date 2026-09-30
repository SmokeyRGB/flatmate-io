> **Read first:** proposal.md, design.md (D1–D10, Risks), both `deliberation/*` specs, and
> `.claude/rules/implementation-hazards.md`. The plan's Part 1 (findings F-1…F-20) is in
> `~/.claude/plans/f4-screen-and-vote.md`. Branch `feat/screening-pass`. Language: code, comments
> and commits in English; `docs/domain/*`, `docs/screens/*` and `docs/review-log.md` in German;
> `docs/backlog/**` in English. Never add AI attribution to commits.
>
> **Order matters.** Group 1 is its own commit, before any code. `0028` reaches dev in group 4,
> after the schema and migration exist, and before any integration test runs. Every test task
> names a break. Run it, see the test fail, revert, and report the failure text.
>
> **Two kinds of break:**
> - A **code break** edits TypeScript locally, runs the one test file, and reverts.
> - A **database break** (group 9) runs as owner through the Supabase MCP on `flatmate-io-dev`,
>   because `app_runtime` owns nothing and the suite has no owner connection (design, Risks).
>
> No break may be "argued" instead of run, except where a task says "invariant guard" explicitly.
>
> **Fixtures** (design D10, pre-mortem M3): a claimed active resident is a participant of every
> open round (snapshot plus auto-join). A "non-participant" is therefore built by a round created
> without their participation (`tests/helpers/applications.ts` `insertTestRound`, no participation
> rows), never by assuming it. `app_runtime` under the household or moderator context may UPDATE
> `casting_round.status`/`settings_snapshot` and `round_participation.can_vote`/`removed_at`
> (permissive policies; precedent `setCanVote`/`setRemoved` in `start-overview.test.ts`, where
> `setCanVote` ignores its `residentProfileId` argument — fix that when moving it to
> `tests/helpers/`). `vote.withdrawn_at` can only be set in the voter's own context while the round
> is open (own-profile UPDATE policy plus `vote_guard`).

## 1. Packet V1.1 and spec corrections (first commit, docs only)

- [x] 1.1 `docs/backlog/requirements/F4-requirements.md` → **V1.1 · 2026-09-30**. Apply the
  plan's Part 1 corrections as edits, each with a one-line "(V1.1: …)" note where the meaning
  changes:
  - F-1: define "open for screening" in FR-4.1 (`new`/`screened`, minus own, minus a non-withdrawn
    own `invite` vote);
  - F-2 and F-10: cite `settings_snapshot.scaleWeights` in FR-4.9/4.10/C-4.4. FR-4.9 becomes "the
    round's frozen weights (defaults 0/1/3/5)". AC-4.9 is exercised through the audited override
    `forceChangeSettingWhileRoundOpen`;
  - F-3: v0.1 `stage_open(round, invite)` ⇔ `status = open`;
  - F-4: FR-4.2 names `application.became_resident_id`, with gap R-3.3/R-5.4 noted;
  - F-5: FR-4.7 lists name, age, `message_raw`, `attributes`, and states no contact field (Q-2);
  - F-6: FR-4.13/4.14 add that re-rating updates the same row and clears `withdrawn_at`;
  - F-7: reword EC-4.12 (reopened pass holds only unrated cards, so after completion the empty
    state; revision via D2/F5);
  - F-8: FR-4.18/AC-4.18 — before F5 the last card leads to the D1 shell on the Casting tab;
  - F-9: EC-4.3 — not offered, nothing about the round shown (V-2);
  - F-11: AC-4.8 aligned with PRD §4.1.4 („abrufbar … ohne ihn zu verlassen"). The weights sit one
    tap away („(?)" pop-over), the numbers are not on the buttons (human decision Q-3 2026-09-30),
    and P-3 holds;
  - F-12: AC-4.7 asserts the enum values and the German labels „Nein · Eher nicht · Finde gut ·
    Unbedingt";
  - F-13: FR-4.3's server side is the deck read plus a database refusal of a vote on the own
    application, while V-1's RLS half (votes *about* a resident) is F5's;
  - F-15: a new "§5a Dependencies" subsection, citing `docs/` and guardrails only, **never
    `openspec/`** (Rule 7):
    - G-D15 (b) on `vote`;
    - `FOR SHARE` on the application;
    - AC-3.16 in F3 change 4;
    - V-2 RLS in F3 change 6;
    - the lock-order obligations: `deleteApplication` locks the application first, then deletes
      its votes, and a vote UPDATE path reads the application `FOR SHARE` before the vote row;
  - F-16: offline buffer out of scope (v0.2, G-D11 pending);
  - F-17: add FR-4.19 (each level has symbol + text, never colour alone, including the selected
    state) and FR-4.20 (the pass is keyboard-operable), with ACs;
  - F-19: add an AC — no budget hint, counter, warning or other residents' votes during the pass;
  - F-20: re-point `04-Domaenenmodell.md` citations to `docs/domain/deliberation.md` /
    `casting.md`.

  Also `docs/backlog/requirements/F3-requirements.md` AC-3.16 (pre-mortem M16): "is tested in F4"
  → tested with F3 change 4's `deleteApplication`, with the same lock-order sentence. Files: both
  packets.
- [x] 1.2 `docs/domain/deliberation.md` `Vote`: add row `household_id | uuid | ⚙️ | redundant zur
  Runde, aber Anker der RLS-Policy (ADR-004)`, the wording `casting.md` already uses for
  `Application.household_id`. `docs/domain/casting.md` (`settings_snapshot`): one note that the
  code stores the key as `scaleWeights` (camelCase) and that this is accepted (F-2).
  `docs/screens/C-beteiligung.md` C1 *Zugang*: „Aus dem primären CTA (T-5) auf Start (B1);
  Beitritt landet seit 2026-09-21 auf B1". Files: those three.
- [x] 1.3 `docs/review-log.md` §Offene-Punkte-Register, in German, in the existing row style:
  - update row „F3-Vorprüfung: V-2 für Bewerbungen" with human decision Q-1 (2026-09-30):
    enforced in the repository and the vote trigger in F4 change 1, RLS stays open, **fällig vor
    dem ersten echten Haushalt**;
  - close „F4: was ‚zum Screening offen' heißt" with the F-1 definition;
  - new: „Stimmen anderer lesbar/löschbar auf DB-Ebene", owned by F5 (V-1/hidden results/G-D1) and
    F3 change 4 (delete path), due as Q-1;
  - new: „Telemetrie `vote_cast` (PRD §5.1)", open, no sink yet;
  - new: „`settings_snapshot.scaleWeights` statt `scale_weights`", accepted;
  - new: „`RoundParticipation.can_vote` ist immer `true`":
    - since ADR-013 plus `membership_resident_pairing` (`drizzle/0020`), every participant is a
      resident profile with `is_resident = true`, all three writers set `true`, and nothing updates
      it;
    - human confirmation 2026-09-30: no scenario in which a resident has no voting right is
      intended;
    - the column and the `p.can_vote = true` term in `invarianten.md`'s `can_vote` stay as the
      specified freeze point, and tests of `false` are invariant guards;
    - retiring the column is a later docs decision, not F4's;
  - new: „Casting-SQL liest `resident_profile` (Identity)" — `getRoundParticipants`,
    `openRoundTx` and the new `listVoterRoundsTx` join an identity table in casting SQL, against
    `kontextgrenzen.md` §4 rule 1. Accepted as precedent (the import direction is allowed); first
    to revisit at a context split (design D2);
  - new: „U-27: Stimmen entfernter Mitglieder" — votes now exist and are kept on removal;
    excluding a removed member's votes from score and log is F5's (score computation);
  - new (cheap, "not F4's to fix"): FR-1.18 `joined_after_open` vs `casting.md` source list;
    `reveal_before_own_vote` vs `hide_results_until_voted`; PRD offline line without a band marker.

  Files: `docs/review-log.md`.
- [x] 1.4 `node tools/check-refs.ts` → 0 failures. No frozen file touched (Rule 4), and no pointer
  from `docs/` into `openspec/` (Rule 7). Commit: `docs(f4): packet V1.1 and spec corrections for
  the screening pass`.

## 2. Deliberation schema and migration `0028` (written, not yet applied)

- [ ] 2.1 `src/db/rls-predicates.ts`: add `OWN_PROFILE`, a builder for the `resident_profile_id =
  (select nullif(current_setting('app.profile_id', true), '')::uuid)` predicate, next to
  `PROFILE_PRESENT` with the same style of comment. `src/modules/deliberation/vote-values.ts`:
  `VOTE_VALUES` (readonly tuple, in order) and `VoteValue`, with no imports.
  `src/modules/deliberation/schema.ts`:
  - `voteStageEnum`/`voteValueEnum` (from `VOTE_VALUES`);
  - the `vote` table;
  - the unique index `vote_application_profile_stage_idx` on `(application_id,
    resident_profile_id, stage)`, and the indexes on `household_id` and `round_id`;
  - the four `pgPolicy`s of design D6, **importing** `PROFILE_PRESENT`/`OWN_PROFILE` (pre-mortem
    M19). `HOUSEHOLD_MATCH` is mirrored the way every schema file does.

  `drizzle.config.ts`: add the schema path. Files: `src/db/rls-predicates.ts`,
  `src/modules/deliberation/{vote-values.ts,schema.ts}`, `drizzle.config.ts`.
- [ ] 2.2 `npx drizzle-kit generate --name vote`, which produces `drizzle/0028_vote.sql` and the
  meta. **Stop if the generated SQL contains anything but vote objects** (drift). Then hand-edit
  it into design D6's five steps:
  - the guarded `DO $$` enum creates;
  - `IF NOT EXISTS` on the table and indexes;
  - `DROP POLICY IF EXISTS` before each policy;
  - `CREATE OR REPLACE FUNCTION vote_guard()` exactly as D6's table (steps 0–7, including step 0's
    INSERT normalisation and `id` among the immutable columns; `FOR SHARE`; `ERRCODE '23514'`; the
    named constraints; `DETAIL` = status for `vote_round_open`; `SET search_path = pg_catalog,
    public`; **no** `SECURITY DEFINER`; **no** `deleted_at`);
  - `CREATE OR REPLACE FUNCTION application_keeps_votes()` (D6 parent side, same header style);
  - `DROP TRIGGER IF EXISTS` + `CREATE TRIGGER` for `vote_guard` (BEFORE INSERT OR UPDATE ON vote
    FOR EACH ROW) and for `application_keeps_votes` (BEFORE UPDATE OF round_id, household_id ON
    application FOR EACH ROW).

  The header comment states purpose, order and re-runnability, the fact that the trigger runs
  twice on the conflict path, and D7's two lock-order obligations, worded as in 1.1. Checks:
  - `grep -nE '\$[0-9]' drizzle/0028*` → no output;
  - `grep -n "deleted_at\|SECURITY DEFINER" drizzle/0028*` → no output;
  - `npx tsx scripts/lint/migration-shape.ts` passes.

  Files: `drizzle/0028_vote.sql`, `drizzle/meta/*`.

## 3. Casting query ports and Start without the stub (design D2, D3)

- [ ] 3.1 `src/modules/casting/repository.ts`: add `listVoterRoundsTx` and `listVoteCandidatesTx`
  exactly as D2 specifies:
  - `ProfileRequiredError` first;
  - every predicate carries `household_id`;
  - the voter predicate, including `resident_profile.status = 'active'`, is re-applied inside the
    candidates query;
  - the candidates query selects only the card columns;
  - no `deleted_at`;
  - `IS DISTINCT FROM`, never `ne()`, for `became_resident_id`;
  - no query when `roundIds` is empty, and `ANY(${ids}::uuid[])` or `inArray` built so it works
    with `prepare: false`.

  A header comment names D2, says the card columns are the V-2 surface, and records the
  `resident_profile` join precedent. Update the comments at `APPLICATION_LIFECYCLE_COLUMNS` and
  `getOrganisationApplication` to name `listVoteCandidatesTx` as the second, voter-gated
  personal-column read.
- [ ] 3.2 Same file: delete `notVotedByViewer` and the grouped T-5 query from `getStartOverview`,
  and `voteCount` from `StartOpenRound`. Keep the participation read, the standing and the
  profile-less early `null` unchanged. Replace the Decision 9 comment with one line naming
  deliberation's `getAwaitingVoteCounts` (design D3).
- [ ] 3.3 `tests/integration/policy/start-overview.test.ts` and
  `start-overview-household-account.test.ts`: remove the `voteCount` assertions and the "T-5 = raw
  count" pin, with a comment naming F4 change 1 D3 as its planned end.
  - **Port case (f5)**, the V-1 walk-back (an application that became the viewer and walked back
    to `screened` creates no vote task), to 6.6 as an `awaiting` count assertion. It must keep a
    break.
  - Port (g) (deleted applications) as a comment only: nothing sets `deleted_at` (design Risks).
  - Everything else stays.

  `tests/unit/start/dashboard-view.test.ts` is adapted in 7.6. Files: those three.

## 4. Apply `0028` to dev

- [ ] 4.1 Run `gh pr list` and `git log origin/main..origin/<branch> -- drizzle/` for every remote
  branch with an open PR. If any other branch adds a migration, **stop and report**. Otherwise
  state in the report that none was in flight.
- [ ] 4.2 Apply `drizzle/0028_vote.sql` to **`flatmate-io-dev`** via Supabase MCP
  `apply_migration`, never production. Then, as owner through the MCP, check:
  - `to_regclass('public.vote')` is not null;
  - `pg_policies` for `vote` lists the four policies with the right `permissive`/`cmd`;
  - `pg_trigger` has `vote_guard` on `vote` and `application_keeps_votes` on `application`, both
    with `tgenabled = 'O'`;
  - `has_table_privilege('app_runtime','vote','INSERT,SELECT,UPDATE,DELETE')` is true;
  - `pg_proc.prosecdef` is false for both functions.

  **Record `md5(pg_get_functiondef('vote_guard'::regproc))` and `md5(pg_get_functiondef(
  'application_keeps_votes'::regproc))`** for group 9's restore check. If any check fails, stop
  and report. Never infer "not yet applied".

## 5. Deliberation repository (design D3–D5)

- [ ] 5.1 `src/modules/deliberation/scale-weights.ts`: `parseScaleWeights(raw: unknown):
  ScaleWeights | null`. It needs exactly the four keys, each `typeof number`, finite and ≥ 0. Extra
  keys are refused too. It has no default. Test `tests/unit/deliberation/scale-weights.test.ts`:
  valid; missing key; extra key; string `"3"`; `NaN`; `Infinity`; negative; null; array; nested
  object as a value. **Code break:** make the parser return defaults on failure → the malformed
  cases fail.
- [ ] 5.2 `src/modules/deliberation/repository.ts`:
  - `VoteError` (codes `invalid_input | not_found | round_not_open | not_eligible | not_votable |
    own_application`, plus `roundStatus?`), `VoteWriteError`, and the `ScreeningPass` union;
  - private `awaitingVoteTx`;
  - `getAwaitingVoteCounts`, `getScreeningPass` and `castVote`, exactly as D3–D5, including
    D5's step order: profile check, then input validation, then `assertAccountCanVote` with
    `HouseholdAccountCannotVoteError` → `VoteError("not_eligible")`, then the one statement;
  - `ProfileRequiredError` imported from casting (DRY).

  The constraint → code mapping is one `const` table reading `err.cause.constraint_name` and
  `err.cause.detail`, the way `toApplicationWriteError` does. `roundStatus` is kept only if it is a
  round-status enum value. Any other error is wrapped in `VoteWriteError` (SQLSTATE and constraint
  in the message, never params; `cause` kept). No pre-check of round or eligibility in TypeScript
  (D5 "Why"). Files: `src/modules/deliberation/repository.ts`.
- [ ] 5.3 Comments only:
  - `src/modules/identity/repository.ts` `assertAccountCanVote`: "(F3)" → "F4, called by
    deliberation's `castVote`";
  - the `removeMember` header's U-27 sentence, per design D10.

## 6. Tests against dev (design D8)

Helpers: `setupPipeline`, `claimPlainMember`, `insertApplicationAt` (with `becameResidentId` for
an own application **in `new` or `screened`**, or AC-4.3 is vacuous; pre-mortem M18),
`insertTestRound`, `holdTransaction` + `settlesWithin`, and `setCanVote`/`setRemoved` moved to
`tests/helpers/` (fixed). Add a small `rawVoteInsert` there if more than one file needs it. Put
teardown in `afterEach`. Assert error **codes and constraint names**, not only end states. Where
this group names a **database break**, it is run in group 9; here, write the test so that the
break can fail it.

- [ ] 6.1 `tests/integration/deliberation/cast-vote.test.ts` (repository):
  - **AC-4.10:** rate `good` then `no` → one row, value `no`, `updated_at > created_at`,
    `withdrawn_at` null, and `household_id`/`round_id`/`stage`/`resident_profile_id` as written.
    Assert every column.
  - **AC-4.13** for `paused`, `closed` and `archived`, set via the moderator context: code
    `round_not_open`, `roundStatus` equal to that state, and an earlier vote unchanged
    (EC-4.4/4.5). DB break (group 9): step 2 removed.
  - **Own application** in `screened` → `own_application`. DB break: step 6 removed.
  - **An `invited` application** → `not_votable`. DB break: step 7 removed.
  - **A mismatched `roundId`**, where the voter participates in **both** rounds, else step 3
    answers first → `not_found`. DB break: step 5's `round_id` comparison removed.
  - **Another household's application** → `not_found`. Held by RLS too, so label it an
    invariant guard.
  - **Invalid value, non-UUID ids** → `invalid_input`, with a spy on `withSessionContext` showing
    **no** call. Code break: move validation after `assertAccountCanVote` → the spy fails.
  - **A stale context after `setMovedOut`** → `not_eligible`, via `assertAccountCanVote`
    (pre-mortem H4). Code break: remove the error mapping → a `HouseholdAccountCannotVoteError`
    surfaces.
  - **Invariant guard (unreachable state)**, in its own `describe`: `can_vote = false` and
    `removed_at` set → `not_eligible`. A comment cites design Context: no production path writes
    either. DB break: step 3 removed, which can fail these.
- [ ] 6.2 `tests/integration/raw-sql/vote-guard.test.ts` (G-C7's other side, and AC-4.3's DB
  half). As `app_runtime` with a resident profile set, raw `INSERT INTO vote` for each case below,
  each rejected with SQLSTATE `23514` and the expected `constraint_name`:
  - the own application;
  - a paused round;
  - a non-participant (a round without their participation);
  - a cross-round pairing (voter in both rounds);
  - **under a moved-out profile's context** (profile `moved_out`, participation still active) →
    `vote_voter_eligible`. This is step 4's own test; DB break: step 4 removed.

  Also:
  - a raw UPDATE that changes `application_id` → `vote_identity_immutable`;
  - a raw INSERT with `created_at`, `updated_at` or `withdrawn_at` supplied → stored as normalised
    by step 0;
  - a raw INSERT naming another **eligible** profile → `42501`;
  - a raw UPDATE of another resident's vote → 0 rows changed, value unchanged;
  - a raw UPDATE moving a voted application to another round of the same household →
    `application_keeps_votes`, while the same move of an unvoted application succeeds.

  DB breaks (group 9): drop `vote_guard` → the own-application insert succeeds; drop
  `application_keeps_votes` → the move succeeds.
- [ ] 6.3 `tests/integration/policy/vote-scoping.test.ts` and
  `tests/integration/raw-sql/vote-scoping.test.ts` (G-C7 pair). Through the policy layer and by
  raw SQL:
  - another household's votes are invisible, and `count(*)` counts only one's own;
  - with no profile set and with profile `''`, `count(*)` = 0;
  - a profile-less raw insert is refused, asserting `vote_application_paired` (the trigger
    answers before the policy; design D6 "Ordering against RLS");
  - the household account's `castVote` → `ProfileRequiredError`, with a `withSessionContext` spy
    showing no call.

  DB breaks (group 9):
  - drop `vote_requires_resident_profile` → the profile-less `count(*)` is non-zero;
  - replace `vote_household_isolation` with `USING (true)` → the cross-household count fails.

  State in the test comment that the insert case is held by the trigger, not by the policy.
- [ ] 6.4 `tests/integration/deliberation/cast-vote-concurrency.test.ts` (EC-4.6), using
  `holdTransaction` + `settlesWithin`:
  - T1 holds an uncommitted upsert of `good`, and T2's `no` upsert must not settle. Commit T1, T2
    completes, and exactly one row exists with value `no`.
  - T1 holds an uncommitted UPDATE of the voter's `resident_profile.status` to `moved_out`, and
    T2's vote must not settle. Commit T1, and T2 is refused with `vote_voter_eligible`, asserted
    through a raw insert. `castVote` would stop earlier only for a *new* context.

  DB break (group 9): step 4 without `FOR SHARE` → T2 settles early and the test fails. The
  timing-based "not settled" is evidence only together with that break (pre-mortem L).
- [ ] 6.5 `tests/integration/deliberation/screening-pass.test.ts`:
  - **AC-4.1:** set equality and order with five applications. Include one `invited`, one
    `rejected_by_household` and one own application in `screened`, and prove they are absent
    (AC-4.2/4.3).
  - **Already rated:** two rated, then the deck holds three. A withdrawn vote counts as unrated:
    set `withdrawn_at` in the voter's own context while the round is open.
  - **AC-4.4/4.5:** a **pin**, not a proof (pre-mortem M13). A new call after a sixth capture has
    six. The "held deck unchanged" half is the client's (7.2).
  - **AC-4.9:** open a round, `forceChangeSettingWhileRoundOpen("scaleWeights", {…good: 4})`, and
    the deck's `weights.good` is 3.
  - **EC-4.11:** set a malformed snapshot via the moderator context → `rules_invalid`, no cards.
  - **`not_eligible`** for a non-participant (a round built without them), **with no title in the
    result**. `round_not_open` plus status.
  - **A moved-out profile called directly** (pre-mortem M8): `getScreeningPass` and
    `getAwaitingVoteCounts` return `not_eligible`/nothing. Code break: remove `resident_profile.status
    = 'active'` from the port → the test fails.
  - **Invariant guard (unreachable state):** `can_vote=false`, `removed_at` set → `not_eligible`.
  - **`roundId = null`** picks the newest open round that awaits the viewer; none gives `empty`.
  - **The card DTO** has exactly the keys `applicationId, applicantName, age, messageRaw,
    attributes` (plus `roundId`/`createdAt` if part of the DTO). No contact key (Q-2). The
    attribute values are passed through as stored: 0025's CHECK is their validator.
  - **Profile-less** → `ProfileRequiredError`, no query.

  Code breaks:
  - remove the voter predicate from `listVoteCandidatesTx` and call it directly with a
    non-participant → cards leak;
  - replace `IS DISTINCT FROM` with `<>` → the NULL-`became_resident_id` cards vanish;
  - add `contact_email` to the select → the key test fails.
- [ ] 6.6 `tests/integration/deliberation/awaiting-vote-counts.test.ts`:
  - the map equals the deck size per round (same fixture as 6.5);
  - after one vote the count drops by one;
  - **a withdrawn vote counts again** (pre-mortem M14);
  - the ported (f5) walk-back case from 3.3;
  - a round without the viewer's participation is absent;
  - the household account gets an empty map with no query.

  Code break: make `awaitingVoteTx` ignore `withdrawn_at` → the withdrawn case fails.
- [ ] 6.7 `tests/integration/policy/authorization-matrix.test.ts`:
  - the deliberation set-coverage block;
  - the `castVote` case: household account → `ProfileRequiredError`, and a claimed plain member in
    a round built without their participation → `VoteError` `not_eligible`;
  - `NOT_APPLICABLE_CASTING` entries for the two ports, each naming its covering test;
  - the "no `src/app` file calls it" assertion for both ports, in the shape of the existing one for
    `insertCapturedApplicationTx`.

  Code breaks: export a dummy function from deliberation's repository → the coverage test fails;
  import `listVoteCandidatesTx` in a `src/app` file → the caller assertion fails.
- [ ] 6.8 Plumbing:
  - `tests/helpers/identity.ts` `HOUSEHOLD_SCOPED_TABLES` gets `"vote"`;
  - `scripts/cleanup-demo-household.sql` deletes from `vote`;
  - `data-inventory.yml` gets the `vote` block (D10, context `deliberation`), whose purpose and
    legal-basis text follows the file's existing deliberation-style entries and cites
    `06-Compliance-Anhang.md`. If none exists, write it from `personenbezogene-felder.md` rows
    27/28 and `aufbewahrung.md` (180 days after `closed_at`), and quote the source.
  - `test/guarded.manifest.json`: `vote_via_policy` → 6.3 policy file, `vote_via_raw_sql` → 6.3
    raw file, and G-D15's `testFiles` + the 6.3 files. Mark `implemented` only now that they pass.

  Code breaks: remove `"vote"` from the set → `cleanup-inventory.test.ts` fails; remove one column
  from the inventory → `data-inventory.ts` fails.

## 7. The screen (design D9)

- [ ] 7.1 `src/ui/strings/de.ts`: replace the `screening` placeholder keys with:
  - `ratings` (`no` „Nein", `rather_not` „Eher nicht", `good` „Finde gut", `definitely`
    „Unbedingt");
  - `selected` (the visually hidden or visible "gewählt" companion to the check glyph);
  - `favouriteNote` „= dein Favorit";
  - `progress(n, total)` „n von N";
  - `weightsToggleLabel` „Punkte der Stufen anzeigen", with „(?)" as the visible glyph;
  - `weightsSentence` „Der große Sprung liegt zwischen *Eher nicht* und *Finde gut*.";
  - `points(n)`;
  - `empty` „Nichts wartet auf dich";
  - `emptyBody`, one calm line with the link back to Start;
  - `refusal.roundNotOpen(statusLabel)`, `refusal.notEligible`, `refusal.rulesInvalid`,
    `refusal.voteFailed` („Das hat nicht geklappt — nichts ist verloren. Nochmal?");
  - `back` „Zurück", `backAria`, `backToStart`.

  `casting` gets `rankingHeading` „Rangliste" and `rankingBody` „Hier erscheint die Rangliste
  dieser Runde." in place of the placeholder keys. No evaluative text, and no mention of revising.
  Remove keys nobody reads anymore (`grep` for them). Files: `src/ui/strings/de.ts`.
- [ ] 7.2 `src/app/(resident)/casting/screening/deck-state.ts`: the pure reducer of D9 (`submitted`,
  `rated`, `failed`, `back`, `forward`, `dropped`; `pending` blocks navigation) and
  `tests/unit/screening/deck-state.test.ts`:
  - forward is refused on an unrated card and at the last index;
  - back stops at 0;
  - while `pending`, back, forward and a second `submitted` are no-ops;
  - `rated(id)` moves to `indexOf(id) + 1`, even if the index had changed;
  - rating the last unrated card sets `done`;
  - revising an earlier card advances by one;
  - `dropped` clamps the index and shrinks the total, and dropping the last unrated card, or the
    only card, sets `done`;
  - the initial state from props is the only input, since the reducer has no "props changed"
    action.

  Code breaks: allow `forward` on an unrated card; use `index + 1` in `rated`; omit `done` in
  `dropped` → each fails its case.
- [ ] 7.3 `src/app/(resident)/casting/screening/actions.ts`: the `castVoteAction` server action
  (D5). It resolves the session, refuses a missing session with a code, calls `castVote`, and
  returns codes only, with **no `revalidatePath`**.
  `src/app/(resident)/casting/screening/screening-deck.tsx`, the client component of D9:
  - the layout: progress bar plus „n von N" as one `role="progressbar"` at the top, with the back
    chevron and „(?)"; the card; the one-row, four-column button bar fixed at the bottom on mobile;
  - the card with name/age heading, message and attributes;
  - the rating form of four `SubmitButton`s with lucide `X`/`ArrowDown`/`ArrowUp`/`Star`. The
    selected rating gets `aria-pressed` and a `Check` glyph, and `onSubmit` returns early while
    pending;
  - „(?)" as the native popover;
  - „Zurück" on desktop, ←/→ keys, and the Pointer Events swipe with D9's thresholds and
    `touch-action: pan-y`;
  - `data-dir` for the animation;
  - the refusal-code table of D9;
  - `router.push("/casting")` on `done`;
  - `useReducer` initialised once from props, and no `router.refresh()`.
- [ ] 7.4 `src/app/(resident)/casting/screening/page.tsx`: D9's server page (`searchParams.round`
  normalised, `getScreeningPass`, the three states). `loading.tsx`: a card-shaped skeleton
  (progress bar, tall card, a row of four pill buttons at the bottom) importing `@/ui/skeletons`.
  `src/app/globals.css`: the deck classes and keyframes, plus the `prefers-reduced-motion`
  crossfade. Transform and opacity only, on the card element; the controls stay outside it. Files:
  those three.
- [ ] 7.5 `src/app/(resident)/casting/page.tsx`: the D1 shell (heading, sentence, back link),
  keeping the redirect via `shouldOpenScreening(overview, awaitingVotes)`. `loading.tsx` stays
  valid. Files: that page.
- [ ] 7.6 `src/app/(resident)/dashboard/dashboard-view.ts` and `page.tsx`:
  - `buildDashboardView(overview, awaitingVotes, …)`;
  - `pendingVoteCount(overview, awaitingVotes)` and `shouldOpenScreening(...)`;
  - the task `href` becomes `/casting/screening?round=<id>`;
  - the page adds `getAwaitingVoteCounts` to its `Promise.all`.

  `tests/unit/start/dashboard-view.test.ts` is adapted: the same cases, fed through the map, plus
  "each round's task links to its round" (start spec "Two rounds"). Code break: drop the
  `?round=` → the new case fails.
- [ ] 7.7 `tests/unit/screening/screening-deck.test.ts` — **`.test.ts`, not `.tsx`**: vitest
  collects only `tests/**/*.test.ts` in the `node` environment, and the repo has no
  testing-library (pre-mortem H3). Render with `createElement` + `react-dom/server`
  `renderToStaticMarkup` and `vi.mock("next/navigation")`, the pattern of
  `tests/unit/casting/capture-page.test.ts`. Assert:
  - four buttons in order with symbol and label and **no digit** in their text;
  - the popover content shows the given weights (a 0/1/4/5 fixture, not the defaults);
  - a card with a prior rating renders `aria-pressed="true"` on that one button only;
  - the progress element carries `aria-valuenow`/`aria-valuemax`;
  - no contact text; the card props type has no contact field, so a fixture with one fails to
    typecheck;
  - no budget or counter text.

  Code breaks: render `points(n)` on a button; drop `aria-pressed` → each fails.

## 8. Verify

- [ ] 8.1 `npm run verify` → green. Report real totals and any flaky timeout by name, with a
  re-run of that file alone.
- [ ] 8.2 `grep -rn "notVotedByViewer\|voteCount\|placeholderBody\|placeholderHeading" src tests`
  → no output. `grep -n "deleted_at\|deletedAt" src/modules/deliberation
  src/modules/casting/repository.ts` shows no new lines. `grep -rn "revalidatePath\|router.refresh"
  "src/app/(resident)/casting/screening"` → no output.

## 9. Database breaks on dev (owner, via MCP; human told first)

- [ ] 9.1 **Before the first break, stop and report** to the orchestrating session: the list of
  breaks below and the two md5 values from 4.2. The orchestrator asks the human, since dev is
  shared. Continue only on the go.
- [ ] 9.2 For each break, one at a time:
  1. apply it as owner via MCP (`CREATE OR REPLACE` of the function with the one step removed, or
     the `DROP`/replace);
  2. run **only** the named test file(s) and record the failing test names and messages;
  3. restore by re-running the exact statement(s) from `drizzle/0028_vote.sql`;
  4. confirm the md5 matches 4.2's value, or `pg_policies`/`pg_trigger` show the original.

  The breaks:
  - (a) step 2 → 6.1 AC-4.13;
  - (b) step 3 → 6.1 invariant guard;
  - (c) step 4 → 6.2 moved-out;
  - (d) step 4's `FOR SHARE` only → 6.4 second case;
  - (e) step 5's round comparison → 6.1 mismatched round;
  - (f) step 6 → 6.1 and 6.2 own application;
  - (g) step 7 → 6.1 `invited`;
  - (h) drop the `vote_guard` trigger → 6.2;
  - (i) drop the `application_keeps_votes` trigger → 6.2 move;
  - (j) drop `vote_requires_resident_profile` → 6.3;
  - (k) `vote_household_isolation` as `USING (true)` → 6.3.

  If a break does not make its test fail, stop and report: the test is vacuous.
- [ ] 9.3 After the last restore, run `npm run verify` once more → green. Recheck 4.2's catalog
  checks.

## 10. Report

- [ ] 10.1 Do **not** run the browser walkthrough (the human signs in). Report:
  - every file touched;
  - every break and its failure text, with no break argued in place of a run unless a task says
    "invariant guard";
  - the 4.1/4.2 results and the md5 values before and after;
  - any deviation from the design, stated plainly with the D-number.

  Leave the plan file to the orchestrating session.
