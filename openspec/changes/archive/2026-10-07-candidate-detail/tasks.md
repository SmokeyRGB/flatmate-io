## 0. Before apply

- [x] 0.1 Check that `feat/candidate-detail` is at `main` (`71af520` or later: #60 unified-app-header is in, which moved the header and menu into `src/app/_frame/`) and that
  `drizzle/` ends at `0034_founding_link.sql`. If `0035` is taken on `main` by then, stop and ask.
- [x] 0.2 **No commits in this apply** unless the orchestrator says otherwise. Leave every change in
  the working tree for review.
- [x] 0.3 Fixtures for every test below:
  - a moderator comes from `setMemberRole` or `createTestModerator`;
  - a plain resident comes from `claimPlainMember`;
  - permission is read as stored, never as a role;
  - former members come from `setMovedOut` / `removeMember` / `reactivateMember`, as in
    `tests/integration/deliberation/ranking.test.ts:426-505`;
  - shared households use `registerHousehold` directly (the global sweep);
  - teardown goes in `afterEach`;
  - anything unique project-wide is random per run.
- [x] 0.4 Run `npm run verify` once before the first edit and record the test count.

## 1. Docs (working tree)

- [x] 1.1 `docs/02-SRD.md` §5.4: record `reveal_vote_authorship` as pulled into v0.1 (human R-1,
  2026-10-05). Use the section's own row shape. Take a new `S-*` id only per `docs/README.md` §3 and
  `docs/SPEC-INDEX.md`, and add the SPEC-INDEX row if the topic has none.
- [x] 1.2 `docs/backlog/requirements/F5-requirements.md` FR-5.21a: add a V1.x note (human,
  2026-10-07). With the setting on, an unscored candidate's detail lists who has voted, without
  ratings. With it off, no names ever, because a distribution compared across visits would tie a
  rating to a name. AC-5.21a gets the matching clause. Note that FR-5.19b's named section stays
  v0.2 (Q-5).
- [x] 1.3 `docs/review-log.md` §Offene-Punkte-Register, in the register's own shape and dated:
  - a row for the 2026-10-07 decision above;
  - a row "the detail shows the card of `invited` applicants to the round's voters" (design D3);
  - a row for the accepted gap (human, 2026-10-07, "full card"): withdrawn/declined applicants'
    cards stay visible to the round's voters until F3 change 4's delete path exists. Owner: F3
    change 4;
  - extend the R-8 row (reversal anchoring) with the second path: reject (or withdraw) then reopen
    lets a moderator who has not voted see results (design D9). Accepted.
- [x] 1.4 `docs/screens/D-casting-tab.md` D2: replace the stale "F5 Änderungen 2 und 3" with this
  change's name, and add the below-quorum shape (no ring, no distribution; names only with the
  setting on). D1: rows open D2. Correct the toggle's label to „Stimmen-Urheberschaft zeigen" (human,
  2026-10-07) in `docs/screens/rahmenwerk.md` §8.6 and `docs/screens/O-organisation.md`
  (Abstimmungsverfahren).
