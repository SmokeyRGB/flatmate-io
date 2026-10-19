# Proposal

## Why

F3 change 2b (`role-permissions`, archived `2026-10-03-role-permissions`) shipped the **expand**
half of its constraints only: `drizzle/0029` raised the upper bounds and added the new holder
rules, but left the lower bounds at what old code still wrote, kept the retired names
`close_round` and `manage_settings` on stored rows, and left the holder rule unenforced for
`manage_rooms`, `create_application` and `change_application_state`. Until this contract step, a
membership can therefore lack rights its role gives it, and a plain resident written by direct SQL
can still hold an organising right the Rechtematrix forbids (`docs/03-PRD.md` §4.0.1: ❌ = not
grantable, ✅ = *„immer"*). Both gaps are open register rows in `docs/review-log.md`
§Offene-Punkte-Register (*„`manage_rooms` ist für Bewohnende noch einzeln vergebbar …"* and
*„Rechtebündel noch nicht exakt erzwungen (Expand/Contract)"*), each marked *„Vor v0.1"*.

**Why now.** The trigger 2b recorded (its task 11.1) is met: on 2026-10-14 every local branch has
merged `main` (`git branch --no-merged origin/main` is empty, no pull request is open), so no live
branch writes the old sets to `flatmate-io-dev` any more. A read-only count on dev the same day
found no row holding a retired name, no plain member holding an organising right, and one live
resident without `vote`, which the re-run backfill covers.

This change serves the same source as 2b: the human decision of 2026-09-28 that a membership
missing its role's rights means *"something has significantly gone wrong before"*, the v0.1-blocker
call of 2026-10-01 (audit finding #1), and `docs/03-PRD.md` §4.0.1.

## What Changes

- **Migration `drizzle/0037` (contract)**, re-runnable, under `LOCK TABLE membership`:
  - backfills the household, moderator and resident sets again (rows written in the window);
  - counts, reports and strips every organising permission a plain member still holds, and strips
    the retired `close_round` and `manage_settings` from every row;
  - sets the **exact** household CHECK (`= HOUSEHOLD_PERMISSIONS`), the moderator CHECK to the full
    moderator set, and the resident CHECK to `@> {vote}` for every live resident;
  - adds `manage_rooms` to the administration CHECK and `create_application`,
    `change_application_state` to the moderator-only CHECK;
  - adds one more CHECK: no row stores a name that is not a declared permission (this is what
    keeps the retired names out for good, on every row, the moderator's included).
- **`src/modules/identity/schema.ts`**: deletes `checkFrom`, `REPLACED_PERMISSIONS`,
  `RETIRED_PERMISSIONS`, the frozen `…_AT_0024`/`…_AT_0027` sets and the `…_UNTIL_CONTRACT` bounds;
  the CHECKs derive from the live sets only. **BREAKING** for any branch still writing the old sets
  (none is open).
- **Tests**: every test that builds a state the contract makes impossible (a plain member granted
  an organising right, a moderator missing one, a live resident stripped of `vote`) is rewritten
  to the real path that produces the condition, or to an assertion that the database refuses the
  write by constraint name. The raw-SQL refusals 2b deferred (its task 7.7) are added. The
  constants test moves back to the live sets.
- **Specs**: `identity/permissions` drops the transition paragraph and scenario and states the
  exact rule.
- **Register**: the two `docs/review-log.md` rows above are closed with a pointer to this change.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `identity/permissions`: *A membership that contradicts its roles cannot exist* loses its
  transition clause and scenario; the holder rule covers every permission, the sets are exact, no
  undeclared or retired name can be stored, and the contract migration's backfill becomes a
  scenario of this requirement.

## Impact

- **Guardrails.** G-C (authorization): tightened, not loosened. The database now refuses every
  membership the matrix forbids. No G-D guarded test is touched (`test/guarded.manifest.json`
  carries none of the rewritten files; checked in tasks). G-L: not touched.
- **Code.** `src/modules/identity/schema.ts` only. No permission check changes: every writer
  already stores the live sets (`auth.ts` registration, claim/join, founding link;
  `repository.ts` appointment, demotion, removal, reactivation).
- **Database.** `flatmate-io-dev` gets `0037` applied **alone**, right before the merge
  (memory: expand/contract on shared dev). Production stays at `0012`.
- **Tests.** About 17 test files rewritten or fixed (listed in tasks); none deleted without a
  stated replacement.
- **Assumption.** No branch outside this repository's local and remote heads writes to
  `flatmate-io-dev` (the Cursor work packages WP01–WP12 are merged or not started). Re-checked
  right before the migration is applied (task 1.1).
