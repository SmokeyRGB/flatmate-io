# Proposal: application-deletion (F3 change 4)

## Why

A household must be able to remove one applicant's record completely, at any time, and today it
cannot: there is no delete path at all, and `application.deleted_at` is a soft-delete column the
model has already abandoned. The F3 packet asks for the opposite of a soft delete:

> **FR-3.18** „Deleting an application shall delete everything that depends on it in the same
> transaction, through exactly one deletion entry point — as `GUARDRAILS.md` **G-D4** and **G-E5**
> already require"

and, since F4 change 1 created `vote`, the forward contract AC-3.16 („those four votes no longer
exist") can now be tested. Change 4 is next in the F3 plan; nothing blocks it (no unmerged branch).

Serves `docs/backlog/requirements/F3-requirements.md` FR-3.17–FR-3.20, AC-3.15–AC-3.18 (AC-3.16
with `vote`), EC-3.7/EC-3.8 (by real deletion), R-3.5, and the manual-delete half of S-33.

## What Changes

- **New permission `delete_application`**, held only by the moderator (FR-3.17: „Deletion is
  reserved to a resident profile in the `moderator` role … neither a plain resident nor the
  household account can delete"; `03-PRD.md` §4.0.1 row „`Application` löschen": ❌ ✅ ❌ ❌). One
  `PERMISSIONS` row; the moderator set grows from eleven to twelve. Migration `0038` widens the
  three exact `membership` CHECKs and backfills every live moderator.
- **`deleteApplication`** in `casting/repository.ts`: the one entry point (G-E5 „genau einen
  Einstiegspunkt"). One transaction: permission, application row `FOR UPDATE`, every dependent
  table (today `vote`), redaction of the earlier events' personal payload keys, the row itself,
  and an `application.deleted` tombstone event with an empty payload (FR-3.20, AC-3.18,
  Compliance §5.6 rules 3–4).
- **Deletion-inventory test**: every table declaring `application_id` must be in the delete
  path's dependent-table list, so a later table (Veto, CastingNote, …) fails the suite until it is
  wired (FR-3.18 „a check that fails whenever a table carrying an application reference is not
  deleted by it").
- **`application.created`'s `source` and `collectedFrom` become redactable** (they describe the
  person's case); the same registry serves end-of-retention redaction.
- **UI**: „Löschen" on the application detail (O5), a native confirmation dialog naming the
  applicant, confirm in red, cancel leaves it intact (FR-3.19, AC-3.17); afterwards the round page
  with a toast.
- **BREAKING (schema): `application.deleted_at` is dropped** (Q-8, R-3.5, `domain/casting.md`
  §2.2). The last reader (`getStartOverview`'s raw SQL) and the schema/inventory entries go first;
  the `DROP COLUMN` is its own migration `0039`, applied by the human after the merge (expand/contract on the shared dev database).

## Capabilities

### New Capabilities
- `casting/application-deletion`: removing one application and everything that depends on it,
  who may do it, the confirmation, and what the audit log keeps.

### Modified Capabilities
- `identity/permissions`: the matrix gains `delete_application` (moderator only); the moderator
  set becomes twelve; existing moderators receive it by migration.

## Guardrails touched

- **G-C** (authorization): a new mutator, refused for a plain resident and the household account;
  the authorization-matrix test records it.
- **G-D4** (Löschvollständigkeit, guarded): the change builds its test. Whether the manifest entry
  moves to `implemented` is a human call at review (see design D9).
- **G-D7** (no values in payloads): the tombstone has an empty payload.
- **G-D8** (redaction): the redaction registry gains its first real keys.
- **G-E5** (one deletion entry point, atomic).
- G-L: not touched.

## Assumptions (recorded, not silently resolved)

- A1 „at any time" (FR-3.17) means any application state and any round status; deletion has no
  state precondition.
- A2 No view displays application events today, so the „gelöschte Bewerbung" display rule
  (Compliance §5.6 rule 4) has no reader to change. It is carried to the first activity feed as a
  register row, not built here.
- A3 Delete from the detail page only; a per-row delete on O4 is not built (the plan marked it
  optional).

## Impact

- Code: `src/modules/identity/schema.ts` (PERMISSIONS), `src/modules/casting/schema.ts`
  (`deletedAt` removed), `src/modules/casting/repository.ts` (`deleteApplication`,
  `getStartOverview` SQL), `src/modules/audit/repository.ts` (allowlist, redaction),
  `data-inventory.yml`, the detail page plus a dialog and a server action, `de.ts`/`en.ts`.
- Database: `drizzle/0038` (permission CHECKs + backfill), applied by the human before the merge;
  `drizzle/0039` (`DROP COLUMN deleted_at`), applied after it (design D2, D8).
- Tests: deletion (AC-3.15–3.18, concurrency, refusals, raw SQL), the inventory test, the
  authorization matrix, the role-permission constant tests, the start-overview fixture.
- Docs: three register rows (feed tombstone display; restores replaying tombstones; no write
  boundary on `retention_until`).
