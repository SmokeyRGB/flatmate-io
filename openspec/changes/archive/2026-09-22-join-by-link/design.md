# Design

## Context

See proposal.md — Why. What matters for the approach is what is already built and what shape it
left behind.

`join-code-protections` shipped the whole server side of a link's life. Two `SECURITY DEFINER`
functions in `drizzle/0013_join_code_issuance.sql` are what this change calls:
`resolve_join_code(text)` is `STABLE` and non-consuming, `claim_join_code(text)` is one conditional
`UPDATE … RETURNING` that decides and counts in a single statement. Both return the same three
columns and `null` for every refusal, so no caller can branch on a reason (FR-2.8). Both compare
`jci.code = p_code` **exactly** — nothing normalises anything today.

The identity module has two compensating-undo pairs already
(`registerHousehold`/`undoRegisterHousehold`, `claimResidentProfile`/`undoClaimResidentProfile`).
Both exist because the same ordering problem bites twice: `signIn` needs a committed Supabase Auth
user, so the Auth user cannot be created after the database transaction, and the database
transaction has therefore already committed by the time session setup can fail.

Three constraints shape everything below. There are **no foreign keys** in this schema (the
two-Supabase-project split), so nothing cascades and every orphan is somebody's explicit `DELETE`.
`withSessionContext` needs a `householdId` before it can open a transaction at all, which is why
the pre-session lookups go through `SECURITY DEFINER` functions rather than the ORM. And an
`AFTER INSERT` trigger on `membership` (`drizzle/0010`, `0012`) adds every new member to each open
round — EC-2.2 is already implemented, and it means a membership insert has side effects in another
module's tables.

## Goals / Non-Goals

**Goals:**

- One transaction for everything a join creates, so that a failure has nothing to compensate.
- The attempt limit is structurally before the code lookup, not merely earlier in the file.
- The code has exactly two ways in — a path segment and a request body — and no third.
- `signIn` keeps working unchanged for the two callers that already use it.

**Non-Goals:**

- Screen A3. Its four mandatory states (G-N6), the manual code-entry screen and the invalid-link
  recovery wording are change 3; this change's route is functional and plain (proposal Assumption 6).
- A general-purpose rate limiter. One route needs one limit; a reusable abstraction over a single
  call site is speculation.
- Changing screen A2. `signIn` gains a parameter; the sign-in form does not gain a checkbox
  (proposal Assumption 8).
- Email verification. FR-2.15/FR-2.17 need a settings path this slice has no screen for; what is in
  scope is that an unverified address blocks nothing, which it already does.

## Decisions

### 1 · The order of operations, and what each step can cost

```
1  rate limit            record the attempt, refuse if over        → "too many attempts"
2  normalise             upper-case, strip whitespace and hyphen
3  resolve               resolve_join_code, non-consuming          → "link not valid"
4  validate              name present, password present and long enough
5  collision check       display name free in this household       → "name already taken"
6  create Auth user      supabaseAdmin().auth.admin.createUser
7  sign in               signInWithPassword → access token
8  ONE transaction       claim_join_code · resident_profile · account · membership ·
                         activity_event · session                  → "link not valid" if the
                                                                      claim returns nothing
9  set cookie            lifetime from the checkbox
```

