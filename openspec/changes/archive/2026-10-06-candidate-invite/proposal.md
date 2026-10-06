## Why

The scoreboard (F5 change 1, `ranking`) turns the votes into an order, but nothing yet turns that
order into a step. The vertical slice for the pitch ends with the moderator inviting someone:
„Einladen" completes the voting process (human, walkthrough of 2026-10-06, which moved this change
ahead of the detail card).

It serves the F5 packet's invite block (`docs/backlog/requirements/F5-requirements.md` §3.6):
- **FR-5.24** „The system shall allow an account holding the change-status permission to move a
  candidate to `invited`."
- **FR-5.25** „On marking a candidate `invited`, the system shall provide a copy-paste text that
  includes the data-protection notice." **This change amends it** (human decision 2026-10-06, see
  below).
- **FR-5.26** „The system shall not send that text, and shall offer no send action anywhere."
- **FR-5.27** „The state change shall be recorded as an append-only audit entry naming the account
  and the acting profile."
- **FR-5.28** „Marking a candidate `invited` shall not require quorum and shall not be blocked by its
  absence."

It also covers AC-5.10 and AC-5.21–5.23, and scope line S-16 (the copy-paste text). Finally, it
closes the register row „`screened` ist in v0.1 verdeckt" (`docs/review-log.md`, added by change 1):
„Wird mit der Änderung „invite" umgesetzt".

### Human decision 2026-10-06: no privacy notice in the invite text

The human, reviewing this change: the privacy notice „is already shown when adding an applicant",
repeating it in the invite text is „overly pushy", and informing the applicant is „the
responsibility of the household, not me". It is removed **completely**, also for third-party
applications (Art. 14). The human was told that the invite is often the first message to such a
person (Art. 14 Abs. 3 lit. b), and declined even a quiet hint beside the text.

Where the duty stays served:
- the Art. 14 notice with its deadline at capture (O3) and on the application's detail (O5);
- the optional Art. 13 notice on every application's detail (Compliance §4.3, „Ergänzt
  2026-09-28").

Compliance §1 already assigns the information duty to the household („Copy-Paste-Textbaustein als
*Hilfsmittel*, nicht als eigene Pflichterfüllung").

This amends documents above this change in precedence, so they are corrected in this change's docs
edits, never only in code:
- SRD S-16;
- PRD §4.0 row 9 and the §4.1.6 acceptance criterion;
- Compliance §4.3;
- `domain/zustandsmaschinen.md`;
- `screens/O-organisation.md` O5;
- the F5 packet's FR-5.25/AC-5.21;
- the `EP-E-2` stub.

Frozen `04`/`07` stay as they are; their living counterparts carry the change.

## What Changes

- **A new repository operation `inviteApplication`** (casting). In one transaction it takes an
  application from `new` or `screened` to `invited`. From `new` it runs the two declared edges
  `new → screened → invited` through the existing private `applyTransitionTx`. No new edge is
  declared, `transitions.ts` is unchanged, and two `application.state_changed` events are written.
  - It requires `change_application_state`, read as a stored permission inside the transaction
    **before** the row is read.
  - It never checks quorum.
  - An application that is already `invited` is a no-op, so a second moderator's click changes
    nothing.
  - Any other state is refused as `not_invitable`.
- **„Einladen" on the scoreboard** (`/casting`, screen D1). The button appears on every row of the
  „Score" group, scored or unscored, and only for a viewer whose stored permissions include
  `change_application_state` (a server-side check, never a role). It opens a dialog with:
  - an editable example text: the household would like to meet the applicant, and asks when they
    have time. **No privacy notice**;
  - one copy button, and no send action anywhere;
  - **„Eingeladen!"**, which submits and sets the state.

  Closing the dialog stores nothing, so „Einladen" stays on the row (R-3 a, G-J4). Once invited, the
  row moves to „Eingeladen" and its results become visible to every participant (R-8, unchanged
  ranking rule).
