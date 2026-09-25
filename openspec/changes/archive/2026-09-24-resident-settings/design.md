# Design

## Context

**What exists (observed on `main` at `f05ac5a`):**

- **Every resident Auth user carries `resident-<profileId>@accounts.flatmate.invalid`.**
  `deriveResidentEmail` in `src/modules/identity/auth.ts` builds it. `signIn`'s name path rebuilds
  it from the profile id on every sign-in. `joinHousehold` always creates the Auth user with it.
  - An optional address given at join is written to `account.email` **only** (the comment at the
    insert: *"never the derived address"*). So for residents, `account.email` is exactly null or a
    real address, and Auth never sees that address.
  - `account.email`'s schema comment says uniqueness *"is enforced at the Supabase Auth layer"*.
    That is true for the household account and false for residents today.
- **`signIn`'s email path is identity-agnostic.** It checks the Auth address and password, then
  `resolveAccountHousehold`, then locks the membership, and sets `acting_profile_id` to the
  profile when `membership.is_resident`. So once a resident's Auth address is real, that path
  signs them in as themselves with no code change. That is G-D14's rule applied as it already
  stands.
- **Join links:** `join_code_issuance` (0013) with a nullable `resident_profile_id` (0015). There
  are two `SECURITY DEFINER` functions, `resolve_join_code(text)` and `claim_join_code(text)`. Both
  return `(household_id, issuance_id, household_name, bound_resident_profile_id,
  bound_resident_display_name)`, and both hold a bound link valid only while its profile is
  `prepared` (third review of PR #17). The route `/join/[code]` renders a neutral or a bound shape
  from `resolveJoinCode`, and records a join attempt (FR-2.28) before anything else.
  `/join` normalises a hand-typed code.
- **Sessions** are our own `session` table. Revocation means `revoked_at`.
  `revokeMembershipForProfileTx` shows the idiom (update where `revoked_at IS NULL`).
  `getCurrentSession()` yields `{ sessionId, context }`.
- **Authorization helpers:** `assertIsAdministration(context, accountId)` checks `household_admin`
  and refuses an `accountId` that isn't `context.accountId`. The O16 row actions use
  `assertIsAdministrationOrModerator` (U-30 parity).
- **No code sends mail.** Supabase's default SMTP delivers only to project-team addresses, has a
  small hourly cap and is best-effort (Supabase docs, *Custom SMTP*), so it is not a channel for
  real residents.

**What the docs say, and where this change amends them:** see the proposal. In short:
- O-16 (a direct reset by the administration) becomes a reset link;
- the provider box's *„steht sie neben der abgeleiteten Kennung"* becomes "replaces it";
- EC-2.6 is corrected to K-18.

## Goals / Non-Goals

**Goals:** E1 with email add/change and password change; email sign-in as a resident; the
reset link, end to end; docs made true.

**Non-Goals:**
- sending any mail, verification or "Passwort vergessen";
- passkey and push;
- the feed surface that displays the reset event;
- migrating existing Auth users;
- letting a moderator issue reset links;
- the household account's own email change (O20 territory).

## Decisions

### D1 — The provider is the authority for its own sign-in identifier

`signIn`'s name path stops rebuilding the derived address. It resolves profile → membership →
`account_id` inside the bootstrap context it already opens. It then reads the Auth user's
**current** email with `auth.admin.getUserById(accountId)` and passes that to
`signInWithPassword`.

**Why not `account.email ?? derived`:** that would hold only while `account.email` and the Auth
address never diverge, and they can:
- residents who joined with an email before this change have `account.email` set and a derived
  Auth address (proposal Assumption 6);
- a commit that fails after the Auth update would leave the reverse.

Asking the provider costs one extra Auth call per name sign-in and has no invariant to keep. The
refusal stays `invalid_credentials` for every failure, including a missing Auth user.

The membership lookup filters on `resident_profile_id = profile.id`. It takes no lock: the existing
`FOR UPDATE` on the membership after `signInWithPassword` still decides revocation, as today.

### D2 — Setting the email: DB row locked first, Auth updated inside the transaction

`changeResidentEmail(current: CurrentSession, rawEmail)` lives in `auth.ts`, because it needs
`supabaseAdmin`.

1. **Validation:** trim, lower-case, reject empty (`missing_email`), reject malformed
   (`invalid_email`; one plain shape check, `x@y.z` without whitespace, no library). The empty case
   is refused whether or not an address exists, which is how "change but not remove" is enforced
   (proposal Assumption 3).
2. **Identity:** `current.context.profileId` must be non-null. The household account is refused
   (`PermissionDeniedError`, the same as other resident-only paths). The account is always
   `current.context.accountId`. No id is taken from the form.
3. **In `withSessionContext`:**
   - `SELECT account … FOR UPDATE` (this serializes against a concurrent change of the same
     account, and against D5's redemption, which locks the same row);
   - if the address is unchanged, return without writing or auditing;
   - `auth.admin.updateUserById(accountId, { email, email_confirm: true })`. `email_confirm: true`
     follows identity.md provider rule 2: the provider's flag is a technical precondition, and
     `email_verified_at` stays the sole delivery authority;
   - on the provider's `email_exists` (and any 422 duplicate shape), throw `email_taken`;
   - `UPDATE account SET email = …` with `email_verified_at = null`, and record
     `account.email_changed`.
4. **A failed commit after a successful provider update** leaves Auth ahead of `account.email`.
   D1 makes sign-in immune to that. E1 would show the old address, and saving again repairs it.
   Accepted and documented rather than compensated: the compensation would itself be a second
   provider call that can fail.

**Enumeration:** `email_taken` tells a *signed-in resident* that some account uses the address.
The message names nobody (spec). The same fact is already observable at the provider's own sign-up
endpoints, and our join route is rate-limited. Accepted.

### D3 — The join path puts a supplied email into Auth

**Pre-mortem fix, 2026-09-24: purpose before shape.** `joinHousehold` reads
`resolved.boundResidentProfile` to decide neutral versus bound. A reset link *also* resolves with
a bound profile, so without a check the join path would treat it as an invitation and fail at
`createUser`: the derived address of an existing profile is already registered. The error would
not be `invalid_link` (FR-2.8). So `joinHousehold` refuses `resolved.purpose !== 'join'` as
`invalid_link` **immediately after resolving**, before the bound/neutral split. The join page
switches on `purpose` before `bound` for the same reason.

`joinHousehold` creates the Auth user with the supplied address when one is given, and with the
derived address otherwise. `account.email` keeps storing the supplied address, as now.
- `createUser`'s `email_exists` becomes a new `JoinErrorCode` `email_taken`. It is thrown before
  anything is committed, so the link's use rolls back with the rest (the existing "spent only by a
  join that completes" rule).
- The join form maps it to a message that keeps name and email typed and never the password (the
  existing "keeps what was typed" rule).
- The bound-link retry hazard in the plan's *known latent issue* is unchanged for the derived case
  and does not arise for a supplied address.

### D4 — A link gets a `purpose`; a reset link is a bound link to an active profile without an email

Migration `0019`:
- enum `join_code_purpose` (`join`, `password_reset`);
- `join_code_issuance.purpose join_code_purpose NOT NULL DEFAULT 'join'`, so existing rows are
  joining links;
- `CHECK (purpose = 'join' OR resident_profile_id IS NOT NULL)`. A reset link always names
  someone, and this holds in raw SQL too.

**`resolve_join_code(text)`** keeps its signature and adds one output column, `purpose`. So it is
DROP IF EXISTS + CREATE (a `RETURNS TABLE` shape can't change under `CREATE OR REPLACE`,
`drizzle/0015`'s lesson). Its validity predicate becomes:

```
AND (
  (jci.purpose = 'join' AND (jci.resident_profile_id IS NULL OR (rp.id IS NOT NULL AND rp.status = 'prepared')))
  OR
  (jci.purpose = 'password_reset' AND rp.id IS NOT NULL AND rp.status = 'active'
     AND EXISTS (SELECT 1 FROM membership m JOIN account a
                   ON a.id = m.account_id AND a.household_id = jci.household_id
                 WHERE m.resident_profile_id = rp.id AND m.household_id = jci.household_id
                   AND m.revoked_at IS NULL AND a.email IS NULL))
)
```

Every join carries its own `household_id` predicate (CLAUDE.md, *A SECURITY DEFINER function*).
There are no foreign keys, so a corrupt membership or account row pointing across households must
not make a reset link valid.

**`claim_join_code(p_code text, p_purpose join_code_purpose)`**: the **caller states which purpose
it redeems**. The conditional `UPDATE` matches only that purpose, with the same predicate as above.
So `joinHousehold` can never spend a reset link, `redeemPasswordReset` can never spend a joining
link, and neither needs a rollback to find out. The migration drops **both** `claim_join_code(text)`
and `claim_join_code(text, join_code_purpose)` before the create. Otherwise the old one-argument
overload would survive beside the new one, still callable and still ignoring purpose.
`claimJoinCode`/`claimJoinCodeTx` gain the parameter.

**Earlier justification, repeated against the wider shape** (config rule; join-by-link design
Decision 13 and the PR #17 review). The functions were justified as disclosing at most a household
name and, for a bound link, the display name of a *prepared* profile of the same household, to
anyone holding a live code.

The new shape discloses:
- `purpose`, which only says what the holder's own code is for;
- for a reset link, the display name of an *active* profile.

The holder was given that code to reset exactly that person's password, so the name is the
greeting A3 shows (spec). No email, account id or status is returned: `a.email IS NULL` is a
predicate, never an output. A code that fails any predicate returns nothing, indistinguishably
(FR-2.8).

**Why not a separate table:** see proposal Assumption 4. The route's attempt limit, hand entry,
single refusal and O16 history all come along with the table.

### D5 — Redeeming a reset link

`redeemPasswordReset(code, { password }, { rememberMe })` in `auth.ts` mirrors `joinHousehold`'s
bound branch.

1. **Before anything:** validate the password (`missing_fields`, `password_too_short`, the same
   rule as join).
2. **`resolveJoinCode(code)`:** the route already recorded the attempt. It must return
   `purpose = 'password_reset'`, otherwise `invalid_link`.
3. **One transaction in the household's context:**
   1. `claimJoinCodeTx(tx, code, 'password_reset')`: no row means `invalid_link`;
   2. `SELECT membership … FOR UPDATE`, then `SELECT account … FOR UPDATE`. Re-check that the
      membership is not revoked, the profile is `active` and `account.email IS NULL`, and treat
      anything else as `invalid_link`. The locks are the serialization against D2 (an email being
      added right now) and against removal (which locks membership). The re-check makes the SQL
      predicate's snapshot irrelevant;
   3. revoke **every** session of the account (`revoked_at IS NULL` filter);
   4. record `account.password_reset_by_admin`: subject `resident_profile`/profile id, actor
      account = the issuance's `created_by_account_id` (the reset is the administration's act; the
      redeemer only completes it), actor profile null, empty payload;
   5. `auth.admin.updateUserById(accountId, { password })`. A failure throws, and the whole
      transaction rolls back, including the claim, so the link is not spent;
   6. `signInWithPassword` with the account's current Auth email (D1's lookup), then
      `insertSessionTx` with `rememberMe`.
4. **Commit.**

**Commit failure after step 5:** the password is already changed, while the sessions are
unrevoked and the link unspent. The link stays valid and a retry repeats everything. The person
already knows the new password. The window is one commit; accepted and documented, as in D2.

**Lock order:** `joinHousehold`'s bound branch locks `resident_profile`. Removal locks
`resident_profile` → `membership` → `session`. This function takes `membership` → `account`, then
updates `session`, and never locks `resident_profile`. `signIn` locks only `membership`. D2 locks
only `account`. No path takes these in reverse, so no deadlock.

### D6 — Issuing a reset link

`issuePasswordResetLink(context, actingAccountId, residentProfileId)` in `repository.ts`:
- `assertIsAdministration` (household account only, proposal Assumption 5);
- in one transaction, check that the profile is in this household and `active`, that its
  membership is live and that its account's `email IS NULL`. Otherwise
  `ResidentProfileNotEligibleForResetError`, one class and no distinguishable reason (the
  `issueJoinCodeTx` precedent);
- then `issueJoinCodeTx` with `purpose: 'password_reset'`, forced `maxUses = 1` and 7 days'
  validity, with the existing `household.join_code_issued` event.

**What serializes the check-then-insert: nothing, deliberately.** An email added right after the
check makes the link dead at resolve and at claim (D4, D5). The rule lives where the link is
judged, like PR #17's bound-link fix. A stale link costs nothing.

`issueJoinCodeTx`'s own check: for `purpose = 'join'` with a profile it keeps demanding `prepared`.
For `password_reset` it does not re-check, because the public caller above has done so. Its warning
comment gains one line. `issueJoinCode` (the moderator-capable public path) refuses
`purpose: 'password_reset'`: that option is not in its options type at all, so the only way to mint
a reset link is D6.

### D7 — Password change on E1

`changeResidentPassword(current: CurrentSession, currentPassword, newPassword)` in `auth.ts`:
- resident-only, as in D2;
- validate the new password with the join rule;
- check the current password by calling `signInWithPassword` with the provider's current address
  (D1's lookup). The provider session it returns is discarded, as `signIn` already does on refusal.
  A failure is `wrong_current_password`;
- then `updateUserById(accountId, { password })`;
- then, in a transaction, revoke every session of the account except `current.sessionId`
  (`id <> current.sessionId AND revoked_at IS NULL`), and record `account.password_changed`.

**Order:** provider first, sessions second. If the revoke fails after the provider change, the
password is changed and other devices stay signed in until the resident retries. That is the
benign direction; the reverse order could end sessions for a password that never changed.

**No lock needed:** a concurrent sign-in elsewhere after the revoke is a sign-in with the new
password, which is legitimate.

`/token` rate limit: one extra `signInWithPassword` per change. Tests must pace (plan *Working
tips*).

### D8 — E1's screen, and O16's reset row action

**`/account`** (`src/app/(resident)/account/`): three sections as cards in the design-system
style, each form a `useActionState` reducer with the state `{ error, saved }`. No typed value
survives into state: `next dev` prints previous state, which is change 3's lesson 1.
- **„E-Mail"**: the current address if any (the resident's own, read through a new
  `getOwnAccountEmail(context)`). Otherwise the pitch plus the EC-2.6 sentence. One field.
- **„Passwort ändern"**: current password, new password, the rule beside it.
- **„Abmelden"**: reuses the existing sign-out action.

The four states: `loading.tsx` exists; **Leer** = no address set (the pitch); **Fehler** = the
form error plus the `(resident)/error.tsx` boundary; **Keine Berechtigung** = a household session
reaching `/account`, which is refused with a link to `/settings`. The `(resident)` layout already
routes household sessions away, so this is the fallback, stated rather than assumed.

**O16** (`src/app/(org)/members/`):
- `getResidentList` gains `hasEmail: boolean` per row. The administration learns **whether**,
  never **which** address (data minimisation);
- rows that are active, live and `!hasEmail` get „Passwort-Link erstellen", for household sessions
  only;
- issuing reveals the link with the existing copy buttons, plus the E-03/K-18 sentence (spec);
- in the link history, `listJoinCodeIssuances` returns `purpose`, and a reset row is labelled
  „Passwort-Link für <Name>" instead of an invitation;
- the „Löschen" and „+7 Tage" actions work unchanged.

**A3** (`/join/[code]`): a third screen shape, `reset`, when `purpose = 'password_reset'`:
greeting, one password field, remember-me, and a submit calling the reset action. Refusals use the
existing single invalid-link state.
- **The attempt is recorded on page load and on submit**, exactly as the join action records it
  today. The submit is a redemption, and FR-2.28 limits redemptions, not only views.
- **A visitor already signed in** (the household account opening the link to check it, say) has
  their current session revoked through `revokeSession`, own session only, before the new cookie
  is set. Otherwise the overwritten cookie would leave a valid, orphaned session row behind.
  Pre-mortem fix, 2026-09-24.

**Sign-in** (`src/app/(auth)/sign-in/`), revised in the walkthrough (human decision 2026-09-24):
- A hint on the household tab was confusing, so it is gone.
- Instead, the **resident tab** switches between household + name and „Mit E-Mail-Adresse
  anmelden".
- That switch posts a new `signIn` kind, `resident_email`. It uses the same address lookup as the
  household path, but refuses a non-resident membership as `invalid_credentials` after the
  membership lock. So the tab still decides the identity (ADR-013), and the household account's
  address on the resident tab never opens a household session.
- The household tab still accepts a resident's address. Its behaviour is unchanged; the tab just
  doesn't mention it.
- Test: `tests/integration/policy/sign-in-resident-email.test.ts`.

### D9 — Audit and inventory

- `PAYLOAD_ALLOWLIST` gains `account.email_changed: []`, `account.password_changed: []` and
  `account.password_reset_by_admin: []`.
- `data-inventory.yml` `account.email.purpose` becomes „Anmeldeadresse; bei Resident-Accounts
  abgeleitet/nicht zustellbar, bis eine eigene Adresse hinterlegt ist (dann beim Anbieter
  gespeichert, unbestätigt)". The class stays 🟠.
- The `account.email` schema comment is corrected.

### D10 — Docs

- **`domain/identity.md` §2.1:**
  - provider box: the sentence *„steht sie neben der abgeleiteten Kennung"* becomes "ersetzt sie
    beim Anbieter", with the sign-in consequence;
  - O-12 box: add that a resident **with** an email may also sign in with it;
  - O-16 box: the reset is performed **by link**, only while no email is set, with the same event
    and session consequences.
- **`backlog/requirements/F2-requirements.md` EC-2.6:** corrected to the K-18 behaviour, citing the
  register.
- **`review-log.md` §Offene-Punkte-Register:** one entry covering the four human decisions of
  2026-09-24:
  - Auth switch plus email sign-in;
  - no removal of the address;
  - reset by link, with a household-account-only issuer;
  - the EC-2.6 correction.
- **`docs/SPEC-INDEX.md`:** check for rows on O-16 and O-12, and add a row only if the topic has
  none.
- Run `node tools/check-refs.ts` afterwards.
- `docs/` never cites `openspec/` (Rule 7).

## Invariants and every path to them

| Invariant | Paths that reach it | Where enforced |
|---|---|---|
| A reset link works only for an active, live profile without an email, in its own household | `resolve_join_code`, `claim_join_code` (SECURITY DEFINER, unauthenticated); `redeemPasswordReset`; raw SQL as app_runtime; a concurrent D2 email add; a concurrent removal | SQL predicate with a household predicate on every join (D4); re-check under `membership`+`account` `FOR UPDATE` (D5); RLS for app_runtime (household isolation only, so raw in-household SQL can mint a row; the SQL predicate still refuses it at redemption unless it satisfies the predicate) |
| A reset link always names a profile | `issueJoinCodeTx`; raw SQL insert | `CHECK` constraint (D4) |
| A joining link is never spent by the reset path, and vice versa | `claim_join_code`; the old one-argument overload | `p_purpose` in the `UPDATE`'s `WHERE`; both overloads dropped (D4) |
| Only the household account issues reset links | `issuePasswordResetLink`; `issueJoinCode` (moderator-capable) | `assertIsAdministration`; `issueJoinCode`'s options type has no purpose (D6) |
| Settings act on the session's own account | `changeResidentEmail`, `changeResidentPassword`, `getOwnAccountEmail` | account id taken only from `CurrentSession.context`; resident-only check; `authorization-matrix.test.ts` exemption states "self-service, own account only" |
| A password change or reset ends the sessions O-13/O-16 name | D5, D7 | revoke inside the same function; tests assert `revoked_at` on each session, and that the kept session is kept |
| No address or code in an audit payload | three new events | allowlist with empty key sets (G-D7) |
| Resident email sign-in acts as the profile, never the household | `signIn` email path | the unchanged membership → `acting_profile_id` logic; a G-D14-style test |

## Risks / Trade-offs

- **Two systems, no two-phase commit** (D2, D5, D7): each case picks its benign direction and
  says so. D1 removes the one divergence that would lock someone out.
- **Supabase `/token` 429 in tests:** each password test signs in several times. Keep test files
  small and serial, and follow the plan's pacing tip.
- **Moderator-issued resets are excluded** by reading O-16 literally. If a household has no one who
  knows the household-account credentials, nobody can issue one. That is the K-18 trade-off as
  written.
- **No removal of the address:** see proposal Assumption 3.

## Migration Plan

`drizzle/0019_join_code_purpose.sql`:
1. enum type, created inside `DO … EXCEPTION WHEN duplicate_object`;
2. `ADD COLUMN IF NOT EXISTS purpose`;
3. `DROP CONSTRAINT IF EXISTS` + `ADD CONSTRAINT` for the check;
4. `DROP FUNCTION IF EXISTS resolve_join_code(text)` + `CREATE`;
5. `DROP FUNCTION IF EXISTS claim_join_code(text)` and `claim_join_code(text, join_code_purpose)`
   + `CREATE`;
6. `REVOKE`/`GRANT` as in 0015.

**Statement order against the live constraints:** the column arrives with its default before the
`CHECK`, so existing rows satisfy it (`purpose = 'join'`). The functions come last, so neither
exists in a shape referencing a missing column.

**Hand-off:** the agent applies steps 1–3. Steps 4–6 are the human's (`SECURITY DEFINER`); the
human runs the **whole file**, which is why every step is re-runnable. The applier then verifies
through `pg_proc` that:
- `claim_join_code` exists exactly once, with two arguments;
- `resolve_join_code` returns `purpose`;

and **stops** if either is not true.

**Rollback:** re-run 0015's function bodies, then drop the constraint, the column and the type.

## Open Questions

None blocking. Wording of the E1 pitch, the O16 caution and the sign-in hint are finalised in
`de.ts` and judged in the walkthrough.