Steps 1–5 cost nothing and are ordered so the ordinary refusals — over the limit, dead link, taken
name — happen before anything external is touched. Step 3 is what FR-2.9 needs anyway (the
household's name before any field), so it is not an extra round trip.

Step 8 re-checks the link at submit, which is EC-2.9: a link deleted between opening the page and
pressing the button is refused there, with the same single message.

**Alternative rejected:** mirroring `registerHousehold`'s shape — transaction, then `signIn`, then
compensate on failure. It would need a full `undoJoinHousehold` deleting membership, account,
profile **and** the `round_participation` rows the auto-join trigger wrote in another module's
table, which is precisely the orphan class this project has been bitten by twice. Signing in before
the transaction and inserting the session row inside it removes the window instead of cleaning up
after it.

### 2 · The claim runs inside the join transaction

`claim_join_code` runs at step 8, as `tx.execute` within the same transaction as the inserts, not as
a standalone call before them.

The plan this change comes from framed the question as a choice: give a spent use back and reopen
the race EC-2.1 closed, or keep it spent and burn a single-use invitation on a transient error.
Inside the transaction there is no half-spent state to arbitrate. A failure rolls the increment back
with the rows, and the count is still never decremented — a failed attempt never increments it.

EC-2.1 survives intact, because it never depended on the statement standing alone. Two writers
contending for the same row serialise on it: the loser blocks until the winner commits, then
re-evaluates `uses < max_uses` against the committed row and matches nothing. That is exactly what
change 1's Decision 1 relied on; the only difference is how long the lock is held — now for the
handful of inserts that follow, all local, with no external call inside the transaction.

**This needs a `Tx`-scoped variant, `claimJoinCodeTx(tx, code)`, in `repository.ts`**, alongside the
existing `claimJoinCode`. It becomes the **second exported `*Tx` primitive** in the codebase, after
`issueJoinCodeTx`, and it carries the same kind of warning comment — with the opposite content.
`issueJoinCodeTx` warns that it performs no authorization and must not be reached from a request;
`claimJoinCodeTx` performs none either, and that is correct — a stranger presenting a code is its
entire purpose, and the control on it is the rate limit at step 1, not an identity check. The
comment says which, so the next reader does not "fix" it by adding an assert.

`claimJoinCode` (the non-`Tx` one) stays. Its only callers are the three join-code tests, and two of
them need it: `join-code-atomicity.test.ts` races concurrent claims against each other, which is
precisely the standalone statement. It is not a second production door — after this change nothing
under `src/` calls it, and a task should say so in its comment so that fact is checkable rather than
inferred.

### 3 · The attempt limit: one table, one function, hashed source, sliding window

**Table `join_attempt`** — `id`, `source_hash text not null`, `attempted_at timestamptz not null
default now()`, plus an index on `(source_hash, attempted_at)`. Deliberately **no `household_id`**:
EC-2.14 says the limit is on the route because *"a guess is tested against every live link at
once"*, and a per-household limit would divide by exactly the number the attack multiplies by.

That makes it the first table in this codebase with no tenant, so the usual RLS policy has nothing
to key on. It gets **RLS enabled and zero policies** — which denies everything under `app_runtime` —
and one `SECURITY DEFINER` function as its only door. A table nothing can read and nothing can
write except through one audited function is a stronger statement than a policy that would have to
invent a tenant for a row that has none.

**Function `record_join_attempt(p_source_hash text, p_window_seconds int, p_limit int) RETURNS
boolean`** — `SECURITY DEFINER`, `VOLATILE`, `SET search_path = public`. It prunes rows older than
the retention, inserts the attempt, counts the source's attempts inside the window, and returns
whether the attempt is allowed. Every attempt is recorded, **including refused ones**, so a source
that keeps hammering keeps its window full rather than getting a fresh burst each time the oldest
row rolls off.

**The key is an HMAC of the client IP**, taken from `x-forwarded-for` (first entry) or `x-real-ip`,
using the existing `SESSION_TOKEN_HASH_SECRET` with a `join-attempt:` domain-separation prefix on
the message. A new environment variable was the alternative; it buys key separation that the prefix
already provides and costs a deployment step in every environment including each developer's, which
is friction on the only route where failing closed means the join path is down.

**Where no IP can be determined, the attempt goes into one shared bucket** rather than being
exempted. Failing open on a missing header would make the limit optional for anyone who can omit it.

**Window 15 minutes, limit 20 attempts.** No authoritative source names a number, so the reasoning
is recorded rather than the number alone. The generous end is set by legitimate traffic: several
flatmates behind one carrier NAT, each opening a link more than once, plus a hand-typed code
mistyped a few times — 20 in a quarter of an hour does not reach them. The strict end only has to
make FR-2.28's arithmetic hopeless, and it does with several orders of magnitude to spare: a
ten-character code over a 32-character alphabet is ~1.1 × 10^15 codes, and even against 10,000 live
links at once, 20 guesses per 15 minutes is roughly 10^8 days of guessing.

**Retention: attempts older than 24 hours are deleted**, by the same function on each call. The
table stays small enough for that to be cheap, and a pruning rule that runs as a side effect of the
only write path cannot rot the way a scheduled job that nobody scheduled does. `data-inventory.yml`
gets `source_hash` as 🟠 with that retention — it is a pseudonymised network identifier about a
visitor, and pretending a hash of an IP is not personal data is the sort of silent default G-F1
exists to forbid.

### 4 · Normalisation is a pure function, and it folds nothing it cannot fold back

`normalizeJoinCode(input)`: upper-case, remove every whitespace character and every `-`, then
re-insert the hyphen between the two groups of five so the result matches the stored shape exactly.
Applied inside `resolveJoinCode`/`claimJoinCodeTx` in `repository.ts`, so both entry paths — the
URL and the form body — normalise identically and no call site can forget.

It is **injective over the issued alphabet**: `JOIN_CODE_ALPHABET` is upper-case letters and digits
2–9 with no hyphen and no whitespace, so upper-casing and stripping separators cannot map two
distinct issued codes onto one another. That is what the spec's second normalisation scenario asks
for.

**No confusable-character folding.** The obvious idea — map `0`→`O`, `1`→`I` — has nothing to map
to: the alphabet already excludes `I`, `O`, `0` and `1` precisely so the pair never arises. An input
containing one of them matches nothing, which is correct, and inventing a mapping would break
injectivity for no gain.

An input of the wrong length is not an error. It is normalised, looked up, and matches nothing —
FR-2.8's single refusal, not an exception. A `throw` here would be a second observable outcome and
would tell a caller that the code was at least *shaped* right.

### 5 · `remember_me` reaches the session row and the cookie together

`signIn` gains a second parameter, `options: { rememberMe?: boolean } = {}`, defaulting to `true`;
registration and claim change not at all. The session row stores the flag and an `expires_at` of 90
days or 12 hours. `setSessionCookie` gains a `maxAge` argument so the cookie never outlives the row
it points at.

EC-2.10 is explicit that the cleared case is a **short server-side lifetime**, not a session cookie:
*"a session cookie has no server-side expiry, so closing the browser would discard the cookie while
leaving the session row valid for anyone holding the token."* The row is the thing that expires; the
cookie merely stops being sent.

`joinHousehold` inserts its own session row rather than calling `signIn` (it is already inside the
transaction at that point), so the row-building lines move into a small file-private
`insertSessionTx` that both use. One place decides what a session row looks like, which is what
G-D14 depends on: `acting_profile_id` is set once, at creation, and never written again.

### 6 · The household name is a second step of registration, and it is client-side

`registerHousehold(email, password, name)` — required, trimmed, non-empty, with a new
`RegistrationErrorCode` value. Every existing call site changes; most of them go through
`tests/helpers/identity.ts`.

Making it required rather than optional-with-a-default is the point: a default is how
`name: "WG"` got there. There is no screen anywhere in `docs/screens/` where a household name can
be edited afterwards, so if registration does not capture it, nothing ever will.

**The step is a step of the register form, not a route of its own, and nothing is persisted between
the two.** Human decision 2026-09-22 asked for a screen after email and password — *„Wie soll dein
Haushalt heißen?"* — and there are three ways to build that:

- **A second route reached after registration commits.** Rejected: the household row would have to
  exist with no name until the person finishes, which means either a nullable column or a
  placeholder — and a placeholder is exactly how `"WG"` got there. It also invents a state where a
  household can be abandoned half-named.
- **A second route reached before registration commits.** Rejected: email and password would have
  to survive the navigation, so the password would be held somewhere between the two screens. Not
  for a field this cheap.
- **A second step of the same form, revealed client-side, submitting once.** Chosen. The password
  leaves the browser exactly once, there is no intermediate state to abandon, `registerHousehold`
  stays a single call with the name required, and no route guard has to be invented.

Its field carries an example rather than an empty box — *„z. B. WG Hauptstraße 12"* — because the
name's whole job is to be recognised by somebody opening a join link, and *„WG"* is what people
type when a field does not suggest otherwise.

The **back** direction matters as much as the forward one: the step can be left to correct the
email or the password without losing what was typed, because it is one form and both steps are in
it.

This keeps A1 itself at exactly the two fields `screens/A-zugang.md` describes — proposal
Assumption 5 reports the undescribed step rather than resolving it.

### 7 · Joining grants no permissions

A link-joiner gets `role: "member"` and `permissions: []`. Nothing is inferred from being first,
from the link used, or from anything else about the arrival.

A join is performed by whoever holds a link, and R-2.2 is the risk that a link leaves the flat.
Deriving any procedural power from an arrival would hand it to an accident of timing. Nothing is
stranded by withholding it: `household_admin` implicitly holds every permission (C-1.4), so a
household always has somebody who can close a round, and a permission can be granted afterwards.

Decision 12 removes the one place this codebase did infer a permission from an arrival, so after
task group 1 there is no longer an exception for this decision to be an exception to.

### 8 · One audit event type, empty payload

`membership.joined`, registered in `PAYLOAD_ALLOWLIST` with `[]` — an unregistered type makes
`recordActivityEvent` throw, which is the mechanism, not an inconvenience. `subject_type` is
`resident_profile` and `subject_id` the new profile, because AC-2.19 asks that the record *"names
the new profile and the time of joining"*; `actor_account_id`/`actor_profile_id` are the joiner's
own. `registerHousehold` already writes an event whose `subject_type` differs from its type's
prefix, so this is the existing shape rather than a new one.

The issuance is **not** in the payload. `membership.joined_via_issuance_id` is the link between join
and issuance and it is a column, not an event field; a second copy would be a second thing to redact
(G-D8) for no added answer. The code, of course, never appears anywhere near it (G-A5).

### 9 · Already a member, or a member elsewhere

The route reads `getCurrentSession()` before anything else that costs.

- **A session for this household** — resident or household account — means the visitor already
  belongs here. No second identity is created; they are redirected to Start with a note (EC-2.4).
  The household-account case is not in EC-2.4's wording, which speaks of a *resident*, but the
  outcome is the same one ADR-013 already requires: the household account never occupies a profile,
  and somebody wanting a resident profile takes A1's separate step rather than a join link.
- **A session for a different household** is refused with its own explanation (EC-2.5, A-2.4). It is
  deliberately **not** the invalid-link message: the link is fine, and sending them to ask a
  flatmate for a working one would be a lie.
- **No session** is the ordinary path.

The note on Start is carried as a query parameter. No code is involved, so G-A5 has nothing to say
about it.

### 10 · Route shape, and how the manual path is already served

`src/app/(auth)/join/[code]/page.tsx` plus `actions.ts`, inside the existing public `(auth)` route
group. The page is a server component: it rate-limits, resolves, and renders either the household
name with the form or the single refusal. The action is the `useActionState` reducer shape the
project already uses — validate up front, `return { error }` for known domain failures, re-throw
everything else, `redirect()` outside the `try` because Next implements it by throwing.

The code is a **hidden field in the form body**, not a query parameter and not a cookie. That is
G-A5's own list of permitted paths, and it is also what makes FR-2.27 cheap: a manual-entry screen
is a form that posts a typed code to this same action, so change 3 adds a screen and no backend.

### 11 · Password requirements are stated, not discovered

Supabase Auth rejects a short password with its own English message, which would reach the resident
as the generic failure string and tell them nothing — exactly AC-2.20's complaint. The form
validates the length itself, before the Auth call, and the field says what it requires. The number
stated is the one actually enforced by the project's Auth settings; no stricter rule is invented
here, because no requirement asks for one.

### 12 · `close_round` becomes a role default, and `isFoundingResident` goes

**Human decision, 2026-09-22.** Not join work, and folded into this change at the user's direction
rather than given its own branch; task group 1 runs first.

Today `claimResidentProfile` grants the **first** resident membership `close_round`
(`auth.ts:260`). That implements F1-requirements.md §8 item 1, which left the default unspecified
and recommended *"the household account's own resident profile holds it initially, and it is
grantable from there"* — approximating *the household account's own profile* as *the first resident
membership*, on A-1.2 (*the person registering almost always also lives there*).

Two things are wrong with it. The approximation diverges from what §8 said whenever a flatmate
claims a prepared profile before the administrator claims theirs — then a flatmate holds round
control and the registering person does not. And it leaves one profile silently holding a permission
its peers do not, which is not discoverable from any screen.

**The fix is the `manage_rooms` precedent, not a new model.** `domain/identity.md` §2.1 already
records one permission with a role default — *„Vorbelegt bei `household_admin` **und**
`moderator`"* (P-O-10, 2026-09-14, i.e. decided *after* S-04). `close_round` gets the same
treatment, `MODERATOR_DEFAULT_PERMISSIONS` gains its second entry, and the `isFoundingResident`
lookup and branch are deleted. Appointing a profile moderator is then what grants round control —
which is also the thing a person can see and reason about.

**Rejected: role-derived permission sets** (admin / moderator / resident each carrying a fixed set).
That is `Berechtigungsvorlagen`, which **S-04** names in its own out-of-scope column
(`02-SRD.md` §5.3 Scope, the table's own out-of-scope column), and `02-SRD.md` sits at
precedence level 2. It would also need an answer for the
case E-04 uses to justify the orthogonality in the first place — *„Deckt Moderator, Bewohnender,
Verwaltung und den **Vermieter-Fall** ohne Sonderlogik ab"*: a landlord moderating a flat they do
not live in is `is_resident = false, role = moderator`. Collapsing to three roles drops the second
axis that PRD §4.0.1's five groups rest on. If that model is wanted, it is an S-04 challenge in the
repo's ADR shape, not a decision taken inside a change.

**Abandonment condition, carried in the note itself.** `manage_rooms` was one named default;
`close_round` makes two. A growing list of `vorbelegt` entries eventually *is* the template system
S-04 excludes — the difference is currently one of degree. The **third** such default is where S-04
must be reopened properly rather than stretched again, and the note in `domain/identity.md` says so,
so the next person meets the limit rather than the trend.

### 13 · A join link may be bound to a prepared profile, and claiming happens only through one

**Human decision, 2026-09-22**, taken after the rest of this change was applied.

`JoinCodeIssuance` gains a nullable `resident_profile_id`. That one column splits the link into two
kinds, and nothing else about the entity changes:

- **null — a neutral link.** Redeeming it *creates* a resident profile. This is what the rest of
  this change already built.
- **set — a bound link.** Redeeming it *claims* the prepared profile it names. The visitor is
  greeted by name — *„Hi Sam! Du wurdest eingeladen, der Demo-WG beizutreten."* — and asked only
  for a password, because the name is not theirs to choose.

**`/claim` is deleted**, and with it the last path that let a prepared profile be taken over without
a link. Administration prepares a profile and issues an invitation for it; the person opens the
link. There is no longer a way to become a resident without one.

**Why this is the security fix and not merely a feature.** Claiming used to need no secret at all:
`claimResidentProfile` takes whatever password is typed and *creates* the account with it, and
C-1.4 says the household id is *„keine Sicherheitsgrenze, nur Zuordnung"*. So a household id plus a
prepared display name was enough to become that person. Folding the claim into sign-in — the
shape first proposed — would have inherited that and moved it onto the screen everyone lands on,
where a mistyped name could silently claim a profile prepared for somebody else, and where a
prepared name logging in while an unknown one errored would undo the message convergence change 0
made deliberately. A bound link removes the input that carried the risk: the name is displayed,
never typed, and the link is the control C-2.4 already says it is.

**This is the shape S-42 needs in v0.2.** `screens/A-zugang.md` A4 describes redeeming an
`ApplicationInviteToken` as *„Gleicher Registrierungsablauf wie A3 (Name + Passwort)"* from a
one-time link that resolves to a known person. A bound join link is that mechanism, built a version
early against a `ResidentProfile` instead of an `Application`. It is deliberately **not** the same
entity — G-D12 guards the v0.2 token and stays pending, unimplemented, untouched.

**Refusals stay single, for both kinds** (human decision). A4 does the opposite on purpose —
*„Die drei Fehlertexte unterscheiden sich bewusst"*, because „schon benutzt" and „abgelaufen" lead
to different next steps. FR-2.8 wins here anyway: one message, no reason, for a bound link exactly
as for a neutral one. Recorded as a choice rather than an oversight, because the divergence from A4
will look like a defect to whoever builds S-42 otherwise.

An already-claimed bound link **needs no new state**: it is issued with `max_uses: 1`, so the claim
spends it and every later attempt meets the ordinary used-up refusal. No `status`, no second check.

**FR-2.10 asks for two fields; a bound link asks one.** That is fewer, not more, so it does not run
into C-2.1, whose concern is a third field being added. It serves S-03's shortest-path intent
rather than straining it. Recorded because "the form has one field" will otherwise read as a
requirement violation on inspection.

**What moves where.** `resolve_join_code` and `claim_join_code` must return the bound profile's id
and display name, so both are replaced — expect the same `SECURITY DEFINER` hand-off refusal that
`drizzle/0014` hit. `joinHousehold` branches once on the binding: bound activates the named profile,
neutral inserts a new one; everything after that point — account, membership, audit, session — is
identical. `claimResidentProfile`'s logic folds into the bound branch, and its three test files are
rewritten against the new path rather than deleted (G-G1): the behaviour they protect still exists.

## Risks / Trade-offs

- **A legitimate household shares one NAT and hits the limit** → 20 attempts per 15 minutes is set
  well above plausible legitimate traffic, every attempt is counted per source rather than per link,
  and the refusal says what happened and that waiting helps, rather than claiming the link is dead.
- **The issuance row is locked for the length of the join transaction** → the transaction contains
  only local inserts; the two external calls (Auth user, sign-in) happen before it opens. A
  competitor waits milliseconds and then gets a correct answer, rather than a fast wrong one.
- **`main` briefly carries a join screen that does not meet G-N6** → named in proposal Assumption 6
  and closed by change 3, which is the next change. The alternative — holding the backend until the
  screen is designed — would leave FR-2.28 unshipped while the short code is already live, which is
  the thing C-2.12 forbids.
- **A hashed IP is still personal data** → declared in `data-inventory.yml` as 🟠 with a 24-hour
  retention that the write path itself enforces, hashed rather than stored raw, and never logged
  (G-B3).
- **The access log is outside this application** → proposal Assumption 7. The two halves that are
  inside it — no query string, no code in any line this application logs — are tested.
- **`registerHousehold`'s signature change touches many call sites** → they are mechanical and
  mostly funnel through `tests/helpers/identity.ts`; a required parameter makes the compiler find
  every one, which an optional one would not.

## Migration Plan

One additive migration: `CREATE TABLE join_attempt`, its index, `ENABLE ROW LEVEL SECURITY` with no
policy, and `CREATE FUNCTION record_join_attempt(...)` with `REVOKE ALL … FROM PUBLIC` and
`GRANT EXECUTE … TO app_runtime`, following `drizzle/0005` and `0013`'s structure and comment style.

Nothing is dropped and nothing is rewritten, so unlike `drizzle/0013` this one rolls back cleanly:
dropping the function and the table returns the database to its previous state, at the cost of the
attempt counters, which are ephemeral by design.

**Plan the hand-off before starting.** The agent harness refused `drizzle/0013`'s steps 4–5 for both
a subagent and the planning session ("Security Weaken"), and a human applied them by hand. This
migration creates a `SECURITY DEFINER` function, so expect the same refusal and arrange for the
human to apply that statement, rather than discovering it mid-apply. The table, the index and the
RLS statement should go through normally.

## Open Questions

- **The exact password minimum to state in the field** depends on the Auth settings of the
  `flatmate-io-dev` project rather than on anything in `docs/`. Read it at implementation time and
  state that number; it changes one string, not the design.
