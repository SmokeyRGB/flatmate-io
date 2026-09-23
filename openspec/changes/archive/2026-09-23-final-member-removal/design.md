# Design

## Context

Everything lives in the `identity` module, plus one read in `casting`. The removal code already has
the right transactional shape: `removeMember` and `setMovedOut` each run the status transition and
`revokeMembershipForProfileTx` (membership + sessions + audit) under one `withSessionContext`, and
that was fixed once already (`identity-moveout-session-revocation-not-atomic`). What is wrong is
the state the hard tier lands in, and what reads that state.

Three facts constrain the approach:

1. **The transition table is application code only.** `transitions.ts` is checked by
   `transitionResidentProfileStatusTx`. No trigger guards `resident_profile.status`, and RLS lets
   `app_runtime` update any row of the household in session context. The only DB-level transition
   guard in the project is `drizzle/0006`'s `session.acting_profile_id` immutability trigger.
2. **Postgres will not use a new enum value in the transaction that added it** (*"unsafe use of
   new value"*). Migrations here are applied one file per call against `flatmate-io-dev`, each in
   its own transaction. So the value and its first use must be in different files.
3. **This schema has no foreign keys** (`project_supabase_dev_split`), so "who joined through which
   link" is `membership.joined_via_issuance_id` joined by hand, and nothing cascades.

## Goals / Non-Goals

**Goals:**
- The hard tier is final in the data, not only in the absence of a button.
- `removed` behaves like `moved_out` for access, quorum, sign-in and name uniqueness, and unlike it
  for listing and reactivation, with every predicate decided on purpose rather than inherited.
- A moderator can see that a removed person may still hold a link, and act on it.

**Non-Goals:**
- Purging a removed person's votes/applications (U-27's other half). Nothing exists to purge until
  F3+; `removed` is the state that purge will key on.
- Deleting `round_participation` rows on removal. F4's denominator reads them; V-3's formula
  filters on profile status at read time.
- A removal path for `prepared` profiles (no membership to remove), or tidying the unused
  `prepared → moved_out` transition.
- `ProcedureLockedError`'s codes, `cleanup()` exporting its delete set: carried debt, unrelated.

## Decisions

### 1. A status value, not a marker on `membership`

`removed` becomes a fourth `resident_profile_status`. A `membership.removed_at` or a flag would be
cheaper, but it would put the finality in application code that has to remember to check it, and
it would leave `ResidentProfile.status = moved_out` claiming a move-out that never happened. The
status is also what F3+'s purge will select on, and what every existing predicate already reads.

Transitions become:

| from | to | caller |
|---|---|---|
| `prepared` | `active` | claim / bound join (unchanged) |
| `prepared` | `moved_out` | none (unchanged, left alone) |
| `active` | `moved_out` | `setMovedOut` |
| `moved_out` | `active` | `reactivateMember` |
| `active` | `removed` | `removeMember` **(new)** |
| `moved_out` | `removed` | `removeMember` **(new)** |

`active → moved_out` stays in the table even though removal no longer uses it. `removed` has no row
where it is `from`.

### 2. A narrow trigger: status may not leave `removed`

`drizzle/0017` adds `reject_resident_profile_unremoval()`, a plain `plpgsql` trigger function
(**not** `SECURITY DEFINER`), and a `BEFORE UPDATE ON resident_profile FOR EACH ROW` trigger:

```sql
IF OLD.status = 'removed' AND NEW.status IS DISTINCT FROM 'removed' THEN
  RAISE EXCEPTION 'resident_profile % is removed; removal is final (U-27)', OLD.id;
END IF;
```

It guards only that one move. It does not freeze the row, since a later redaction
(`06-Compliance-Anhang.md`) or F3+'s purge may need to write other columns, and it does not block
`DELETE`, which erasure may need. It does not duplicate the whole transition table in SQL either.
That would be a second source of truth for ADR-002's table, and the table is still enforced in
code. The trigger covers exactly the one guarantee U-27 calls „endgültig".

Why this counts as G-C7 territory: a guarantee that only holds while every caller goes through
`transitionResidentProfileStatusTx` is the application-discipline kind that `0006`'s comment
rejects for the same reason. Tested both ways (Decision 10).

### 3. Two migrations

