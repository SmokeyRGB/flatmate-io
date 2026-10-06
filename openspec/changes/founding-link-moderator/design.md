## Context

- `registerHousehold` (`src/modules/identity/auth.ts`) already mints one founding link inside its
  transaction: `issueJoinCodeTx(tx, householdId, accountId, null, { validDays: 7, maxUses: 1 })`.
  It is an ordinary neutral link, and nothing distinguishes it from a link issued later.
- `joinHousehold` is the only production path that creates a resident membership:
  1. Pre-Auth checks: `resolveJoinCode`, the `purpose` check, a refusal of any signed-in visitor
     (`already_member` / `other_household`) and the name check.
  2. Then Auth `createUser` and `signInWithPasswordWithResend`.
  3. Then one transaction under the new account's context: `claimJoinCodeTx` (SECURITY DEFINER
     `claim_join_code`, one conditional `UPDATE … SET uses = uses + 1`), the profile, the account,
     a membership with `role 'member'` and `permissions ['vote']`, `membership.joined`, and
     `insertSessionTx`.
  4. Any failure after `createUser` ends in `deleteAuthUserUnlessCommitted`.
- The join page decides its screen in `decideJoinScreen` (`join-screen-state.ts`). A session in
  the link's household gives `already_member`, which redirects the household account to its
  settings.
- `setMemberRole` stores an appointment as `role = 'moderator'` and `permissions =` the sorted,
  deduplicated union of the existing permissions and `MODERATOR_PERMISSIONS`. It records
  `membership.role_changed {fromRole, toRole}`.
- `claimResidentProfile` stays as it is (proposal).

## Goals / Non-Goals

**Goals**
- The founding link's redeemer becomes moderator, stored exactly as an appointment stores it.
- The household account can redeem its own founding link in one submit. The submit ends the
  household session inside the join transaction.
- Exactly one founding link per household, set only by registration. It admits at most one
  redeemer.

**Non-Goals**
- No change to `resolve_join_code` or `claim_join_code` (no SECURITY DEFINER shape change).
- No backfill of existing households.
- No pre-join hint for a signed-out founder.
- No last-moderator guard.
- No round rights for the household account: dropped by the human on 2026-10-06, S-50/U-20 stand.

## Decisions

### D1. The mark is a column on the link, constrained in shape and count

`join_code_issuance.is_founding_link boolean NOT NULL DEFAULT false`.

Constraints, enforcing the relationship as well as the count:
- `CHECK (NOT is_founding_link OR (purpose = 'join' AND bound_resident_profile_id IS NULL))`. A
  founding link is a neutral join link, never a reset link or a bound one.
- `CREATE UNIQUE INDEX … ON join_code_issuance (household_id) WHERE is_founding_link`. At most one
  per household, so a later lookup can never be ambiguous.

Writers: only `registerHousehold`, through a new `founding: true` option on `issueJoinCodeTx`.
The public `issueJoinCode` (moderator or household account, O16) never passes it, and its
signature does not expose it. The column is never updated.

Paths that could reach a marked link:
- **Raw SQL as `app_runtime`:** it could `UPDATE … SET is_founding_link = true` on an ordinary
  link of a household that has none yet (only legacy households). This is application-level by
  ADR-004, and `import-boundary.ts` keeps raw SQL inside the repositories. Accepted and noted;
  the unique index caps any slip at one.
- **SECURITY DEFINER functions:** `resolve_join_code` and `claim_join_code` don't read or write
  the column. Unchanged.

Alternative rejected: deriving "founding" from the earliest issuance created by the household
account. It is ambiguous under clock ties and wrong once a household deletes and re-issues.

### D2. The founding join stores the appointment in the join transaction

Inside `joinHousehold`'s transaction, after `claimJoinCodeTx` returns `issuanceId`:
1. Read `is_founding_link` for that issuance, with an explicit `household_id` predicate. This runs
   under the new account's context, the same household, so RLS admits it.
