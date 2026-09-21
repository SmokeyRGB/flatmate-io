# Design

> **Rewritten 2026-09-21** against the issuance model (O-18, PR #13). The superseded version, which
> designed three columns on `household` and a rotating code, is at `2cc4f78` in this branch's
> history. Decisions 1, 2 and 3 below survive that rewrite largely intact; the rest are new.

## Context

See `proposal.md` — Why. Two facts shape everything:

**1. The party presenting a code has no session, and the tables are RLS-scoped.**
`withSessionContext` (`src/db/session-context.ts`) requires a `householdId` before it opens a
transaction — and discovering the household is exactly what resolving a code is *for*. The project
has met this once and solved it deliberately: `resolveAccountHousehold`
(`src/modules/identity/repository.ts:152`) calls a `SECURITY DEFINER` function from
`drizzle/0005_identity_login_bootstrap_function.sql`, described in its own comment as *"the ONE
deliberate hole"*, revoked from `PUBLIC` and granted only to `app_runtime`.

**2. This is not an additive migration.** F1 shipped `household.join_code`,
`join_code_rotated_at`, a `rotateJoinCode` function and an O16 UI that renders them. All of it
moves.

## Goals / Non-Goals

**Goals**

- A link's count can never exceed its maximum, under any interleaving, without holding a lock
  across a round trip.
- A refusal is structurally incapable of carrying its reason.
- Exactly one new hole in the RLS wall, as narrow as `resolve_account_household`.
- Change 2 can call the claim inside its own larger transaction without losing atomicity.
- Every household that exists today keeps working, with its current link, on the day this deploys.

**Non-Goals**

- **No rate limiting.** It belongs with the public route, which is change 2 — see `proposal.md`
  Assumption 1 for why that does not break C-2.12, and why the obligation is change 2's to carry.
- No join route, no join form, no manual code entry.
- No `status` column (`domain/identity.md` §2.1 forbids it by name).
- No changes to how membership is created; this change only lends change 2 the claim.

## Decisions

### 1 · One conditional `UPDATE` claims the redemption

```sql
UPDATE join_code_issuance
   SET uses = uses + 1
 WHERE code = p_code
   AND deleted_at IS NULL
   AND expires_at > now()
   AND (max_uses IS NULL OR uses < max_uses)
RETURNING household_id, id;
```

One statement decides and counts. Returning no row *is* the refusal, and there is no window between
the halves for a competitor to slip through: PostgreSQL re-evaluates the `WHERE` against the updated
row when two writers contend for it.

**Alternative considered: `SELECT … FOR UPDATE` then update** — the shape `openRound` uses
(`src/modules/casting/repository.ts:255-261`, its race proven by the EC-1.9 test at
`tests/integration/policy/round-open-atomicity.test.ts:117`). Right *there*, because `openRound`
runs several precondition checks in application code between the read and the write. Here the whole
decision is a `WHERE` clause, so a lock held across a round trip to Node buys nothing and costs a
held row lock on a path a stranger can trigger. Its **test** is still the model to copy.

### 2 · Two `SECURITY DEFINER` functions, and the input is not pre-verified

`drizzle/00NN_join_code_issuance.sql` adds:

- `resolve_join_code(p_code text) RETURNS TABLE (household_id uuid, household_name text)` —
  `STABLE`, non-consuming. FR-2.9 requires the household's name before any input is requested, so
  *looking* at a link must not spend one of its uses.
- `claim_join_code(p_code text) RETURNS TABLE (household_id uuid, issuance_id uuid, household_name text)`
  — `VOLATILE`, Decision 1's statement. It returns the issuance id because change 2 must write
  `membership.joined_via_issuance_id`.

Both `REVOKE ALL … FROM PUBLIC` and `GRANT EXECUTE … TO app_runtime`, matching `drizzle/0005`.

**The honest difference from 0005.** Its comment leans on a property this does not have:
*"Not callable to enumerate accounts; the caller must already hold a verified account_id."* These
take a stranger's string. What keeps it acceptable is narrowness plus **the attempt limit of
FR-2.28, which is change 2's** — and until change 2 there is no public route to call them from.
The functions return three columns and nothing else, so a correct guess reveals a household id, an
issuance id and the name the joiner is about to be shown anyway.

**This dependency goes in the migration's comment, not only here**, because the next person to read
that SQL is the one who needs to know the limit is load-bearing.

**Alternative considered: relax the RLS policy to permit a lookup by code** — rejected outright.
It widens the policy for every query rather than one call site, and G-C is a hard floor.

### 3 · The refusal type cannot carry a reason

```ts
export type JoinCodeResolution =
  | { householdId: string; issuanceId: string; householdName: string }
  | null;
```

FR-2.8 requires one message that does not distinguish FR-2.7's causes. A discriminated union of
causes plus a rule that every caller collapse it makes correctness a matter of discipline at each
call site; a type that never held the cause cannot leak it at any of them. EC-2.8 then needs no
branch — `uses < max_uses` is already false at zero.

**What changed since the superseded version:** that one argued the type *also* protected against a
distinction the model could not make. It can now — every issued link is kept. The type is unchanged;
its justification is one support lighter, exactly as FR-2.8 itself now records.

**The accepted cost:** a moderator asking "why didn't my link work?" cannot be answered from the
refusal. They can answer it from O16, which lists every link with its expiry and count — one of the
reasons the list shows those rather than hiding them.

### 4 · The migration carries existing links across, then drops the columns

One migration, in order:

1. `CREATE TABLE join_code_issuance` with its RLS policy, keyed on `household_id` like every other
   household-scoped table.
2. `INSERT INTO join_code_issuance (…) SELECT id, join_code, NULL, NULL, 0, owner_account_id, …
   FROM household WHERE deleted_at IS NULL` — one row per household, carrying its current code,
   **no maximum and no expiry**, which is precisely what that code is today
   (`proposal.md` Assumption 2).
3. `ALTER TABLE membership RENAME COLUMN joined_via_code TO joined_via_issuance_id` and retype to
   `uuid`. It has never been written, so there is no data to convert.
4. `ALTER TABLE household DROP COLUMN join_code, DROP COLUMN join_code_rotated_at`.
5. The two `SECURITY DEFINER` functions.

**Step 2 must precede step 4 in the same migration**, or a deploy between them leaves a household
with no link at all. **Rollback is not clean after step 4** — the codes live only in the new table.
That is acceptable because `flatmate-io-dev` is the only deployment and it is disposable; it would
not be acceptable against a real household, and the migration says so in a comment.

**No foreign keys** — this project does not use them (the two-Supabase-project split), so
`household_id` and `joined_via_issuance_id` are plain `uuid` columns.

### 5 · Rotation becomes three actions, and the audit follows

`rotateJoinCode` disappears. `issueJoinCode`, `extendJoinCode` and `deleteJoinCode` replace it, all
inside `withSessionContext` behind the existing `assertIsAdministrationOrModerator` — the same
authorization `rotateJoinCode` already had, since U-30 gives administration and moderation parity.

`PAYLOAD_ALLOWLIST` (`src/modules/audit/repository.ts:13-33`) gains
`household.join_code_issued` and `household.join_code_deleted`, both with **empty payloads** — the
code must never enter one (G-A5). `household.join_code_rotated` stays registered although nothing
writes it any more, because historical rows carry it and the allowlist is what makes them readable
as valid.

Extending is deliberately **not** audited: it changes no one's access, only defers an expiry, and
FR-2.19 audits joins rather than every moderator gesture.

### 6 · O16 follows `screens/O-organisation.md` O16 literally

Three parts in order: the `.callout-caution` warning; the create form; the list of links.

- **The create form parameterises the next link, not an existing one** — two fields (`Gültig für
  (Tage)` default 7, `Höchstens nutzbar` default 1) and one action. O16's reasoning, which is worth
  keeping in view: *„ein ausgestellter Link ist ein Versprechen an die Person, die ihn bekommen hat,
  und wird nachträglich nicht umgeschrieben."*
- **Each row** carries its remaining validity, `n von m genutzt`, `+7 Tage`, `Löschen`, the code in
  monospace, the full URL muted beneath, and the stacked copy pair — *"a full-width solid primary
  'copy the whole thing' action on top, a quieter secondary 'copy just the short value' option
  beneath"* (`09-Design-System.md`). That pair is new CSS and needs `navigator.clipboard`, so it is
  a small client component; `page.tsx` stays a server component.
- **"Löschen"** opens a `.dialog` confirmation, because the design system requires one for
  hard-to-reverse actions and invalidating outstanding invitations is one. **No typed-name gate** —
  that is reserved for U-27's permanent member removal, and reusing it here would flatten a
  distinction the design system draws deliberately.
- **Every new string goes in `src/ui/strings/de.ts`** and nowhere else, per change 0. §8.6 fixes
  „Einladungslink" and „Löschen"; the rest is new copy. `members.rotateJoinCode`
  („Einladungslink erneuern") is deleted along with the action it labelled.

### 7 · Code generation

A short, upper-case code from a confusion-resistant alphabet, in two groups of five (FR-2.26). It
replaces `randomUUID()` at the one place a code is minted, which after this change is
`issueJoinCode` — `registerHousehold` (`auth.ts:66`) calls it for the founding link rather than
minting its own.

Uniqueness is a `UNIQUE` constraint on `code` plus retry on violation, not a pre-check: a
read-then-insert has the same race as a read-then-update, and the constraint is the only thing that
actually decides.

### 8 · Where the code lives

Everything is inside the `identity` module. `schema.ts` gets the table, `repository.ts` the
resolution, the claim and the three moderator actions — it is the only file outside `src/db/`
permitted to touch the raw client (G-C1, `scripts/lint/import-boundary.ts`), and the two
`db.execute` calls sit beside `resolveAccountHousehold` for that reason. `members/actions.ts` calls
exported functions only. No other module is touched.

## Risks / Trade-offs

**An anonymous validity oracle with a shortened code** → Mitigated by FR-2.28, which is change 2's.
Until then the functions have no public caller. Named in `proposal.md` Assumption 1 so the
obligation cannot be dropped in the gap between the two changes.

**A destructive migration** → Step 4 drops columns whose data lives only in the new table after
step 2. Mitigated by doing both in one migration and by the fact that `flatmate-io-dev` is the only
deployment. Not acceptable against a real household; the migration comment says so.

**A second hole in the RLS wall** → Two more `SECURITY DEFINER` functions genuinely widen the
trusted surface. Mitigated by a three-column return, `REVOKE … FROM PUBLIC`, the G-C1 lint confining
call sites to `repository.ts`, and G-C7 tests asserting they leak nothing more.

**A dead invitation URL until change 2** → Named, bounded, behind authentication. Deferring the URL
instead would leave S-49's "warning where the link is copied" with no link to sit beside.

**O16 grows a list that can only get longer** → Dead links are never cleaned up, by design (O-18's
whole point). A household issuing one link a month accumulates slowly; if this ever needs paging,
that is a later change with real numbers behind it, not a guess now.

## Migration Plan

One migration file, the five steps of Decision 4 in that order. No separate data migration and no
backfill beyond step 2.

**Rollback:** clean before the migration runs, not clean after — the codes exist only in
`join_code_issuance` once step 4 has run. Restoring would mean re-issuing links, which is why the
comment in the migration says what it says.

## Open Questions

None that can be deferred. The one obligation that outlives this change — FR-2.28 shipping with
change 2 — is recorded in `proposal.md` Assumption 1 and in the migration's own comment, rather
than left as a question.
