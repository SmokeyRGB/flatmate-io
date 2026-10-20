# Design: application-deletion (F3 change 4)

## Context

- No delete path exists. `application.deleted_at` is still in `casting/schema.ts` and
  `data-inventory.yml`, and one reader is left: `getStartOverview`'s raw state-count SQL
  (`AND deleted_at IS NULL`). Change 3 removed the other filters. `room`, `household` and
  `join_code_issuance` keep their own `deleted_at`. They are not touched.
- The one table that references an application is `vote` (F4, `drizzle/0028`). Its policies let any
  profile in the household `DELETE` any vote: household isolation plus `PROFILE_PRESENT`, and the
  own-profile policies cover only INSERT and UPDATE. 0028's header puts an obligation on this
  change: *deleteApplication locks the application FOR UPDATE FIRST, then deletes its votes*.
  `castVote`/`withdrawVote` both write through `vote_guard`, which takes the application `FOR
  SHARE` before the vote row. So they already keep their half (F4 change 2 shipped as an upsert,
  `deliberation/repository.ts` LOCK ORDER).
- `activity_event` is append-only. Its RESTRICTIVE update policy `activityevent_append_only_update`
  allows an UPDATE only where the subject application exists and `retention_until < now()`.
  `REDACTABLE_KEYS` (`audit/repository.ts`) registers no key today.
- Permissions: since `role-permissions-contract` (`drizzle/0037`) three `membership` CHECKs are
  exact and derived from `PERMISSIONS`: `membership_declared_permissions`,
  `membership_moderator_only_permissions` and `membership_moderator_holds_role_permissions`. A new
  moderator permission without its migration is refused on every write that stores the moderator
  set.
- Cross-module imports of another module's `repository.ts`/`schema.ts` are baselined violations in
  dependency-cruiser. Adding one needs a human decision (G-G3). `deliberation/repository.ts`
  already imports `casting/repository.ts`.

## Goals / Non-Goals

**Goals:** the single deletion entry point with everything it must take along, the moderator-only
permission, the tombstone and the redaction, the inventory gate, the confirmation UI, and the
removal of `deleted_at`.

**Non-Goals:** a per-row delete on O4 (A3). Bulk or automatic deletion, which is the retention
slice (v0.2). Round deletion. An activity feed and its „gelöschte Bewerbung" label (A2, register
row). Making backups replay tombstones (register row, D10).

## Decisions

### D1 — `delete_application`, a moderator-only permission

One row `delete_application: { holders: ["moderator"] }` in `PERMISSIONS`. `MODERATOR_PERMISSIONS`
and `MODERATOR_ONLY_PERMISSIONS` derive it, so the founding link, appointment and demotion pick it
up without a change. FR-3.17 says the right is „not a grantable permission". The holder rule makes
that true: only a moderator row may hold it. *Alternative:* reuse `change_application_state`.
Rejected. One permission per matrix row (identity/permissions), and the matrix has its own row
„`Application` löschen".

### D2 — Migrations `0038_delete_application_permission.sql` and `0039_drop_application_deleted_at.sql`

**Split (pre-mortem 2):** dropping the column while main still declares `deletedAt` would break
every `select().from(application)` of main and every open branch on the shared dev database
(drizzle names every declared column). So 0038 carries the permission only and is applied before
the merge (D8). 0039 carries only the drop and is applied by the human **after** the merge, once no
deployed code declares the column (expand/contract). Both ship in this PR, so CI's fresh stack
builds both. Until 0039 is applied, dev has one extra column, which `data-inventory-live` reports
as a warning only.

0038's statement order

Generated with drizzle-kit, then rewritten by hand to be re-runnable (0037 is the template: the
quoted `"membership"`, literals equal to the constants, `DROP CONSTRAINT IF EXISTS` before each
`ADD`). The order is argued against the constraints live at each statement:

1. `LOCK TABLE "membership" IN SHARE ROW EXCLUSIVE MODE`. No appointment or join lands between
   the backfill and the floor.
2. A `DO` block with `RAISE NOTICE` reporting the live moderators that lack `delete_application`,
   and any non-moderator row holding it (expected 0).
3. Re-add `membership_declared_permissions` with `delete_application` in the list. This only
   widens the list, so it is valid on every row. It must come before step 5, or the backfill
   stores an undeclared name and is refused.
4. Re-add `membership_moderator_only_permissions` with `delete_application`. It is valid because
   no row holds the name yet. Doing it before the backfill means nothing can ever give it to a
   non-moderator.