- **`0016_resident_profile_removed_status.sql`**: `ALTER TYPE resident_profile_status ADD VALUE IF
  NOT EXISTS 'removed';` and nothing else.
- **`0017_resident_profile_removal_final.sql`**, in this order, each step re-runnable (plan lesson
  1a: a human may run the whole file after an agent ran part of it):
  1. **Backfill** (Decision 8).
  2. `DROP INDEX IF EXISTS resident_profile_display_name_active_idx;` then
     `CREATE UNIQUE INDEX IF NOT EXISTS resident_profile_display_name_active_idx ON resident_profile
     (household_id, display_name) WHERE status NOT IN ('moved_out', 'removed');`, keeping the index
     name so nothing else has to change. The backfill runs first: it only widens the set of
     excluded rows, so the new index can never fail to build because of it.
  3. `CREATE OR REPLACE FUNCTION reject_resident_profile_unremoval()` +
     `DROP TRIGGER IF EXISTS … ; CREATE TRIGGER …`.

**Generating them:** change `schema.ts` (enum + index predicate), run `drizzle-kit generate`, and it
produces one file with both the `ADD VALUE` and the index change, plus a snapshot. Keep that as
`0016` with **only** the `ADD VALUE` statement; create `0017` with `drizzle-kit generate --custom`
and put the index statements there by hand, along with the backfill and trigger. The snapshot
`0016` got from the generate already reflects the final schema, and trigger/backfill are invisible
to drizzle's snapshot, so the journal and snapshots stay consistent.

**Harness expectations:** neither file creates a `SECURITY DEFINER` function or drops a column,
the two things refused three times before. `DROP INDEX` might still trip the "mass delete"
heuristic. If it does, hand **that statement** to the human. Do not rewrite the migration to dodge
it. **Read the SQL before handing it over** (plan lesson 1b).

### 4. The predicate audit: every status read, decided one by one

| Site | Today | After | Why |
|---|---|---|---|
| `schema.ts` partial unique index | `status != 'moved_out'` | `NOT IN ('moved_out','removed')` | FR-1.4 as amended: name freed |
| `repository.ts` `isDisplayNameTaken` | `ne(status,'moved_out')` | `notInArray(status, NAME_RELEASING_STATUSES)` | same; it is the readable twin of the index, and `joinHousehold`'s `name_taken` goes through it |
| `auth.ts` `signIn` display-name lookup | `ne(status,'moved_out')` | `notInArray(…, NAME_RELEASING_STATUSES)` | once the name can be reused, the lookup must never be ambiguous between a removed and a new „Sam" |
| `auth.ts` `signIn` membership load | no `revoked_at` check | refuse if `revokedAt` set → `invalid_credentials` | Decision 6 |
| `repository.ts` `getResidentList` | all profiles | `ne(status,'removed')` | hidden (human decision) |
| `repository.ts` `getCurrentHouseholdMembers` | `eq(status,'active')` | unchanged | already excludes both |
| `casting/repository.ts` open-round snapshot | `eq(status,'active')` + `revokedAt IS NULL` | unchanged | already excludes both |
| `casting/repository.ts` `getRoundParticipants` | no status check | `eq(residentProfile.status,'active')` | Decision 7 |
| `repository.ts` `listJoinCodeIssuances` joiners | all joiners | removed joiners not named; flag computed | Decision 9 |
| `drizzle/0015` `resolve_join_code` / `claim_join_code` | `rp.status = 'prepared'` | unchanged | a bound link needs `prepared`; `removed` already fails it |
| `auth.ts` claim/join `prepared` checks | `prepared` | unchanged | same |
| `members/page.tsx` badge | `=== 'moved_out'` | unchanged | removed rows never reach the page |
| `members/page.tsx` remove button | `status !== 'moved_out'` | shown for `active` **and** `moved_out` | Decision 1's `moved_out → removed` |
| `members/page.tsx` reactivate/mark-moved-out branch | `!== 'moved_out'` | unchanged, since only `active`/`moved_out` reach it | |

`NAME_RELEASING_STATUSES = ["moved_out", "removed"] as const` is exported from `transitions.ts`
beside the table, so the index predicate, `isDisplayNameTaken` and `signIn` cannot drift apart
silently. The index SQL can't import it, so the schema comment names the constant, and a unit test
asserts the index's `WHERE` text lists exactly its members.

