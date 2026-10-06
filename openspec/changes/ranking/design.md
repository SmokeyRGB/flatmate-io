## Context

See proposal.md for why. The current state this design builds on (verified 2026-10-05 on `main`
`baf4945`, after PR #50 and #51):

- **`deliberation`** owns `vote` (`schema.ts`). Its repository has `awaitingVoteTx` (the one
  definition of "awaiting my vote"), `getAwaitingVoteCounts`, `getScreeningPass` and `castVote`.
  Nothing reads other residents' votes and no score code exists. `scale-weights.ts` parses the
  frozen weights: four keys, finite ≥ 0, fractions allowed (a unit test pins `4.5`), all-zero
  accepted.
- **Casting ports** (F4 design D2) are self-guarding `...Tx` reads that deliberation calls instead of
  joining casting tables:
  - `listVoterRoundsTx` returns the rounds with an active voting participation, every status,
    newest first.
  - `listVoteCandidatesTx` returns `new`/`screened` applications, excluding
    `became_resident_id = viewer profile`, optionally with card columns.
- **The snapshot** (`openRoundTx`) is `{scaleWeights, favoriteBudgetFactor, hideResultsUntilVoted,
  quorumShare}`. `quorumShare` is a `numeric` read back as a **string** (`"0.5"`). Since the
  2026-10-05 relaxation of FR-1.21, `updateHouseholdSettings` may change settings while a round is
  open, so the snapshot is the only thing that keeps an open round's rules fixed.
- **`vote_guard`** (`drizzle/0028`) refuses any vote unless the round is open and the application
  is `new`/`screened`, among other conditions. So an `invited` application can never gain a vote.
- **Rooms** are created `planned`. The demo seed never opens them, so N (open rooms) is 0 on
  today's Demo-WG.
- **`/casting`** redirects to the pass while anything awaits the viewer (`shouldOpenScreening`).
  Otherwise it shows F4's shell.
- **Membership:** `membership_account_id_unique` and `membership_resident_profile_id_unique`
  (`drizzle/0021`) allow one membership per account and per profile.

## Goals / Non-Goals

**Goals:**
- The arithmetic lives in one pure module with no database, so every AC about numbers is a unit
  test.
- The ranking itself is computed on read, with no cache and nothing stored (A-5.3, G-J4).
- Every visibility rule is applied in the repository read, before the data leaves the server.
- No migration, so the change can run beside other branches on shared dev.

**Non-Goals:**
- The `vote` SELECT policies (V-1/V-2 in the database). They are plan change 4, human decision Q-1.
- A per-candidate breakdown, the distribution, authorship and „5 von 7" (plan change 2).
- Any write. This change adds no write path. Its one lock is the one every permission-checked read
  takes: `assertHasPermissionTx` locks the caller's membership row `FOR SHARE` (identity's default,
  `readLiveMembershipTx`), taken first, so the lock order is unchanged. A move-out's `FOR UPDATE`
  waits for the read. `getRanking` returns names and scores, so the default lock is right; the
  `{ lock: false }` opt-out is reserved for count reads like T-5.
- The hidden-results hint (FR-5.19a) and a notice for hidden rows the viewer can still vote on. The
  redirect to the pass (human decision Q-2) runs whenever anything in any open round awaits the
  viewer, so on `/casting` the awaiting count is always 0 and every hidden row is one the viewer can
  no longer vote on (R-7). Both would be dead code. FR-5.19a is met by the redirect itself: the
  scoreboard is reachable only once nothing awaits the viewer (packet V1.1 note, task 1.1).
- Closed and archived rounds. No path closes a round, and `quorum_denominator_frozen` has no
  writer (F-12). Both are refused with their state named.

## Decisions

### D1 · A pure ranking module, `deliberation/ranking.ts`