- [x] 1.5 Q-4 amendment (human, 2026-10-07: „A rejected application should still be visible in
  the round, and scoreboard, until deleted"). Record it in:
  - the F5 packet: a V1.x note at FR-5.22 / the Q-4 note, with the three end states
    (`rejected_by_household`, `declined_by_applicant`, `withdrawn`; `archived` stays off, human
    2026-10-07) and the collapsed group „Ausgeblendet" below „Eingeladen";
  - `docs/screens/D-casting-tab.md` D1: the group, collapsed by default, rows with their state, no
    „Einladen", no highlight;
  - `docs/review-log.md`: a register row in its own shape, plus the minimisation argument of design
    D3 point 2.

  Also in `D-casting-tab.md` D2: the card slides over the board, is swipeable, and is a full page on
  a direct link.
- [x] 1.6 Run `node tools/check-refs.ts`. It must pass.

## 2. Migration and schema

- [x] 2.1 `src/modules/identity/schema.ts`: add `revealVoteAuthorship:
  boolean("reveal_vote_authorship").notNull().default(false)` to `householdSettings`.
- [x] 2.2 `drizzle/0035_reveal_vote_authorship.sql`:
  - hand-written, with a header comment like 0034's (expand-only, why the agent may apply it);
  - one statement, `ALTER TABLE "household_settings" ADD COLUMN IF NOT EXISTS
    "reveal_vote_authorship" boolean DEFAULT false NOT NULL;`;
  - `drizzle/meta/_journal.json` gets entry idx 35, with `when` greater than 0034's, and the tag
    equal to the file name;
  - `drizzle/meta/0035_snapshot.json` comes from `drizzle-kit generate`, after which the generated
    SQL is replaced by the hand-written file;
  - `migration-shape.ts` must pass.
- [x] 2.3 `data-inventory.yml`: under `household_settings`, add `reveal_vote_authorship: { category:
  "⚙️" }`.
- [x] 2.4 Apply `drizzle/0035` to `flatmate-io-dev` **now** (pre-mortem finding 3: after 2.1,
  `getHouseholdSettings`' `select()` and `registerHousehold` name the new column, so every
  DB-backed test fails until it exists).
  - It is expand-only, so the agent may apply it, and other branches' code ignores the column.
  - Confirm through the catalog that `household_settings.reveal_vote_authorship` exists as
    `boolean NOT NULL DEFAULT false`. If it does not, stop and report; never infer that it is
    merely not applied yet.

## 3. Settings: field list, write path, form

- [x] 3.1 `src/modules/casting/settings-fields.ts`: add `"revealVoteAuthorship"` to
  `VOTING_PROCEDURE_FIELDS`, and update the comment to five fields, frozen per round (R-1).
- [x] 3.2 `src/modules/casting/repository.ts` `updateHouseholdSettings`:
  - add the `columnPatch` line;
  - throw before the UPDATE when `patch.revealVoteAuthorship` is present and not a boolean
    (design D7).
- [x] 3.3 `src/modules/casting/repository.ts` `openRoundTx`: add `revealVoteAuthorship:
  settings.revealVoteAuthorship` to the snapshot object.
  - Update `tests/integration/policy/settings-while-round-open.test.ts`. Its `frozen` object
    (l.101) gains `revealVoteAuthorship: false`, and the `toEqual(frozen)` assertions at l.107, 115
    and 124 stay as they are.
  - Add one case: turning the flag on after opening leaves the snapshot's `false`.
  - `round-open-atomicity.test.ts:59` uses `toMatchObject` and needs no edit.
- [x] 3.4 `src/app/(org)/settings/actions.ts`: send `revealVoteAuthorship:
  formData.get("revealVoteAuthorship") === "on"` beside `quorumShare`.
- [x] 3.5 `src/app/(org)/settings/settings-form.tsx` and `page.tsx`:
  - a checkbox `name="revealVoteAuthorship"` with `defaultChecked` from the current value;
  - the label „Stimmen-Urheberschaft zeigen" (human, 2026-10-07);
  - the anchor/bandwagon hint;
  - the page passes the value;
  - strings go in `de.settings`.
- [x] 3.6 Tests:
  - `tests/unit/casting/settings-form-feedback.test.ts` (or a sibling): the checkbox renders checked
    and unchecked from the prop.
  - A new `tests/unit/casting/settings-action.test.ts`, mocking the repository as
    `invite-action.test.ts` does:
    - a checked box sends `true`;
    - an absent box sends `false`;
    - `quorumShare` still passes through.
  - Integration, `tests/integration/deliberation/candidate-detail.test.ts` (task 6): a non-boolean
    patch value is refused with the thrown error, and the row is unchanged.
  - `tests/unit/audit/payload-allowlist.test.ts` still passes with the fifth field.
  - **Breaks:**
    - drop the `=== "on"` (send the raw string); the action test fails;
    - remove the boolean guard; the refusal test fails. The test must pass a value Postgres would
      coerce to boolean (`"on"` or `"yes"`), not one it rejects by itself.

## 4. Rules: the frozen flag

- [x] 4.1 `src/modules/deliberation/round-rules.ts` `parseRoundRules`:
  - `RoundRules` gains `revealVoteAuthorship: boolean`;
  - an absent key gives `false`;
  - a present non-boolean gives `null` (design D5);
  - the doc comment says why absent is not a fallback.
- [x] 4.2 `tests/unit/deliberation/round-rules.test.ts`:
  - absent gives `false`;
  - `true`/`false` pass through;
  - `"true"`, `1` and `null` give `null`.
  - **Break:** treat a non-boolean as `false`; the test fails.

## 5. Ranking core and the arithmetic

- [x] 5.1 `src/modules/deliberation/ranking.ts`:
  - factor the last step of the per-candidate score into `scoreFromSum(sum, n, max)`, used by
    `computeRanking`'s loop and by `explainScore` (design D4);
  - add `explainScore(weights, values): ScoreExplanation` (design D4), with BigInt/`Scaled` only.
- [x] 5.2 `tests/unit/deliberation/ranking.test.ts`:
  - `explainScore(...).score` equals `computeRanking`'s score over a generated grid of value
    multisets (n = 1…6) and weight sets, including decimal weights and the x.5 boundary;
  - `exact` flags for 2,75 (exact) and 11/3 (inexact);
  - the spec's two worked examples.
  - **Break:** compute `explainScore`'s score with plain float rounding; the grid finds a mismatch.
- [x] 5.3 `src/modules/casting/repository.ts` `getRoundTallyBasisTx`:
  - return `countedVoters: { id, displayName }[]` in place of `countedVoterIds` (`rprof.display_name`
    from the existing join; no new predicate, design D6);
  - update `tests/integration/deliberation/screening-pass.test.ts:337-338` (ids via
    `countedVoters.map((v) => v.id)`).
- [x] 5.4 `src/modules/deliberation/repository.ts`:
  - extract the non-exported `readRoundTallyTx` from `getRanking` (design D2). Its statement order
    and the consistency comment stay verbatim;
  - `getRanking` maps the result onto `Ranking`, which gains only `closed: RankedGroup` (task 6.0);
  - the only permitted edits to existing tests:
    - `tests/integration/deliberation/ranking.test.ts`: none to existing cases (6.0 adds new ones);
    - `tests/unit/casting/ranking-board.test.ts`: the fixture gains `closed: { scored: [],
      unscored: [] }`;
    - `screening-pass.test.ts` (5.3 and 6.0) and `settings-while-round-open.test.ts` (3.3), as
      named there.

    Any other edit to an existing test is a stop-and-report.

## 6. The detail read, and the end states on the board

- [x] 6.0 End states on the board (design D9):
  - `src/modules/casting/repository.ts`: `BOARD_STATES` gains `rejected_by_household`,
    `declined_by_applicant` and `withdrawn` (**not** `archived`, human 2026-10-07). The port comment
    records the Q-4 amendment and why `archived` stays out;
  - `src/modules/deliberation/repository.ts`: `getRanking` groups them into `closed` (ranked with
    `openRoomCount` 0). The `decided` filter, today `state !== "invited"`, becomes an explicit
    `new`/`screened` test, so it no longer swallows the end states;
  - invert `tests/integration/deliberation/screening-pass.test.ts:292-308`. It is the Q-4 exclusion
    test, and it now asserts that board scope returns new, screened, invited, rejected and withdrawn
    in that order, and still no `archived` or `offer_made` (insert one of each);
  - `ranking.test.ts` cases (assert the `closed` arrays, not just rendering):
    - each of the three end states appears in `closed`, with its state;
    - a candidate the viewer never voted on, then withdrawn, is visible in `closed` with hiding on;
    - `closed` rows never have `leading: true`;
    - the viewer's own application in `rejected_by_household` is absent;
    - a round with only end-state applications is a board, not `none`/empty;
    - `archived` is absent;
    - **reopened**: withdraw a candidate the viewer has not voted on (visible in `closed`), then
      move it back to `new`. It is in `hidden` again.
  - **Breaks:**
    - drop one end state from `BOARD_STATES`; that case fails;
    - add `archived`; the absence case fails;
    - revert the `decided` filter to `!== "invited"`; the `closed` case fails.
- [x] 6.1 `src/modules/casting/repository.ts`:
  - factor the candidate WHERE into a private `voteCandidateWhere(context, roundIds, states)`, used
    by `listVoteCandidatesTx`;
  - add `getVoteCandidateCardTx(tx, context, roundIds, applicationId)`, which uses the same
    predicate with the board states. It selects id, round id, state and the four card columns only,
    and gives `null` when absent. A malformed id gives `null` with no query;
  - the comment carries design D3's widening argument (both points, and the accepted gap).
- [x] 6.2 `src/modules/deliberation/repository.ts`: `getCandidateDetail(context, applicationId):
  Promise<CandidateDetail>` per design D2, steps 1–7, and the result union. Voter ids never leave
  the function. `authorship`/`voters` are `null` unless the frozen flag is on. Names are sorted with
  `Intl.Collator("de")`.
- [x] 6.3 `tests/integration/policy/authorization-matrix.test.ts`:
  - `getCandidateDetail` goes in `NOT_APPLICABLE_DELIBERATION`, with "read; visibility tested in
    tests/integration/deliberation/candidate-detail.test.ts";
  - `getVoteCandidateCardTx` goes in the casting `...Tx` map, and in the "no `src/app` file may
    import it" assertion list (line ~275).
- [x] 6.4 New `tests/integration/deliberation/candidate-detail.test.ts`. Assert `kind`/`reason`
  codes, not only rendering. Each case with its break:
  - **Same numbers as the board.** Score, n and denominator equal `getRanking`'s row for a scored
    and an unscored candidate. *Break:* compute the detail's score with a fresh formula that drops
    the x.5 rule.
  - **Own application** gives `not_found`, with hiding on and off and the flag on and off. *Break:*
    remove the `IS DISTINCT FROM` predicate from `voteCandidateWhere`.
  - **Rejected application** opens as `scored`/`unscored`, with its state, results visible without
    an own vote. **`offer_made`** (seeded with `insertApplicationAt`) gives `not_found`. *Break:* add
    `offer_made` to the board states.
  - **Non-participant** gives `not_found`. **Another household's id** gives `not_found`.
    **Malformed id** gives `not_found`. *Break:* drop the `round_id IN roundIds` condition from
    `voteCandidateWhere`.
  - **The port alone, against the EXISTS.**
    - Call `getVoteCandidateCardTx` directly with a round id the viewer takes no part in; it
      returns `null`.
    - Call it again after `setMovedOut` of the viewer; it returns `null`.
    - *Break:* drop the voter EXISTS. Through `getCandidateDetail` this break cannot fail, because
      `listVoterRoundsTx` already filters the rounds.
  - **Without `vote` permission** gives `not_eligible`.
  - **Closed round** gives `round_not_available`, and **broken snapshot** gives `rules_invalid`.
  - **Hidden** (hiding on, not voted, `new`): `kind: "hidden"`. Assert the object's keys exactly,
    so it carries no vote-derived key. *Break:* return the unscored shape.
  - **Scored distribution** 2/1/0/1, and `formerCount` 0.
  - **Unscored**: no `distribution`, no `score`, no `explanation` key.
  - **Former member.** After `setMovedOut`, n drops, `formerCount` is 1, and the name is absent with
    the flag on. After `reactivateMember` the vote counts again. *Break:* count every vote's voter.
  - **Participation**: `denominator` excludes a moved-out member.
  - **Flag off**: `authorship === null` and `voters === null`, and `JSON.stringify(result)` contains
    no voter profile id and no voter display name. *Break:* fill `authorship` regardless of the
    flag.
  - **Flag on, scored**: ratings with names. **Flag on, unscored**: names without ratings.
  - **Flag on, own application**: `not_found`.
  - **Frozen flag.** Open with off, then `updateHouseholdSettings` on, and there are still no names.
    Also the reverse. *Break:* read the live setting.
  - **Snapshot without the key** (written raw as the owner path allows, or via
    `setRoundStatus`-style helper) reads as off. **A string value** gives `rules_invalid` on the
    detail and on the board.
  - **Card columns**: the payload has `age`/`messageRaw`/`attributes`, and no contact field. Use a
    seeded application with email and phone, and assert the strings are absent from
    `JSON.stringify`.

## 7. The detail screen, the sliding sheet, the board

- [x] 7.1 Move shared pieces out (the second-use rule, design D8/D10), keeping markup and classes
  identical:
  - `ScoreRing` from `ranking-board.tsx` to `src/app/(resident)/casting/score-ring.tsx`;
  - `CardBody` from `screening/screening-deck.tsx` to
    `src/app/(resident)/casting/candidate-card-body.tsx`;
  - the deck's swipe **constants** and one pure function `releaseDecision({ dx, speed, width,
    cancelled })` into `src/ui/swipe.ts` (design D10). The pointer handlers stay in each component.
    The deck imports the constants and the function and keeps every other line, including its
    slop and ratio check and its `dx/4` resistance.

  The deck and board tests pass unedited. A behaviour change in the deck is a stop-and-report.
- [x] 7.2 New `src/app/(resident)/casting/distribution-bar.tsx` (server component): four segments in
  the rating colours (`--vote-*` tokens), and the visible text equivalent as its accessible name.
  With names, each rating line lists them.
- [x] 7.3 New `src/app/(resident)/casting/candidate-detail-view.tsx` (server component,
  `CandidateDetailView({ applicationId, mode: "sheet" | "page" })`):
  - session and profile guard as on `/casting`;
  - the `shouldOpenScreening` redirect;
  - `getCandidateDetail` and `holdsPermission(…, INVITE_PERMISSION)` in parallel;
  - render per `kind`:
    - scored: card, state, ring, „aus x Stimmen", distribution, participation, the „(?)" popover
      with `WeightsList` and the explanation, the former note;
    - unscored: card, state, needed notice, participation, names if any, the former note;
    - hidden: name, state, explanation, link to `/casting/screening`;
    - refusals: the board's refusal copy, so extract the board's local `Refusal` component to a
      shared file. `not_found` gets its own neutral line;
  - `InviteDialog` via `showInvite`, for scored/unscored only;
  - in `page` mode, a back link to `/casting?round=<id>`;
  - reuse `ScreeningCard`'s card fields type and the attributes cast at
    `deliberation/repository.ts:248`; do not declare a second card type;
  - it **must not import `DetailSheet`** (or anything that imports `ViewTransition`), so that it stays
    renderable under vitest (design D1).
- [x] 7.4 The route tree of design D1, exactly:
  - `casting/layout.tsx` (new, server): renders `{detail}` and a wrapper `<div id="casting-board">`
    around `{children}`;
  - `casting/candidate/[applicationId]/page.tsx` and `loading.tsx` (full page, `mode="page"`, with
    a right-swipe to the board via a small client wrapper using `releaseDecision`). **The static
    `candidate/` segment is required** (design D1: a bare `(.)[applicationId]` would intercept
    `/casting/screening`);
  - `casting/@detail/default.tsx` (null);
  - `casting/@detail/[...rest]/page.tsx` (null), plus its `PAGE_LOADING_EXEMPTIONS` entry in
    `scripts/lint/pending-feedback.ts` with the reason "renders null; closes the detail slot";
  - `casting/@detail/(.)candidate/[applicationId]/layout.tsx` (`DetailSheet` around `children`: the
    one frame), `page.tsx` (`mode="sheet"`, content only) and `loading.tsx` (the skeleton, content
    only).

  Skeletons come from `@/ui/skeletons`: ring and two lines, a bar line, a card. Read
  node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/parallel-routes.md and
  intercepting-routes (Next docs) first. `pending-feedback.ts` must pass.
- [x] 7.5 New `src/app/(resident)/casting/detail-sheet.tsx` (client, design D10):
  - it is used only as the intercepted segment's `layout.tsx` frame;
  - layout: a fixed right panel, full width on phones, and a transparent backdrop. Its effect sets
    `inert` on `#casting-board` and removes it on unmount;
  - focus moves to the panel on open, and Escape and the close button call `router.back()`;
  - React `<ViewTransition>` with `enter`/`exit` slide classes;
  - its own pointer handlers using `src/ui/swipe.ts`: rightward only, the panel follows the
    finger, `releaseDecision` decides, a commit animates off and then calls `router.back()` with
    the exit transition suppressed, and short of the threshold it springs back;
  - `touch-action: pan-y`;
  - no unit test imports this file (`ViewTransition` is missing from vitest's React).

  CSS goes in `src/app/globals.css`: keyframes, the panel, and `prefers-reduced-motion` turning the
  slide off.
- [x] 7.6 `ranking-board.tsx`:
  - scored and unscored rows in „Score", „Eingeladen" and the closed group link the name and ring
    to `/casting/candidate/<applicationId>`, with `LinkPendingHint`;
  - `total` (l.34-39) includes `closed`, so a board with only closed rows is not the empty state;
  - „Einladen" stays outside the link, and hidden rows are unlinked;
  - the closed group is a native `<details>`, closed by default. Its `<summary>` is the heading
    with the count, and its rows name their state.
- [x] 7.6a `src/app/(org)/rounds/[id]/applications/invite-actions.ts`: add
  `revalidatePath("/casting/candidate/<applicationId>")` beside the existing three.
  `tests/unit/casting/invite-action.test.ts` gains the assertion. *Break:* drop it; the test
  fails.
- [x] 7.7 Strings in `src/ui/strings/de.ts`:
  - under `de.casting.detail`:
    - the distribution text;
    - „{n} von {d} haben abgestimmt";
    - the former note, singular and plural („1 Stimme entfernt, weil sie von ehemaligen
      Bewohnenden stammt" / „{x} Stimmen entfernt, weil sie …");
    - the needed notice;
    - the hidden explanation;
    - the names heading;
    - the not-found line;
    - the back link;
    - the close button's label;
  - under `de.casting`: `closedHeading` „Ausgeblendet" and the count beside it (human, 2026-10-07).

  **Mirror every key this change adds to `de.ts` into `src/ui/strings/en.ts`**, at the same path,
  with an English translation in the file's own style (human, 2026-10-07). This covers
  `de.casting.detail.*`, `closedHeading` and the new `de.settings` keys.
  - `en.ts` is the human's untracked file for the planned language switch. **Never stage or commit
    it.**
  - Keys already missing from it before this change (e.g. `de.invite.*`) are out of scope; list
    them in the hand-back.

  The arithmetic formatter is a pure `formatExplanation(explanation)` with `de-DE` decimals. Use
  apologetic du-tone for failures (memory: German UI error tone). Show the new wording to the human
  at review.
- [x] 7.8 Tests:
  - `tests/unit/casting/candidate-detail-view.test.ts` (`renderToStaticMarkup`, mocks as in
    `ranking-board.test.ts`), one per kind:
    - scored renders the bar text and the „(?)" arithmetic;
    - unscored renders no ring or bar;
    - hidden renders no number;
    - flag-off fixtures render no names;
    - „Einladen" appears for a moderator on `new`, and not for `invited`, `rejected_by_household`,
      hidden or a plain resident.
  - `ranking-board.test.ts`, new cases only:
    - scored and unscored rows link to the detail, in all three groups, and hidden rows do not;
    - the closed group renders as a `<details>` without `open`, with the count and the state
      labels, and no „Einladen";
    - a board with only closed rows renders the group, not the empty state.
  - `tests/unit/ui/swipe.test.ts` covers `releaseDecision`:
    - a slow drag past `min(width × RELEASE_FRACTION, RELEASE_MAX_PX)` commits;
    - a short drag returns;
    - a fast short flick ≥ `FLICK_MIN_PX` commits;
    - with `cancelled`, a flick does not commit, and only the far threshold does;
    - the sign of `dx` is returned, so each caller allows its own direction.
  - `formatExplanation`: the four lines of design D4.
  - **Breaks:**
    - render the bar on unscored;
    - link the hidden rows;
    - render the group `open`;
    - halve `RELEASE_MAX_PX` in `releaseDecision`;
    - let a cancelled flick commit;
    - drop `closed` from `total`.

    Each must make a test fail.

## 8. Demo seed

- [x] 8.1 Check that `npm run seed:demo-round` still works with the new snapshot key (it opens rounds
  through `openRoundTx`). No seed change unless it fails. The demo household keeps the flag off.

## 9. Apply the migration, verify, hand back

- [x] 9.1 Re-confirm through the catalog that the column from 2.4 is still there (the dev database
  is shared).
- [x] 9.2 Run `npm run verify` and compare the count with 0.4. Report every deliberate break from
  tasks 3–7 as seen failing.
- [x] 9.3 Hand back to the orchestrator with:
  - the diff summary;
  - any test file edited against the "pass unedited" rule in 5.4 / 7.1;
  - the new German strings for the human's review.
- [x] 9.4 **Orchestrator, not the applier:** the browser walkthrough before `/code-review high`. Done 2026-10-07; the deck swipe was not tested in the browser (only one awaiting card), and the Escape-in-dialog bug it found is fixed in `detail-sheet.tsx`.
  - Paths, on desktop and at mobile width:
    - open a row, so the card slides in;
    - close it, so the card slides out and the scroll position is kept;
    - browser back closes the card;
    - a swipe past the threshold closes it, with the board visible during the drag;
    - a short drag springs back;
    - a vertical scroll in the card does not move it;
    - reload on an open card gives the full page, and swiping there goes to the board;
    - the redirect while open: make something await a vote, then reopen a card, and you land in
      the pass with no card left over (and the pass renders, not a card for "screening");
    - „Einladen" inside an open card: after „Eingeladen!" both the card and the board show the new
      state;
    - the collapsed group opens and its rows open their cards;
    - reduced motion: no slide;
    - the screening deck still swipes as before;
    - settings: tick the toggle, save, and the box stays ticked after the save (React 19 form
      reset against `defaultChecked`).
  - The human signs in in the pane, or use the seed credentials on localhost.
