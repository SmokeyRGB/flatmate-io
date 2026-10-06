## Context

Change 1 (`ranking`, archived 2026-10-06) built the scoreboard D1 on `/casting`. It is a server
component fed by `getRanking`, a voter-gated read whose candidate port returns **names only**
(ranking design D3: closed `scope`, never contacts). The board shows three groups: „Score"
(`new`/`screened`), „Eingeladen" and „Verdeckt".

What exists for the invite step today (verified on `main` = `7ce2ec3`):
- **`casting/transitions.ts` declares `new → screened` and `screened → invited`.** Both are
  `state_only` and require `change_application_state`. The way back, `invited → screened`, also
  requires `reverse_application_state`. Its header (l.99–122) reserves an `operation` kind for steps
  with effects, and says a reopening belongs to the step of its target.
- **`applyTransitionTx`** (`casting/repository.ts`, private) is the one place a state changes. It
  checks the declared rule and every `requires` on the share-locked membership, then writes `state`
  and `state_changed_at` and exactly one `application.state_changed {fromState, toState}`.
  `transitionApplication` wraps it in one transaction: membership FOR SHARE, then the application
  FOR UPDATE.
- **No screen calls `transitionApplication`.** O4 (`applications-section.tsx`) and O5
  (`applications/[applicationId]/page.tsx`) offer no state action at all. Its only caller outside
  tests is the demo seed (`scripts/demo/seed-round.ts:153–154`). So the "manual Gesichtet step" the
  register row wanted removed does not exist as a control. Only the „Gesichtet" group label does.
- **`notice.tsx`** (F3 change 3) has `NoticeTextPanel`, an editable textarea with no `name`, a copy
  button and a regenerate button, plus `ApplicantNotice` (Art. 13) and `ThirdPartyNotice` (Art. 14,
  deadline line beside the text). `application-notice.ts` has the pure `noticeCategories` and
  `oneMonthAfter`. No privacy page exists, so the `[Link]` hint stays (`de.applications.notice.linkHint`).
- **`vote_guard`** (`drizzle/0028`) reads the application FOR SHARE and refuses a vote unless it is
  in `new`/`screened`.

The constraints from the brief of the change 1 session and the plan (F5 Part 3 §2):
- reuse the notice pieces;
- do not widen the voter-gated port;
- read the permission as stored, never as a role;
- „Eingeladen!" is a `SubmitButton`;
- the seed must use the new path;
- PR #55 and the Fixes session's change B share `casting/repository.ts`, `de.ts` and the
  authorization matrix.

## Goals / Non-Goals

**Goals:**
- One repository operation that invites from `new` or `screened` in one transaction, with the
  declared rules and one audit event per step.
- „Einladen" → an editable example text (no privacy notice, human decision 2026-10-06) → „Eingeladen!" on the scoreboard's
  „Score" rows and on O5, for holders of `change_application_state` only.
- Nothing stored before „Eingeladen!", and nothing sent.
- The seed invites through the same operation.

**Non-Goals:**
- The read-only detail card D2. That is change 3; it will mount the same dialog.
- Any backward or side-state control (reject, withdraw, reopen, un-invite). See D8.
- The privacy page (Stufe 2) and its `draft → published` state.
- Any privacy notice in the invite text (removed by the human, 2026-10-06; the notices at capture and on
  O5 are unchanged).
- Changing `transitions.ts`, the permission sets, the `application.invited` event name or any
  protected test.
- A round-status condition on inviting.

## Decisions

### D1 · Two declared edges inside one operation, with no new edge and no new rule kind

`inviteApplication` runs `applyTransitionTx` once from `screened`, and twice from `new`
(`new → screened`, then `screened → invited`), in one transaction on one locked row.

Alternatives considered:
- **A new declared edge `new → invited`.** It changes the declared table, which mirrors
  `zustandsmaschinen.md` (precedence 7, frozen counterpart `04`). It also changes the domain doc
  and the G-D3-protected tests (`state-machine.test.ts`, `backward-transition.test.ts`), so it
  needs the human. And it would need its own way back (`invited → new`), which is another new edge.