**The apply must re-run the grep**, `moved_out|"active"|'active'|"prepared"|'prepared'|status` over
`src/`, `drizzle/*.sql` and `scripts/`, and account for any site not in this table in its report.
The table is what planning found, not a proof that nothing else exists.

### 5. `removeMember` from `moved_out`, and `revoked_at`

For a `moved_out` source, the membership is already revoked. `revokeMembershipForProfileTx` gains a
`revoked_at IS NULL` condition on its membership update, so the original revocation time survives,
and it **always** writes its audit event. `membership.removed_as_intruder` is what distinguishes
the tiers in the trail (FR-1.30) and what Decision 8 keys on. Sessions: already revoked. The
existing `isNull(session.revokedAt)` makes that a no-op.

`transitionResidentProfileStatusTx`'s date patch: `moved_out_on` is a *„Wohn-Tatsache"*
(`data-inventory.yml`). `→ removed` sets no date and clears none, so an `active → removed` intruder
gets no move-out date, and a `moved_out → removed` profile keeps the one it had. The
`fromStatus === 'moved_out'` clearing branch must now fire only for `→ active`, not for `→ removed`.

### 6. Sign-in refuses a revoked membership

In `signIn`, after the membership row is loaded, `if (membershipRow.revokedAt) throw new
SignInError("Membership revoked", "invalid_credentials")`. It uses the same code as a wrong
password, per change 0's convergence (proposal Assumption 4). Supabase Auth has already issued its
own session by then. It is discarded unstored, which is what already happens on every other
refusal after `signInWithPassword`. A household account's `household_admin` membership is never
revoked, so this cannot lock out administration.

### 7. The participant list reads current residents

`getRoundParticipants` adds `eq(residentProfile.status, "active")`. That affects both tiers: it is
V-3's *„moved_out fällt heraus"* applied to FR-1.19's *"residents taking part"*. The casting module
already joins `residentProfile` here, so there is no new cross-module reach. The query is left
exactly as coupled as it was. `round_participation.removed_at` is not written: that column means
a moderator took someone out of a round, which is a different fact.

### 8. The backfill, attributed to whoever removed

```sql
WITH last_membership_event AS (
  SELECT DISTINCT ON (m.resident_profile_id)
         m.resident_profile_id, ae.event_type, ae.actor_account_id, ae.actor_profile_id, m.household_id
  FROM membership m
  JOIN activity_event ae ON ae.subject_type = 'membership' AND ae.subject_id = m.id
  WHERE ae.event_type IN ('membership.revoked', 'membership.removed_as_intruder', 'membership.reactivated')
  ORDER BY m.resident_profile_id, ae.occurred_at DESC
), promoted AS (
  UPDATE resident_profile rp SET status = 'removed'
  FROM last_membership_event l
  WHERE rp.id = l.resident_profile_id AND rp.status = 'moved_out'
    AND l.event_type = 'membership.removed_as_intruder'
  RETURNING rp.id, rp.household_id, l.actor_account_id, l.actor_profile_id
)
INSERT INTO activity_event (household_id, event_type, subject_type, subject_id,
                            actor_account_id, actor_profile_id, payload)
SELECT household_id, 'resident_profile.status_changed', 'resident_profile', id,
       actor_account_id, actor_profile_id,
       jsonb_build_object('fromStatus', 'moved_out', 'toStatus', 'removed')
FROM promoted;
```

G-D3 says every transition produces exactly one `ActivityEvent`, so the backfill writes one. The
actor is the person who made the original removal. That keeps the decision attributed to them: the
migration only records the removal in the state it should always have had. The payload keys are
exactly `PAYLOAD_ALLOWLIST`'s for `resident_profile.status_changed`, even though SQL bypasses
the allowlist check. Re-runnable: a second run finds no `moved_out` row left to promote.

Column names (`occurred_at`, `payload`) must be checked against `src/modules/audit/schema.ts` when
writing it. If `payload`'s column name differs, or `activity_event` carries a NOT NULL column not
listed here, fix the SQL rather than the design.