The module takes `{ weights, quorumShare, denominator, openRoomCount, candidates: { id, createdAt,
values: VoteValue[] }[] }`. The values are **already the counted votes** (D4 filters former
members out). It returns:
- `scored: { id, score, n, leading }[]`, in the seven-key order;
- `unscored: { id, n, needed }[]`, ordered by `createdAt, id`.

`veto_penalty` is a constant-0 first key, so the comparator's shape never changes (C-5.8). Unit tests
cover AC-5.1–5.4, 5.7–5.9, 5.11–5.14, EC-5.1–5.3, 5.13, N = 0, N greater than the number of rows,
and a tie at the N boundary.

**Exact arithmetic.** Weights may be fractions and the quorum share is a decimal string, so plain
floats can misround. Two examples: `0.07 × 100` gives `7.000000000000001`, whose `ceil` is 8 instead of 7; and a
scaled mean that is exactly 37.5 can come out below it and round to 37. (An earlier draft named
`0.1 × 30`, which is exactly 3 in JavaScript; the applier caught it.) The module therefore turns each weight and the share into an exact
scaled integer, read from its decimal string (`String(n)` for a number, any number of fraction
digits), brings all weights to **one common scale** (the largest fraction-digit count among them)
before any sum, and computes in `BigInt`. The target is ES2017 (`tsconfig.json`), so the code
uses `BigInt(10) ** BigInt(k)`, never `10n` literals, which `tsc` refuses (TS2737):
- `score = floor((2·Σw·100 + n·max) / (2·n·max))`, which is x.5 rounded up for non-negative values;
- `needed = ceil(p·d / q)` for a share of `p/q`.

A value that cannot be read exactly (exponent notation such as `1e-7`) counts as malformed: D2
refuses it. There is no digit cap: BigInt has no limit, and a cap would make a share like
`0.3333333`, which the settings form accepts unvalidated, freeze a round as permanently
`rules_invalid`. A float such as `String(0.1 + 0.2)` = `"0.30000000000000004"` is read as exactly
that decimal. *Alternative:* floats with an epsilon. Rejected: the rounding would then
depend on how big an epsilon someone picked, which is exactly what P-3 rules out.

`NO_SCORE` is not a number in the types. An unscored row simply has no `score` field, so a `0`
cannot stand in for it by accident.

*Why a module:* the rules in `rechenmodelle.md` §8.3 must be checkable on paper, and a pure function
is the cheapest place to test them exhaustively. Nothing else in the codebase computes a score, so
this duplicates nothing.

### D2 · One frozen-rules parser, `deliberation/round-rules.ts`