2. If it is set, insert the membership with `role 'moderator'` and
   `permissions = appointedPermissions(RESIDENT_PERMISSIONS)`.
   - `appointedPermissions` is one exported helper in `identity`: the sorted, deduplicated union
     with `MODERATOR_PERMISSIONS`.
   - A test pins that it equals what `setMemberRole` stores for a fresh member, so the two cannot
     drift.
   - It passes the 0024/0027 CHECKs. Moderator + resident is the normal pair
     (`moderator-permissions.test.ts`).
3. After `membership.joined`, record `membership.role_changed {fromRole: 'member', toRole:
   'moderator'}`. The actor is the new account and profile. The payload is already allowlisted
   (`audit/repository.ts`).

**Serialization.** The single admission rests on `claim_join_code`'s conditional
`UPDATE … WHERE uses < max_uses`. It row-locks the issuance and lets exactly one transaction past
`max_uses = 1`. A second concurrent founding join gets no row, so `invalid_link`, and rolls back.
The read in step 1 follows that lock, and the column is immutable anyway. No new lock is needed.

**Every writer of the same state:**
- **The new membership's role/permissions:** the row is invisible to every other writer
  (`setMemberRole`, `revokeMembershipForProfileTx`, `reactivateMember`) until commit. After
  commit those writers lock it FOR UPDATE as they do any membership.
- **`membership_account_id_unique` / `membership_resident_profile_id_unique`** still bound the
  count.
- **The `membership_auto_join_open_rounds` trigger** fires as for any join. A fresh household has
  no open round, and for an old household it behaves as today.

### D3. The household account may redeem its own founding link; the submit ends its session

**Screen.** `decideJoinScreen` gets one more input, `householdAccountFoundingLink: boolean`. The
page sets it only when all of these hold:
- the session's household is the link's household;
- the session is the household account (`context.profileId === null`);
- `isFoundingLink(context, issuanceId)` returns true. This is a new read-only identity repository
  function, under the household account's own context, with a `household_id` predicate.

When set, the function returns the ordinary `neutral` form instead of `already_member`. Opening
the link writes nothing. A resident session still gets `already_member` for every link.

**Submit.** `joinHousehold`'s `currentSession` option becomes `CurrentSession` (context +
`sessionId`), as `redeemPasswordReset` already takes. The pre-Auth check becomes:
- another household: `other_household`, unchanged;
- same household, a resident session: `already_member`, unchanged;
- same household, the household account, and `isFoundingLink(currentSession.context,
  resolved.issuanceId)`: allowed;
- otherwise: `already_member`.

Inside the join transaction, after the membership insert:
`UPDATE session SET revoked_at = clock_timestamp() WHERE id = $sid AND account_id = $householdAccount AND household_id = $hh AND revoked_at IS NULL`.

Zero rows is fine: the household session already ended in another tab, and the visitor is a
plain visitor either way. As defence in depth, the transaction re-checks the claimed issuance's
mark. If a household-account session reaches the transaction with an unmarked link, it throws
`already_member` and rolls back.

**The action** sets the new resident's cookie as every join does, replacing the household cookie.
Nothing clears the cookie before the join commits.

**Failure points, both sides.** These are the existing Auth/DB boundary from
implementation-hazards, plus the session row:

| Fails at | Postgres | Supabase Auth | Household session |
|---|---|---|---|
| Pre-Auth checks | nothing written | nothing | untouched |
| `createUser` (refusal or unknown) | nothing | none, or compensated by `deleteAuthUserBestEffort` | untouched |
| `signInWithPasswordWithResend` | nothing | user deleted by `deleteAuthUserUnlessCommitted` | untouched |
| Inside the transaction, or its commit | rolled back, revocation included | deleted unless committed | still live |
| After commit (cookie write) | joined, household session revoked | user live | ended; the visitor signs in as the new resident |

The revocation is a DB write inside the transaction, so it can never outlive a failed join.