5. Backfill: `UPDATE "membership" SET permissions = sorted DISTINCT union with
   {delete_application} WHERE revoked_at IS NULL AND role = 'moderator' AND NOT (permissions @>
   …)`. The CHECKs widened in steps 3 and 4 accept it. Revoked rows hold nothing (0037), so they
   are not touched.
6. Re-add `membership_moderator_holds_role_permissions` with the twelve. It is valid after step 5.
0039 is one statement, `ALTER TABLE "application" DROP COLUMN IF EXISTS "deleted_at"`. No
function, trigger, policy, view, script or the n8n intake names it (verified in the pre-mortem).

Re-running either file changes nothing. The human applies both in the SQL editor: 0038 because
it tightens a CHECK other sessions write against (D8), 0039 because the harness refuses `DROP
COLUMN`. After each, the applier checks the catalog and stops if anything is missing (task group
7). Rollback notes in the headers. For 0038: re-add the three constraints as 0037 wrote them and
strip `delete_application`. For 0039: `ADD COLUMN IF NOT EXISTS deleted_at timestamptz`.

0038's order and backfill are exercised on real rows by a replay test before the human applies it
(pre-mortem 4). The test is modelled on `tests/integration/raw-sql/role-permissions-contract.test.ts`:
a scratch table with 0037's CHECKs, seeded rows, the file run twice, and the refusals.

### D3 — `deleteApplication(context, { roundId, applicationId })`, one transaction

It lives in `casting/repository.ts` (the owner of `application`) and returns nothing. Steps 1–4
are exactly `withLockedApplication`'s preamble (pre-mortem 11), so that helper gains two
parameters, the permission to check and the error to throw for not_found, instead of a copy.
Transition and invite keep passing `change_application_state` and `ApplicationTransitionError`.
Order:

1. `context.profileId === null` → `ProfileRequiredError` before any query (G-D15/ADR-014).
2. Ids not UUIDs, or `input` malformed → `ApplicationDeletionError("not_found")` before any query.
3. `withSessionContext`: `assertHasPermissionTx(tx, context, "delete_application")`. This puts
   **membership FOR SHARE** on the caller's live membership before the row is read
   (`PermissionDeniedError` otherwise). A member without the right learns nothing, not even
   whether the row exists.
4. `SELECT id FROM application WHERE id AND round_id AND household_id … FOR UPDATE`. No row →
   `not_found`. This lock is the 0028 obligation. A concurrent transition, correction or second
   delete waits on it. One that arrives after the commit finds no row (`not_found`), and a
   `vote_guard` that arrives after it finds the application missing (23514, mapped by `castVote`).
5. For each table in `APPLICATION_DEPENDENT_TABLES` (D5): `DELETE FROM <table> WHERE
   application_id = $id AND household_id = $hh`, as raw SQL with `sql.identifier`. Today that is
   only `vote`. Casting imports nothing from deliberation, so no new cross-module edge and no
   cycle. The coupling to the table name is made explicit by the list and checked by the gate.
6. Redaction (D4): `UPDATE application SET retention_until = current_date - 1` on the locked row,
   then `redactApplicationEventsTx(tx, applicationId)` from audit.
7. `DELETE FROM application WHERE id AND household_id RETURNING id` (exactly one row; the lock
   holds it).
8. `recordActivityEvent(application.deleted, subject application/id, actor from context,
   payload {})`. The `round_id` column stays null, as with every other application event.

Every SQL error is wrapped like `ApplicationWriteError` (SQLSTATE and constraint, never values).
**LOCK ORDER:** membership FOR SHARE → application FOR UPDATE → vote rows. This is the order every
writer of `application` takes (the LOCK ORDER comment on `openRoundTx`), and the reverse of nothing.

*Writers of the same state, pairwise:*
- **The application row.** `captureApplication` writes a different row. `updateApplication`,
  `transitionApplication` and `inviteApplication` take the same FOR UPDATE, so they are
  serialised on it.
- **Vote rows.** `castVote`/`withdrawVote` take application FOR SHARE (in the guard) before the
  vote row, so the pair is serialised on the application lock. A raw `UPDATE vote` cannot be
  ordered and may lose a deadlock (40P01). That is safe and documented in 0028.
- **Event payloads.** The only other writer is `redactExpiredActivityEvents` (retention, not yet
  scheduled). It writes the same nulls, so the pair is idempotent.
- **New events about the application.** Each is written inside a transaction that holds the
  application lock (transition, correction) or the FOR SHARE (`vote.*`). So none lands after the
  tombstone.

