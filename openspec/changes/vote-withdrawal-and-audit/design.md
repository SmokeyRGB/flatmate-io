## Context

See proposal.md for the why. Current state, verified on `main` = `c31335e`:

- `vote` (drizzle/0028) already has `withdrawn_at`. `vote_guard` (BEFORE INSERT OR UPDATE) makes
  every rule decision and takes shared locks in this order: round, participation, profile,
  application. On INSERT it forces `withdrawn_at := NULL`. On UPDATE it pins the identity columns
  and stamps `updated_at`.
- 0028's header binds a later writer to a lock order: *"Every repository UPDATE of a vote
  (withdrawVote, change 2) reads the application FOR SHARE BEFORE it touches the vote row"*.
  F3 change 4's `deleteApplication` locks the application FOR UPDATE first and then deletes its
  votes.
- `castVote` is one upsert, `INSERT … ON CONFLICT (application_id, resident_profile_id, stage) DO
  UPDATE SET value, withdrawn_at = NULL`, after `assertAccountCanVoteTx` (membership FOR SHARE,
  stored `vote` permission). 0028's header gives its order: BEFORE INSERT runs on the proposed row
  *before* conflict detection, taking round, participation, profile and application FOR SHARE.
  Only then is the conflicting vote row locked.
- `recordActivityEvent` (audit) is the one event write path. It checks an allowlist of keys and
  a value rule per key (PR #41). It is not yet called by deliberation.
- Start's acknowledgement exists (F5 change 1, design D11 there): `allRated = mayVote &&
  openForVoting && awaitingVotes.get(roundId) === 0`, rendered as one `<p>`.
- The deck pushes `/casting` when `phase === "done"`. `SavedToast` already implements "show once
  from a query parameter, then strip it".
- No app code reads `activity_event` rows for display (grep, 2026-10-12).

## Goals / Non-Goals

**Goals:** a withdrawal that is serialized exactly like a vote; events that are exact for every
single-writer sequence; zero duplication of the vote rules in TypeScript.

**Non-Goals:**
- Any withdraw UI. That is F5 change 4, on D2.
- The "changed since your vote" marker (F5 change 6).
- Telemetry (no sink).
- Redaction rules for vote events. `stage` is not personal data.
- What deletion does to vote events (F3 change 4).

## Decisions

### D1 · `withdrawVote` is the same upsert, so it inherits the lock order and the rules

`withdrawVote(context, { applicationId })`:
1. Without a profile, throw `ProfileRequiredError` before any query. A malformed id raises
   `invalid_input`.
2. In one `withSessionContext`: `assertAccountCanVoteTx`, which locks the membership FOR SHARE
   and checks the `vote` permission. The household account and a missing permission become
   `not_eligible`, as in `castVote`.
3. **Pre-read** the caller's own `invite` row on the application: `round_id`, `value`,
   `withdrawn_at`, plain SELECT, no lock. If there is no row, or `withdrawn_at` is set, the
   result is `VoteError("not_found")`. Nothing is written.
4. **Upsert** the pre-read row back:
   ```
   INSERT … VALUES (household, round_id, application, profile, 'invite', value)
   ON CONFLICT (application_id, resident_profile_id, stage)
   DO UPDATE SET withdrawn_at = clock_timestamp() WHERE vote.withdrawn_at IS NULL
   RETURNING id, (xmax = 0) AS inserted
   ```
   BEFORE INSERT `vote_guard` runs first. It applies **every** rule (round open, eligibility,
   profile active, pairing, own application, votable) and takes the locks in castVote's order,
   before the vote row is locked. That meets 0028's obligation: the application is FOR SHARE
   before the vote row. The trigger then runs again as BEFORE UPDATE. Refusals map through the
   existing `toVoteError`.
5. **No row returned**: a concurrent withdrawal won, so the result is `not_found`. **`inserted`
   is true**: the row vanished between steps 3 and 4. Only `deleteApplication`, or a resident's
   raw `DELETE` (the DELETE policy is household plus profile), can do that. The function throws
   `not_found` inside the transaction, which rolls the insert back. A withdrawal therefore never
   creates a live vote.
6. `recordActivityEvent(vote.withdrawn)`, in the same transaction.

**Alternatives considered:**
- (a) A plain `UPDATE vote SET withdrawn_at …`. It locks the vote row *before* the trigger takes
  the application FOR SHARE. That deadlocks against `deleteApplication`, the exact case 0028
  warns about.
- (b) A casting port that pre-locks the round, participation and application, then a plain
  UPDATE. That needs a new cross-module port that copies the trigger's lock chain (and the
  profile lock lives in identity). It is a second copy of the lock order that can drift.
- (c), the choice: one statement, whose lock order *is* the trigger's. The pre-read exists only
  to supply the INSERT's required columns and to refuse "nothing to withdraw". It decides no
  rule. The cost is that an upsert that "withdraws" reads oddly. A LOCK ORDER comment and step 5
  explain why.

### D2 · `castVote` writes only on a real change, and classifies it for the event

The upsert gains `WHERE vote.value IS DISTINCT FROM excluded.value OR vote.withdrawn_at IS NOT
NULL` and `RETURNING (xmax = 0) AS inserted`. A plain SELECT pre-read of the caller's row (value,
`withdrawn_at`) runs before it, after `assertAccountCanVoteTx`.

- BEFORE INSERT still runs on the proposed row, so a same-value re-send in a paused round is still
  refused (spec scenario). Only the UPDATE is skipped. That skip is the behaviour change in the
  proposal: `updated_at` no longer moves on a no-op.
- The event, after the statement:
  - no row returned: no event (no-op);
  - `inserted`, or no pre-read row, or pre-read `withdrawn_at` set: `vote.cast`;
  - otherwise: `vote.revised`.

  `vote.cast` covers both a first rating and a re-rating after a withdrawal, since the vote
  becomes live (proposal assumption 1).
- **Ceiling:** the pre-read is unlocked, so two concurrent writes *by the same voter* (two tabs)
  can misclassify one event: `cast` instead of `revised`, or the reverse. The vote row itself is
  still correct, and the unique index plus the upsert serialize it. Locking the vote row in the
  pre-read would break D1's lock order, and the cost is one mislabelled audit line for one person
  racing themselves. Mark it with a `ponytail:` comment. The upgrade path is PG 18's `RETURNING
  OLD.*`, which needs no pre-read.

### D3 · Events: three types, `{stage}` only, written by deliberation through audit

- `PAYLOAD_ALLOWLIST`: `"vote.cast"`, `"vote.revised"`, `"vote.withdrawn"`, each `["stage"]`.
- `PAYLOAD_VALUE_RULES`: `stage: oneOf(voteStageEnum.enumValues)`, imported from
  `deliberation/schema`. Audit already imports casting's and identity's enums the same way.
- `subjectType: "application"`, `subjectId: applicationId`, `actorAccountId: context.accountId`,
  `actorProfileId: context.profileId`.
- drizzle/0018's RESTRICTIVE SELECT policy on application-subject events applies (a profile is
  required to read them). Inserts come from a resident session, which always has a profile.
- Not added to `REDACTABLE_KEYS`: a stage name is not personal data.
- **Who can see that X voted on Y.** The event's actor plus subject reveals *that* a resident
  voted, which `reveal_vote_authorship` hides on D2. This adds nothing over raw SQL: any resident
  can already read `vote` rows of the household under RLS, by ADR-004's layering, where roles
  within a household are application-level. No app reader of `activity_event` exists. **A future
  activity feed must filter `vote.*` by the round's frozen `revealVoteAuthorship`.** Record this
  in the spec's Purpose note at sync, not as code now.

### D4 · Digit keys reuse the submit path

The existing ←/→ `keydown` handler gains `1`–`4`. It keeps the same guards (modifier, text field,
`:popover-open`) and adds three:
- `dialog[open]` present;
- `stateRef.current.pending !== null`;
- a refusal is showing.

The rating runs through the same function the form's `onSubmit` uses, factored out as
`rate(value)`, so keys and buttons cannot diverge. `onSubmit` keeps its own guard for implicit
submits. The key is `VOTE_VALUES[n - 1]`, matching the button order (`VOTE_VALUES.map`). Escape
ordering is unchanged: C1 has only the pop-over, which closes natively.

### D5 · Praise: a URL hand-off and a celebratory variant of the existing toast

- **Deck:** on `phase === "done"`, push `/casting?rated=1` if the reducer recorded at least one
  successful rating in this pass, otherwise `/casting`. Read `Object.keys(state.ratings).length >
  0`, or the reducer's equivalent. Check `deck-state.ts`: `ratings` may be seeded from server
  data. If it is, use a `ratedInPass` flag set on `rated`.
- **Casting page:** if `searchParams.rated` is present, render `SavedToast` with `param="rated"`
  and `tone="celebrate"`. Widen `SavedToast`'s `param` union and pass `tone` through to
  `SuccessToast`. The redirect to the pass, when votes are pending, still wins. The toast is then
  lost, which is correct, since there is work again.
- **`SuccessToast` `tone="celebrate"`:** the check mark is an inline SVG whose stroke draws in
  ~400 ms (`stroke-dashoffset`). A few small stars in `--vote-absolutely` rise and fade around the
  icon only, all `aria-hidden`. Under `prefers-reduced-motion`: no draw and no stars, the
  existing crossfade only. CSS lives in `globals.css` beside `.toast`.
- **Start:** the `allRated` `<p>` becomes `<div className="callout-celebratory">` with a heading
  (`s.start.allRated`, unchanged) and a body (`s.start.allRatedBody`, new). The condition is
  untouched (proposal assumption 3). The dashboard-view unit test gets the "withdrawal takes it
  away" case: `awaitingVotes` = 1 after a withdrawal, so `allRated` is false. The integration
  half: an `awaiting-vote-counts` test where withdraw makes the count 1 again.
- **Strings**, de and en twins:
  - `casting.ratedToast`: „Geschafft! Deine Stimmen sind drin." / "Done! Your votes are in."
  - `start.allRatedBody`: „Damit bringst du eure WG ein gutes Stück näher an die Entscheidung." /
    "That brings your household a good step closer to the decision."

### D6 · Invariants and every path that reaches them

| Invariant | Paths | Enforced where |
|---|---|---|
| A withdrawal obeys the vote rules | `withdrawVote`; raw `UPDATE vote SET withdrawn_at` as app_runtime | `vote_guard` on both INSERT and UPDATE (raw UPDATE included); the own-profile UPDATE policy limits a raw UPDATE to one's own row |
| A withdrawal never deletes | `withdrawVote` (an upsert only); raw `DELETE` | Function: no DELETE. A raw DELETE is outside the rule; it is the deletion path F3 change 4 owns |
| A withdrawal never creates a live vote | `withdrawVote` step 5 | Throws on `inserted`, so the transaction rolls back |
| No value in an event | `recordActivityEvent` is the only writer | Allowlist plus value rule; payload-allowlist unit test |
| One event per real change | `castVote`, `withdrawVote` | Upsert `WHERE` returns no row on a no-op; event only on a returned row; same transaction |
| Lock order (application before vote row) | `castVote`, `withdrawVote`, future `deleteApplication` | Both mutators are upserts: BEFORE INSERT locks before the conflict lock |

**Writers of the same state, pairwise:**
- `castVote` × `withdrawVote`: same lock chain, then the unique index serializes on the vote row.
- `withdrawVote` × `withdrawVote`: second sees no row and gets `not_found`.
- `withdrawVote` × `deleteApplication` (F3 change 4, future): application FOR SHARE vs FOR UPDATE.
  Whoever is first wins; the other waits; no cycle.
- Round pause/close × `withdrawVote`: round FOR SHARE waits for the status writer, then refuses.

## Risks / Trade-offs

- [The upsert-as-withdraw reads oddly] → a LOCK ORDER comment cites 0028's obligation and D1's
  alternatives.
- [Event misclassification under same-voter concurrency] → D2 ceiling, `ponytail:` comment.
- [`updated_at` no longer bumps on a same-value re-send] → a deliberate spec change. Check that no
  test or reader relies on it (cast-vote tests only assert a bump on a *different* value).
- [Shared dev DB] → per-run ids, `afterEach` teardown; rerun alone before believing a failure.
- [Toast via hand-typed `?rated=1`] → reveals nothing; accepted (proposal assumption 5).

## Migration Plan

None. No schema change and no hand-off. Rollback is a revert.

## Resolved in review (human, 2026-10-12)

- Banner heading keeps the code's „… für alle Bewerbungen gevotet!“ (the human set it).
- A re-rate after a withdrawal is `vote.cast`; withdrawing with no live vote is refused `not_found`.
