> **Pre-mortem amendments (2026-10-12) are binding and override the task text below where they differ: see §0.**

## 0. Pre-mortem amendments

- [x] 0.1 Read these before any task; each names the task it changes.
  - **3.3 (H1)**: hold `application FOR UPDATE` under a context WITH a profile (e.g. the moderator's or another resident's context; under the household context 0018 makes it lock 0 rows) and assert it locked exactly 1 row. Run the NOWAIT probe under the VOTER's own context in its own short transaction (the RESTRICTIVE own-profile UPDATE policy makes FOR UPDATE match 0 rows otherwise) and assert it returned 1 row. Also assert the withdraw has not settled within 2000 ms while the lock is held.
  - **3.2(j) (M1)**: deterministic, no seam: `holdTransaction(voter.context, tx => DELETE FROM vote WHERE id = …)` uncommitted; start withdrawVote (pre-read sees the committed row; the upsert waits on the deleter); release → upsert inserts → `inserted` → throw `not_found` → rollback. Assert `not_found`, zero rows, no event. Drop the invariant-guard fallback.
  - **4.1/4.2 (M2, M3)**: `rate()` takes the id from `stateRef.current.ids[stateRef.current.index]`, never a render closure; a synchronous in-flight ref is set before dispatch and cleared in `handleResult` (both paths); ignore `event.repeat`; the listener reads `rate` through a ref. `deckKeyAction` is pure and takes `{key, modifiers, repeat, inTextField, popoverOpen, dialogOpen, refusal, inFlight}`; one unit case per guard (modifier, repeat, text field, popover, dialog, refusal, in-flight), plus mapping and ←/→.
  - **2.1/3.1 (L1, L2)**: use Drizzle `setWhere` (not the deprecated `where`) in `onConflictDoUpdate`. Inserted-flag without `xmax`: withdrawVote `RETURNING (withdrawn_at IS NULL) AS inserted` (trigger forces NULL on INSERT; the SET makes it non-null); castVote `RETURNING (created_at = updated_at) AS inserted` (trigger sets them equal on INSERT; UPDATE stamps clock_timestamp later).
  - **5.1 (L3)**: use a `ratedInPass` flag set on a successful `rated` (a ref or reducer field), not `Object.keys(state.ratings)` — `dropped` deletes entries.
  - **5.4 (L4)**: `.callout-celebratory` sets no text colour; give the heading `text-primary` (and the base callout class if one exists).
  - **3.4 (L5)**: classification is the `DELIBERATION_CASE_NAMES` array (~line 934); add `withdrawVote` there. Cases: no vote → `not_found`; household → `ProfileRequiredError`; and the stronger one: vote, then remove participation (`setRemoved`) → `not_eligible`.
  - **1.2 (L8)**: the break also fails the `{stage: "invite"}` accept case for `vote.cast`; expected.
  - **3.2(a) (L9)**: assert `createdAt` exactly equal to the first rating's; `updatedAt >= withdrawnAt` is fine but not the point.
  - **5.3 (L10)**: importing `SavedToast` from `(org)` is fine; no move needed. Type `searchParams` with `rated?: string | string[]`.

## 1. Audit: register the vote events

- [x] 1.1 `src/modules/audit/repository.ts`: add `"vote.cast"`, `"vote.revised"` and
  `"vote.withdrawn"` to `PAYLOAD_ALLOWLIST`, each with `["stage"]`. Add a value rule
  `stage: oneOf(voteStageEnum.enumValues)` for each type, importing `voteStageEnum` from
  `@/modules/deliberation/schema`. Write a short comment citing G-D7 (never the value) and design
  D3, including the note that a future feed must filter by `revealVoteAuthorship`.
- [x] 1.2 `tests/unit/audit/payload-allowlist.test.ts`: for each of the three types, accept
  `{stage: "invite"}` and `{}`. Refuse `{value: "no"}`, `{stage: "invite", value: "good"}` and
  `{stage: "maybe"}`, and assert that the refusal message does not contain the refused value. The
  existing "every key has a rule" test must stay green. **Deliberate break:** remove the `stage`
  value rule for `vote.cast`. The "every key has a rule" test and the `{stage: "maybe"}` case
  must fail. Report seeing them fail.

## 2. castVote: write only on a real change, and record the event

- [x] 2.1 `src/modules/deliberation/repository.ts` `castVote` (design D2). After
  `assertAccountCanVoteTx`:
  - add a plain SELECT pre-read of the caller's own `invite` row (`value`, `withdrawnAt`);
  - add `where: or(ne(vote.value, sql\`excluded.value\`), isNotNull(vote.withdrawnAt))` to
    `onConflictDoUpdate`;
  - add `.returning({ inserted: sql<boolean>\`(xmax = 0)\` })`;
  - with no row returned, record no event; with `inserted`, no pre-read row, or pre-read
    withdrawn, record `vote.cast`; otherwise record `vote.revised`.

  Write the event through `recordActivityEvent` in the same `tx`, with subject `application` /
  `applicationId`, the actor from `context`, and payload `{ stage: "invite" }`. Add a `ponytail:`
  comment on the unlocked pre-read (the same-voter concurrency ceiling, with PG 18 `RETURNING
  OLD` as the upgrade path).