- **Turning the rows into `invited` into an `operation` kind**, so `transitionApplication` refuses
  them. The header's reopen rule would then make `rejected/withdrawn/declined → invited`
  unexecutable too, because the invite takes only `new`/`screened`. That is a regression of the
  `application-pipeline` spec („reopening into those states" is executable). The invite also has no
  stored effect: the text is never stored (D4). So there is nothing for the generic path to skip
  except the UI duty to show the text, and O-organisation's „in derselben Handlung" rule is met by
  the only UI path that exists.

**This departs from a declared plan, and the departure is recorded.** `transitions.ts` (header) and
the register row „Übergänge je Schritt freischalten" expected F5's invite to declare its rows as an
`operation`. After this change, `transitionApplication(…, "invited")` still invites without text,
and nothing but the UI enforces the text. A register row (task 1.1) states this and the reason. The
`application-pipeline` delta says the text is a duty of the invitation's UI, not of the generic
path. **Needs the human's confirmation at review** (pre-mortem finding 5).

**The cost:** two `application.state_changed` events for an invite from `new`. Both name the account
and profile (AC-5.23). They share one `occurred_at`, because `now()` is fixed at transaction start,
so they are ordered by chaining `fromState`/`toState`, never by time; tests assert the chain. `zustandsmaschinen.md` names `application.invited`; the code has never
emitted it. That stays a register note, and the domain table is not edited.

**`applyTransitionTx` stays private.** The operation lives in the same file, so exporting it would
widen a no-authorization-by-contract primitive for no caller (YAGNI). Its header comment is updated:
the invite is the first caller that runs two rows in one transaction, and an export is still the
job of the first operation that lives in another module.

### D2 · `inviteApplication(context, { roundId, applicationId })`

The order follows `transitionApplication`'s:
1. **Before any query:** `context.profileId === null` → `ProfileRequiredError("inviteApplication")`
   (G-D15). A malformed id → `ApplicationTransitionError("not_found")`.
2. **`withSessionContext`:** `assertHasPermissionTx(tx, context, "change_application_state")`, which
   share-locks the live membership. It runs **before** the row is read, so a refusal teaches nothing
   about the row. `applyTransitionTx`'s own check covers only the branches that reach it, and
   without this one, `invited` (no-op) and `not_invitable` would answer a member who lacks the
   permission: a state oracle (pre-mortem finding 1).
3. **The row:** `SELECT id, household_id, state FROM application WHERE id = $app AND round_id =
   $round AND household_id = $hh FOR UPDATE`. No row → `not_found`. The round predicate makes a
   stale scoreboard tab for another round a refusal, never a silent invite.
4. **By state:**
   - `invited` → return `{ alreadyInvited: true }`, with no write and no event;
   - `new` → `applyTransitionTx(…, "screened")`, then `applyTransitionTx(…, "invited")` on the
     returned row;
   - `screened` → `applyTransitionTx(…, "invited")`;
   - anything else → `ApplicationTransitionError("not_invitable")`.

   `applyTransitionTx` re-checks every `requires` of each row on the same locked membership.
5. **Return:** `{ alreadyInvited: boolean }` only. No row and no personal column.

`ApplicationTransitionErrorCode` gains `not_invitable`. Votes and quorum are never read (FR-5.28).
There is no round-status check (proposal A-3).

**Serialisation and lock order** (LOCK ORDER comment on `openRoundTx`: membership FOR SHARE →
household_settings → casting_round → room → application): the invite takes membership FOR SHARE,
then the application FOR UPDATE, the same as `transitionApplication` and `updateApplication`. It
takes no settings, round or room lock, so no cycle is possible.

### D3 · Who sees „Einladen": one server-side permission check, no new read

**Human decision 2026-10-06:** the invite text carries no privacy notice (proposal, „Human
decision"). The dialog then needs nothing beyond what the board already shows: the application's
id, the round's id and the applicant's name. So there is **no new read**. An earlier draft had
`listInvitableApplications`, which returned the collection source, the notice categories and the
capture time. It was built and then removed with the notice (YAGNI).

Whether the viewer may invite is one stored-permission check on the server. `holdsPermission(context,
permission): Promise<boolean>`, the helper O5's page already has as `holdsCreateApplication`, is
generalised and moved to one shared server module (`src/app/holds-permission.ts`), so the board page
and O5 use the same code (DRY). It wraps `assertHasPermission` (identity's exported function: the
live membership, permissions as stored, never a role) and maps `PermissionDeniedError` to `false`.
It rethrows anything else.

The check is unlocked and outside any write. That is enough because it only decides whether a
button renders. The write re-checks under the share lock (D2), so a revocation between page load
and click is refused there.

**Why no lock or read is needed for the names:** the board's rows come from `getRanking`, already
filtered by V-1/V-2/V-4. The button is attached only to rows of the `decided` group. A row the
viewer cannot see never gets one.

### D4 · The dialog: one client island, the text never posted

`InviteDialog` lives in `src/app/(org)/rounds/[id]/applications/invite-dialog.tsx`, beside
`notice.tsx`, whose `NoticeTextPanel` (editable textarea, copy, re-seed) it reuses. Next to it sit
`invite-text.ts` (the pure `inviteText(name)` and `showInvite`) and `invite-actions.ts`. The board
and O5 both mount it. The board importing from another route group is accepted: it already imports
`../dashboard`. The pattern is `new-room-dialog.tsx` (a native `<dialog className="dialog">`,
`showModal()`, a top-right ×), with one difference: **the body mounts only once opened** (`opening >
0`). So a closed row carries no text and no numeral, and the board's digit assertions (C-5.1) keep
holding.

Its props are `roundId`, `applicationId` and `applicantName`, and nothing else. It contains:
- a heading `de.invite.heading(name)` and one intro line;
- `NoticeTextPanel`, seeded with `inviteText(name)` = `de.invite.text({ name })` (the greeting and
  the invitation, the name falling back to `nameFallback` when blank). It is editable, can be
  copied and re-seeded. The panel's „[Link]" hint is about a notice, so it is **not** shown here:
  `NoticeTextPanel` gains an optional `linkHint` prop (default `true`, so both notices are
  unchanged), and the dialog passes `false`;
- a `<form action={…}>` with two hidden inputs only (`roundId`, `applicationId`) and
  `<SubmitButton>{de.invite.confirm}</SubmitButton>` („Eingeladen!"). The textarea is outside the
  form and has no `name`, so the edited text cannot be posted (G-J4).

On `ok` the dialog closes, and the action's revalidation re-renders the page with the row under
„Eingeladen". On a refusal the dialog stays open and shows one calm sentence („Sorry, …", du-tone).
Closing writes nothing. No send, share or mailto control exists anywhere in the dialog.

`inviteApplicationAction` (`invite-actions.ts`, `"use server"`) gets the session from the cookie,
checks both ids with `isUuid`, and passes only them. It maps errors to codes (`not_found`,
`not_invitable`, `not_allowed`, `no_session`, `failed`), never to applicant data. On success it
revalidates `/casting`, `/rounds/{roundId}` (O4's groups) and
`/rounds/{roundId}/applications/{applicationId}` (O5).

`notice.tsx` returns to its state on `main`, except for the `linkHint` prop. The pre-mortem's
`thirdPartyNoticeText`/`DeadlineLine` extraction and `notice-text.ts` existed only for the
notice-in-the-invite and go with it.

### D5 · Board wiring

When `ranking.kind === "board"`, `casting/page.tsx` also calls `holdsPermission(context,
"change_application_state")` and passes `canInvite: boolean` to `RankingBoard`. `Group` takes
`canInvite`, passed `true` for the `decided` group only, and renders `<InviteDialog roundId
applicationId applicantName />` on every row of it. The board stays a server component; the dialog
is the client island. Every invite trigger is a plain `type="button"`, and the one-per-page
`anchor-name: --help-trigger` popover is not reused. A plain resident pays one refused permission
read per board view.

### D6 · O5

`applications/[applicationId]/page.tsx` uses the shared `holdsPermission` for both
`create_application` (the existing edit link) and `change_application_state`. When
`showInvite(canChangeState, application.state)` (true iff permitted and the state is `new` or
`screened`), the page shows `InviteDialog`'s „Einladen" in the action row at the top, beside
„Bearbeiten" (human walkthrough 2026-10-06: not hidden at the bottom). Otherwise it shows
nothing new.

### D7 · `screened` in v0.1

There is no control to remove. The spec records the rule: no control moves to `screened` on its own,
leftovers display under „Gesichtet" and stay invitable. The register row is closed in the docs
commit.

### D8 · No way back in the UI yet (proposal A-2)

The repository keeps `invited → screened` (moderator set) and `screened → new`, so P-4 holds at the
domain level. No screen offers any backward or side-state action today. Adding only „Einladung
zurücknehmen" would be one control without its siblings (reject, withdraw, reopen), and it would
land on the hidden `screened`. A register row records that P-4's way back has no UI in v0.1 yet,
owner: the change that builds O5's status actions. **Human, 2026-10-06: agreed.**

### D9 · Seed

`seed-round.ts` replaces its two `transitionApplication` calls with `inviteApplication(alexContext,
{ roundId: round.id, applicationId: applicationIds[6] })`. The applications, the votes and the
0-or-3 rule stay untouched.

## Invariants and every path that reaches them

**"Only a holder of `change_application_state` moves an application to `invited`"**
- `inviteApplication` and `transitionApplication`: the permission is checked in the repository, in
  the write's transaction, on the share-locked membership, and again per row by `applyTransitionTx`.
- The board button and O5: decided by server reads of the stored permission. The action calls the
  repository, which re-checks.
- Raw SQL as `app_runtime`: bound by RLS (household) only. Roles within a household are
  application-level by ADR-004's layering, unchanged for every table.
- No `SECURITY DEFINER` function writes `application.state`.

**"No vote lands on an `invited` application"**
- `vote_guard` reads the application FOR SHARE. That conflicts with the invite's FOR UPDATE, so a
  vote either commits first or waits and is then refused (`not_open`).

**"The dialog carries no applicant data beyond the name the board shows"**
- Its props are three: two ids and the name (D4). The voter-gated port is unchanged, and no new read
  exists.

**Every writer of `application.state`, pairwise**
- `inviteApplication` × `transitionApplication`: both take the application FOR UPDATE after
  membership FOR SHARE, so they are serialised on the row. The second one re-reads the state and
  applies its rule to it: an invite after a reject is `not_invitable`, and a transition after an
  invite sees `invited`.
- `inviteApplication` × `inviteApplication`: the same row lock. The second sees `invited` and is a
  no-op (spec scenario "Two moderators at once").
- `inviteApplication` × `updateApplication`: the same row lock. The update writes no state.
- `inviteApplication` × `castVote` (`vote_guard`): FOR UPDATE against FOR SHARE, as above.
- `application_keeps_votes` (`drizzle/0028`, BEFORE UPDATE OF `round_id`/`household_id`) does not
  fire: the invite's SET is `state, state_changed_at` only.
- `deleteApplication` (F3 change 4, not built) has the obligation to take FOR UPDATE already
  (comment on `transitionApplication`).

**Relationships a predicate joins through:** the invite's row predicate (`id`, `round_id`,
`household_id`) is a filter on one row, with no join. That the row's round belongs to the same
household is held by the `application_round_same_household` trigger. How many rows: `id` is the
primary key, so at most one.

## Risks / Trade-offs

- **[Two events per invite, one timestamp]** The two events share `occurred_at`, so a future history
  view must chain them by `fromState`/`toState` (register row, task 1.1). It then shows „Neu →
  Gesichtet → Eingeladen" for one
  click → acceptable. Both are true steps, and the history view takes its labels from its rows.
  Register note on the `application.invited` name.
- **[An irreversible click in the UI]** A mistaken „Eingeladen!" cannot be undone on screen (D8) →
  the confirm button sits after the text, inside a dialog, never on the row itself. The repository
  supports the way back for the change that builds it. The question goes to the human.
- **[Shared files with PR #55 and `founding-link-moderator` (formerly change B, migration 0034)]** `casting/repository.ts`, `de.ts` and the matrix →
  merge `main` before apply and before the PR, and re-run verify. No migration, so there is no
  number race.

## Migration Plan

None. No schema change, and no data change beyond what users do. Rollback is a revert of the code.

## Open Questions

- ~~A-1~~ **Decided (human, 2026-10-06):** invite also on O5.
- ~~A-2 / D8~~ **Decided (human, 2026-10-06):** no undo control now; register row.
- **Copy:** the draft for `de.invite.*`, to settle after the walkthrough:
  - heading „{Name} einladen";
  - intro „Hier ist ein Vorschlag für deine Nachricht. Du kannst ihn ändern und kopieren — Flatmate
    verschickt nichts.";
  - text „Hey {Name}, wir würden dich gern kennenlernen! Wann hättest du in den nächsten Tagen Zeit
    für ein Treffen bei uns?";
  - confirm „Eingeladen!" and the hint below it „Erst klicken, wenn du die Nachricht verschickt
    hast.".
