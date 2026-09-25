## Context

See proposal.md (Why). The current state that shapes the approach:

- `application` has one policy, `application_household_isolation`: PERMISSIVE, `FOR ALL`, household
  only (`src/modules/casting/schema.ts`, `drizzle/0000`/`0001`). RLS is on. `app_runtime` does not own
  the table (G-C2, `tests/integration/policy/table-ownership.test.ts`), so RLS applies to every query
  the application runs.
- `withSessionContext` (`src/db/session-context.ts`) runs `SET LOCAL app.profile_id` only when
  `profileId !== null`. Its comment says an unset setting reads as real SQL `NULL`, *never an empty
  string*. **That holds only on a fresh connection.** Once a transaction on a physical connection has
  set the `app.profile_id` placeholder, later transactions on that connection read `''`.
  `tests/integration/raw-sql/pool-reuse.test.ts` already accepts `null` or `""` for exactly this
  reason, and `docs/domain/invarianten.md` §5.5 defines `app_profile_id()` as `nullif(current_setting(
  'app.profile_id', true), '')::uuid` for the same reason. The comment in `session-context.ts` is
  corrected in this change (task 2.4).
- The household account **writes** casting data. The existing G-D15 tests create a room and a round
  under `hh.context` (`profileId: null`), and `createRound`/`openRound` insert the
  `round_participation` snapshot.
- `activity_event` has three policies: household isolation (PERMISSIVE `FOR ALL`), append-only
  UPDATE (RESTRICTIVE, `EXISTS (SELECT 1 FROM application …)`) and append-only DELETE (RESTRICTIVE,
  `false`).
- No production code path reads or writes `application` yet. `getApplication` and
  `transitionApplication` are called only from tests. `redactExpiredActivityEvents` also has no
  production caller.

## Goals / Non-Goals

**Goals:**
- The database half of G-D15 for `application` and application audit events, tested with a **count**
  and not only a row. That includes the `''`-valued setting.
- A refusal at the policy layer that carries its own error.

**Non-Goals:**
- Who *among residents* may read or transition an application. That is still F3's decision
  (`docs/review-log.md`, Implementierungspflichten, "F3: `transitionApplication`"). The
  authorization-matrix entry stays `KNOWN_OPEN`.
- V-1/V-2 policies on votes, vetoes, notes (F4+). Decision 2 records what they will need.
- Serializing `transitionApplication`'s read-then-write. It already exists, is not introduced here,
  and is F3's to settle along with its authorization.

## Decisions

### Decision 1 — Predicate: "`app.profile_id` is set and non-empty", inline, RESTRICTIVE `FOR ALL`

```sql
(select nullif(current_setting('app.profile_id', true), '')) IS NOT NULL
```

This goes into a second `pgPolicy` on `application` in `schema.ts`, named
`application_requires_resident_profile`, with `as: "restrictive"`, `for: "all"`, and the same
expression as `using` and `withCheck`. A RESTRICTIVE policy is ANDed with the permissive household
policy, so household isolation is unchanged and the new policy can only narrow access. The
`(select …)` wrapper follows this file's own precedent (Supabase RLS-performance guidance; the
setting is evaluated once per query).

`FOR ALL` rather than `FOR SELECT`: `created_by_profile_id` is `NOT NULL` (`docs/domain/casting.md`
§2.2, `04-Domaenenmodell.md` O-17), so a household-account session has no legitimate write either.
An insert then fails loudly (WITH CHECK). An update or delete matches zero rows.

Alternatives:
- *Create `app_profile_id()` as a SQL function* (the literal §5.5 sketch). This was rejected for now:
  a function is not expressible in `schema.ts`, so it would need a custom migration next to a
  generated one, and `drizzle-kit`'s snapshot would not know about it. The inline expression is
  byte-for-byte §5.5's body. When F4 adds the V-1/V-2 policies that §5.5 sketches, that change can
  introduce the function and migrate this policy to call it.
- *Check that the profile exists, belongs to the household, and is active* (`EXISTS (SELECT 1 FROM
  resident_profile …)`). This was rejected. G-D15 is stated on `app_profile_id() IS NULL`, and it is
  met. Where `app.profile_id` comes from is a different invariant: it is set only in
  `session-context.ts` (G-C8, lint-enforced), from `session.acting_profile_id`, which is immutable
  (G-D14). V-3 revocation of a moved-out profile acts on sessions (`signIn`,
  `revokeMembershipForProfileTx`), not on this table. The stronger check would add a subquery on
  every application query and would break every test that uses a synthetic profile uuid. **The cost
  of this choice is stated plainly:** any code that can put an arbitrary uuid into `app.profile_id`
  passes this policy. Only `session-context.ts` can, and Decision 6 relies on exactly that for test
  teardown.

### Decision 2 — `round_participation` gets no restriction in this change