Testing a migration's statement: the block sits between `-- backfill:begin` / `-- backfill:end`
markers, and the test reads it from the file and runs it inside `withSessionContext` for a fixture
household. RLS then confines it to that household, so the test exercises the real statement and
cannot touch other rows. If `app_runtime` lacks a privilege the statement needs (e.g. `INSERT` on
`activity_event` via raw SQL), report it rather than widen a grant.

### 9. The link flag, the joiner names, and the dead-link section

`listJoinCodeIssuances`'s joiners query adds `residentProfile.status` to its select. Joiners whose
status is `removed` are **not** pushed into `joinedResidentNames`, and set
`hasRemovedJoiner: true` on their issuance instead. `JoinCodeIssuanceWithJoiners` gains that
boolean. It is a plain fact about the link's history, not a display decision: the repository does
not know or care whether the link is still usable.

**Link state lives in one pure module (revised 2026-09-23).** Until now a link's state was derived
only inside `page.tsx`'s `joinCodeStatusLabel`. Three things now depend on it (the label, the
live/dead split, and the caution), so it moves to `src/modules/identity/join-code-state.ts`, with no
DB access and no import from the repository:

- `joinCodeState(issuance, now): "live" | "expired" | "used_up" | "deleted"`, checked in
  `joinCodeStatusLabel`'s existing order: deleted, then expired, then used up, else live.
  `domain/identity.md` §2.1's definition of *aktiv* (`deleted_at` null, `expires_at` in the future,
  `uses < max_uses`) is exactly `"live"`.
- `removedJoinerCautionApplies(issuance, now)` is `hasRemovedJoiner && joinCodeState(…) === "live"`.

`joinCodeStatusLabel` is rewritten on top of `joinCodeState` (same texts, same order).

**The caution is for live links only** (human decision, 2026-09-23, correcting the first version,
which flagged every non-deleted link). A used-up link can never be used again: „+7 Tage" moves
`expires_at` only (`extendJoinCode`), `max_uses` is fixed and `uses` is never reset. A deleted link is
closed for good. An expired link is unusable until a moderator extends it, and extending it makes it
live, which brings the caution back at the moment it matters. O16 renders a `.callout-caution` with
`de.members.joinCode.removedJoinerCaution` when `removedJoinerCautionApplies` holds, placed with the
extend/delete controls. It does not name the person (proposal Assumption 2) and does not delete
anything.

**Dead links are collapsed** (human decision, 2026-09-23). O16 partitions the issuances by
`joinCodeState`: live ones first, as today, and every other state inside a native `<details>` (no
`open` attribute, no client JS, no new component) whose `<summary>` shows
`de.members.joinCode.deadLinksSummary(count)`. The `<details>` is rendered only when at least one
dead link exists. Each dead link inside keeps its current rendering: end-state label, count, code,
and joiners (AC-2.26). Copy buttons are pointless on a dead link but are left in place, since
removing them was not asked for. Order within each part stays `created_at DESC` (FR-2.29). Because
the caution applies to live links only, it never sits inside the collapsed section, and the section
needs no auto-open. With no live link at all, the existing empty/lead state (EC-2.13) still leads
with issuing, and the dead links are still listed, collapsed.

Copy, German and in the key table (`src/ui/strings/de.ts`), using §8.6's **„Löschen"**, e.g.:
caution *„Über diesen Link ist eine inzwischen entfernte Person beigetreten. Solange du ihn nicht
löschst, kann sie ihn erneut verwenden."*; summary *„Nicht mehr nutzbare Links ({n})"*. The
wording is the apply's to refine. It must not say „Widerrufen"/„Zurückziehen", and must not present
the link as a security boundary (C-2.5).

### 10. Tests

- `tests/unit/identity/resident-profile-transitions.test.ts`: updated to four statuses, the two new
  transitions accepted, and every `removed → *` refused. **Updated, not deleted** (not guarded,
  checked).
- **Repository (policy side):** removing an active member and a moved-out member both land in
  `removed`; `reactivateMember` on a removed member throws and leaves membership revoked; removed
  member absent from `getResidentList`, moved-out member present; `getCurrentHouseholdMembers`
  unchanged; a new profile and a join both accept a removed member's name; display-name sign-in
  with a removed member's name and old password is refused `invalid_credentials`.