`scale-weights.ts` is renamed to `round-rules.ts`. It keeps `parseScaleWeights` (now also refusing
when the largest weight is 0, or when a weight cannot be read exactly by D1's rule) and adds
`parseRoundRules(snapshot) → { weights, quorumShare, hideResultsUntilVoted } | null`:
- `quorumShare` may be a string or a number. It must read exactly and satisfy 0 < share ≤ 1.
- `hideResultsUntilVoted` must be a boolean.
- Anything else is `null`, which the caller turns into `rules_invalid` (EC-5.5/5.6, Q-7).

The pass keeps calling `parseScaleWeights` alone, because a quorum problem must not block rating.
The ranking calls `parseRoundRules`. The existing unit test moves with the file and gains the
all-zero case and the exactness cases. `4.5` stays valid.

*Alternative:* one parser for the whole snapshot, used by both screens. Rejected: the pass would
then refuse to work over a rule it never uses.

### D3 · Casting ports: widen one, add one

**`listVoteCandidatesTx`** changes from `{ withCard: boolean }` to `{ scope: "votable" | "board";
fields: "ids" | "names" | "cards" }`:
- `scope` is **closed**: `"votable"` means `new`/`screened` (the deck and T-5, unchanged) and
  `"board"` means `new`/`screened`/`invited`. The state lists live inside casting. A free
  `states` array was rejected: any later caller could then pull names of `rejected_by_household`,
  `withdrawn` or `archived` applicants through a voter-gated port, reopening Q-4 and the
  Art. 5(1)(c) argument without a design ever saying so.
- Each row now also carries `state`, which is not personal.
- `"names"` selects `applicant_name` only and returns it as a top-level `applicantName`.
  `card` stays present only for `"cards"`, so `VoteCandidateCard` keeps meaning "the four card
  columns were read".
- `"board"` with `"cards"` is refused by the type (an overload or a union of option shapes): the
  board never needs card columns of an `invited` applicant.

Call sites to update: the three in `deliberation/repository.ts`, plus the tests that call the port
directly (`screening-pass.test.ts` around l.178, 188, 192, 263, 277; `vote-household-account.test.ts`
around l.64). The key-set assertion in `screening-pass.test.ts` (around l.265) gains `state`, on
purpose.

*Widening justified against the narrow original.* F4 design D2 justified the card columns as the
voter-gated read of `new`/`screened`, and the comments at `casting/repository.ts` around l.55-57,
76, 248 and the port's own header say so. The board scope lets a voter see the **names** of
applicants in their own round who were invited. That is the same round, under the same voter
predicate, and D1 is defined as the round's applications (PRD §4.1.6). It is the first
resident-facing read of invited applicants' names. No contact, card or `collected_from` column is
added. Side states stay excluded (Q-4). All four comments are rewritten to match.

**New port `getRoundTallyBasisTx(tx, context, roundId) → { countedVoterIds: string[];
openRoomCount: number } | null`.**
- `countedVoterIds` is `invarianten.md` §5.3's denominator: participations of the round with
  `removed_at IS NULL` and `can_vote`, whose profile is `active`.
- The port **guards by its own result**. It returns `null` when the viewer's profile is not in
  `countedVoterIds`, which is exactly the active-voter predicate the other ports apply, so the
  guard adds no query and no third copy of the predicate. It throws `ProfileRequiredError` for a
  profile-less context and returns `null` for a non-UUID round id.
- `openRoomCount` counts `room.id = ANY(round.room_ids)` with `status = 'open'` and
  `deleted_at IS NULL`. Every join carries `household_id`.
- **DRY.** The active-voter condition (participation not removed, `can_vote`, profile `active`,
  household-matched) is written once as a private SQL fragment in casting and used by
  `listVoteCandidatesTx`'s `EXISTS` and by this port's query. `listVoterRoundsTx` keeps its Drizzle
  join form; its predicate is the same, and it is the one the comments point to as the definition.

*Why one port for two facts:* both are facts about one round, with one guard and one caller.
Splitting them would repeat the guard. Deliberation may not join `round_participation` or `room`
itself (`kontextgrenzen.md` §4 rule 1).

### D4 · `getRanking(context, roundId | null)`, one transaction, read-only

1. A profile-less context throws `ProfileRequiredError` before any query (G-D15). The page has
   already sent the household account to its own surface.
2. `assertHasPermissionTx(…, "vote")` runs inside the transaction. Without the permission, the
   result is `refused: not_eligible` (2b pattern).
3. The round comes from `listVoterRoundsTx`:
   - with an id: a missing row gives `not_eligible` (names nothing), and a status other than
     `open`/`paused` gives `round_not_available` with the status;
   - without an id: the newest `open` or `paused` round. If there is none, the result is
     `{ kind: "none" }`.
4. `parseRoundRules(snapshot)` runs. `null` gives `rules_invalid`.
5. Candidates come from the port with `scope: "board", fields: "names"`.
6. The basis comes from `getRoundTallyBasisTx`. `null` gives `refused: not_eligible`. That is
   reachable: steps 3 and 6 are separate statements under READ COMMITTED, so a move-out of the
   viewer committing between them makes the port return `null`. An empty `countedVoterIds` cannot
   reach here (the port returns `null` when the viewer is not in it), so EC-5.7's "denominator
   zero" is the same `not_eligible` refusal, never `rules_invalid` and never a throw.
7. **One** `SELECT application_id, resident_profile_id, value FROM vote` reads every vote with
   household, round, `stage = 'invite'`, `withdrawn_at IS NULL` and the application among the
   candidates. From this one statement the read derives:
   - the viewer's own votes: rows with `resident_profile_id = context.profileId`;
   - the counted votes: rows whose voter is in `countedVoterIds`.
8. Visibility per candidate (V-4): visible if `!hideResultsUntilVoted`, or if the viewer holds a
   vote on it. A candidate that is not visible goes to `hidden` as `{ applicationId, applicantName,
   state }`, ordered by `createdAt, id`, never by anything vote-derived. There is no
   `canStillVote`: under the redirect every hidden row on `/casting` is one the viewer can no
   longer vote on (Non-Goals), so one notice serves them all (R-7).
9. D1's module runs over the **visible candidates only**. The sort is a total order on per-candidate
   keys, so restricting the input preserves the relative order. Ranking the visible set is
   therefore the same as ranking everything and dropping the hidden rows, and the highlight slots
   go to visible rows only (Q-15).

The result type is a union:
- `{ kind: "board"; round: { id, title, status }; rules: { weights, needed, denominator };
  openRoomCount; scored; unscored; hidden }`;
- `{ kind: "none" }`;
- `{ kind: "refused"; reason: "not_eligible" | "rules_invalid" }`;
- `{ kind: "refused"; reason: "round_not_available"; status }`.

`HiddenRow` is its own type with no result keys, so AC-5.16 holds by type and by test.

**Consistency without a stricter isolation level.** Reveal and aggregate come from one statement
(step 7), so a `castVote` committing mid-read cannot make a row visible without its new vote, or
the reverse. The basis (step 6) is a separate statement, but votes are counted only if their voter
is in that same set, so numerator ≤ denominator always holds. A move-out racing the read costs one
transiently stale display, and nothing is written. *Alternative:* `REPEATABLE READ`. Rejected: one
statement already gives the property that matters.

### D5 · V-1 stays the existing predicate, and why that is account-wide

`invarianten.md` §5.1 defines `redaction_subjects` as every profile of the session's account.
The two unique indexes of `drizzle/0021` limit each account to one membership, and so to at most
one profile. G-D14 (b) ensures no path changes a session's acting profile after sign-in, and
sign-in sets it from that membership. So for a resident session the set is exactly
`{context.profileId}`. For the household account the set is empty, and it is refused at step 1
anyway.

**The runtime check that makes this safe.** `invarianten.md` §5.1 warns against relying on a
session field. `getRanking`'s own step 2 does not: `assertHasPermissionTx` goes through
`readLiveMembershipTx` (`identity/repository.ts` around l.531-546), which returns nothing unless
the account's membership is not revoked **and** its `resident_profile_id` equals
`context.profileId`. A stale or mismatched context is therefore refused before any candidate is
read. A test covers it (task 6.6).

The candidate port's `became_resident_id IS DISTINCT FROM profileId` is therefore already
account-wide, and **no code changes**. The packet's FR-5.29 wording is corrected in the docs commit
(F-4).

A test for an "earlier profile of the same account" cannot be built, because the unique index
refuses it. The tests instead cover the viewer's profile across open/paused rounds and hide
on/off. The pre-mortem confirmed that no `src/` writer changes `membership.resident_profile_id`
(membership updates set `revoked_at`, role and permissions only), and `session.acting_profile_id`
is immutable by trigger (`drizzle/0006`).

**If 0021's indexes are ever relaxed, this argument fails.** The design names them so a reviewer
of such a migration finds this. The register row for V-1's database half (change 4) says so too.

### D6 · Entry paths for each invariant this change relies on

| Path | V-1 (own application) | V-2 (participant only) | V-4 (hidden until own vote) |
|---|---|---|---|
| `getRanking` | port predicate (D5); live-membership check in step 2 | step 2; `listVoterRoundsTx`; the candidate port's self-guard; `getRoundTallyBasisTx`'s own-result guard | step 8, by type |
| `getScreeningPass` / T-5 | same port predicate | same | returns only the viewer's unrated candidates and no result |
| Raw SQL as `app_runtime` | **open**: `vote` SELECT is household-wide (register row; change 4, Q-1) | **open**, same | **by design not RLS** (`invarianten.md` §5.5: V-4 is an aggregate rule) |
| Server actions / routes | none new; the page calls only `getRanking` | — | — |
| Household account | refused before any query | — | — |
| Concurrent `castVote` | — | — | D4 step 7, one statement |

No `SECURITY DEFINER` function is added or touched. The open raw-SQL row is the deferral the human
accepted (Q-1). The demo data is synthetic and nothing sets `became_resident_id` in `src/`, so
nobody is exposed meanwhile.

### D7 · The screen: a server component, no client JavaScript

`/casting/page.tsx` keeps its redirect unchanged, including for `?round=`: a resident with anything
awaiting in **any** open round is sent to the pass even when the address names another round.
That is Q-2's "vote first, then see results", and it is why the hint and the can-still-vote notice
are not built (Non-Goals). The page then reads `?round=` (a non-UUID or an array counts as
absent, as in the pass) and calls `getRanking`. The rendering lives in a new server component,
`casting/ranking-board.tsx`, a pure function of the result, so render tests use
`renderToStaticMarkup`:
- **Score ring:** an inline SVG circle with `stroke-dasharray` proportional to the score, using
  `--primary` on `--muted`. The number is in the centre with „aus x Stimmen" beside it, and the sr
  text comes from the spec.
- **Highlight:** the class `.ranking-leading` drifts a `linear-gradient` from `--accent` to
  `--card` through `background-position`. Under `prefers-reduced-motion: reduce` it is a static
  `--accent` tint. It moves no layout. The sr text is a visually hidden span on each leading row.
- **Unscored rows** use the same row shape without the ring. **Hidden rows** sit under a separator,
  muted, with lucide `EyeOff` (already a dependency) and the one notice „Verdeckt — du hast hier
  nicht abgestimmt".
- **„(?)":** a native `popover` (as the deck does, so no JS). Shared with the pass's „(?)" through
  `.weights-popover`: it hangs below its trigger by CSS anchor positioning, right edges aligned, with
  a caret, and its `::backdrop` dims and blurs the page (human walkthrough 2026-10-06, Carbon-style
  popover). Without anchor support it stays centred, without the caret. It reuses the weights list, which is
  **extracted** from `screening-deck.tsx` into `casting/weights-list.tsx` (DRY). It adds the formula
  sentence and „{needed} von {denominator} Stimmen reichen". Its trigger is a `<button
  type="button">`, as in the deck, so the `pending-feedback.ts` lint does not read it as a submit.
- **States:**
  - `none` and an empty board render the same empty state;
  - `rules_invalid`, `not_eligible` and `round_not_available` render calm refusals, reusing the
    pass's wording where it fits;
  - `loading.tsx` becomes a skeleton of a heading and three row shapes from `@/ui/skeletons`.

Copy goes into `de.ts` `casting`, replacing `rankingBody`. Nothing else leaves `screening-deck.tsx`.
`ICONS`, `RATING_CLASS` and `CardBody` stay private until change 2 needs them (YAGNI).

*Alternative:* a client component for the board. Rejected: nothing on it is interactive except the
popover, which is native.

### D8 · Demo reset

`scripts/seed-demo-household.ts` is extended. The cleanup SQL already covers every declared table
(checked against the 14 tables in `schema.ts`; `activity_event` stays by design), so it only gains
a comment naming this change.

- **Residents:** Alex (moderator), Sam, Kim and Jule are claimed **before** the round opens, so
  the snapshot holds four voters and quorum needs 2. Robin stays prepared, with the bound link.
  Claiming Robin later auto-joins the open round (`drizzle/0031`), which makes the denominator 5
  and quorum 3.
- **Rooms:** the household account moves both rooms `planned → open`, so N = 2.
- **Applications:** seven realistic synthetic applications (G-B1: invented names,
  `@example.test`, the 030 23125 range), replacing the „Testbewerbung" set. Every application gets
  either **zero** or **all three** other votes, never one or two: one or two other votes plus the
  presenter's would sit exactly on the quorum line and flip between scored and unscored when Robin is
  claimed (quorum 2 → 3).
- **Votes, cast through `castVote` as Alex, Kim and Jule:**
  - five applications get all three others' votes, with varied values. These are scored for any
    presenter rating and either denominator, because 3 + 1 ≥ 3;
  - one application gets no other vote, so it stays unscored after the presenter's single vote;
  - one further application gets the three others' votes and is then moved `new → screened →
    invited` by Alex. The presenter never voted on it, so it is hidden.
- **The presenter is Sam (or Robin after claiming).** Alex, Kim and Jule voted on the invited row,
  so for them it is visible, not hidden; Alex's view in the walkthrough checks shared scores only.
- **Output:** the seed prints the WG-Kennung (`household.signInCode`, PR #51), the names, the links
  and a short "what to show" list. Counts only, no applicant data.

**Reset in place (human decision 2026-10-06).** The human keeps the existing Demo-WG: its
household id, WG-Kennung, accounts, profiles, memberships, join links and settings stay, and only
the casting activity is reset. Two pieces:
- `scripts/reset-demo-household.sql`, run as owner in the SQL editor with the same guards as the
  cleanup (refuses `app_runtime`, matches the fixed demo email, a notice and no change when there
  is no demo household). It deletes the demo household's `vote`, `application`,
  `round_participation`, `casting_round` and `room` rows, in that order (`drizzle/0026` refuses a
  round that still has applications). Rooms go too, so the round starts from two fresh `open`
  rooms whatever state earlier testing left them in (a room left `occupied` or `promised` has no
  F1 path back to `open`). `activity_event` stays (append-only). It prints the remaining counts.
- `npm run seed:demo-round` (`scripts/seed-demo-round.ts`) works on the existing household through
  the app's own paths only. It signs in with `signIn({ kind: "household", … })` using
  `DEMO_PASSWORD` (the password the original seed printed), so it needs no id and no raw lookup.
  It reads the residents through the household account's own resident list, and claims Kim and
  Jule only when they are missing, with the same password. The voters' contexts come from
  `signIn({ kind: "resident", householdId, displayName, password })`. A failed sign-in stops the
  script with a message naming who, and nothing after it runs. It then creates the two rooms, opens
  them, and calls the shared round seeding. It refuses to run when the household still has a
  round ("run the reset SQL first"), so it never stacks rounds.
- **One round seeding, used twice (DRY).** The rooms-round-applications-votes-invite part of
  `seed-demo-household.ts` moves into `scripts/demo/seed-round.ts`, called by both scripts. The
  fresh-database path (`cleanup` + `seed:demo`) keeps working unchanged in behaviour.
- **Voters.** The snapshot holds every active resident: Alex, Sam, Kim, Jule, plus Robin if
  claimed. That is 5 voters (quorum 3) or 4 (quorum 2). Each application gets 0 or 3 seeded votes
  (Alex, Kim, Jule), so for Sam and Robin as presenters the three row kinds hold in both cases, even
  when both of them rate. Residents the human added by hand also land in the snapshot. They raise
  the denominator, and with 9 or more voters at share 0.5, 3 seeded votes plus the presenter's fall below
  quorum. The script prints the voter count and the quorum, and warns when 3 + 1 < quorum.

*Why not seed the presenter's votes:* the walkthrough is the pitch. The presenter rates live and
the board appears.

### D9 · Plumbing the lints and gates force

- `authorization-matrix.test.ts`:
  - `getRanking` goes into `NOT_APPLICABLE_DELIBERATION` as a read, with its visibility tested in
    `tests/integration/deliberation/ranking.test.ts`;
  - `getRoundTallyBasisTx` goes into the casting port list, with no `src/app` caller (the existing
    assertion is extended).
- `test/guarded.manifest.json`: **G-D2 stays `pending`** (human decision 2026-10-06). `ranking.test.ts`
  tests its open-round half (moved-out voters leave the denominator). The closed-round half ("votes
  count on in closed rounds") needs a close path, and the human will implement it in the
  finalization of F3. The test file's header says so, and says that `guarded-tests.ts` checks only
  `implemented` entries: deleting this file turns nothing red until G-D2 is `implemented`.
- `vote-household-account.test.ts` (registered for G-D15, which is `implemented`) gains two cases
  in its own `vi.mock("@/db/session-context")` pattern: `getRanking` with a profile-less context
  throws `ProfileRequiredError` with zero queries, and `getRoundTallyBasisTx` does the same.
- `pending-feedback.ts`: `/casting` already has `loading.tsx`, the board has no form, and the
  popover trigger is `type="button"`.
- Data inventory: no column, so no change.

## Risks / Trade-offs

- **[V-1 is not enforced in the database yet]** → Human decision Q-1. Change 4 must land before the
  first real household. The register row stays open with that gate.
- **[The D5 equivalence depends on two unique indexes]** → D5 names them, and step 2's
  live-membership check refuses a mismatched context at runtime. Change 4's RLS function computes
  the real set either way.
- **[A hidden row's `state` tells the viewer an application was invited]** → The state is not
  derived from votes, and invited applications are on O4 for moderators anyway. V-4 is about
  results, not existence (FR-5.18).
- **[The highlight on visible rows only can mark a row that a hidden candidate would outscore]**
  → Accepted in Q-15. The redirect makes hidden rows rare, and a remaining hidden row is mostly
  already `invited`.
- **[Amending SRD S-32 and `invarianten.md` §5.3 against their recorded reasoning (P-3: "Rangliste
  würde ohne sichtbaren Anlass springen")]** → This is the human's decision (Q-6), recorded in the
  docs commit. The detail card's „x Stimmen entfernt …" note (change 2) is the visible reason that
  answers P-3.
- **[A frozen share or weight nobody validated on write]** → `updateHouseholdSettings` and the
  settings form accept any `quorum_share`. A bad value opened into a round makes that round
  `rules_invalid` for good. Validating on write is plan change 5 (Q-7); a register row names it
  (task 1.8).
- **[Latency on dev]** → `getRanking` runs about six statements on one connection. That is
  comparable to `getScreeningPass` plus one vote query, with no nesting (one pooled connection per
  call chain).

## Migration Plan

There is no migration. Deployment is the code plus the docs commit. The Demo-WG reset runs after
merge or before the rehearsal: the human runs `scripts/cleanup-demo-household.sql` as owner in the
SQL editor (or lets the agent run it through the Supabase MCP), then runs `npm run seed:demo`.
Rollback is a revert. Nothing stored changes shape.

## Decisions from the propose review (human, 2026-10-06)

- G-D2 stays `pending` in the manifest; the closed-round half follows in the finalization of F3.
- The empty board is a sentence naming the round plus a link back to Start, as designed. The human
  noted a later rethink: an application's standing is individual (one invited or moved in, others
  still waiting, and later several voting rounds), so the Casting tab may need sub-tabs by stage,
  each applicant shown under theirs. Not part of this change; recorded as a register row (task 1.8)
  and in the plan.
- The docs commit (task group 1) is approved as planned.
