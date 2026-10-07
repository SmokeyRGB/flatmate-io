## Why

The scoreboard (F5 change 1, `ranking`) shows one ring per candidate and nothing else. Every
breakdown was deliberately moved off it: the distribution, the arithmetic and „5 von 7" (human
decisions Q-5, Q-10). They have nowhere to live until the candidate detail (screen D2) exists.
Without it, a score cannot be checked from the ranking. P-3 asks for exactly that check
(*„Die Score-Formel und die Stufenwerte sind aus der Rangliste heraus einsehbar"*, PRD §4.1.6).

It serves the F5 packet (`docs/backlog/requirements/F5-requirements.md`, V1.1):
- **FR-5.5** „The system shall present, on demand and without leaving the screen, how a displayed
  score was reached: the weight of each rating, the number of votes, and the arithmetic."
- **FR-5.20** „The candidate detail view shall show how the four ratings split for that candidate,
  as counts per rating level."
- **FR-5.21** „The distribution shall be shown in addition to the score, not instead of it."
- **FR-5.21a** „The system shall support a household setting, `reveal_vote_authorship` (default
  off), that — when enabled — additionally shows, next to the distribution, the name of the
  resident behind each vote. Self-redaction (FR-5.29/5.30) always takes precedence …"
- **FR-5.22** „The candidate detail view shall show the candidate's current state."
- AC-5.6, AC-5.20 and AC-5.21a.
- The count half of FR-5.19b: „5 von 7" per application (Q-5; names stay v0.2).
- The former-members note (Q-6): „x Stimmen entfernt, weil sie von ehemaligen Bewohnenden
  stammen".
- R-1 (human, 2026-10-05): `reveal_vote_authorship` ships with the detail card, frozen per round
  like every round setting.

Screen D2 (`docs/screens/D-casting-tab.md`) is the UI source. Its own rule applies here: the detail
*„lädt Stimmen, Notizen und Aggregat erneut mit Policy-Prüfung — übernimmt nichts ungeprüft aus
D1"*.

## What Changes

- **A candidate detail card** with its own address, opened from any scored or unscored scoreboard
  row. Opened from the scoreboard, it **slides in from the right over the scoreboard**, which stays
  rendered beneath it. It slides out to the right on close or back navigation. On a phone it can be
  **swiped away to the right**, with the scoreboard visible beneath it during the drag, using the
  same thresholds as the screening pass. Opened from a link or a reload, it renders as a full page.
  Under reduced motion nothing slides (human, 2026-10-07). It shows:
  - the application's card content without contacts, and its state;
  - the ring, „aus x Stimmen" and „x von y haben abgestimmt";
  - the distribution bar with a complete text equivalent;
  - a „(?)" with the round's frozen weights, the vote counts and the arithmetic, ending on the
    exact score the ring shows;
  - the former-members note when votes were dropped;
  - „Einladen" for moderators, the existing invite dialog.
- **Below quorum the card shows no result.** There is no ring, no distribution and no rating, only
  „noch x Stimmen nötig" and „x von y haben abgestimmt" (human, explore session 2026-10-07).
- **Applications out of the running stay on the scoreboard** (human, 2026-10-07, amending Q-4:
  „A rejected application should still be visible in the round, and scoreboard, until deleted").
  - The three end states are `rejected_by_household`, `declined_by_applicant` and `withdrawn`.
    `archived` stays off the scoreboard, because it marks data at the end of its retention (human,
    2026-10-07).
  - They form their own **collapsible group below „Eingeladen"**, collapsed by default.
  - Each row names its state, and its results are visible, because nobody can vote on them any more.
  - Their detail opens like any other, with the full card (human, 2026-10-07).
    - Withdrawn or declined applicants have no deletion or erasure path yet (F3 change 4), so their
      card stays visible for the life of the round.
    - This gap is recorded in the review log.
  - A moderator who has not voted can reject a candidate and reopen it, and so see its results
    early. This is the same exposure as the accepted R-8 for `invited`, and it is recorded.
  - They carry no „Einladen" and take no highlight slot.
- **One refusal for everything the viewer may not see.** The viewer's own application, an unknown
  id, another household's application, a round the viewer takes no part in, and a state the
  scoreboard does not hold are all refused the same way (Q-9). An application whose results are still hidden to
  the viewer (V-4) shows only its name and the way to vote.
- **A new household setting „Stimmen-Urheberschaft zeigen"** (`reveal_vote_authorship`, default
  off), a toggle on the household account's settings screen.
  - It is frozen into each round's rules when the round opens.
  - When the round's frozen value is on, a scored card shows each counted vote's rating beside the
    voter's name, and an unscored card lists who has voted, without ratings.
  - When it is off, the card carries no voter identity at all.
  - A round opened before this setting existed reads it as off.
- **The scoreboard's rows become links** to the detail. The scoreboard's read changes only by the
  new group: no distribution, no voter data and no card field reach it.
- **Docs.** The new setting is pulled into v0.1 in the SRD's scope (R-1), and the voting-procedure
  field list grows from four to five.

Not in this change:
- changing or withdrawing one's own rating on the card (change 4 `candidate-revise`);
- notes (C4);
- the named who-has-voted section of FR-5.19b (v0.2, Q-5);
- a nudge for who still owes a vote (a possible later idea, raised 2026-10-07).

## Capabilities

### New Capabilities
- `deliberation/candidate-detail`: the D2 read and screen. It covers what the card shows for a
  scored, an unscored and a hidden candidate, the one refusal, the arithmetic, the participation
  count, the former-members note, and when voter names appear.

### Modified Capabilities
- `deliberation/ranking`: four changes.
  - The rules gain the frozen `revealVoteAuthorship` flag (absent = off, malformed =
    `rules_invalid`).
  - The board holds three end states in „Ausgeblendet", a fourth group, collapsed (the „Three
    groups" requirement is renamed to four). `archived` stays off the board.
  - The empty state counts that group.
  - Scoreboard rows open the candidate detail.
- `casting/invitation`: „Einladen" is also offered on the candidate detail, under the same gate.

## Impact

- **Guardrails touched:**
  - **G-C** (visibility).
    - This is a new resident-facing read of vote-derived data and of the card columns of
      `invited` applicants and applicants out of the running.
    - The board's candidate read widens from three states to six. This reverses the Q-4
      minimisation argument by human decision, and the amendment is recorded in the docs.
    - V-1, V-2 and V-4 are enforced in the repository on the same code path as the scoreboard.
  - **G-D1** stays `pending`, owned by change 5. G-D2 is unchanged.
  - **G-D6** (subject-access export) is not touched. FR-5.21a scopes the export's authorship ban
    separately, and no export code exists yet.
  - **G-F1/G-F3**: one new ⚙️ column in `data-inventory.yml`.
  - **G-L**: not touched.
- **Database:** migration `drizzle/0035`, an expand-only `ADD COLUMN IF NOT EXISTS` on
  `household_settings`, applied late on `flatmate-io-dev`.
- **Code:**
  - `src/modules/deliberation/` (ranking core, a new read, the arithmetic explanation);
  - `src/modules/casting/repository.ts` (snapshot key, settings patch, a one-application card read,
    voter names from the tally port);
  - `src/modules/casting/settings-fields.ts`;
  - `src/modules/identity/schema.ts`;
  - the `/casting` route group: a new layout with a parallel `@detail` slot, an intercepting
    `(.)candidate/[applicationId]` route for the sliding card, a full-page
    `candidate/[applicationId]` route, linked
    rows, and the collapsed group;
  - the swipe release rule, shared with the screening deck;
  - `globals.css` (slide and swipe styles, reduced motion);
  - `src/app/(org)/settings/`;
  - `src/ui/strings/de.ts`.
- **Tests:**
  - an integration suite for the new read;
  - its row in the authorization matrix;
  - unit tests for the arithmetic, the screen and the settings form.

### Assumptions recorded

- **Names on an unscored card** (flag on, no ratings) extend FR-5.21a, which speaks only of names
  beside the distribution. The human chose this on 2026-10-07. Names without the flag were rejected,
  because a distribution compared across two visits would tie a rating to the newly listed name.
- **The setting's label is „Stimmen-Urheberschaft zeigen"** (human, 2026-10-07). `rahmenwerk.md`
  §8.6 and `O-organisation.md` say „… in der Rangliste zeigen", but the names appear on the detail,
  not the scoreboard. Both docs are corrected to the chosen label in this change.
- **The out-of-the-running group is headed „Ausgeblendet"** (human, 2026-10-07). It says neither
  that the applicant is finished nor anything judging (C-10, AC-5.28). The row count sits beside
  the heading.
- **The hidden state follows D2** (human-confirmed 2026-10-07). A candidate the viewer has not
  voted on shows its explanation and the way to vote, never `not_found`. In practice the „vote
  first" redirect (Q-2) catches it before the card renders.
