## Context

This design builds on change 2, `openspec/changes/archive/2026-09-29-application-capture`. From
there it keeps:
- design D4, the capture order;
- D5, the organisation read;
- D6, the three-step form;
- D15, the contact rule.

What exists and is extended, not rebuilt:
- **Repository** (`src/modules/casting/repository.ts`):
  - `captureApplication` locks the membership `FOR SHARE`, then the round `FOR SHARE`.
  - `getOrganisationApplication` requires `create_application` or `change_application_state` and
    keeps the membership locked through the read.
  - `getApplication` returns lifecycle columns only.
  - `transitionApplication` has **no permission check** and takes a caller-supplied `actor`.
- **Screens:**
  - The detail route `/rounds/[id]/applications/[applicationId]`.
  - `ThirdPartyNotice`, a quiet two-line callout that keeps the example text behind a toggle.
  - `SavedToast`.
  - The round page, which shows title, status, the „Bewerbung erfassen" link and the participant
    panel.
- **Permissions:**
  - `MODERATOR_PERMISSIONS` = `manage_rooms`, `close_round`, `create_application`,
    `change_application_state`.
  - `drizzle/0024`'s CHECKs are built from the constants in `src/modules/identity/schema.ts`.
  - `tests/unit/identity/role-permissions-constants.test.ts` pins `0024`'s hand-written literals to
    those constants.
- **Pairing triggers:**
  - `application_round_same_household` fires on `INSERT OR UPDATE OF round_id, household_id`, and
    locks the round `FOR SHARE` (`0025`).
  - `casting_round_keeps_applications` (`0026`) refuses deleting or re-homing a round that still
    has applications.

See proposal.md for why.

## Goals / Non-Goals

**Goals:**
- One rule for who sees an application's personal data on the organisation surface. The list
  and the detail share it, and it is written once.
- Every writer of an application row is serialised against every other one on the row lock, in
  one lock order.
- Reversing a state is a stored permission, and the database refuses it outside the moderator set.
- The correction form is O3's form, not a second form with its own rules.

**Non-Goals:**
- A screen that changes a state (F5), and any round-status condition on a state change (A3).
- Per-transition event names (`application.screened` …, `reverses_event_id`). F5 flags them.
- V-2 for residents (change 6), and the organisation layout guard (change 5).
- The "changed since your vote" marker (F5). This change only emits the event it derives from.
- Deletion (change 4). The detail gets no delete button yet.

## Decisions

### D1 · The list is its own read, with the detail's rule, and grouping is a pure function

`listOrganisationApplications(context, roundId)` in `casting/repository.ts`:
1. `context.profileId === null` → return `null` **before** `withSessionContext`, so no query runs
   (G-D15 obligation (a)). A malformed `roundId` → `null` too.