1. **It holds nothing derived from `Application`.** It records which residents take part in a round.
   The codebase already draws this line: the raw-SQL G-D15 test keeps `quorum_denominator_frozen` on
   the base table as *"derived from RoundParticipation … never from Application"*.
2. **The household account writes it.** `createRound`/`openRound` insert the snapshot under the
   household-account context, and the `auto_join_open_rounds` trigger (`drizzle/0012`,
   SECURITY INVOKER) inserts with `ON CONFLICT … DO NOTHING RETURNING id` inside whatever session
   activated the membership. `RETURNING` applies SELECT policies to the returned row. A RESTRICTIVE
   policy of either kind (`FOR ALL` or `FOR SELECT`) would therefore make opening a round, and every
   membership activation by the household account while a round is open, **raise**.
3. **The one number it yields leaks nothing new.** The denominator ("… von 7") equals the round's
   active residents, and the household account already sees and manages that list on O16. The
   participant *names* are already withheld at the policy layer (`getRoundParticipants` returns `[]`).

**Recorded for F4:** once votes exist, "5 von 7" becomes derivable. The numerator lives in `vote`,
and that table needs this change's policy from its first migration. The household account never
writes votes, so nothing in (2) applies there. This goes into the review-log row (task 1.1).

### Decision 3 — `activity_event`: RESTRICTIVE `FOR SELECT` on application-subject rows

```sql
subject_type <> 'application' OR (select nullif(current_setting('app.profile_id', true), '')) IS NOT NULL
```

`application.state_changed` rows carry `fromState`/`toState` per application. A count of them per
`subject_id` is the application count, and their payloads give the state distribution. That is a
G-D15 row-and-aggregate leak by a sibling path, so it belongs in the same commit.

- **Scoped to `subject_type = 'application'`**, so the household account's own room, round, settings
  and membership events stay readable (`hasProcedureChangedNotice` among them).
- **`FOR SELECT` only.** INSERT stays governed by the existing policies. `recordActivityEvent` uses
  `.returning()`, so a household-account session that inserts an application event would raise.
  That is unreachable, because `transitionApplication` refuses first (Decision 4), and loud if it
  ever becomes reachable.
- **UPDATE and DELETE:** an UPDATE must see the row it targets, so redaction of application events
  in a household-account session now matches nothing. The existing UPDATE policy's own `EXISTS`
  on `application` already causes the same result under Decision 1. See Decision 5.

Alternative: leave `activity_event` alone and record it as a follow-up. That was rejected under
"fix the class": it is the same invariant on a sibling path. **Human decision, 2026-09-24:
included.**

### Decision 4 — Policy-layer refusals before the query

- `getApplication`: `if (context.profileId === null) return null;` before `withSessionContext`, the
  same shape as `getRoundParticipants`.
- `transitionApplication`: `if (context.profileId === null) throw new ProfileRequiredError(...)`
  before any query. `ProfileRequiredError` is a new exported class in `casting/repository.ts` with a
  stable `code = "profile_required"`, in the style of `ProcedureLockedError`. Without it, the refusal
  would arrive as *"Application not found"* (RLS hides the row), and a refusal reached by that wrong
  path looks identical to a genuine refusal (CLAUDE.md, Tests that can fail).

`authorization-matrix.test.ts` is not edited. `getApplication` stays `NOT_APPLICABLE` (read-only), and
`transitionApplication` stays `KNOWN_OPEN`, because a plain resident is still not refused, and that is
F3's decision.

### Decision 5 — Retention: automatic deletion on a system path; the household account sees only the round's deadline

**Human decision, 2026-09-24.** Once a round has concluded and its retention period expires, its
applications are **deleted automatically** unless an extension was requested. The household account
needs no view of the applications for this. What it is shown is that the round's retention expires,
and that the applications will then be deleted unless an extension is requested.

What this means for the design:

- **The deletion runs on a named system path, never in a household-account session.** Under
  Decision 1 a household-account session would find no applications, delete none, and still report
  success. `redactExpiredActivityEvents` has the same shape. Neither has a production caller today;
  the system path is built by whichever slice builds retention, in line with O-17's *„Ein künftiger
  Systempfad bekäme eine benannte Quelle"*.
- **The household account's notice and its extension request act on the round, not on
  applications.** Both use only fields ADR-014 already makes visible: `casting_round.retention_until`,
  `retention_extensions` and `retention_warned_at`. The notice SHALL NOT state how many applications
  will be deleted. That number is exactly the aggregate G-D15 forbids, and the database refuses to
  produce it in that session anyway.
- **This matches the authoritative source.** `06-Compliance-Anhang.md` §5 anchors `Application`
  retention at the round's close, and so do E-18, `03-PRD.md` and O17/O18 (warning 14 days ahead, no
  silent deletion). `domain/aufbewahrung.md` §7 and `domain/casting.md` anchored it at `created_at`.
  Those are citation errors, corrected in task 1.2 (human decision 2026-09-24). One consequence is
  left open there: an application whose round never closes has no deletion date.