**Every writer of the live-session set, pairwise against this revocation:**
- **`revokeSession` (sign-out):** both are conditional
  `UPDATE … WHERE revoked_at IS NULL` on the same row, so whichever commits first wins and the
  other matches zero rows. Idempotent, with no invariant between them.
- **Household password change (ends the account's other sessions under the `account` row lock):**
  same row, same idempotent shape. The ordering doesn't matter: the end state is "revoked" either
  way.
- **`revokeMembershipForProfileTx` / `insertSessionTx` / `signIn`:** they touch resident sessions
  or insert new rows, never this household session row. No conflict.

### D4. Members screen names the founding link

The founder lands on the members screen after registration. It now leads with
„Bewohner:in hinzufügen" (PR #55). Preparing a profile and issuing a bound link would make the
founder a plain member, so the founding link's row in the join-link list gets a label and a
one-line hint:
- the label: „Dein Gründungslink";
- the hint: „Tritt selbst darüber bei, dann bist du Moderator:in.";
- shown only while the link is unused and live.

`listJoinCodeIssuances` adds `isFoundingLink` to its rows. The wording is a draft, for the human
to confirm (memory: German UI tone).

### D5. Migration

One file, `drizzle/0034_founding_link.sql` (0034 is reserved for this change by the F5 session; F5 change 3 takes the next number). Merge `main`
before applying, and apply to dev late.
1. `ALTER TABLE join_code_issuance ADD COLUMN IF NOT EXISTS is_founding_link boolean NOT NULL DEFAULT false;`
   Every existing row becomes false, so step 2's CHECK holds on all rows.
2. `ALTER TABLE … DROP CONSTRAINT IF EXISTS join_code_issuance_founding_shape;` then `ADD
   CONSTRAINT … CHECK (…)`.
3. `CREATE UNIQUE INDEX IF NOT EXISTS join_code_issuance_one_founding_link ON join_code_issuance
   (household_id) WHERE is_founding_link;`
   No row is true yet, so it can't conflict.

It is additive, so older branches on shared `flatmate-io-dev` keep inserting rows with the default
(memory: expand/contract on shared dev). No DROP COLUMN and no SECURITY DEFINER, so the harness
does not refuse it. The data-inventory entry is `⚙️` operational (no personal data).

## Risks / Trade-offs

- **Spec reversal.** "No permission is inferred from how a membership came about" loses its
  absoluteness. This is mitigated by tying the exception to one named, single-use,
  registration-only link and by recording the appointment.
- **The founding link leaks to a flatmate.** If the founder forwards the founding link instead of
  joining through it, that flatmate becomes moderator. This is the old misfire in a narrower
  form. D4's label is the mitigation, and the household account can demote at once. Raise it in
  the human review.
- **Tests that join through the founding link flip silently.** Most tests issue their own links.
  Tasks include an audit of every test that redeems a household's first or founding issuance.
- **A seed or test using `claimResidentProfile`** is unaffected by design.
- **Legacy households on dev** have no founding mark and behave as today.

## Open Questions

- D4 wording. Should the hint also appear on Start/organisation for the household account? Kept
  to the members screen here.

## Coordination with F5 (candidate-invite, change 2)

- A founding-link moderator stores the same `permissions` array an appointment stores (D2). F5's
  invite checks `change_application_state` on the stored set, never the role, so it works
  identically for an appointed and a founding-link moderator. Task 3.3 (b) adds a positive check
  for `change_application_state`.
- Seeds: `claimResidentProfile` is unchanged, so `seed-demo-household.ts` (Alex appointed
  explicitly) and `seed-demo-round.ts` (Kim/Jule) never create a moderator through this change. A
  re-created profile is never founding, so no second moderator appears. `scripts/demo/seed-round.ts`
  is not touched.
- `authorization-matrix.test.ts`: rows are appended without reformatting. Whichever PR merges
  second merges `main` and re-runs verify.