2. In one transaction:
   - `assertHoldsAnyPermissionTx(tx, context, ["create_application", "change_application_state"])`
     with the lock (the default). The read returns names and contacts, so the reason in
     `getOrganisationApplication` applies unchanged: without the share lock held through the read,
     a revocation could commit between the check and the read (Copilot, PR #39).
   - `SELECT id, applicant_name, state, collected_from, age, contact_email, contact_phone,
     contact_other, created_at FROM application WHERE round_id = $1 AND household_id =
     context.householdId ORDER BY created_at DESC`.
3. It returns rows. It never returns `message_raw` or `attributes`, because the list does not show
   them.

There is no `deleted_at IS NULL` filter. Nothing in the code sets `deleted_at`, and
`getOrganisationApplication` has no such filter either. Change 4 drops the column. Adding the filter
here would only create one more place to remove it later.

Grouping is a pure helper, `src/modules/casting/application-groups.ts`:
- `APPLICATION_STATE_ORDER` = `MAIN_PATH` followed by the four side states.
- `groupApplicationsByState(rows)` → `{ state, count, rows }[]`, empty groups dropped, the input
  order kept inside each group.
- A unit test asserts that `APPLICATION_STATE_ORDER` equals the enum's values as a set, and has no
  duplicate. A state added to the enum later fails that test instead of silently disappearing from
  the list.
- The counts come from the same rows, so a count and its list can never disagree, and there is no
  second query to guard.

*Alternatives:*
- **Widen `getOrganisationApplication` to return many rows.** Rejected: it is keyed on one id, and
  a "list or one" switch in one function is the merged read D5 of change 2 warns against.
- **A `GROUP BY` count query.** Rejected: it adds a second read with its own guard, for a list of
  low tens (A-3.1).

**Sibling reads**, checked for personal columns (PR #39 lesson):
- `getApplication`: lifecycle only, unchanged.
- `getOrganisationApplication`: guarded, unchanged.
- `getStartOverview`: counts only, profile-only, and the viewer's own application excluded. That is
  B1's rule and unchanged.
- `getRoundParticipants`: resident names, not applicant data. Unchanged; change 5 gates the route.
- `transitionApplication` today reads the full row with `.select()` and returns it through
  `.returning()`, name, contacts and message included (pre-mortem M10). D6 makes both
  lifecycle-only, and the `application-capture` delta states that exactly two reads return
  personal columns: the detail and this list.
- `updateApplication` (D4) returns `{ changed }` only, never the row.
- No other read of `application` exists (`grep -n "from(application)\|FROM application" src/`).

### D2 · The round page: one block, three viewer cases

`/rounds/[id]/page.tsx` renders the header (title and status) and the „Bewerbungen" section inside
one `panel-round` (U-29). The participant panel moves below it as a plain section. It belongs to
the round too, but O4's rule is about the header and the list.

| Viewer | What the section shows | How it is decided |
|---|---|---|
| Household account (`profileId === null`) | the §8.6 sentence (`de.applications.states.householdAccount`, already in `de.ts`), no list, no number | the page branches on `profileId` and does not call the read. The read would return `null` anyway |
| Resident without either permission | no section at all | the read throws `PermissionDeniedError`, and the page catches it |
| Holder | the grouped list, or the empty state | — |

**Empty:** „Noch keine Bewerbung erfasst". Then „Bewerbung erfassen" as the primary button, only
when `canCapture`, which is the existing check (open round plus `create_application`). When the
list is not empty, the existing „Bewerbung erfassen" link sits in the section's header. There is
never a second capture button.

**Row:** a link-card to the detail.
- The name.
- A `badge` with the §8.6 state word.
- „Über jemand anderen" as a quiet text marker, when third party.
- One muted line: the age (`de.applications.list.age(n)`), then the stored contacts, joined with
  „ · ". It is omitted when all of them are empty.

**Group header:** the §8.6 word plus the count, for example „Neu · 3". The human asked for the page
to stay calm, so the design has no colours per state and no icons beyond what the badge already
has.

**Fehler (G-N6):** any other error from the list read is caught in the section. It is logged as
`{ code: "unexpected", name }`, never the error object: a Drizzle message carries bound values
(change 2, D4). The section shows „Die Bewerbungen konnten gerade nicht geladen werden. Lade die
Seite neu." The rest of the page still renders, and the „Bewerbung erfassen" link stays in the
section header while `canCapture` holds: capture does not depend on the list.

The catch is narrow. A `TypeError` or `ReferenceError` is a programming error, such as a
repository function missing from a test's module mock (pre-mortem M7), so it is **rethrown**, never
shown as a load error. Otherwise a test whose mock lacks the list read would pass while rendering
only the error state.

**Laden:** `rounds/[id]/loading.tsx` gets one `panel-round` holding a `SkeletonHeading` and a
`SkeletonList`. Its shape is the header plus the list.

The `?saved=` toast stays as it is. The new row is now visible in the list under „Neu".

### D3 · The notice on every application: one text panel, two variants

`src/app/(org)/rounds/[id]/applications/third-party-notice.tsx` becomes `notice.tsx`, and the
import in O3 is updated. It exports:
- `NoticeTextPanel`: the editable textarea, the copy and regenerate buttons, and the `[Link]` hint.
  This is the inner block `ThirdPartyNotice` has today, moved out unchanged. The rules of change 2's
  D6 still hold: the textarea has no name, the notice sits outside any form, and there is no send
  control.
- `ThirdPartyNotice`: API unchanged for O3. It gains an optional `why?: true`, which the detail
  passes and O3 does not.
- `ApplicantNotice`, the Art. 13 variant:
  - collapsed by default;
  - one secondary button, „Datenschutz-Hinweis anzeigen", with `aria-expanded`;
  - opened, it shows `NoticeTextPanel`, seeded with `de.applications.notice.applicantText`
    (Compliance §4.5 Stufe 1 **verbatim**, A1);
  - it is not a callout. It sits as a quiet row under the facts, because nothing is due. The
    third-party callout stays a callout, because a duty exists there.
- „Warum steht das hier?": a round (?) icon button (`WhyButton`) in the notice's own button row, with
  the question as its hover text (`title`) and its accessible name (`aria-label`), and
  `aria-expanded`. It opens `de.applications.notice.why` in place, below (`WhyText`). Both variants
  take a `why` prop, which the detail passes and O3 does not. Nothing depends on hovering: a tap
  opens it *(changed 2026-09-29, human walkthrough: first a text button, then a (?) on its own line;
  now beside the button it explains)*.

Draft German for the human, in the walkthrough, in `de.ts`: *„Ihr als WG speichert die Angaben
und entscheidet, was damit passiert. Deshalb seid ihr dafür verantwortlich, die Person darüber zu
informieren. Flatmate.io schlägt euch nur einen Text vor und verschickt nichts selbst."* The
future flatmate.io page on these duties is already a register entry (change 0). Until it exists,
there is no link.

On the detail: a third party gets `ThirdPartyNotice why`, as today plus the why. The applicant gets
`ApplicantNotice` plus `WhyNotice`. Neither variant writes, stores or tracks anything (AC-3.20). A
render test asserts this for each variant: the third-party sentence is present exactly when
`third_party`, and there is no element with `name` inside the notice.

*Alternative: one component with a `variant` switch.* Rejected. The two differ in weight: a callout
with visible duty lines, against a collapsed row. They also differ in their text source and in
whether a date exists. A switch would put every one of those differences behind a condition.

### D4 · `updateApplication`: the same checks as capture, the row locked, a diff, one event

`updateApplication(context, input: RawApplicationInput & { roundId, applicationId })` in
`casting/repository.ts`:

1. `profileId === null` → `ProfileRequiredError("updateApplication")`, before any query.
2. `roundId` or `applicationId` not a UUID → `ApplicationUpdateError("not_found")`.
3. `withSessionContext`:
   - a. `assertHasPermissionTx(tx, context, "create_application")`, which puts the membership
     `FOR SHARE` (FR-3.21 names this permission).
   - b. `SELECT … FROM application WHERE id = $a AND round_id = $r AND household_id =
     context.householdId FOR UPDATE`. No row → `not_found`.
   - c. **Stale check (pre-mortem M5).** `applicationBaseline(current) !== input.baseline` →
     `ApplicationUpdateError("stale")`, with nothing written. The baseline is described below. It
     needs only the locked row, so it runs **before** parsing: a stale form is told so at once,
     not first sent to fix a field *(moved 2026-09-29, code review)*.
   - c2. `parseApplicationInput(input)`. It runs after the checks, as in capture, so a member
     without the permission learns only that. Keys it does not know (`source`, `state`, `roundId`
     as a field) are ignored: the parser never reads them, and `roundId` only selects the row.
   - d. `changedApplicationFields(current, parsed)`: a fixed list, compared column by column.
     `attributes` is compared as the canonical JSON of the `{label, value}` array in order. `null`
     and a blank both mean empty, because the parser already maps a blank to `null`.
   - e. No field changed → return `{ changed: [] }`, with no UPDATE and no event.
   - f. `UPDATE application SET <changed columns only> WHERE id = $a`, wrapped by
     `toApplicationWriteError` (change 2, D4: no value leaves in an error). **The SET list never
     contains `round_id` or `household_id`.** So the pairing trigger (`UPDATE OF round_id,
     household_id`) does not fire, and no round lock is taken. The SET list never contains `state`,
     `state_changed_at`, `source`, `created_*` or `became_resident_id` either.
   - g. `recordActivityEvent`, `application.updated`, payload `{ fields: string[] }` (the changed
     column keys in the fixed order), actor from `context`.
4. Returns `{ changed: string[] }`.

**The baseline: why, and why not a column.** Without it, D7's "no lost update" is false for a form.
The diff runs against the locked row, but the form holds the values from page load. Say B opened
the form before A saved a new name. B's save would see B's stale name as a change, revert A's
correction, and audit `applicantName` as changed by B.

The fix is optimistic concurrency, in three parts:
- The edit page computes `applicationBaseline(row)`, a SHA-256 hex digest of the canonical JSON of
  the eight correctable fields, and puts it in a hidden `baseline` input.
- The action passes it through.
- Step c2 compares it with the locked row. A mismatch refuses with `stale`, and the form keeps what
  was typed (the capture form's controlled inputs) and says „Die Bewerbung wurde inzwischen
  geändert. Lade die Seite neu, um die aktuelle Fassung zu sehen."

The digest is one-way, and it goes only to a viewer who already sees the values. It never reaches
action state or a log. An `updated_at` column was rejected: G-J4 forbids a field the domain model
does not name.

`applicationBaseline` and `changedApplicationFields` live in a **pure module**,
`src/modules/casting/application-changes.ts`, not in `repository.ts`. There they are unit-testable,
and they don't become repository exports that the authorization matrix would have to classify
(pre-mortem M6).

**The audit.** `PAYLOAD_ALLOWLIST` gains `"application.updated": ["fields"]`. `updateApplication`
also asserts, before recording, that every element of `fields` is one of the eight fixed names
(`CORRECTABLE_FIELDS` in `application-changes.ts`). The allowlist checks keys only, so without
this a code bug could write a value into the array. `REDACTABLE_KEYS`
gets nothing new, because field names are not personal. EC-3.6 needs no extra data:
- `application.created` records the first `collectedFrom`;
- each later `application.updated` naming `collectedFrom` flips a two-valued field;
- so the history of the source can be reconstructed without storing any value, and AC-3.19 forbids
  storing one ("neither the old nor the new value").

The F5 marker reads `fields` for the content subset (`applicantName`, `age`, `messageRaw`,
`attributes`).

**Error codes:** `ApplicationUpdateError` has the codes `not_found` and `stale`. Input errors are
`ApplicationInputError`, as in capture. There are also `PermissionDeniedError`,
`ProfileRequiredError` and `ApplicationWriteError`.

**Contacts round-trip.** The form is pre-filled with `[contact_email, contact_phone,
contact_other]`, the non-null ones in that order. `classifyContact` is deterministic, and every
stored value was put in its column by the same rule. So an unchanged form re-sorts every value into
its own column, and the diff is empty. A value written by another path, one that the rule would
sort elsewhere, shows up honestly as two changed columns. A unit test covers the round trip for
each kind, including a phone longer than 50 (`other`).

### D5 · The correction form is O3's form in edit mode, opening on the message

`capture-form.tsx` gains a `mode` prop:
- `{ kind: "capture", roundId }`, today's behaviour.
- `{ kind: "edit", roundId, applicationId, baseline, stored: CaptureValues & { thirdParty: boolean
  }, capturedAt: string }`. It is named `stored`, not `initial`, because `CaptureForm` already has a
  test-only `initial` prop.

In edit mode:
- **Every place that branches on `thirdParty` for the notice switches to `noticeDue(mode,
  thirdParty)`:** `decideSubmit`, the step-2 primary button's label, and the notice's mount. Today
  `deadlinePassed` is hard-coded `false` in capture mode, which is right there, since the capture
  instant is now. In edit mode it is computed from `capturedAt` (pre-mortem L).
- The hidden `baseline` input rides along (D4 c), and a `stale` refusal shows its sentence without
  changing step.
- The form **starts on step 1, the message, exactly like capture** *(changed 2026-09-29, human walkthrough: opening on „Angaben" hid the message behind „Zurück", and the free text looked missing)*.
- The heading is „Bewerbung bearbeiten", and the primary control is „Änderungen speichern".
- The notice step (3) appears only when `thirdParty` is ticked **and** `initial.thirdParty` was
  false. That is EC-3.5's "from the moment of the change". An application that was already a third
  party keeps its notice on the detail, so repeating it here would be noise.
- The deadline comes from `oneMonthAfter(new Date(capturedAt))`, never from now. When it has
  passed, the notice's existing `deadlinePassed` line says so.
- The form's action is `updateApplicationAction` in `[applicationId]/edit/actions.ts`, with the
  same shape as the capture action: codes only in the state, no value, never an error object in a
  log, and `redirect()` outside the try.
- On success it redirects to the detail with `?updated=1`, and the detail shows „Änderungen
  gespeichert". A correction that changed nothing redirects with `?updated=0`, and the detail shows
  „Keine Änderungen" *(added 2026-09-29, human walkthrough: a save with no changes wrote nothing but
  announced a save; `tests/unit/casting/update-action.test.ts`)*. `SavedToast` gets a `param` prop, so it strips `updated` or `saved`.

`capture-steps.ts` stays pure. A new `noticeDue(mode, thirdParty)` joins it, unit-tested. (A
`firstStep(mode)` existed while edit mode opened on step 2; it was removed when both modes started
on step 1.)

The route `/rounds/[id]/applications/[applicationId]/edit`:
- `page.tsx` reads through `getOrganisationApplication`. `null` → `notFound()`. A permission
  refusal → the detail's refusal text.
- It then checks `create_application` with the same try/catch as the round page. Without it, it
  shows „Bewerbungen bearbeitet die Moderation der WG.", and the action refuses anyway.
- `loading.tsx` imports `@/ui/skeletons` and has the shape heading plus form.
- The detail shows „Bearbeiten" (a secondary link) only to a `create_application` holder.

*Alternative: a single-page edit form with every field visible.* It is simpler for a typo, but it
is a second form with its own layout, and the human asked for O3 to stay three quiet steps.
**Decided by the human, 2026-09-29: the three steps are kept for correction too** (proposal A4).

### D6 · `transitionApplication`: the permission in the transaction, the row locked, the actor from the session

New signature: `transitionApplication(context, applicationId, toState)`. **BREAKING:** the `actor`
parameter is gone.

1. `profileId === null` → `ProfileRequiredError("transitionApplication")`, before any query. This
   is unchanged, and the guarded G-D15 test relies on it.
2. `applicationId` not a UUID → `ApplicationTransitionError("not_found")`. The codes are
   `not_found` and `step_not_available`.
3. `withSessionContext`:
   - a. `assertHasPermissionTx(tx, context, "change_application_state")`, with the membership
     `FOR SHARE`.
   - b. `SELECT … FROM application WHERE id = $a AND household_id = context.householdId FOR
     UPDATE`. No row → `not_found`. Today's read had no lock at all, so two concurrent transitions
     both read `new` and both wrote. That is a read-then-write with nothing serialising it.
   - c. `ruleFor(from, to)`. It throws `InvalidTransitionError` for an undeclared pair, as
     `assertTransitionAllowed` did.
   - d. `ruleFor(from, to)` (D6a). A `pending` row → `ApplicationTransitionError
     ("step_not_available")`. **Every** permission in the row's `requires` →
     `assertHasPermissionTx`. This reads the membership row that step a already locked, so no new
     lock is taken.
   - e. The UPDATE of `state` and `state_changed_at`, then `application.state_changed`
     `{fromState, toState}`, with `actorAccountId`/`actorProfileId` from `context`.
4. Both the locked SELECT and the UPDATE's `.returning()` list **lifecycle columns only**. Today's
   `.select()`/`.returning()` of the whole row is the last sibling that hands out personal columns
   (pre-mortem M10). The return type is the same lifecycle shape `getApplication` returns.

**`docs/domain/zustandsmaschinen.md` §3.1 "Wer darf" (pre-mortem M8).** That column names a
permission per transition. Two of them are not `change_application_state`:
- `invited ⇄ scheduled` needs `confirm_appointment`;
- `moved_in → offer_made` needs `manage_members` as well.

Its backward rows name `change_application_state` alone. The floor follows `03-PRD.md` §4.0.1,
which has precedence 3 over the domain file's 7: "Kann Status ändern", plus "zurücknehmen" for the
moderator only. So the backward rows' "Wer darf" gain `reverse_application_state` (a docs
amendment, D10). The transition-specific permissions are **not guessed now**. D6a leaves their
rows undeclared until the feature that builds them declares them.

### D6a · A declared rule per transition: rights and side effects grow step by step

**The problem (human review, 2026-09-29).** A casting has many steps after intake: the invite, the
live casting (appointments), the second vote (`stage = offer`), the offer with its room, the
notice of move-in, and the applicant becoming a resident. v0.1 builds only intake to scoreboard.
Most later transitions have side effects that `zustandsmaschinen.md` §3.1 lists:

| Transition | Its side effect |
|---|---|
| `invited ⇄ scheduled` | the appointment is confirmed or cancelled, and the slot freed |
| `scheduled → interviewed` | the appointment is completed, and `stage = offer` opens |
| `interviewed → offer_made` | requires `assigned_room_id`; the room becomes `promised`; vetoes lock (I-4, I-6) |
| `offer_made → moved_in` | the room becomes `occupied`; a resident profile is created and `became_resident_id` set (I-3, I-5, V-1) |
| `moved_in → offer_made` | the most expensive way back, and it never clears `became_resident_id` |
| side exits from `offer_made`/`moved_in` | the room is released |

A generic "set the state" function that could execute these rows would skip every one of those
effects: an offer without a room, a resident without a profile. The rule "an invariant holds only
where it is enforced" demands that the generic path cannot take them at all.

**The decision.** `src/modules/casting/transitions.ts` gains one declared rule per pair of
`TRANSITIONS`, next to the table. It is a second column of the same table, never a
code-derived rule (ADR-002):

```ts
export const PENDING_STEPS = ["appointment", "interview", "offer", "move_in",
                              "move_in_reversal", "retention"] as const;
export type PendingStep = (typeof PENDING_STEPS)[number];
type TransitionKey = `${ApplicationState}->${ApplicationState}`;
export type TransitionRule =
  | { kind: "state_only"; requires: readonly string[] }   // executable by transitionApplication
  | { kind: "pending"; step: PendingStep };              // no rights declared yet: refused
export const TRANSITION_RULES = new Map<TransitionKey, TransitionRule>([ /* one per pair */ ]);
export function ruleFor(from: ApplicationState, to: ApplicationState): TransitionRule;
  // throws InvalidTransitionError when undeclared
```

Explicit type arguments on `new Map<…>` keep `kind` a literal union, never a `string` that
tempts a cast. `transitions.ts` stays pure: `task-precedence.ts` imports it, so any identity type
comes in through `import type` only. The sibling pattern is `F1_REACHABLE_TRANSITIONS` in
`room-transitions.ts`, an executable subset beside the declared table, and this follows its
style. The runtime `PENDING_STEPS` array is what the test checks. A type-only union has nothing to
check at runtime (second pre-mortem, finding 5).

- A **`state_only`** row changes `state` and `state_changed_at` and writes its event, nothing
  else. Its `requires` is `change_application_state`, plus `reverse_application_state` when the
  move is backward. It is **written out per row, not computed**, so each row can later grow its
  own permission without a code branch.
- A **`pending`** row belongs to a step not built yet. It declares **no** rights, because guessing
  F5's or v0.2's permissions now would fix their design. `transitionApplication` refuses it with
  `ApplicationTransitionError("step_not_available")` and changes nothing.
- **Extending, per later step.** When a feature builds a step, in one change, it:
  1. builds the operation that carries the effects (for example `confirmAppointment`);
  2. turns that step's rows into an `operation` kind naming the operation, with their `requires`;
  3. adds any new permission to the role sets the matrix gives it to (constant, backfill and
     CHECK, the §2.1 rule).
  
  The operation calls the one internal step `applyTransitionTx(tx, context, row, to, expectedKind)`.
  That step checks **every** entry of the row's `requires` on the locked membership (second
  pre-mortem, finding 1). It never assumes an entry was checked earlier: an appointment row may
  require `confirm_appointment` and not `change_application_state`. The generic function uses the
  same code path, so a permission rule is never written twice. `transitionApplication` executes
  only `state_only` rows, so an operation's row is never reachable without its effects. The
  `operation` kind is **not added in this change**, because no operation exists yet. The first
  feature that builds one adds it.