*Raw SQL as `app_runtime`.* RLS gives household isolation only (ADR-004 layering). A plain
resident can `DELETE FROM application` by raw SQL inside its household, as it can `UPDATE` today.
The permission is application-level, like every other casting permission. The household account
cannot: `application_requires_resident_profile` (0018, RESTRICTIVE FOR ALL) matches zero rows.
Both facts are already tested
(`tests/integration/raw-sql/application-visibility-household-account.test.ts` and
`tests/unit/audit/immutability.test.ts`), and this change adds no policy, so no new raw-SQL file
is written (pre-mortem 7). The deletion test's header cites them.

*The lock order is tested, not only argued (pre-mortem 1).* A voter's uncommitted vote insert
holds A FOR SHARE (through `vote_guard`). `deleteApplication` must wait for it at step 4, and
afterwards no vote on A remains. Without the step-4 `FOR UPDATE`, the step-5 `DELETE` would not
see the uncommitted vote, step 6 would wait, and the vote would commit as an orphan. So removing
the lock makes the test fail.

### D4 — Redaction: ending the retention now

FR-3.20 asks for the redaction in the same transaction. The update policy permits an UPDATE only
for an application whose `retention_until` has passed. A manual deletion *is* the end of the
retention (Art. 17), so the delete path sets `retention_until` to yesterday on the locked row and
then runs the same key-nulling as end-of-retention redaction, scoped to that one subject. The
policy stays the single gate.

*Rejected:* widening the policy to „or the application no longer exists". The household account
and, after change 6, a resident outside the round are blind to the application row under RLS. To
them `NOT EXISTS` is true for every application, so the widened policy would let a blind session
rewrite application events.

