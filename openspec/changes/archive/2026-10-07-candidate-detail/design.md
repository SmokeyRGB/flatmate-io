## Context

See proposal.md for why. The current state this design builds on (main `96306a8`):

- **`getRanking`** (`src/modules/deliberation/repository.ts`) is the scoreboard's one read, in one
  read-only transaction. The order of its reads is its consistency argument (Copilot round, PR #54):
  1. the `vote` permission;
  2. the round, through `listVoterRoundsTx`;
  3. `parseRoundRules`;
  4. ONE statement for every non-withdrawn `invite` vote of the round;
  5. only after that, the candidates through `listVoteCandidatesTx(scope "board", fields "names")`;
  6. the tally basis through `getRoundTallyBasisTx`;
  7. the V-4 filter, then `computeRanking` per group.

  It already holds the per-candidate vote values in a local map. It never exposes them.
- **`listVoteCandidatesTx`** has a closed options type: `"board"` with `"cards"` does not compile.
  Its comment states why: the board never needs the card columns of an `invited` applicant
  (Q-4, Art. 5(1)(c)). The detail does need them, so this change widens that surface on purpose
  (D3).
- **`getRoundTallyBasisTx`** already joins `resident_profile` to find the counted voters. It returns
  only their ids.
- **`openRoundTx`** writes `settings_snapshot` with four keys. `parseRoundRules` reads three of
  them strictly.
- **Settings.**
  - `VOTING_PROCEDURE_FIELDS` (four entries) is the audit allow-list and the patch type of
    `updateHouseholdSettings`.
  - The patch values are typed `unknown`, and the column patch is listed by hand.
  - The settings form sends only `quorumShare`.
  - There is **no `LOCKED_SETTINGS_FIELDS`** and no procedure lock. The plan's wording predates
    FR-1.21's relaxation (2026-10-05). The snapshot is the only freeze.
- **The scoreboard UI.** `ranking-board.tsx` is a server component. `ScoreRing` is local to it, and
  the rows are plain `<li>`s with no link. The resident card body (`CardBody`) is local to
  `screening-deck.tsx`. There is no distribution component.
- **No intercepting or parallel routes exist.** Dialogs are native `<dialog>`, and popovers use the
  native `popover` attribute.

## Goals / Non-Goals

**Goals:**
- The detail and the scoreboard can never disagree on visibility or numbers, because they run the
  same code.
- A detail with authorship off carries no voter identity, by type as well as by test.
- The scoreboard's response changes only by its new group, the applications out of the running
  (D9). No distribution and no voter data reach it.

**Non-Goals:**
- Revising or withdrawing one's own rating (change 4).
- Notes (C4).
- RLS on `vote` (change 5).
- The named who-has-voted section of FR-5.19b (v0.2).
- Validating the other four settings on the write path (change 6). Only the new flag is validated
  here.

## Decisions

### D1 · An intercepted route over the board, and a full page for direct links

The human wants a card that slides over the scoreboard and can be swiped away, with the scoreboard
visible beneath it (2026-10-07). That needs the board rendered underneath, which a plain route
cannot give. Next 16's intercepting and parallel routes can
(node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/intercepting-routes.md,
parallel-routes (Next docs) §Modals):

```
src/app/(resident)/casting/
  layout.tsx                                   NEW: {detail} + a wrapper <div id> around {children}
  page.tsx, loading.tsx                        the scoreboard (rows become links, D8/D9)
  candidate/[applicationId]/page.tsx+loading   full page: a direct link or a reload
  @detail/default.tsx                          null: no card
  @detail/[...rest]/page.tsx                   null: closes the slot on any other soft navigation
  @detail/(.)candidate/[applicationId]/
    layout.tsx                                 DetailSheet (client) around {children}: ONE frame
    page.tsx                                   the card's content: a tap on a row
    loading.tsx                                the card's skeleton (plain content, no frame)
  screening/...                                unchanged
```

**Why the static `candidate/` segment** (pre-mortem finding 1, verified in
`node_modules/next/dist/esm/lib/generate-interception-routes-rewrites.js`):
- Next compiles an intercepting route into a `beforeFiles` rewrite, conditioned only on the
  `Next-Url` header matching the intercepting route and its descendants.
- `@detail/(.)[applicationId]` would rewrite `/casting/:applicationId` for any soft navigation made
  from under `/casting`. That includes `/casting/screening`: the „vote first" redirect from the
  board, or from an open card, would land in the sheet with `applicationId = "screening"`.
- Static segments win only in the file router, which runs after the rewrite.
- With `candidate/` as a static prefix, no dynamic segment sits beside `screening`.

- **Both pages render one server component.** `CandidateDetailView({ applicationId, mode })` calls
  `getCandidateDetail` and the `shouldOpenScreening` redirect (Q-2), so visibility cannot differ
  between the two. Only the frame differs: `DetailSheet` (client, D10) for the card, and a plain
  page with a back link for the full page.
  - **The frame lives in the intercepted segment's `layout.tsx`.** Next nests layout ⟶ loading ⟶
    page, so the skeleton and the content then share one `DetailSheet` instance. The enter
    animation, focus and `inert` run once.
  - **`CandidateDetailView` never imports `DetailSheet`.** `ViewTransition` exists only in Next's
    compiled React, not in `node_modules/react` 19.2.8, so a vitest render of any module that
    pulls it in renders an undefined element (pre-mortem finding 10).
- **The board's HTML carries nothing new.** The card is a server render of the intercepted route,
  fetched for one candidate on the navigation. This is why the earlier objection to a sheet (every
  row's detail in the board's HTML, AC-5.16) no longer applies.
- **`[...rest]` returning null closes a stale slot.** A soft navigation keeps a parallel slot's last
  active state, so without it a navigation from an open card to `/casting/screening` could leave
  the card mounted. That redirect leaving no card behind is a walkthrough check.
- **The round comes from the application, not the address** (D2). There is no `?round=` to forge,
  and a foreign round's application falls into the one refusal by construction. The full page's
  back link is `/casting?round=<its round>`.
- **Refreshing after an invite.** `inviteApplicationAction` also calls
  `revalidatePath("/casting/candidate/<id>")`, so a full-page card refreshes. An open sheet
  re-renders with the current tree on the action's refresh. Both are walkthrough checks.
- **`pending-feedback.ts`.** `[...rest]/page.tsx` renders null, so it gets a named entry in
  `PAGE_LOADING_EXEMPTIONS` ("renders null; closes the detail slot"). Every other new `page.tsx`
  has its `loading.tsx`.
- **This is the codebase's first intercepting route.** The tree above is all of it.

Alternatives:
- **A native `<dialog>` with a client fetch.** Rejected. It needs a second read surface, it loses
  `loading.tsx`, and a reload loses the card.
- **A plain route with a page-to-page slide (View Transitions alone).** Rejected. During a swipe
  the board is no longer rendered, so "the scoreboard visible beneath the card" cannot hold.

### D2 · One core for the board and the detail

A non-exported `readRoundTallyTx(tx, context, round, rules)` is extracted from `getRanking` steps
4–7. It returns:
- the candidates (board scope, names);
- the counted voter set with display names, and the denominator;
- per candidate, the counted votes as `{ voterId, value }`, and the count of non-counted
  (former-member) votes;
- the viewer's own-voted set;
- an `isVisible(candidate)` predicate;
- `openRoomCount`.

The statement order stays exactly as it is, including the comment carrying the consistency
argument.

`getRanking` keeps its steps 1–3, calls the core, and maps the result onto `Ranking`. The type
gains exactly one field, `closed: RankedGroup` (D9). The values the board does not need (voter
ids, former counts) stay inside the module.

The regression check:
- the existing cases of `ranking.test.ts` pass unedited (new D9 cases are added beside them);
- `tests/unit/casting/ranking-board.test.ts` gains only `closed` in its fixture.

Any other edit to those cases is a stop-and-report. Three other tests change because of this
change, and are named in tasks (pre-mortem finding 2):
- `screening-pass.test.ts:292-308` is the Q-4 exclusion test, which D9 inverts;
- `screening-pass.test.ts:337-338` asserts `countedVoterIds` (D6);
- `settings-while-round-open.test.ts:107/115/124` compares the whole snapshot (D5).

`getCandidateDetail(context, applicationId)` is the new export (the plan's `getRankingEntry`,
renamed after the screen; the plan is updated). It runs in one read-only transaction:
1. It throws `ProfileRequiredError` for a profile-less context, like `getRanking`.
2. `assertHasPermissionTx(…, "vote")`. A refusal gives `{ kind: "refused", reason: "not_eligible" }`,
   the board's own refusal, which names nothing about the application.
3. A malformed id gives `not_found`, with no query.
4. `listVoterRoundsTx(tx, context)`, all of the viewer's rounds. Then it reads the application's
   round with the new port of D3. Absent (own, foreign, a state the board does not hold, non-participant, missing) gives
   `not_found`.
5. A round that is not `open`/`paused` gives `round_not_available`, as on the board. Broken rules
   give `rules_invalid`.
6. The D2 core for that round. The candidate must be in its candidate set; if not, `not_found`
   (belt and braces, because the port and the core use the same predicate). The candidate's
   visibility comes from the same `isVisible`.
7. Its score comes from `computeRanking` over **this one candidate**. Score and quorum are
   per-candidate functions, so this equals its board score. `leading` is ignored (no rank on D2).
   It is never re-implemented.

Result type (a discriminated union; names are illustrative):

```
CandidateDetail =
  | { kind: "hidden";   round; application: { id, name, state } }
  | { kind: "unscored"; round; application: CardFields & { state }; n; needed; denominator;
      formerCount; voters: string[] | null }               // null when the flag is off
  | { kind: "scored";   round; application: CardFields & { state }; score; n; denominator;
      distribution: Record<VoteValue, number>; explanation: ScoreExplanation;
      formerCount; authorship: Record<VoteValue, string[]> | null }   // null when the flag is off
  | { kind: "refused"; reason: "not_found" | "not_eligible" | "rules_invalid" }
  | { kind: "refused"; reason: "round_not_available"; status }
```

Voter **ids** never leave the repository. Only display names do, and only when the round's frozen
flag is on. Names are sorted with `Intl.Collator("de")`, which is deterministic and reveals nothing
about vote order.

- **Alternative: `getCandidateDetail` calls `getRanking` and filters.** Rejected. `getRanking`
  deliberately drops values and voters, so this would mean widening its payload or a second
  transaction. The board would also pay for detail fields.

### D3 · A one-application card port, not "board" + "cards"

New casting export `getVoteCandidateCardTx(tx, context, roundIds, applicationId)` returns the
application's id, round id, state and the four card columns (`applicant_name`, `age`,
`message_raw`, `attributes`), or `null`.

