## Why

F5 is where votes become a decision: *"Votes become a score, a quorum judgement and an ordering.
Each resident sees a candidate's results only after voting on that candidate."*
(`docs/backlog/requirements/F5-requirements.md` §1, scope lines S-12, S-13, S-14, S-31). Today the
Casting tab is F4's placeholder (`„Hier erscheint die Rangliste dieser Runde."`), so the demo flow
stops after the screening pass (C1). This change is F5 change 1 of the living plan
(`~/.claude/plans/f5-ranking-hidden-until-you-vote.md`, Part 3 §1). It is the pitch path: a real
D1 scoreboard on a re-seedable Demo-WG, with **no migration**.

## What Changes

- **Docs first (packet V1.1).** A commit corrects the F5 packet and records the human's 2026-10-05
  decisions where they amend the chain:
  - **Former members' votes leave the score too** (Q-6, R-4: moved out or removed; reactivation
    restores the vote). This overrides SRD S-32's „bleibt die abgegebene Stimme im Score",
    `invarianten.md` §5.3 `score_votes` and PRD §4.2.3. The commit records it as a human decision.
  - **One scoreboard.** Unscored rows sit at its bottom and hidden rows below it (Q-3). This
    replaces the separate „Warten auf Stimmen" section in FR-5.10/AC-5.9, PRD §4.1.6 and
    `D-casting-tab.md` D1.
  - **No D3, ever** (Q-9). FR-5.31/5.32 and AC-5.26 are struck.
  - **Snapshot authority.** All three rules come from the round's snapshot (F-1).
  - **Account-wide V-1** (F-4), and **„x.5 rundet auf"** defined (F-25).
  - **Pending sort** by `created_at, id`.
  - **Register rows** (Part 1 F-2, F-6, F-12, F-26, F-27, F-28).
- **Pure ranking module** (`deliberation/ranking.ts`):
  - score, quorum and the seven-key order of `rechenmodelle.md` §8.3;
  - `NO_SCORE` is a distinct value, never `0`;
  - the top N rows by score are marked as leading.
- **One frozen-rules parser**, shared by the pass and the ranking. It refuses all-zero weights, a
  quorum share outside (0, 1], and a non-boolean hide flag as `rules_invalid` (EC-5.5, EC-5.6;
  human Q-7).
- **`getRanking`**, a read-only deliberation read in one transaction. It enforces the following
  before anything reaches the client: V-2 (a participant only), V-1 (the own application is
  absent from every list and count), and V-4 (results per candidate only after one's own
  non-withdrawn `invite` vote). It returns three lists:
  - `scored`: at quorum, in rule order;
  - `unscored`: below quorum, chronological;
  - `hidden`: whose result fields do not exist at all.
- **Two casting query ports.** The candidate port is widened to `invited` and returns names only
  for the board. A new port returns the round's counted voters (the quorum denominator) and the
  open-room count.
- **D1 scoreboard** on `/casting`, replacing the shell:
  - a progress-ring score with „aus x Stimmen";
  - a faint animated highlight on the top N rows, N = the round's open rooms (R-6), static under
    reduced motion;
  - unscored rows at the bottom with the threshold named;
  - hidden rows greyed below with `EyeOff`;
  - a screen-level „(?)" with the frozen weights and the formula (PRD §4.1.6 AC „aus der Rangliste
    heraus einsehbar").
  The redirect to the pass while anything awaits the viewer's vote stays (Q-2).
- **Demo reset** (Q-12). The cleanup SQL plus `npm run seed:demo` always yields the full flow:
  sign in (or claim Robin), vote in the pass, then see the scoreboard. That needs more residents,
  realistic applications, two `open` rooms, others' votes cast through `castVote`, one unscored row
  and one hidden `invited` row.
- **G-D2's open-round half is tested** (former members leave the quorum denominator). The manifest entry stays `pending` until the closed-round half can be tested, which the human will do in the finalization of F3 (human decision 2026-10-06).

- **Walkthrough changes (human, 2026-10-06):** the board shows three groups, „Punktwert", „Eingeladen"
  and „Verdeckt". An application that left `new`/`screened` is revealed to every participant, since
  nobody can vote on it any more. Start acknowledges having rated everything and names no single
  phase. The seed leaves no application in `screened`.

Not in this change (plan changes 2–5):
- the detail card, per-candidate arithmetic, distribution, „5 von 7" and `reveal_vote_authorship`
  (change 2);
- revise/withdraw and „Einladen" (change 3);
- the `vote` SELECT policies, i.e. V-1's database half (change 4, before the first real
  household);
- the sort toggle and the „changed since your vote" marker (change 5).

## Capabilities

### New Capabilities
- `deliberation/ranking`: score, quorum and order, frozen-rule reading, the visibility rules
  V-1/V-2/V-4 in the read, and the D1 scoreboard with its states and the top-N highlight.
- `tooling/demo-household`: the Demo-WG can be reset at any time to a state that shows the flow
  sign-in → pass → scoreboard.

### Modified Capabilities
- `ui/resident-frame`: "The Casting tab leads to what can be done there". With nothing awaiting
  the viewer's vote, the tab shows the round's scoreboard instead of the placeholder sentence.
- `deliberation/screening-pass`: "The round's frozen weights are one tap away". All-zero frozen
  weights refuse the pass like malformed ones, because the shared parser now applies.
- `start/next-action`: "Nothing open means the round's standing" drops the single phase name, and a
  new requirement acknowledges having rated everything (`B-start.md`, decided 2026-09-15, never
  built). Human walkthrough 2026-10-06.

## Impact

- **Code:**
  - `src/modules/deliberation/` (new `ranking.ts`, `round-rules.ts`; `repository.ts` gains
    `getRanking`; `scale-weights.ts` is folded in);
  - `src/modules/casting/repository.ts` (port option, one new port);
  - `src/app/(resident)/casting/` (page, loading, new board component);
  - `src/ui/strings/de.ts`, `src/app/globals.css` (highlight keyframes);
  - `scripts/seed-demo-household.ts`, `scripts/cleanup-demo-household.sql` (checked).
- **Tests:**
  - new unit tests (pure module, parser, render);
  - new integration tests (`tests/integration/deliberation/ranking.test.ts`);
  - authorization-matrix entries;
- **Docs:** packet, SRD S-32, PRD §4.1.6/§4.2.3/§4.2.5, `domain/invarianten.md` §5.3,
  `domain/rechenmodelle.md` §8.3, `domain/casting.md`, `screens/D-casting-tab.md`, and
  `review-log.md` register rows. `docs/04`, `05` and `07` (frozen) are untouched.
- **Database:** no migration, no new column, no data-inventory change. The Demo-WG on
  `flatmate-io-dev` is recreated (new household id) by the human-run cleanup and the seed. Never
  production.
- **Guardrails touched:**
  - **G-C** (visibility): V-1, V-2 and V-4 are enforced in the repository read. V-1's database
    half is deferred to change 4 by human decision Q-1, due before the first real household.
  - **G-D2**: its open-round half is tested here; the manifest entry stays `pending` (human,
    2026-10-06). **G-D1** stays `pending` until change 4.
  - **G-D15**: the household account gets no ranking value.
  - **G-L / P-5**: the ranking aggregates human votes under disclosed rules. No AI is involved.
- **Assumptions recorded:**
  - One membership per account (`membership_account_id_unique`, `drizzle/0021`) makes the
    account-wide redaction set equal the session's profile today. The existing predicate is kept
    and the equivalence is argued in design.
  - No path closes a round yet, so the ranking computes live and shows `open` and `paused` rounds
    only (F-12).