- **The same dialog on the organisation's application detail (O5)**, shown for `new`/`screened`
  applications to holders of `change_application_state`. `screens/O-organisation.md` O5 places the
  invite there („Die Statushandlungen unten baut F5"). Human decision 2026-10-06 (A-1).
- **`screened` stays hidden in v0.1.** No user-facing control moves an application to `screened`.
  Today none exists anyway: no screen calls `transitionApplication`. The invite passes through
  `screened` inside one transaction. Existing `screened` rows still display under „Gesichtet" and
  can still be invited.
- **The demo seed** (`scripts/demo/seed-round.ts`) invites its seventh application through
  `inviteApplication` instead of two `transitionApplication` calls, so there is one path. The
  applications themselves are not touched.
- **Docs edits:**
  - the human decision above, in each document it amends;
  - register rows: close „`screened` verdeckt"; the two `state_changed` events instead of
    `application.invited`; the invite staying `state_only` (design D1); P-4's way back without a
    UI (A-2).

No migration. No change to `transitions.ts`, to the permission sets or to any protected test.

## Capabilities

### New Capabilities
- `casting/invitation`: inviting an application. It covers the operation, its permission and its
  states, the example text without a privacy notice, nothing being sent and nothing being stored
  before „Eingeladen!", the audit, and where the action is offered (scoreboard and O5).

### Modified Capabilities
- `deliberation/ranking`: the „Score" group's rows carry „Einladen" for holders of
  `change_application_state`. Nothing else on the board changes.
- `casting/application-pipeline`: the state-change rule records that in v0.1 `screened` is passed
  through by the invite and reached by no control of its own, while existing `screened` rows still
  display.
- `tooling/demo-household`: the seed invites through the invite operation.

## Guardrails touched

- **G-C (authorization and visibility):** the invite checks `change_application_state` in the
  repository, from the session (`context.accountId`), never from a caller id. The household account
  is refused before any query (G-D15). The button is decided on the server from the stored
  permission, never by the client and never by a role comparison (the `role-reads.ts` lint). The
  dialog receives only ids and the applicant's name, which the board already shows.
- **G-D3 (declared transitions, one ActivityEvent each, protected):** relied on, not changed. Both
  edges are declared rows, and each writes its own event.
- **G-D7 (audit payload):** the events carry `fromState`/`toState` only. No text, and nothing typed
  into the dialog.
- **G-J4 (store nothing unneeded):** the edited text is never posted. The `<textarea>` has no name
  and sits outside the form.
- **`ui/pending-feedback`:** „Eingeladen!" uses `SubmitButton`.

It touches no G-L (no AI) and no RLS policy. The privacy notice is not a guardrail. It is a
compliance aid owned by the household (Compliance §1, §4.3), so removing it is a human decision
recorded in the docs, not a floor violation.

## Assumptions (A-1, A-2 and the notice decided by the human on 2026-10-06)

- **A-1 The invite is also offered on O5.** **Decided: yes.**
- **A-2 No „Einladung zurücknehmen" in this change.** The repository already allows the declared way
  back (`invited → screened`, moderator set), but no screen offers any backward or side-state action
  today. A register row records it. **Decided: no undo control now.**
- **A-3 No round-status check.** Inviting is allowed in a paused round too, and from O5 in a round of
  any status. FR-5.24 sets no condition, and the existing transitions take none. Likewise, no
  self-check: in v0.1 nothing sets `became_resident_id`, so "one's own application" cannot occur
  (V-1 concerns votes, which the invite never reads).
- **A-4 The example text's wording** is a first draft in `de.ts`, for the human to edit after the
  walkthrough. Tests read it from `de`.

## Impact

- **Code:**
  - `src/modules/casting/repository.ts`: `inviteApplication`, and a new `not_invitable` error code;
  - `src/app/(resident)/casting/page.tsx` and `ranking-board.tsx`;
  - new `invite-dialog.tsx`, `invite-actions.ts` and `invite-text.ts` beside O5;
  - `src/app/(org)/rounds/[id]/applications/[applicationId]/page.tsx`;
  - a shared server helper `holdsPermission`;
  - `src/ui/strings/de.ts`;
  - `scripts/demo/seed-round.ts`.
- **Tests:**
  - an integration test for the operation;
  - the authorization matrix;
  - the no-query spy test;
  - render tests for the board and the dialog.
- **Docs:** `docs/review-log.md`, plus the documents listed under the human decision.
- **Parallel work:** `founding-link-moderator` (migration `0034`) touches the identity permission
  code and the matrix. Its moderators get the same stored set as `setMemberRole`, so
  `change_application_state` needs nothing extra here. Whichever PR merges second merges `main` and
  re-runs verify.
