<!-- Moved verbatim from CLAUDE.md on 2026-09-28 (it had grown to 384 lines; the target is ~200).
     Loaded at session start like CLAUDE.md itself: no `paths:` frontmatter, by decision.
     Section names are unchanged: many code and migration comments cite
     them as CLAUDE.md "<section>", and drizzle/ files can't be edited (G-E4). -->

# Implementation hazards specific to this repo

Each of these cost at least one review round in PRs #4–#18. They are facts about this codebase,
not new rules — the rules stay in `docs/GUARDRAILS.md`.

**An invariant holds only where it is enforced.** Four paths reach data without passing through
the TypeScript that states the rule:

- **Raw SQL as `app_runtime`.** RLS applies, but it guarantees household isolation only. Roles,
  permissions and ownership *within* a household are application-level for every table, by
  ADR-004's layering ("zweifach erzwungen heißt nicht identisch zweimal"); `import-boundary.ts`
  keeps raw SQL inside the repositories. The transition tables in `transitions.ts` are
  application-level too, so a state rule that must survive even that — finality, say — needs a
  constraint or trigger (`drizzle/0017` is the example).
- **A `SECURITY DEFINER` function.** It runs past RLS, and `resolve_join_code`, `claim_join_code`
  and `record_join_attempt` answer unauthenticated callers. With no foreign keys nothing keeps a
  stored id honest, so every join inside such a function carries its own `household_id`
  predicate. `scripts/lint/definer-coverage.ts` requires each one to be called in a raw-SQL test.
- **A concurrent request.** Any read-then-write needs a unique constraint, a row lock (`FOR
  UPDATE`, or a conditional `UPDATE`) or an advisory lock. The Supavisor transaction pooler
  serialises one-statement transactions by accident, so a racy function can pass a concurrency
  test. Make the test deterministic by holding an uncommitted transaction while the other path
  runs (`tests/integration/policy/revoked-membership-sign-in.test.ts`), or label it an invariant
  guard rather than a regression test.
- **A sibling entry.** A rule checked where state is revoked must also be checked where it is
  created (sessions: `signIn`), and a guarded read has sibling reads (`getRoundForSession` vs
  `getRoundParticipants`). Authorization lives in the repository function, not the route that
  happens to call it today, and it derives from the authenticated session (`context.accountId`),
  never from a caller-supplied actor id — the `assert*` helpers in `identity/repository.ts` refuse
  a mismatch. `tests/integration/policy/authorization-matrix.test.ts` fails when a
  new `casting`/`identity` repository export has no recorded decision: it must refuse a plain
  resident, or carry a stated reason for being exempt. It covers mutators only; each read's
  visibility is tested per read. A history view (a dead link, a past event) takes its labels from
  its own rows, never from a current-state list: `getResidentList` hides removed people, so a
  label looked up there silently disappears (PR #23).

**The relationship a predicate joins through must itself be enforced.** With no foreign keys, a
pairing between columns is true only where a constraint says so. Before a predicate or a
`SECURITY DEFINER` join relies on one, check that it is a constraint. If it isn't, add the
constraint once rather than a predicate in every reader. Enforce all of the relationship, not the
one property a reviewer named: which rows pair up (`membership_resident_pairing`, `drizzle/0020`)
**and** how many there may be. A lookup that takes `[row]` from a query with no unique index
behind it is ambiguous (`membership` per profile and per account, `drizzle/0021`). PR #23 needed
two review rounds because the first fix covered only the pairing.

**No transaction spans Postgres and Supabase Auth.** A provider call inside `withSessionContext`
is not rolled back with it. Order the steps so that every failure point leaves a safe state, and
write down which state each one leaves. For a reset, that means ending the sessions and spending
the link first, then setting the password, then signing in (`redeemPasswordReset`). Don't claim
atomicity in a comment. The rule covers every provider call, not only the one a review named. Before calling
a boundary fixed, `grep -n "supabaseAdmin()" src/` and check each call inside a transaction: the
provider call goes last before the commit, and a failed commit after it is reconciled. PR #23 fixed
the reset in one round and the password and email changes, three screens up, only in the next.
Three more rules at that boundary, from PR #23's fourth round:
- A repair after a failed commit reconciles to the authority's current state (the provider's
  address), never replays its own write, since a later writer may have committed in between.
- Every error after an external change maps to the state that change left behind, not only the
  errors you expected: once the password is set, any failure means "set, please sign in".
- A change to credentials (email, password) re-checks the caller's own `session` row under lock.
  A reset or password change ends sessions without revoking the membership, so a membership
  check alone lets a just-ended session through.
- Authentication happens at the provider before any lock can be taken, so a sign-in that checked
  the old password can arrive after a reset. `signIn` reads the database clock before
  authenticating and refuses when `account.password_changed_at` is later (`drizzle/0022`).
- A stamp written inside a long transaction uses `clock_timestamp()`, not `now()`. `now()` is
  fixed at transaction start, so it predates the provider calls made in between.
- An unanswered provider call is an *unknown* outcome, not a refusal — auth-js returns it as
  `AuthRetryableFetchError`, and it is never distinguishable from a definite decline by an `if
  (error)` check alone. The request may or may not have taken effect. A mutating call resolves this
  by reading the provider back under the same lock the call itself was made under; it is never
  resent blind (`src/modules/identity/auth-provider.ts`, auth-provider-deadline proposal.md).

**Every writer of the same state, pairwise.** When two functions write the same thing (a password,
a provider address, the set of live sessions), each pair has to be serialized against each other,
not each against its own caller. `changeResidentPassword` and `redeemPasswordReset` both change
the password and both take the `account` row lock (PR #23). A new session is created inside the
same transaction, under the same `membership` lock, that decides the membership still stands, as
`signIn` does. Inserting it after that transaction commits reopens the race with removal.

Anything keyed on request data — a header, a cookie, a route param — ask who can set it.
`x-forwarded-for` is caller-supplied unless `JOIN_ATTEMPT_TRUSTED_IP_HEADER` names a proxy that
overwrites it.

**Migrations.**

- A new enum value goes in its own migration file; Postgres rejects using it in the transaction
  that added it.
- The agent harness refuses `DROP COLUMN` and `SECURITY DEFINER` statements. A human applies them
  and then runs the whole file, so write such files re-runnable (`IF NOT EXISTS`, `DROP FUNCTION
  IF EXISTS` before `CREATE`); `CREATE OR REPLACE` cannot change a `RETURNS TABLE` shape. The agent
  never executes those statements, so nobody sees their errors until the human does — read them.
  `scripts/lint/migration-shape.ts` checks the mechanical half for files after `0017`.
- Order statements by the constraints live *at each statement*, including those the file is
  about to drop (`drizzle/0017`: the old unique index had to go before the backfill).
- There are no foreign keys, so nothing cascades. A new household-scoped table joins the delete
  set in `tests/helpers/identity.ts` (`tests/unit/lint/cleanup-inventory.test.ts` fails
  otherwise) and, if registration writes it, `undoRegisterHousehold` in
  `src/modules/identity/auth.ts`.
- `DATABASE_URL` connects as `app_runtime`: hand-run SQL through it matches zero rows under RLS
  and reports success. Owner work goes through the Supabase SQL editor.

**Tests that can fail.** Assert error codes, not only end states — a refusal reached by the wrong
path looks identical otherwise. A status-transition test asserts every column the statement
writes, not only the status. A migration test seeds the *pre*-migration state, including the
conflicting row. A new test counts once it has been seen failing against a deliberate break.