`REDACTABLE_KEYS` gains `"application.created": ["source", "collectedFrom"]` (the plan's
recommendation: they describe the person's case, Compliance §5.6 rule 3). `application.updated`
(field names), `application.state_changed` (state names) and `vote.*` (stage) carry no personal
field, so nothing is registered for them. `redactExpiredActivityEvents` and the new
`redactApplicationEventsTx` share one loop over the registry. Only the subject predicate differs,
so the two cannot drift.

*Known hole, not widened here (pre-mortem 6).* `retention_until` decides who may rewrite an
application's events, and nothing in the database bounds writes to it. By raw SQL, a resident can
set it to yesterday and then rewrite (not only null) that application's event payloads. This was
possible before this change. The change makes setting it the designed path, so the hole goes into
the register (D10, row 3) instead of being fixed in this change.

`application.deleted` is registered in `PAYLOAD_ALLOWLIST` with `[]`. G-D7: any key is refused.

### D5 — The inventory gate

`APPLICATION_DEPENDENT_TABLES = ["vote"] as const` is declared in `casting/schema.ts`, next to
`application`. It is pure, so a unit test can import it without a database. The new
`tests/unit/lint/application-deletion-inventory.test.ts` (a sibling of `cleanup-inventory.test.ts`)
reads every `src/modules/*/schema.ts` with the table parser that `cleanup-inventory.test.ts`
already has. The parser moves to `tests/helpers/schema-tables.ts` and both tests share it
(pre-mortem 9). The test finds each `pgTable("<name>", …)` that declares `uuid("application_id"`.
Matching that call, not the bare string, keeps a comment that names the column from counting. It asserts:

- (a) that set equals the list. A missing table fails, and so does a stale one.
- (b) every listed table also declares `household_id`, which the delete predicate uses.
- (c) a positive control on synthetic schema text, so a parser that finds nothing cannot pass
  vacuously.

A column that a hand-written migration adds without touching `schema.ts` is already caught by
`data-inventory-live.test.ts`.

### D6 — UI: „Löschen" on the detail, a native dialog

`[applicationId]/delete-dialog.tsx` (client), modelled on `rooms/remove-room-form.tsx`: a trigger
`btn-link text-destructive`, and a `<dialog className="dialog">`. The form inside it carries hidden
`roundId`/`applicationId`, a `SubmitButton className="btn btn-destructive"` with a pending label,
and a cancel `btn-link`. It uses `useActionState`, so a refusal shows in the dialog. It is a plain
confirm, **not** type-to-confirm: the Design System keeps that for member removal (noted, as the
plan says). The page shows it when `holdsPermission(context, "delete_application")`, and it is
read in the existing `Promise.all`.

`[applicationId]/delete-actions.ts` holds the server action. It reads the session, calls
`deleteApplication`, and maps `not_found`, `PermissionDeniedError` and anything else to a state
code. `redirect("/rounds/{id}?deleted=1")` stays outside the try (as in `edit/actions.ts`). The
round page shows a `SavedToast param="deleted"`.
`SavedToast`'s `param` union and the round page's `searchParams` type each gain `deleted`
(pre-mortem 10). The cancel button inside the form is `type="button"`.

Wording, **confirmed by the human 2026-10-20**:

| key | de | en |
|---|---|---|
| trigger | Löschen | Delete |
| heading | „{Name}" löschen? | Delete "{name}"? |
| body | Die Bewerbung und alles, was dazu gespeichert ist, wird endgültig gelöscht. Das lässt sich nicht rückgängig machen. | The application and everything stored with it will be deleted for good. This cannot be undone. |
| confirm / pending | Endgültig löschen / Wird gelöscht … | Delete for good / Deleting … |
| toast | Bewerbung gelöscht. | Application deleted. |
| not_found | Sorry, diese Bewerbung gibt es nicht mehr. | Sorry, this application no longer exists. |
| denied | Sorry, du darfst keine Bewerbungen löschen. | Sorry, you are not allowed to delete applications. |
| failed | Sorry, das hat nicht geklappt. Bitte versuch es noch einmal. | Sorry, that didn't work. Please try again. |

### D7 — `deleted_at` removed from the code first

Remove `deletedAt` from `casting/schema.ts`, its `data-inventory.yml` entry, the `AND deleted_at
IS NULL` in `getStartOverview`, the `deletedAt` fixture option and the stale comments in
`start-overview.test.ts` and `awaiting-vote-counts.test.ts`, and the „change 4 drops the column"
comment at `listOrganisationApplications`. The code works with or without the column. The column
goes in 0038 (D2, step 7).

### D8 — Rollout on the shared dev database (as the contract change's D5)

Once 0038 is on dev, the tightened moderator floor refuses every write of the *eleven*-permission
set, and main stores exactly that until this PR merges. Before 0038 is on dev, this branch's
twelve are refused by the declared-names CHECK. So:

1. Open the PR. CI's fresh-stack `verify` builds from `drizzle/` and is the gate. Pushes before
   the apply need `git push --no-verify` (**human agreement needed**, as for #68).
2. Run the reviews (`/code-review high`, Copilot).
3. The human applies 0038 to dev; the applier checks the catalog.
4. Run `npm run verify` alone on dev.
5. Merge at once.
6. After the merge, the human applies 0039 (drop `deleted_at`); the applier checks the catalog and
   reruns `npm run verify` on main.

Re-check `git branch -a --no-merged origin/main` before step 3.

### D9 — G-D4 in the manifest

G-D4 („Löschvollständigkeit — in einer Transaktion") lists Vote, Veto, CastingNote,
AvailabilityWindow, Appointment and three application columns. Only `vote` exists, and the columns
fall with the row. Once the deletion test and the inventory gate pass and have been seen failing
against their breaks, they cover G-D4 for every table that exists, and they fail for each one
added later. **Decided (human, 2026-10-20):** mark G-D4 `implemented` with those two files, once both
pass and have been seen failing against their breaks, in the commit that adds them.

### D10 — Register rows (docs/review-log.md §Offene-Punkte-Register)

1. The first activity feed renders an application event whose subject no longer exists as
   „gelöschte Bewerbung" (Compliance §5.6 rule 4). No reader exists today.
2. A restore from backup resurrects manually deleted applications unless the restore replays the
   `application.deleted` tombstones (the register obligation „jeder Restore lässt den Löschlauf
   durchlaufen"). The tombstone carries the id, which is enough to replay.
3. `application.retention_until` grants the right to rewrite the application's events (the
   append-only update policy), but no constraint or trigger bounds writes to it. One option is a
   trigger that lets it only move earlier, or only be set by the retention and delete paths.

## Risks / Trade-offs

- **Change 6 / F5 change 5 can blind this path.** A future SELECT policy on `vote` hiding other
  residents' votes would make step 5 silently skip them. The AC-3.16 test therefore checks each
  voter's own view and fails then. A future V-2 policy on `application` makes a moderator outside
  the round get `not_found`. Change 6 decides whether that is wanted and re-runs this suite.
- **Setting `retention_until` before deleting** is a write that nobody else sees (same
  transaction, the row is deleted). The cost is one statement. The gain is that the append-only
  policy stays the single gate.
- **Raw SQL** lets a plain resident delete inside its household. This is the accepted ADR-004
  layering, the same as every other casting write. It is stated here, not fixed.
- **No foreign keys.** An application id stored elsewhere outside a column named `application_id`
  would not be found by the gate. None exists. A future one must use that name. The gate's
  failure message says so.