Its WHERE is the **same** predicate as `listVoteCandidatesTx`'s board scope, factored into one
private `voteCandidateWhere(context, roundIds, states)` that both call. That covers household,
round ∈ the viewer's rounds, state ∈ the board states (D9), not own (`became_resident_id IS
DISTINCT FROM`), and the active-voter EXISTS. No contact column, no `collected_from`, no `source`,
no audit column. `VoteCandidateOptions` stays closed, so no list read can pull every board row's
card.

**The widening, argued against the earlier design** (F5 `ranking` D3, the port comment). There are
two widenings.

1. **Card columns of board rows.** The board exposed only the names of `invited` applicants. This
   port adds the four card columns, one application at a time, on explicit request, under the same
   voter predicate. That is what the residents decide on, within their own round. They saw the same
   card in the pass while it was `new`/`screened`, unless it left that state before they voted.
2. **The end states** (D9). Q-4 left them out on Art. 5(1)(c) grounds. The human reversed that on
   2026-10-07 („should still be visible in the round, and scoreboard, until deleted"). The purpose
   is the household's own record of whom the round decided about, inside that round.
   - The limit is deletion: F3 change 4 removes the application and its votes.
   - Retention is not changed by this read, and `archived` (retention expiry) stays off.
   - **The known gap, accepted by the human (2026-10-07, "full card").**
     - No deletion path exists yet (F3 change 4), and no erasure or consent flag either.
     - So a `withdrawn` or `declined_by_applicant` applicant's age, free-text message and
       attributes stay visible to the round's voters for the life of the round, even after an
       Art. 7(3)/17/21 request.
     - The alternative offered, end states showing name, state and results only, was declined.
     - The register records the gap, with F3 change 4 as its owner (task 1.3).

No contact is ever read (F4 Q-2). The pre-mortem attacked both points (finding 6). The register
gets the amendment of Q-4 and the gap (task 1).

- **Alternative: allow `{ scope: "board", fields: "cards" }`.** Rejected. It reopens the list-wide
  read the type was built to forbid.

### D4 · The arithmetic is a pure function beside the scoring rule

`ranking.ts` gains `explainScore(weights, values): ScoreExplanation`. It returns:
- the weight per vote, in the vote-value order `no → definitely`;
- n and the exact sum;
- the mean as `{ value: Scaled-decimal, exact: boolean }`;
- the max weight;
- the raw percentage as `{ value, exact }`;
- the score.

The score comes from the **same** internal function `computeRanking` uses. `computeRanking`
accumulates sum and counts in one loop, so the factored function is the last step,
`scoreFromSum(sum, n, max)` (pre-mortem nit), and no second formula exists. All of this uses BigInt
and the existing `Scaled` helpers.

Display (`de-DE` decimals, at most two places; `≈` when the shown value is not exact):

```
(0 + 3 + 3 + 5) ÷ 4 = 2,75  →  2,75 ÷ 5 × 100 = 55
(3 + 3 + 5) ÷ 3 ≈ 3,67      →  3,67 ÷ 5 × 100 ≈ 73,33  →  73
(5 + 4) ÷ 2 = 4,5           →  4,5 ÷ 6 × 100 = 75
… = 72,5  →  73 (x,5 aufgerundet)
```

The first line is the spec's example. The raw percentage is computed from the exact mean, never
from the rounded display value. Its `≈` covers the visible discrepancy, and the last arrow names
the rounding when one happens.

A unit test runs `explainScore(...).score === computeRanking(...)`'s score over a generated grid of
value multisets and weight sets, including decimal weights and the .5 boundary.

### D5 · The flag in the snapshot: absent = off, malformed = refused

- **Storage.** Migration `drizzle/0035_reveal_vote_authorship.sql` runs `ALTER TABLE
  household_settings ADD COLUMN IF NOT EXISTS reveal_vote_authorship boolean DEFAULT false NOT
  NULL`. Drizzle gets `revealVoteAuthorship` on `householdSettings` (`identity/schema.ts`). It is
  expand-only, so other branches' code ignores the column.
- **Freezing.** `openRoundTx` adds `revealVoteAuthorship: settings.revealVoteAuthorship` to the
  snapshot. It is read from the same FOR SHARE-locked settings row, so the existing lock pair with
  `updateHouseholdSettings` (FOR UPDATE) covers it.
- **Reading.** `parseRoundRules` returns `revealVoteAuthorship: boolean`. A missing key gives
  `false`. A present key that is not a boolean gives `null`, so `rules_invalid` for the board too
  (spec delta `deliberation/ranking`). The board never uses the flag, but a snapshot with one
  unreadable rule is not trusted for the others (EC-5.5's spirit), so this is deliberate.

**Why absent ≠ fallback.** EC-5.5 forbids filling in a rule that was in force but is unreadable.
A round opened before 0035 had no such setting, and "off" is the default the column itself gets.
That is the state of the world at opening, not a guess.

### D6 · Voter names come from the tally port

`getRoundTallyBasisTx` returns `countedVoters: { id, displayName }[]`, in place of
`countedVoterIds`. It selects `rprof.display_name` from the join it already has, so there is no new
join, no new predicate and no identity import in deliberation (kontextgrenzen §4).

Its two readers follow: `getRanking`, and `tests/integration/deliberation/screening-pass.test.ts:337`
(the only test assertion on the field). `getRanking` uses only the ids. Names exist server-side for every board read but never reach its
payload. The extra data is one text column of the household's current residents, which every
resident already sees on „Wer wohnt hier".

- **Alternative: a separate names port, called only when the flag is on.** One more export, one
  more matrix row, and the same predicate a third time (the port comment warns against that).
  Rejected for now. If the pre-mortem finds the always-read names objectionable, an `{ withNames }`
  option is the fallback.

### D7 · The settings toggle

- `VOTING_PROCEDURE_FIELDS` gains `"revealVoteAuthorship"`, and its comment says five.
  - **Audit.** The audit allow-list follows automatically, and `payload-allowlist.test.ts` must
    still pass.
- `updateHouseholdSettings` gets a `columnPatch` line. It **refuses a non-boolean** value with a
  thrown error before the UPDATE. Postgres would otherwise cast the string `'on'` or `'yes'` to
  `true` from a careless caller.
- `updateSettingsAction` sends `revealVoteAuthorship: formData.get("revealVoteAuthorship") ===
  "on"`. A form always submits the checkbox's state, and absent means unchecked. So every save
  writes both fields, and the audit `field` lists both. That matches today's behaviour for
  `quorumShare`, which is also always sent.
- `SettingsForm` gets a checkbox labelled „Stimmen-Urheberschaft zeigen" (human, 2026-10-07). It has a short hint that names the
  trade-off: visible names can anchor later voters (`screens/O-organisation.md`, Abstimmungsverfahren
  „mit Hinweistext zum Anker-/Bandwagon-Tradeoff"), and the change reaches only rounds opened
  afterwards. That second point is already covered by the existing `appliesToNextRound` callout.
- The page passes the current value. `getHouseholdSettings` selects the whole row, so the applier
  checks that the column arrives.

### D8 · UI composition, shared pieces justified

- **`ScoreRing`** moves from `ranking-board.tsx` to `casting/score-ring.tsx`, unchanged, because
  there are now two users. **`CardBody`** moves from `screening-deck.tsx` to a shared
  `casting/candidate-card-body.tsx`, because the deck and the detail render the same C1 content.
  Each move is the second-use rule, and both moves keep markup and classes identical so that the
  deck's tests pass untouched.
- **`DistributionBar`** (new, server component) draws four segments in the rating colours from
  `09-Design-System.md` / the existing vote-choice tokens, in `VOTE_VALUES` order (Nein left,
  Unbedingt right, as the voting buttons; human 2026-10-07). Its visible text equivalent („1×
  Nein, 0× Eher nicht, 1× Finde gut, 2× Unbedingt") is the accessible name too, not a hidden
  duplicate. With the flag on, each rating line lists its names.
- **The detail's „(?)"** reuses the board's native-popover pattern (`deck-help`, `weights-popover
  card`) and `WeightsList`, plus the explanation line from D4.
- **„Einladen"**: `showInvite(canChangeState, state)` and `InviteDialog` with `{ roundId,
  applicationId, applicantName }`, only for `scored`/`unscored` kinds. `holdsPermission(…,
  INVITE_PERMISSION)` is read beside the detail, as on the board. The dialog receives no card field
  (spec `casting/invitation`).
- **Rows**: in `ranking-board.tsx`, scored and unscored rows wrap their name and ring in a
  `next/link` to the detail, with `LinkPendingHint`, in „Score", „Eingeladen" and the closed group
  (D9). „Einladen" stays a sibling, so the dialog never sits inside the link. Hidden rows stay
  unlinked.
- **Strings**: under `de.casting.detail` (distribution text, participation, former note with
  singular and plural, „noch x Stimmen nötig", hidden explanation, back link) and `de.settings`
  (toggle label and hint). `votesLabel` is reused for plurals.

### D9 · The end states on the board: one more state list, one more group

- **States.** In `casting/repository.ts`, `BOARD_STATES` gains `rejected_by_household`,
  `declined_by_applicant` and `withdrawn`, and its comment records the 2026-10-07 amendment of
  Q-4.
  - **`archived` stays out** (human, 2026-10-07). It is the retention-expiry state
    (`domain/zustandsmaschinen.md`), and every `->archived` rule is `pending: retention` in v0.1.
  - `deleted_at` is not filtered by the port today. Deletion is F3 change 4's (EC-5.9), which
    filters it for every scope at once. `VOTABLE_STATES` is unchanged. The `scope` type stays closed: there are still
  exactly two scopes, and the board's list is still decided in casting.
- **Visibility needs no new rule.** `isVisible` already reveals any candidate whose state is not
  `new`/`screened`, and `vote_guard` refuses votes on every other state.
  - **The reopen path.** `transitions.ts` allows `rejected_by_household`/`withdrawn` -> `new` |
    `screened` | `invited` (`state_only`, `change_application_state` plus
    `reverse_application_state`). A moderator who has not voted can therefore reject, read, and
    reopen.
  - That is the same class as R-8's accepted `invited -> screened` reversal, and it is now a
    second path. It is accepted and recorded (task 1.3).
  - A reopened candidate is hidden again for a viewer who has not voted, which the ranking delta's
    scenario „Reopened" pins.
- **Grouping.** `getRanking` splits the visible candidates three ways: decided (`new`/`screened`;
  today's filter `state !== "invited"` would swallow the end states, so it becomes an explicit
  `new`/`screened` test), invited, and `closed` (the three end states). `closed` is ranked like `invited`, with
  `openRoomCount` 0, so it takes no highlight slot.
- **UI.** The group renders as a native `<details>`, closed by default. Its `<summary>` is the
  heading „Ausgeblendet" with the row count beside it (human, 2026-10-07), so it needs no client
  JavaScript and is keyboard-operable.
  - Rows carry their state label from the existing state words (`de.ts` „Abgesagt (von uns)",
    „Zurückgezogen", …), and „Einladen" never appears (`showInvite` already refuses those states).
  - The empty state counts the group too (spec delta: only out-of-the-running rows still show the
    board). `ranking-board.tsx`'s `total` adds `closed`.
- **Reopening (P-4)** stays where it is (O4, moderators), and the board does not offer it.

### D10 · The sliding sheet and the swipe

- **`DetailSheet`** (client, `casting/detail-sheet.tsx`) is the intercepted segment's
  `layout.tsx` frame (D1).
  - A fixed full-height panel takes the right edge on wide screens and the full width on phones,
    over a transparent backdrop, so the board stays visible and is not dimmed into invisibility.
  - It has a close button (`router.back()`), focus moves to the sheet on open, and Escape closes
    it.
  - While the sheet is open, its effect sets `inert` on the board's wrapper `<div id>` (rendered by
    the server `casting/layout.tsx`), and removes it on unmount.
- **Slide in and out.** Navigations are transitions in the App Router, so React `<ViewTransition>`
  around the sheet animates both directions declaratively. It uses `enter` and `exit` classes with
  CSS keyframes (translateX 100% → 0 and back) in `globals.css`
  (node_modules/next/dist/docs/01-app/02-guides/view-transitions.md). This covers the close
  button, the browser's back and the Android back gesture alike.
  - Where the View Transitions API is missing, the card simply appears and disappears.
  - `prefers-reduced-motion: reduce` turns the keyframes off.
- **Swipe: share the rule, not the handlers** (pre-mortem finding 8, YAGNI).
  - **What is shared.** The constants (`SLOP_PX`, `HORIZONTAL_RATIO`, `RELEASE_FRACTION`,
    `RELEASE_MAX_PX`, `FLICK_MIN_PX`, `FLICK_MIN_SPEED`) and one pure function,
    `releaseDecision({ dx, speed, width, cancelled })`, move to `src/ui/swipe.ts`.
  - **What the function covers.** The far threshold, the flick rule, and `cancelled`: a
    `pointercancel` commits only on the far threshold, the 2026-10-02 mobile fix.
  - **What stays local.** Each component keeps its own pointer handlers: the deck's two
    directions, its `dx/4` resistance at the ends and `canGoBack`/`canGoForward`, and the sheet's
    rightward-only drag. The horizontal-ratio test also stays where it is today, decided once at
    the slop move.
  - **Why not a hook.** A shared hook would need `onDrag`, `onCommit` and `allowed(dir)` callbacks
    for two users that differ in nearly everything but the rule.
  - **The deck's safety net.** The deck has no swipe test today, so "its tests pass" proves
    nothing. A new unit test pins `releaseDecision` including `cancelled`. The walkthrough swipes
    the deck too. Any behaviour change in the deck is a stop-and-report.
  - The sheet follows the finger to the right only, via a transform on the panel. The board beneath
    is real DOM, so it is visible through the gap.
  - A commit animates the panel off-screen and then calls `router.back()`. The exit view transition
    is suppressed for that one navigation, so the card does not jump back and slide again.
  - A release short of the threshold springs back.
  - `touch-action: pan-y` keeps vertical scrolling inside the card native, so a vertical scroll is
    never a swipe.
- **The full page** (direct link) has no sheet. A right swipe there navigates to
  `/casting?round=<id>`, and so does its back link.
- **Scroll position.** The board is never unmounted under the sheet, so closing returns to the
  same scroll position by construction.

## Invariant paths (design rule: every path to the guarded state)

**Vote values and voter identity of a candidate (V-1, V-2, V-4)**

| Path | Where enforced |
|---|---|
| `getRanking` | Unchanged, through the D2 core |
| `getCandidateDetail` | The same D2 core and D3 port predicate. Flag off gives a `null` authorship by type |
| The page/route | Renders only. No visibility logic, and it imports no `...Tx` port (matrix assertion) |
| Raw SQL as `app_runtime` | RLS gives household isolation only. V-1/V-2 on `vote` is change 5 (register row „Stimmen anderer lesbar …", read half), unchanged by this change |
| `SECURITY DEFINER` | None reads `vote` |
| Concurrent `castVote` | The D2 statement order holds (votes before candidates). A vote between them is absent, never leaked |

**Card columns of an application**

| Path | Where enforced |
|---|---|
| `getOrganisationApplication` | Permission-gated (unchanged) |
| `listVoteCandidatesTx` `"cards"` | Votable scope only (unchanged) |
| `getVoteCandidateCardTx` | One application, board scope, the shared predicate (D3) |

**Writers of the same state**

- `household_settings.reveal_vote_authorship` has two writers. `updateHouseholdSettings` (FOR
  UPDATE) is serialized against `openRoundTx`'s FOR SHARE read, the existing lock pair (LOCK ORDER
  comment). `registerHousehold` inserts the row and relies on the column default; there is no
  concurrent writer before the row exists.
- `casting_round.settings_snapshot` has one writer, `openRoundTx`. It is unchanged except for the
  added key.
- The detail itself writes nothing. „Einladen" writes through `inviteApplication`, unchanged and
  already pairwise-argued in change 2.

**Relationships the joins rely on.** The relationships this change relies on are already
constrained by earlier migrations:
- a voter has at most one live participation per round, through
  `round_participation_active_pairing_idx` (`drizzle/0011`, unique on `(round_id,
  resident_profile_id) WHERE removed_at IS NULL`), so a name is listed once;
- `household_id` is on every join, per the existing port comment.

The design adds no new join.

## Risks / Trade-offs

- **Invited and out-of-the-running applicants' cards reach residents who never saw them in the
  pass** (D3, D9) → this is argued in D3, and the withdrawn/declined gap is accepted and
  registered. The read is single-application and voter-gated, and carries no contacts.
- **Reject-and-reopen reveals results to a moderator who has not voted** (D9) → this is the same
  class as R-8, accepted and registered. A reopened candidate is hidden again.
- **With the flag on, residents can work out who has not voted** (the complement of the names) →
  this is accepted by opting in. It is the reason names never appear with the flag off (human,
  2026-10-07). The register's "names imply non-voters" row for FR-5.19b stays as it is.
- **With the flag off, someone watching the distribution change between two visits can guess a
  rating from outside knowledge of who just voted** → this is inherent to any live aggregate, and
  the board's score already moves the same way. No mitigation in v0.1.
- **The core extraction could shift `getRanking`'s statement order** → the regression check is the
  untouched `ranking.test.ts`, whose cases do not change in this change. The diff review reads the moved block line by line against the
  original.
- **Display rounding confuses a reader who recomputes** (3,67 ÷ 5 × 100 = 73,4, while the card shows
  ≈ 73,33) → the `≈` signs mark it, and the final score is always the rule's exact result.
- **Names are read on every board load** (D6) → this is a deliberate simplicity trade, and the
  fallback is named in D6.
- **The first intercepting route.** Slot state on soft navigation, the redirect inside an
  intercepted page, and the `[...rest]` catch-all are new ground → the D1 tree is fixed in tasks,
  including the static `candidate/` segment the pre-mortem found necessary. A walkthrough covers
  the paths: open, back, swipe, and redirect-while-open.
- **View Transitions vary by browser** (the Next guide warns about Safari) → the sheet works
  without them, and only the slide is lost. The swipe does not depend on them.
- **Extracting the release rule could change the deck's feel** → only constants and a pure
  function move, and the function is unit-tested, including `cancelled`. The walkthrough swipes the
  deck too.
- **End-state rows lengthen the board** → the group is collapsed by default and sits below the rows
  that still need a decision.

## Migration Plan

1. Write `drizzle/0035_reveal_vote_authorship.sql` by hand, re-runnable, with a header comment like
   0034's. Add the `_journal.json` entry (idx 35, `when` above 0034's) and `meta/0035_snapshot.json`
   (via `drizzle-kit generate`, then hand-edited to `IF NOT EXISTS`, as 0034 was).
2. This is expand-only (ADD COLUMN with a default), so the agent may apply it. Apply it **late**,
   right before `npm run verify`, to `flatmate-io-dev`. Then confirm through the catalog that the
   column exists with its default; `data-inventory-live.test.ts` does this too. Production stays at
   0012.
3. **Rollback.** The code ignores a missing key (absent = off), and older branches ignore the
   column. A drop would be a human-run `DROP COLUMN IF EXISTS` and is not planned.