- [x] 2.2 `tests/integration/deliberation/cast-vote.test.ts`. Add:
  - (a) a same-value re-send leaves every column unchanged, `updated_at` included, and adds no
    event;
  - (b) a same-value re-send after the round is paused is refused `round_not_open`;
  - (c) a first rating yields exactly one `vote.cast`, with the actor account and profile and the
    payload exactly `{stage: "invite"}`;
  - (d) `good` → `no` adds one `vote.revised`;
  - (e) a refused vote (paused round) adds no event.

  Read the events through a resident context: the 0018 policy hides them from the household
  account. The existing re-rating-after-withdrawal test asserts `vote.cast` too.
  **Deliberate breaks:** drop the `where` (then (a) fails on `updated_at` and the event count);
  swap the cast/revised branches (then (c) and (d) fail). Report seeing both fail.
- [x] 2.3 Grep `tests/` for any assertion that a same-value re-rate bumps `updated_at`, and adapt
  it to the new spec. Name the files changed in the report, or report none found.

## 3. withdrawVote

- [x] 3.1 `src/modules/deliberation/repository.ts`: export
  `withdrawVote(context, input: { applicationId: string })` exactly as design D1, steps 1–6.
  - Write a LOCK ORDER comment that cites drizzle/0028's obligation and why it is an upsert
    (alternatives (a) and (b) from D1).
  - Refusals map through the existing `toVoteError`.
  - `VoteError("not_found")` covers no live row, a concurrent withdrawal, and `inserted` (that
    case throws inside the transaction, so it rolls back).
  - The event is `vote.withdrawn`, `{stage: "invite"}`, in the same `tx`.
  - No server action and no UI (F5 change 4).
- [x] 3.2 New `tests/integration/deliberation/withdraw-vote.test.ts`, with per-run fixtures and
  teardown in `afterEach`.
  - (a) Rate `good`, withdraw. The row still exists. Assert every column: `id`, `householdId`,
    `roundId`, `applicationId`, `residentProfileId` and `stage` unchanged; `value` = `good`;
    `createdAt` unchanged; `withdrawnAt` not null; `updatedAt` ≥ `withdrawnAt`'s statement time.
    Exactly one `vote.withdrawn` is added, payload `{stage: "invite"}`.
  - (b) Withdraw → rate `no` → withdraw: one row, value `no`, withdrawn, `createdAt` the first's.
    The events are `cast`, `withdrawn`, `cast`, `withdrawn` in order.
  - (c) Withdraw with no vote, and a second withdraw: both `not_found`, nothing written, no event.
  - (d) Paused round: `round_not_open` with `roundStatus` `paused`, and the vote stays live.
  - (e) Application moved to `invited` (through the casting transition): `not_votable`, and the
    vote stays live.
  - (f) Participation removed after voting: `not_eligible`, and the vote stands (EC-4.7).
  - (g) Household account: `ProfileRequiredError`, with no query issued.
  - (h) A resident whose `vote` permission is stripped: `not_eligible`.
  - (i) After a withdrawal, `getAwaitingVoteCounts` counts the application again, and
    `getScreeningPass` deals it again.
  - (j) Never inserts: delete the caller's own row by raw SQL between pre-read and upsert. Do
    this deterministically, by running the delete in the same test before calling an internal
    hook, or by holding it in an uncommitted transaction. If neither is possible without a test
    seam, label (j) an invariant guard and assert only that withdrawing on a deleted row returns
    `not_found` and leaves no row.

  Assert error codes in every refusal case, not only end states. **Deliberate breaks:** replace
  the upsert with a plain `UPDATE` (the lock test in 3.3 must fail); remove the `inserted` check
  ((j) must fail where deterministic); write `vote.cast` instead of `vote.withdrawn` ((a) fails).
  Report each.
- [x] 3.3 New `tests/integration/deliberation/withdraw-vote-lock-order.test.ts`. Hold an
  uncommitted transaction that locks the application `FOR UPDATE`, standing in for
  `deleteApplication`. Start `withdrawVote` and show that it blocks *before* taking the vote row
  lock: from a third connection, `SELECT … FROM vote WHERE id = … FOR UPDATE NOWAIT` succeeds
  while the withdrawal waits. Then release. **Deliberate break:** a plain `UPDATE` version locks
  the vote row first, so the NOWAIT probe fails with `55P03`. Report seeing it fail. Follow the
  pattern of `tests/integration/policy/revoked-membership-sign-in.test.ts` for the held
  transaction.
