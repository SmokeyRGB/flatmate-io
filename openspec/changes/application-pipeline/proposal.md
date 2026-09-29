## Why

Applications can now be captured (change 2, PR #39), but they are listed nowhere. The human's
walkthrough remark was: *"the existing applicants are listed nowhere; they should be listed in the
rounds tab in their own section"*. `docs/backlog/requirements/F3-requirements.md` §1 scopes the
feature as *"A moderator types an application into a form, records where the data came from, and
sees all applications of the round grouped by state."* This change builds the second half of that
sentence, the pipeline (screen O4). It also builds what the packet asks of the application
afterwards:
- correcting it (FR-3.21/3.22, Art. 16);
- the optional privacy notice on every application (FR-3.23);
- the guard on `transitionApplication`.

That guard is the obligation `docs/review-log.md` §Implementierungspflichten records as *„F3:
`transitionApplication`"*, due *„bevor die erste Route sie aufruft"*. It is change 3 of the F3
plan, and it runs before change 2b (human decision 2026-09-29).

## What Changes

- **Pipeline (O4) on the round page `/rounds/[id]`.** A „Bewerbungen" section sits in the same
  visual block as the round header (O4 layout, U-29). It groups the round's applications by
  `Application.state`, the main path in its order first, then the side states, each group with its
  count (FR-3.14, `03-PRD.md` §4.1.7). Empty groups are left out. Each row shows the name, the
  state word from `rahmenwerk.md` §8.6, a short contact summary, and „Über jemand anderen" for a
  third-party collection (FR-3.15, O4). Each row links to the detail. An empty round says so, and
  offers „Bewerbung erfassen" while the round is open (FR-3.16, AC-3.14). The household account
  sees neither the list nor any number from it, only the §8.6 sentence (O4 „Keine Berechtigung",
  G-D15). A resident without an application permission sees no section.
- **A guarded list read**, `listOrganisationApplications`. It follows the same rule as the existing
  detail read `getOrganisationApplication`:
  - a profile-less session is refused before any query;
  - the caller must hold `create_application` or `change_application_state`, checked inside the
    read's transaction on a share-locked membership;
  - it returns only this household's rows of this round.
- **The detail (O5's shell)** gains:
  - For **every** application, a collapsed, optional „Datenschutz-Hinweis" to copy (FR-3.23,
    AC-3.20). It is the Art. 13 text of `06-Compliance-Anhang.md` §4.5 Stufe 1, or the *Variante
    Dritterhebung* for a third party. Beside it, „Warum steht das hier?" opens two or three sentences
    on the household's responsibility. Nothing is required, tracked or reminded.
  - A „Bearbeiten" entry that leads to the correction form.
- **Correction** at `/rounds/[id]/applications/[applicationId]/edit`, through a new
  `updateApplication`. Every captured field can be corrected, the collection source included
  (FR-3.21). The rules:
  - It takes `create_application` inside the transaction and locks the application row
    `FOR UPDATE`.
  - It never touches `round_id`, `source`, `state` or the creator.
  - A correction made from a form that is out of date, because someone else saved in between, is
    refused as stale. It never silently reverts the other person's correction.
  - A correction that changes nothing writes nothing.
  - Otherwise it writes one `application.updated` event that names the changed fields and never
    their values (FR-3.22, AC-3.19, G-D7).
  - Switching to a third party shows the duty with the date **counted from capture** (EC-3.5). The
    earlier events stay (EC-3.6).
- **`transitionApplication` guarded** (FR-3.24, AC-3.21). The rules:
  - A profile-less session is refused first.
  - Every state change needs `change_application_state`. A backward one also needs a new
    permission, `reverse_application_state`. Both are checked inside the transaction, and the row is
    locked `FOR UPDATE`.
  - **Each declared transition carries its own rule** in `transitions.ts`: its permissions, and
    whether it may run as a plain state change (human decision, 2026-09-29: rights grow step by
    step). v0.1 runs only `new ⇄ screened ⇄ invited`, the exits from those states, and their
    reopenings. Every transition whose effects belong to a later step is refused as not available
    until that step is built, together with its operation and its rights. These are the
    appointment, the interview and second vote, the offer with its room, the move-in with its
    resident profile, and retention.
  - The actor comes from the session. **BREAKING:** the caller-supplied `actor` parameter is
    removed.
  - The `KNOWN_OPEN` entry in the authorization matrix goes.
- **`reverse_application_state` (migration `0027`).** The permission joins `MODERATOR_PERMISSIONS`
  only, in one change with its constant, a backfill of the live moderators, and the widened
  `membership_moderator_holds_role_permissions` CHECK. A new CHECK makes it impossible for any
  other membership to hold it, which is how the matrix's ❌ (not grantable) holds in the database.
  This follows the human decision that roles are only names for permission sets (2026-09-28/29).
  FR-3.24 and `domain/identity.md` §2.1 still say *„hängen an der Rolle"*, so both are amended here.
  **BREAKING on the shared dev database** until merge: another branch's `setMemberRole` appoints
  without the new permission, and the widened CHECK refuses that.
- **Vocabulary**: the eleven state words of `rahmenwerk.md` §8.6 go into `de.ts`.
- **Docs**:
  - FR-3.24 and `domain/identity.md` §2.1: reversing a state becomes a permission held only in the
    moderator set. Deletion stays with change 4.
  - `review-log.md`: the `transitionApplication` obligation is closed, and a row is added for the
    decision.

**Not in this change:** deletion and the `deleted_at` drop (change 4), O1 and the layout guard
(change 5), V-2 (change 6), a screen that changes a state (F5), and the „changed since your vote"
marker (F5).

## Capabilities

### New Capabilities
- `casting/application-pipeline`: the round's list of applications and who sees it; the optional
  notice on every application's detail; correcting an application and its audit; the guard on
  every state change.

### Modified Capabilities
- `identity/permissions`: the moderator set gains `reverse_application_state`, and a permission
  that only the moderator set may contain is a database invariant.
- `casting/application-capture`: "no other read returns personal columns" now names the two
  guarded reads (the detail and the new list), and a state change returns lifecycle columns only.

## Impact

- **Code:**
  - `src/modules/casting/repository.ts`: `listOrganisationApplications` and `updateApplication`
    are new; `transitionApplication` is guarded and its signature changes.
  - `src/modules/casting/`: a pure grouping helper.
  - `src/modules/identity/schema.ts`: the constants and the CHECKs.
  - `src/modules/audit/repository.ts`: `application.updated` is registered.
  - `src/app/(org)/rounds/[id]/`: the page, its skeleton, the detail, the new edit route, and a
    generalised notice component.
  - `src/ui/strings/de.ts`.
- **Migration `0027_reverse_application_state.sql`.** It has a backfill and two CHECKs, and no
  `SECURITY DEFINER` or `DROP COLUMN`, so the agent can apply it to dev itself. The window between
  applying it and merging must be short (see design).
- **Tests:**
  - New integration tests for the list, the correction and the guard.
  - Setup-only changes to `tests/unit/audit/backward-transition.test.ts` (guarded, G-D3) and
    `tests/integration/policy/application-visibility-household-account.test.ts` (guarded, G-D15),
    shown to the human.
  - `start-overview.test.ts` and the authorization matrix change too, and so does
    `role-permissions-constants.test.ts`, which now also reads `0027`.
- **Script:** `scripts/seed-demo-household.ts` (the new signature).
- **Docs:** `docs/backlog/requirements/F3-requirements.md` FR-3.24/AC-3.21, `docs/domain/identity.md`
  §2.1, `docs/review-log.md`. `tools/check-refs.ts` must pass.
- **Guardrails touched:**
  - **G-C**: the list read, the correction and the state-change guard are authorization rules, each
    enforced in the repository, not only in a route.
  - **G-D**: the setup of the G-D3 and G-D15 guarded tests changes, and their assertions do not.
  - **G-D7**: the new event carries field names only.
  - **G-D15**: every new function refuses a profile-less session first.
  - **G-N6**: four states per screen.
  - **G-J4**: no new column; the F5 marker is derived.
  - **G-L**: untouched, since nothing here processes text by machine.

## Assumptions

- **A1:** the Art. 13 notice is Compliance §4.5 Stufe 1 **verbatim**, including its fixed
  „(Name, Kontakt, deine Nachricht)". Only the Art. 14 variant generates its categories, because
  Art. 14(1)(d) requires them and Art. 13 does not.
- **A2:** a correction is possible whatever the round's status. Art. 16 rectification does not end
  when a round closes, and FR-3.21 names no such condition.
- **A3:** `transitionApplication` requires no particular round status. FR-3.24 states the whole
  rule, and any condition on the round belongs to F5, the first screen that changes a state.
- **A4:** the correction form reuses O3's three-step form, pre-filled and opening on the message
  like capture *(changed 2026-09-29 in the walkthrough; it first opened on „Angaben", which hid the
  message)*. The notice step appears only when the source is switched to a third party
  during this correction. **Confirmed by the human, 2026-09-29** („The three-step walkthrough is
  okay"). The single-page alternative is not built (design D5).