- **Nothing in this change builds any of it.** The decision is recorded in the review-log (task 1.1)
  so the retention slice starts from it. The existing G-D8 test runs with a profile and is
  unaffected.

### Decision 6 — Teardown under a synthetic profile

`cleanupHousehold` (`tests/helpers/identity.ts`) runs the one-statement CTE under
`{ ...context, profileId: context.profileId ?? uuid() }`. The two guarded `afterEach` blocks switch
`profileId: null` to `profileId: uuid()`. This is sound only because of Decision 1's stated cost: the
policy checks presence, not identity. It is test-only and confined to deletes of rows the test
created. Without it, the `application` CTE arm matches zero rows, returns no error, and the
household row is deleted, which is exactly the silent-orphan class `makeCleanup`'s comment
describes. `cleanup-inventory.test.ts` would not catch this, because it checks table *membership*
in the set, not effect.

Alternative: delete through the Supabase service-role client (`join-rate-limit.test.ts`'s
precedent). This was rejected, because it would split the single-round-trip CTE into two paths.
**Human decision, 2026-09-24:** the teardown-only edit in the two guarded files is approved.

### Decision 7 — Migration `drizzle/0018`, generated, made re-runnable by hand

`npx drizzle-kit generate` after the schema edits should emit two `CREATE POLICY … AS RESTRICTIVE`
statements. The applier prefixes each with `DROP POLICY IF EXISTS "<name>" ON "<table>";`, so the file
survives a partial apply. `migration-shape.ts` does not check policies, so this is by hand. The file
contains no `DROP COLUMN`, no `SECURITY DEFINER` and no enum `ADD VALUE`, so there is no statement the
harness is known to refuse. If it refuses `DROP POLICY`, that statement goes to the human (task 3.3).

Statement order: both statements are additive policies with no data change and no constraint
interaction. Each takes effect at its own statement, so order between the two is irrelevant. Verified
by `pg_policies` (`permissive = 'RESTRICTIVE'`, the exact `qual`/`with_check`).

### Sibling paths — where each is enforced

| Path to `application` data in a profile-less session | Enforced by |
|---|---|
| `getApplication` | Decision 4 (early `null`), and Decision 1 underneath |
| `transitionApplication` | Decision 4 (`ProfileRequiredError`), and Decision 1 underneath |
| Future F3 repository reads and writes (list, create) | Decision 1. Each new function also needs its own early refusal and test (F3's duty, recorded in task 1.1) |
| Raw SQL as `app_runtime` (`SELECT`, `count(*)`, `INSERT`, `UPDATE`, `DELETE`) | Decision 1, tested in task 4.2 |
| Profile setting `''` on a reused pooled connection | Decision 1's `nullif`, tested in task 4.2 |
| `activity_event` application-subject rows | Decision 3, tested in task 4.3 |
| `activityevent_append_only_update`'s `EXISTS` subquery | Decision 1 filters it, so the result is no redaction (Decision 5) |
| `redactExpiredActivityEvents` | Decision 1 and Decision 3, with no production caller (Decision 5) |
| `casting_round_admin_view` (`security_invoker`) | Reads no application columns; the existing G-D15 policy test |
| `round_participation` | Not Application-derived (Decision 2) |
| `SECURITY DEFINER` functions (`drizzle/0005`, `0013`, `0014`, `0015`) | None reads `application`; checked in planning, re-checked in task 2.5 |
| A concurrent second request | Not applicable. The predicate reads only the transaction's own setting and there is no read-then-write |

## Risks / Trade-offs

- [The savepoint route to `''` behaves differently than assumed] → Task 4.2 asserts the
  precondition `current_setting('app.profile_id', true) = ''` before counting. If it reads `NULL`,
  the applier switches to a dedicated `max: 1` client with two sequential transactions
  (`pool-reuse.test.ts`'s method), reports it, and does not drop the scenario.
- [A later change adds a household-account read of applications "because it's just a count"] →
  That is exactly ADR-014's named failure mode. The database now refuses it, and G-D15's new raw-SQL
  test fails.
- [The teardown edit in guarded files grows beyond teardown] → The approval covers `afterEach` only.
  Task 5.2 requires the diff to show no change inside any `it`.
- [The comment in `session-context.ts` stays wrong and someone writes `IS NOT NULL` without `nullif`
  in a future policy] → Task 2.4 corrects the comment. The `''` test fails on the missing `nullif`
  (its deliberate break).

## Migration Plan

Apply `0018` to **`flatmate-io-dev`** only, via the Supabase MCP `apply_migration` (as `0016`/`0017`
were), verify via `pg_policies`, then run the suite. Production is applied by the human after merge.
Rollback: `DROP POLICY IF EXISTS application_requires_resident_profile ON application; DROP POLICY
IF EXISTS activityevent_application_requires_resident_profile ON activity_event;`. This loosens
access, so it is a G-C change requiring human approval, never an agent action.