- [x] 3.4 `tests/integration/policy/authorization-matrix.test.ts`: classify `withdrawVote` as a
  mutator. Add a case in the `castVote refuses who may not vote (M6)` describe: a claimed plain
  resident with no participation gets `not_found`; the household account gets
  `ProfileRequiredError`. **Deliberate break:** leave `withdrawVote` unclassified, and the
  "every exported function" test must fail.

## 4. C1: digit keys

- [x] 4.1 `src/app/(resident)/casting/screening/screening-deck.tsx`:
  - Factor the body of `onSubmit` after its guard into `rate(value: VoteValue)`, and have
    `onSubmit` call it.
  - Extend the `keydown` handler: `1`–`4` call `rate(VOTE_VALUES[n - 1])`.
  - Keep the existing guards (modifier, text field, `:popover-open`) and add three:
    `document.querySelector("dialog[open]")`, `stateRef.current.pending !== null`, and a refusal
    showing (read it through a ref).
  - Use `event.key`, so the numpad works too.
  - No hint on the touch layout. Do not add a visible key hint unless one already exists for ←/→.
- [x] 4.2 Test: `rate()` is component-internal and there is no rendering test harness for the
  deck. Extract the key mapping and guard decision into a pure helper, `deckKeyAction(event,
  state)`, in `deck-state.ts`, and unit-test it in `tests/unit/screening/deck-state.test.ts`:
  - `"3"` → rate `good`;
  - `"5"` → none;
  - with ctrl → none;
  - pending → none;
  - `"ArrowLeft"` → back (the existing behaviour, kept).

  **Deliberate break:** an off-by-one mapping. Report seeing it fail.

## 5. Praise

- [x] 5.1 `src/app/(resident)/casting/screening/screening-deck.tsx`: on `phase === "done"`, push
  `/casting?rated=1` when `Object.keys(state.ratings).length > 0`. The deck never seeds
  `ratings`, since `initialDeckState` is called without them; check this and note it in a
  comment. Otherwise push `/casting`.
- [x] 5.2 `src/app/(org)/rounds/[id]/saved-toast.tsx`: widen `param` to
  `"saved" | "updated" | "rated"` and add an optional `tone?: "celebrate"`, passed through.
  `src/ui/success-toast.tsx`: with `tone="celebrate"`, render an inline SVG check mark whose
  stroke draws (~400 ms) and a few small stars in `--vote-absolutely` around the icon only, all
  `aria-hidden`. `src/app/globals.css`, beside `.toast`: the keyframes, with a
  `prefers-reduced-motion` fallback (no draw, no stars). If moving `SavedToast` to `src/ui/` is
  needed for an import from `(resident)`, move it and update its two callers in the same commit.
- [x] 5.3 `src/app/(resident)/casting/page.tsx`: when `searchParams.rated` is present and the page
  does not redirect, render `<SavedToast param="rated" tone="celebrate" message={…ratedToast} />`.
  Read the Next.js version's `searchParams` guide in `node_modules/next/dist/docs/` first: it is a
  Promise in this version.
- [x] 5.4 `src/app/(resident)/dashboard/page.tsx`: render `allRated` as `<div
  className="callout-celebratory">`, with the heading (`s.start.allRated`, unchanged, in the brand
  colour as `.callout-celebratory` defines it) and a body line `s.start.allRatedBody`. No icon.
  Leave `dashboard-view.ts`'s condition untouched.
- [x] 5.5 `src/ui/strings/de.ts` and `src/ui/strings/en.ts`, as twins:
  - `casting.ratedToast`: „Geschafft! Deine Stimmen sind drin." / "Done! Your votes are in."
  - `start.allRatedBody`: „Damit bringst du eure WG ein gutes Stück näher an die Entscheidung." /
    "That brings your household a good step closer to the decision."

  Use the strings exactly as written; do not reword them.
- [x] 5.6 `tests/unit/start/dashboard-view.test.ts`: add "a withdrawal takes it away", with the
  awaiting count 1 for the round so `allRated` is false. The integration half is 3.2 (i).
  **Deliberate break:** `>= 0` instead of `=== 0`. Report seeing it fail.

## 6. Verify and record

- [x] 6.1 `npm run verify` passes. On a failing integration test under shared-dev overlap, rerun
  that file alone before treating it as real.
- [x] 6.2 Report every deliberate break seen failing (1.2, 2.2, 3.2, 3.3, 3.4, 4.2, 5.6), and the
  outcome of 2.3. Do not touch `test/guarded.manifest.json` unless a G-D test was added. G-D7 is
  already covered by the payload-allowlist test; if its manifest entry names that file, leave it.