- **Exporting the helper.** It stays private in this change. It is exported, with `expectedKind`,
  by the first feature that needs **two or more rows in one transaction**, even if they are all
  `state_only`. F5's „Als eingeladen markieren" is such a feature: it takes `new → screened →
  invited` in one action (`03-PRD.md` §4.1.6), and there is no `new → invited` pair. Two calls to
  `transitionApplication` would be two transactions, and nesting them is refused
  (`NestedSessionContextError`).
- **A reopening belongs to the step of its target.** A reopening into state X is classified with
  the forward row into X and is re-classified in the same change. Otherwise the reopening would be
  a bypass the day the forward row gains an operation: `rejected_by_household → invited` would skip
  F5's invite (the "sibling entry" rule of the hazards file).

**The rows declared `state_only` in v0.1** (the human: *"a moderator only needs rights for
processes from new ⇄ screened ⇄ invited"*):
- forward: `new → screened`, `screened → invited`;
- backward: `screened → new`, `invited → screened`;
- the side exits no step owns yet: `new`, `screened` or `invited` → `rejected_by_household`, and
  → `withdrawn`; `invited → declined_by_applicant`;
- their reopenings: `rejected_by_household`/`withdrawn` → `new`, `screened` or `invited`, and
  `declined_by_applicant → invited`. Reopenings count as backward (`isBackwardTransition`, verified
  for all seven), so they need `reverse_application_state`.

That is 18 rows. The other 36 of the 54 declared pairs are `pending`.

**Why `screened → invited` is `state_only` although §3.1 lists an effect.** The effect is the
Copy-Paste-Text with the privacy notice, a helper for the household that writes nothing to the
database. D3 already offers the Art. 13 text on every application's detail. F5 builds the action
that shows the text in the same step (O5), and when it does, it may turn this row and the
reopenings into `invited` into its operation.

**The reason field.** §3.1 and `03-PRD.md` §4.1.7 give reopenings *„ein Begründungsfeld"*. A
`state_only` reopening writes only `{fromState, toState}`. F3 has no screen that changes a state,
so nothing is lost. F5's register row carries the reason field as its re-classification of the
seven reopenings.

**Every other declared pair is `pending`:**

| Rows | `step` |
|---|---|
| `invited ⇄ scheduled`; exits from `scheduled`; reopenings into `scheduled` | `appointment` |
| `scheduled → interviewed`, `interviewed → scheduled`; exits from `interviewed`; reopenings into `interviewed` | `interview` |
| `interviewed ⇄ offer_made`; exits from `offer_made`; reopenings into `offer_made` | `offer` |
| `offer_made → moved_in`; `declined_by_applicant → moved_in` (the reopening) | `move_in` |
| `moved_in → offer_made`; `moved_in → declined_by_applicant` | `move_in_reversal` |
| every row into or out of `archived` | `retention` |

**Rule:** a side row takes the step that owns the main-path state it leaves or re-enters (second
pre-mortem, finding 6). The feature that builds that step re-classifies all of its rows at once.

**The moderator's set contains every right v0.1's rows need.** `change_application_state` and
`reverse_application_state` cover every `state_only` row, and nothing else is added for
transitions. A test pins three things:
- every permission in a `state_only` row's `requires` is in `MODERATOR_PERMISSIONS`;
- the **full rule table as a literal**: every pair with its kind, and its exact `requires` or its
  `step`. So widening the executable set, or changing a row's rights, is always a deliberate
  and visible diff, and never a side effect of editing `TRANSITIONS`. A subset check alone would
  miss an extra permission on a row (second pre-mortem, finding 5);
- every `step` is in `PENDING_STEPS`.

**Why not one permission per step now** (`screen_application`, `invite_application` …)? The matrix
has one row, *„Kann Status ändern"*, for all of them. Splitting it would create permissions that no
spec names, which is the "Vorlagensystem" S-04 excludes (`identity.md` §2.1). The table makes the
split possible per row, the day a spec asks for it.

**Order inside `transitionApplication`** (D6 step 3, revised):
1. membership `FOR SHARE` + `change_application_state`, so that someone without it learns nothing;
2. the row `FOR UPDATE`;
3. `ruleFor(from, to)`, which throws `InvalidTransitionError` for an undeclared pair. It replaces
   the `assertTransitionAllowed` call here, which stays exported for the state-machine tests;
4. `pending` → `step_not_available`;
5. **every** permission in `requires`, on the membership row step 1 already locked. That means
   `change_application_state` again, which costs one query, plus `reverse_application_state` on
   backward rows. Steps 3–5 are the private helper;
6. the UPDATE and the event.

Step 1 is a coarse check in front of everything. It keeps a member without the permission from
learning anything about the row. So a plain resident asking for a `pending` row gets
`PermissionDeniedError`, and only a holder of `change_application_state` gets
`step_not_available`. That leaks nothing, because such a holder can read the row through
`getOrganisationApplication` anyway.

`isBackwardTransition` stays for the audit (FR-0.11). The permission comes from the row.

The permission is checked before the row is read, so a member without it learns nothing about the
row. After that point, only `not_found` and the backward refusal depend on the row, and only a
holder of `change_application_state` reaches them.

**Authorization matrix:** the `KNOWN_OPEN_CASTING` entry and its "no route caller yet" test are
removed. `transitionApplication` is classified as "refuses a plain resident", in the same shape as
the other casting mutators. `updateApplication` joins the list with the same classification.
The matrix requires every export to be classified (`authorization-matrix.test.ts`: NOT_APPLICABLE
+ KNOWN_OPEN + cases = every export). So `listOrganisationApplications` goes into
`NOT_APPLICABLE_CASTING` with the reason "read; its visibility is tested per read in
`application-pipeline-list.test.ts` (D1)". The matrix covers mutators only (hazards file).

### D7 · Every writer of an application row, and one lock order

| Writer | Row lock on `application` | Other locks, in order |
|---|---|---|
| `captureApplication` (INSERT) | — (new row) | membership `FOR SHARE` → round `FOR SHARE` (and the trigger's round `FOR SHARE`) |
| `updateApplication` | `FOR UPDATE` | membership `FOR SHARE` → application |
| `transitionApplication` | `FOR UPDATE` | membership `FOR SHARE` → application |
| `deleteApplication` (change 4) | must take `FOR UPDATE` or `DELETE … RETURNING` | membership → application (**obligation**, written into change 4's section of the plan) |
| raw SQL as `app_runtime` | RLS (household) only | application-level rules do not apply (ADR-004 layering), as for every table |

How each pair is serialised:
- **update against update:** the second waits on `FOR UPDATE`, then checks its baseline against
  the first's result (D4 c). A form loaded before the first save is refused as `stale`. Only
  then does it diff. There is no lost update, including across two open forms, which the row lock
  alone would not give (pre-mortem M5).
- **update against transition:** the same row lock. Neither writes the other's columns, and the
  lock still orders their events.
- **update or transition against a revocation:** the membership `FOR SHARE` conflicts with the
  revoking UPDATE.
- **capture against either:** there is no shared row.
- **The round:** neither update nor transition writes `round_id`, so neither takes a round lock. A
  future round close takes the round `FOR UPDATE` and conflicts only with capture, which is change
  2's obligation.

**Lock order everywhere: membership, then round, then application.** No function takes a lock on
`application` and then on `membership`, so there is no cycle. Two tests make it deterministic, in
the pattern of `tests/integration/policy/revoked-membership-sign-in.test.ts`:
- one holds an uncommitted `FOR UPDATE` on the application while a second transition runs;
- one holds an uncommitted revocation of the membership while an update runs.

### D8 · `reverse_application_state`: a constant, a backfill and two CHECKs, in one change

In `src/modules/identity/schema.ts`:
- `export const MODERATOR_ONLY_PERMISSIONS = ["reverse_application_state"] as const;`
- `MODERATOR_PERMISSIONS` = the four existing values plus `...MODERATOR_ONLY_PERMISSIONS`.
- A new `check("membership_moderator_only_permissions", sql\`role = 'moderator' OR NOT
  (permissions && ${permissionArrayLiteral(MODERATOR_ONLY_PERMISSIONS)})\`)`.

The existing `membership_moderator_holds_role_permissions` widens by itself, because it is built
from the constant.

**Why a CHECK, not only "no function grants it":** the matrix gives reversing ❌ to residents, not
⬜. That is the only difference between this permission and `change_application_state`. Without
the CHECK, the model would allow an individual grant the spec forbids. Every other membership
writer is already safe:

| Writer | Effect on this CHECK |
|---|---|
| registration | the exact household set, which is already disjoint |
| claim or join | the resident set, which is empty |
| demotion | `setMemberRole` removes `MODERATOR_PERMISSIONS` by `EXCEPT`, and reverse goes with it |
| move-out or removal | everything is cleared |
| reactivation | the resident set only |

Nothing in the code needs to change for these.

**Migration `drizzle/0027_reverse_application_state.sql`.** It is generated by `drizzle-kit
generate` and then edited by hand. It contains no `SECURITY DEFINER` and no `DROP COLUMN`, so the
agent applies it to dev. Order, argued against the constraints live at each statement:
1. `LOCK TABLE "membership" IN SHARE ROW EXCLUSIVE MODE`, as `0024` does: no appointment or
   demotion can land between the backfill and the CHECKs.
2. A precondition `DO` block: `RAISE EXCEPTION` if any live non-moderator row already holds
   `reverse_application_state`. None can today, since the value is new. It is never silently
   stripped.
3. The backfill: every live moderator unions in `reverse_application_state`, sorted, like
   `0024`'s. At this statement, the old moderator CHECK (four values) is still live. A union keeps
   the four, so every row still passes it.
4. `DROP CONSTRAINT IF EXISTS` and `ADD` for `membership_moderator_holds_role_permissions` with the
   five-value literal. It is valid because step 3 ran.
5. `DROP CONSTRAINT IF EXISTS` and `ADD` for `membership_moderator_only_permissions`. It is valid
   because step 2 proved no non-moderator holds the value. Revoked rows are members with no
   permissions, so they pass.

The file is re-runnable: the backfill is idempotent, and every CHECK is dropped before it is added.
It is not covered by `migration-shape.ts` rules beyond the generic ones: no enum, no column, no
function. After generation, `grep -nE '\$[0-9]' drizzle/0027*` must be empty. drizzle-kit drops
`check()` params (change 2, pre-mortem H3). A plain `\$` grep would also match step 2's `DO $$`
block (pre-mortem M11).

`role-permissions-constants.test.ts` hard-reads `0024`. It is changed to read, for each constraint
name, the **last** migration file that defines it, so the moderator constraint comes from `0027`,
and to cover the new constraint. Its purpose is unchanged: it keeps the hand-written literals
equal to the constants.

Its backfill test ("every backfill uses the same literals as its constant") compares `0024`'s
four-value moderator backfill with the now five-value constant, so it would fail (pre-mortem H2).
`0024` is applied history and is **never edited**. The test pins `0024`'s backfill literals to a
frozen four-value `MODERATOR_PERMISSIONS_AT_0024`, declared in the test and commented as history.
A new case asserts `0027`'s backfill literal against `MODERATOR_ONLY_PERMISSIONS`.

**Dev window.** Once `0027` is on `flatmate-io-dev`, any branch whose code still has the
four-value constant appoints a moderator without the new permission, and the widened CHECK refuses
it. Today no other branch is open (`gh pr list` was empty on 2026-09-29). The applier applies
`0027` only after the code is ready, the human is told, and the PR merges promptly. The pattern is
the same as `0023`/`0024`.

### D9 · Vocabulary

`de.status.application` holds the eleven §8.6 words verbatim, keyed by the enum. A unit test
asserts the keys equal the enum's values. New strings:
- `de.applications.list` (heading, empty, the count label, the age, the load error);
- `de.applications.notice.applicantText` and `showApplicantNotice`;
- `de.applications.notice.why` and `whyToggle`;
- `de.applications.edit` (heading, save, pending, updated, permission denied).

### D10 · Docs amended in this change (German where the file is German)

- `docs/backlog/requirements/F3-requirements.md` (English):
  - FR-3.24: *"a backward state change shall additionally require `reverse_application_state`,
    which only the `moderator` role's permission set contains and no other membership can hold
    (amended 2026-09-29: roles are names for permission sets, `domain/identity.md` §2.1)"*.
  - AC-3.21's middle clause: *"holding `change_application_state` but not
    `reverse_application_state`"*.
- `docs/domain/identity.md` §2.1: the paragraph *„Was ausdrücklich kein vergebbares Recht ist"*.
  The German text is in tasks.md, for the human to read. Reversing becomes the permission, held
  only in the moderator set and refused elsewhere by the database. Deleting keeps its current
  sentence until the manual-deletion change builds it.
- `docs/domain/identity.md` §2.1, also: the sentence counting *„vier feste Vorbelegungen je
  Rolle"* becomes five for the moderator (pre-mortem L).
- `docs/backlog/requirements/F3-requirements.md` §8 item 3 (*"The two new role defaults"*): it
  gains a note that reversing is a third, moderator-only one.
- `docs/domain/zustandsmaschinen.md` §3.1, the backward table's "Wer darf": add
  `reverse_application_state`, with a note citing `03-PRD.md` §4.0.1 (D6).
- `docs/review-log.md`:
  - the obligation *„F3: `transitionApplication`"* moves to closed, citing FR-3.24 and the test
    files;
  - one register row for the permission decision;
  - the closed row of 2026-09-28 (*„Wer Bewerbungen anlegt, ändert und löscht"*, which says
    „Löschen und Zurücknehmen hängen an der Rolle `moderator`") gets a dated note that its
    „Zurücknehmen" half is superseded by the new row;
  - one open row, **„Übergänge je Schritt freischalten"**. Every later step declares its rows in
    `TRANSITION_RULES`, together with its operation and its permissions, in the feature that
    builds it (D6a). The steps: the invite text in F5, appointments, interview, offer, move-in, its
    reversal, retention. The row also records four rules:
    - a reopening into a state is re-classified with that state's forward row;
    - the per-transition rights of `zustandsmaschinen.md` §3.1 (`confirm_appointment`,
      `manage_members`) are decided by the feature that builds the step;
    - the reopening reason field (*„Begründungsfeld"*) arrives with F5;
    - the G-D9 test (*„`became_resident_id` wird nie auf `null` gesetzt"*) belongs to the
      `move_in_reversal` step.
- `docs/domain/zustandsmaschinen.md` §3.1: one dated note under the tables. Until the step that
  carries a transition's effects is built, the transition is not executable. v0.1 executes only
  `new ⇄ screened ⇄ invited`, the exits from those states, and their reopenings. The note cites
  I-1 through I-5 as the reason.
- `tools/check-refs.ts` must pass. No frozen file is touched, and `docs/` gains no pointer into
  `openspec/`.

## Risks / Trade-offs

- **[Risk] Edit mode makes `capture-form.tsx` (441 lines) harder to read, and could regress O3.**
  → Mitigation:
  - the mode logic lives in `capture-steps.ts` (pure, unit-tested);
  - every existing O3 test stays green;
  - the walkthrough runs capture once more.
  
  If the branch grows past a few conditions, split the step bodies into components, not into a
  second form.
- **[Risk] `0027` on the shared dev database refuses another branch's appointment.** → Mitigation:
  apply it last, say so, and merge promptly (D8).
- **[Risk] Tests that call `transitionApplication` with invented accounts now fail on the
  permission.** Among them is the guarded `backward-transition.test.ts` (G-D3). → Mitigation:
  setup-only changes. The test uses a real household and `createTestModerator`, and its assertions
  (one event, both actor ids, both states) stay byte-identical. The diff is shown to the human
  (G-G1).
- **[Risk] `start-overview.test.ts` (f5) walks an application back from `moved_in` to
  `screened` as a plain resident.** Both halves are now refused: the plain resident by the
  permission, and every row past `invited` by D6a. → Mitigation: the test inserts the application
  directly at `invited` with `became_resident_id` set, a state the declared walk-back
  (`zustandsmaschinen.md` §3.1, P-4) makes reachable once its steps are built. In the test,
  `became_resident_id` names the **founder's** profile. The founder (the moderator) then takes the
  one `state_only` step `invited → screened`, and the assertion is unchanged. A comment says why
  the row is inserted. It must not cite G-D9 as a guarantee, because G-D9 is still `pending` in the
  manifest, with no test. Its test belongs to the `move_in_reversal` step (register row).
- **[Trade-off] v0.1 can reject, withdraw or decline an application only up to `invited`.** That
  covers every state v0.1 can reach. Scheduling, the offer, move-in and retention are v0.2
  (`02-SRD.md` §5.4, `docs/backlog/README.md`). So nothing reachable is stuck:
  - P-4 holds for every state v0.1 can reach, since every backward move out of `new`, `screened`,
    `invited` and the three side states is `state_only`;
  - `03-PRD.md`'s "every permitted backward move within two actions" holds for the executable
    subset.
- **[Risk] A moderator who is not a resident (`is_resident = false`, no profile) sees no list and
  can change no state (G-D15).** This is today's rule for capture too. It is left for change 6,
  which already has to decide the "moderator without participation" case.
- **[Trade-off] No round-status condition on corrections or state changes (A2, A3).** A correction
  after a round closes is the Art. 16 case. A state change on a closed round is F5's decision, and
  the F3 plan's Part 5 records it.
- **[Trade-off] The list shows contacts.** They are personal data, but only to permission holders,
  under the same lock as the detail. The rows never include the message or the attributes.

## Migration Plan

1. Code and tests are written against `0027`, generated but not applied.
2. `npm run verify` locally. It is expected to fail only in the tests that need `0027`, and those
   are listed.
3. Apply `0027` to `flatmate-io-dev` through the Supabase MCP `apply_migration`, after telling the
   human. Then check the catalog: both constraint definitions, and every live moderator holding
   the value.
4. `npm run verify` green, then the walkthrough, then `/code-review high`, archive and PR. CI's
   `verify` job builds a fresh stack from `drizzle/`, so `0027` must also run on an empty
   database.
5. **Rollback:** a follow-up migration dropping `membership_moderator_only_permissions` and
   re-adding the four-value CHECK. The extra stored value is harmless under the old code. Nothing
   is destroyed, so there is nothing to restore.

## Open Questions

- The wording of the „Warum steht das hier?" sentences and of the Art. 13 row's label. The human
  words them in the walkthrough. They live only in `de.ts`, so no spec or task changes.