- **Raw SQL (`tests/integration/raw-sql/`)** as `app_runtime` inside session context:
  `UPDATE resident_profile SET status = 'active' WHERE id = <removed>` raises; updating another
  column of a removed row succeeds; `active → moved_out` via raw SQL is not blocked by the trigger
  (proves it is narrow).
- **Sign-in:** a moved-out member and a removed member, each with correct credentials via the
  **email** branch (`resident-<id>@accounts.flatmate.invalid`), get `invalid_credentials` and no
  `session` row; a reactivated member signs in. Assert the error **code** (plan lesson from change
  2: assert the code, not just the end state).
- **Participant list:** a round participant moved out / removed disappears from
  `getRoundParticipants`; the `round_participation` row itself is untouched.
- **Link flag:** removed joiner not named and `hasRemovedJoiner` true, whatever the link's state;
  use count unchanged.
- **Link state (unit, pure):** `joinCodeState` for each of the four states including the boundary
  (`expires_at == now` is expired, `uses == max_uses` is used up, deleted wins over both);
  `removedJoinerCautionApplies` true only for live + removed joiner, false for used up, expired
  (with uses left) and deleted, and true again for that expired link once its `expires_at` is moved
  into the future.
- **Backfill:** fixtures for a `removed_as_intruder` profile, a `revoked` profile, and a
  removed-then-reactivated-then-moved-out profile; only the first is promoted, with exactly one
  `status_changed` event attributed to the original remover. Second run is a no-op.
- **Index/constant agreement:** unit test that the partial index's `WHERE` lists exactly
  `NAME_RELEASING_STATUSES`.

Teardown in `afterEach`, never in `finally` (CLAUDE.md). No new table, so the three-place cleanup
lesson does not apply. The G-C7 two-sided rule is met by the raw-SQL trigger test plus the
repository tests.

### 11. Docs, in `docs/`, never pointing into `openspec/`

- `docs/domain/identity.md` §2.1: `ResidentProfile.status` becomes `enum(prepared, active,
  moved_out, removed)` with a sentence on `removed` (U-27's hard tier, no transition out,
  DB-enforced); the three *„`status != moved_out`"* uniqueness mentions become *„weder `moved_out`
  noch `removed`"*; `Session.revoked_at`'s third trigger names removal too.
- `docs/backlog/requirements/F1-requirements.md`: FR-1.4 amended (*"neither `moved_out` nor
  `removed`"*), with a dated note, and FR-1.26 gains a sentence that a removed member is not listed.
- `docs/screens/O-organisation.md` O16: removed members are not listed; a **live** link a removed
  person came through carries a caution beside „Löschen"; dead links are listed in a section
  collapsed by default (still listed, so *„Ein toter Link verschwindet nicht"* holds).
- `docs/review-log.md` §Offene-Punkte-Register: one struck-through row, **Menschliche Entscheidung
  (2026-09-22)**, covering the finality defect and the three decisions (name freed, hidden, link
  flag), in the same shape as the `close_round` row.
- `docs/SPEC-INDEX.md`: add a row for two-tier member removal, maßgeblich `08-UX-Entscheidungen.md`
  U-27, only if none exists (none found during planning).
- German, and quotes reproduced verbatim (ADR-012). `node tools/check-refs.ts` afterwards. Frozen
  files untouched.

## Risks / Trade-offs

- **`DROP INDEX` then `CREATE` leaves a window without uniqueness** if the file is applied outside
  a transaction. Applied per file in one transaction it is atomic. If a human runs `0017` in the
  SQL editor, it must be run as a whole, not statement by statement.
- **Hiding removed members hides a mistake too.** A wrong removal is visible only in the audit log.
  The recovery is re-inviting under the same name (now possible), not an undo. That is what
  „endgültig" means, and the user chose it knowing that.
- **The backfill trusts audit history.** A removal whose audit event was never written (only
  possible if `recordActivityEvent` failed, and it shares the transaction, so it can't) would be
  missed. Acceptable.
- **`NAME_RELEASING_STATUSES` vs. the index text** can drift, since SQL can't import TS. The
  agreement test is the mechanism, not the comment.
- **Two findings widen a "U-27 fix"** (sign-in, participant list). Both are V-3 gaps that make a
  removal less than final, and each is one predicate. Leaving them would ship a removal that a
  sign-in undoes.
