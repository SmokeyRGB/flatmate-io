# Proposal

## Why

O16 renders an invitation URL that leads nowhere. `join-code-protections` (change 1, PR #15) built
the whole link lifecycle — issue, extend, delete, the history, the atomic claim — and deliberately
shipped no route a stranger could reach, so `https://<host>/join/<code>` has 404'd since it merged
(that change's proposal.md Assumption 3). This change is the other side of it: the path that turns
a copied link into a resident.

It is also where an obligation change 1 carried forward comes due.
`docs/backlog/requirements/F2-requirements.md` **C-2.12**:

> The short code (FR-2.26) and the attempt limit (FR-2.28) are **one decision, not two**.
> Shortening the code is what P-1 requires; the attempt limit is what keeps the shortened code
> defensible. Shipping the first without the second would weaken the only remaining access control
> (C-2.4) rather than making it usable.

Change 1 shipped the short code on the argument that the oracle is the public redemption route and
that route did not exist yet. This change is that route. `drizzle/0013_join_code_issuance.sql`
says so in its own SQL comment, above the two functions this change calls:

> FR-2.28 (join-code-protections's change 2) MUST add an attempt limit on whatever route calls
> `claim_join_code`/`resolve_join_code` before that route goes live […] This is not a note to
> delete once change 2 ships — it is the reason change 2's rate limit is not optional.

What the packet asks for is one screen's worth of work behind it (§1 Scope):

> A resident receives one household link, registers with a name and a password, and lands on a
> screen showing the single next thing to do.

## What Changes

- **`close_round` becomes a role default, and the `isFoundingResident` branch goes.** Not join
  work — a human decision of 2026-09-22, folded into this change at the user's direction rather than
  given its own branch, and ordered first. `claimResidentProfile` grants the *first* resident
  membership `close_round`; that approximation diverges from what F1-requirements.md §8 recommended
  whenever a flatmate claims before the administrator does, and it leaves one profile silently
  holding a permission its peers lack. Replaced by a role default in the shape `manage_rooms`
  already has (`domain/identity.md` §2.1, P-O-10). Design Decision 12.
- **A join link may be bound to a prepared profile, and `/claim` is deleted.** Human decision of
  2026-09-22, taken after the rest of this change was applied. `JoinCodeIssuance` gains a nullable
  `resident_profile_id`: a link that names a profile *claims* it (greeting the visitor by name and
  asking only for a password), a link that names none *creates* one as before. This is also a
  security fix — claiming needed no secret at all, since `claimResidentProfile` creates the account
  with whatever password is typed and C-1.4 says the household id is *„keine Sicherheitsgrenze,
  nur Zuordnung“*. Requiring the link makes C-2.4 true in fact. Design Decision 13.
- **A `/join/[code]` route** — the first public route in the application that is neither sign-in
  nor register. It resolves the code without spending it (FR-2.9/AC-2.1: the household's name is
  shown before any field is requested), renders the two required fields plus the optional email
  and the pre-selected "stay signed in" box, and validates again at submit (EC-2.9: a link deleted
  mid-registration is refused on submit, not only on open).
- **`joinHousehold` in `src/modules/identity/auth.ts`** — claim the link, create the
  `ResidentProfile` (`status: active`), the `Account`, the `Membership` and the `Session`, and
  audit it, in **one** transaction, with the Supabase Auth user created before it and cleaned up
  best-effort if it fails (the idiom `undoRegisterHousehold`/`undoClaimResidentProfile` set).
  `claimResidentProfile` does not fit: it requires a pre-existing `prepared` profile and
  self-service join has none.
- **`membership.joined_via_issuance_id` is written for the first time.** The column has existed
  since F1 (as `joined_via_code`), was renamed and retyped by change 1, and has never had a value.
  FR-2.6 is what it is for.
- **FR-2.28 attempt limiting**, route-scoped rather than link-scoped, per EC-2.14: *"The limit is
  on the route, not on a link, because a guess is tested against every live link at once."* A new
  table plus a `SECURITY DEFINER` function, checked **before** any code lookup, so AC-2.25's
  *"refused without being checked against any link"* is structurally true rather than a matter of
  ordering discipline.
- **Code normalisation before lookup** (EC-2.15, AC-2.24): upper-cased, whitespace stripped,
  separator optional. Neither `resolve_join_code` nor `claim_join_code` normalises — both compare
  `jci.code = p_code` exactly — and nothing in the codebase normalises today, so a code typed off a
  note as `uampn qacvz` currently fails. EC-2.11 is unaffected: display names still do not fold
  case.
- **`remember_me` becomes real** (FR-2.12, EC-2.10). `signIn` hardcodes `rememberMe: true` and a
  90-day `expires_at`; the checkbox needs the cleared case to mean a **short server-side lifetime**
  of 12 h, not a cookie that merely disappears. The session cookie's `maxAge` follows the row
  rather than outliving it.
- **The household gets a real name** (FR-2.9/AC-2.1). `registerHousehold` hardcodes `name: "WG"`,
  so every household would be introduced to every joiner by the same word. Registration captures it
  in a **second step after email and password** — *„Wie soll dein Haushalt heißen?"*, with an
  example in the field — rather than as a third field beside them. See Assumption 5.
- **EC-2.4 and EC-2.5 get explicit paths** — an already-signed-in member of this household is
  taken to Start with a note and no second profile; a signed-in resident of a *different*
  household is refused with an explanation (A-2.4: one account per household in this slice).
- **AC-2.26's other half.** O16 already lists dead links with their counts; it does not name who
  joined through them, because nothing wrote the reference. This change adds the names to the
  existing list — the criterion is unreachable until joins exist.
- **One new audit event type** (FR-2.19/AC-2.19), empty payload, registered in
  `PAYLOAD_ALLOWLIST` or `recordActivityEvent` throws. The code never enters a payload (G-A5).

**Deferred to change 3 (`feat/join-screen`), decided 2026-09-22:** a link from the sign-in screen
to `/register` — which is today reachable by typing its URL and no other way — and a field for
entering a join code by hand. Both are entry points into the join path, which is change 3's subject;
FR-2.27's manual-entry screen already lives there.

**Not in this change:** screen A3 itself — its four mandatory states (G-N6), the manual
code-entry screen (FR-2.27's *screen*; its backend is the same claim path and ships here), and the
invalid-link recovery copy — are change 3. The Start screen B1 is change 4. See Assumptions 4 and 6.

## Capabilities

### New Capabilities

- `identity/permissions`: which permissions a membership holds without anyone granting them, which
  are individually grantable, and what a new membership starts with. Seeded here because this change
  is the first to touch that behaviour — lazily, describing what is implemented, never by copying
  packet prose.
- `identity/join`: redeeming a join link — what a visitor sees before they type anything, what
  exactly two fields buy them, what a join creates and records, what happens to somebody who is
  already a member or belongs to another household, how long staying signed in lasts, and the
  limit on how often the route may be asked to check a code.

### Modified Capabilities

- `identity/join-code`: one requirement is added — a link may name the prepared profile it was
  issued for, changing nothing else about a link's expiry, cap, count, deletion or refusal. Two
  requirements change. **"A code resolves to at most one household"**
  gains normalisation — a code typed by hand with the wrong case, extra spaces or no separator
  resolves to the same link as the one in the URL (EC-2.15/AC-2.24), which is what makes FR-2.26's
  hand-typeable shape worth anything. **"The moderating person governs the links"** gains the
  joiners: each link in the history names the residents who came in through it (AC-2.26).

## Impact

**Guardrails this change touches:**

- **G-A5** — *„Der Beitrittscode verlässt niemals das System"*, and its 2026-09-21 addendum is
  about this change by name: *„Der Anfragekörper ist seit F2 kein Randfall mehr. **FR-2.27**
  verlangt eine Eingabe des Codes von Hand (P-1), also kommt er regulär per POST an […] die
  Formularroute braucht dieselbe Redaktion wie die Einladungsroute."* The code travels as a path
  segment and in a request body, never in a query string, and never into a log — including the
  `console.error` paths the server-action convention uses for unanticipated failures. The one half
  this change cannot satisfy in application code is named in Assumption 7.
- **G-C** (the hard floor, authorization) — the `close_round` change **moves an authorization
  boundary** and so is named first rather than folded in with the plumbing. It widens access for
  every moderator and narrows it for the profile that happened to be claimed first. Enforcement does
  not move: `assertHasPermission` remains the single choke point every round-lifecycle call routes
  through, and only the default set it reads changes.
- **G-C1** — the raw Postgres/Drizzle client stays inside `src/modules/identity/repository.ts`;
  the new rate-limit function is called from there like `resolveJoinCode` and `claimJoinCode`.
- **G-C7** — two-sided tests. The join path writes four household-scoped tables through a route
  that starts with no session at all, so the policy layer and raw SQL both have to be exercised.
- **G-C8** — unchanged; `SET LOCAL` still only in `src/db/session-context.ts`. The join path's
  pre-session lookups use the 0005/0013 `SECURITY DEFINER` bootstrap precedent, not a new hole.
- **G-F1** — the rate-limit table's columns must be declared in `data-inventory.yml` before merge.
  Its source identifier is derived from a client IP address and is therefore **personal data**
  (🟠, not ⚙️ like the join-code columns): it needs a purpose, a legal basis and a retention rule,
  and the retention rule has to be an actual pruning path, not a sentence.
- **G-B3** — no PII in logs. Same field, the other direction: the source identifier is stored
  hashed and is never logged.
- **G-E1** — destructive DDL needs human approval. This change's migration is **additive** (one
  table, one function, no drops), but it does create a `SECURITY DEFINER` function, which the
  agent harness refused for `drizzle/0013` steps 4–5 in change 1. Planned as a hand-off up front
  rather than discovered mid-apply.
- **G-D** — **no guarded test is touched and none closes.** `test/guarded.manifest.json` stays
  byte-identical. G-D12 is the v0.2 `ApplicationInviteToken`, a different token with a different
  lifecycle; G-D14 (one session, one identity) is exercised by the new join path and must keep
  passing, which is not the same as changing it.
- **G-L / P-5** — not in play; nothing here decides anything about the flat.
- **G-N6** — the four mandatory screen states are **not** satisfied by this change's route, and
  that is deliberate rather than overlooked. Assumption 6.

**Code:** `src/modules/identity/auth.ts`, `repository.ts`, `schema.ts`, `session-cookie.ts`; a new
`src/app/(auth)/join/[code]/` route with its `actions.ts`; `src/app/(auth)/register/`
(household name); `src/app/(org)/members/page.tsx` (joiner names on the link history);
`src/modules/audit/repository.ts` (`PAYLOAD_ALLOWLIST`); `drizzle/` (one additive migration);
`data-inventory.yml`; `src/ui/strings/de.ts`. For bound links: a second migration,
`docs/domain/identity.md` §2.1 (the entity O-18 defined gains a field) and its register entry, the
deletion of `src/app/(auth)/claim/`, and the rewrite of the three `claim*` test files against the
new path (**never deletion** — G-G1; the behaviour they protect still exists). Plus, for the
`close_round` correction:
`docs/domain/identity.md` §2.1, `docs/review-log.md` §Offene-Punkte-Register,
`docs/backlog/requirements/F1-requirements.md` §8 and
`tests/integration/policy/founding-resident-permission.test.ts` — the only `docs/` edits in this
change, and none of them in a frozen file.

**Compliance:** the join code identifies a household, not a person (`domain/identity.md` §2.1,
O-9). The rate-limit source identifier is the first thing this codebase stores that is about a
*visitor* rather than a member — `06-Compliance-Anhang.md` §11.2's TOM list is where the limit
belongs, and `data-inventory.yml` is where the column does. C-2.5 still binds every string the
joiner reads: these limits are **social visibility, not hardening**, and are never presented as
security.

## Assumptions

0. **Two role defaults are not a template system, and the third one is where that stops being
   true.** S-04 (`02-SRD.md` §5.3 Scope) excludes `Berechtigungsvorlagen` by name, and `02-SRD.md` is
   precedence level 2. `manage_rooms` already carries a role default decided after S-04 (P-O-10), so
   a single named `vorbelegt` permission is established as not being a template. `close_round` makes
   two. **This change does not claim that scales**, and design Decision 12 writes the limit into
   `domain/identity.md` itself so the third one reopens S-04 rather than extending a trend. The
   larger model the user asked about — role-derived permission sets — was considered and is **not**
   taken here: it needs an S-04 challenge in the repo's ADR shape and an answer for E-04's
   landlord case.
0b. **A bound link refuses with FR-2.8's single message, not A4's distinct ones** (human
   decision). `screens/A-zugang.md` A4 deliberately does the opposite for the v0.2 invite token —
   *„Die drei Fehlertexte unterscheiden sich bewusst“* — because „schon benutzt“ and „abgelaufen“
   lead to different next steps for a person who was personally invited. Recorded as a considered
   divergence so that whoever builds S-42 reads it as a decision rather than a defect.
0c. **A bound link's form has one field, and FR-2.10 asks for two.** Fewer, not more, so C-2.1 —
   whose concern is a third field — is untouched, and S-03's shortest-path intent is served rather
   than strained. Named because "this form has one field" otherwise reads as a violation on
   inspection.
1. **The attempt limit is stored in Postgres, keyed by a hashed client IP, and shared across
   instances.** FR-2.28 requires *"the number of code-redemption attempts from one source"* to be
   limited but names no mechanism, and no authoritative source picks one. An in-process counter
   was rejected: it resets on every deploy and does not exist at all across instances, which makes
   the limit an illusion exactly when the estate is large enough for FR-2.28's argument to bite. A
   table plus one atomic `SECURITY DEFINER` function has the same shape as the two functions the
   join path already calls. The concrete window, threshold and pruning rule are design.md's.
2. **There is no half-spent state, so nothing has to decide who eats the cost of one.** The plan
   this change comes from posed the question as *"what happens to a use that `claim_join_code`
   already spent, when the join then fails halfway"* — give it back and reopen the race EC-2.1
   closed, or keep it spent and burn a single-use invitation on a transient error. **Neither, on
   inspection:** the claim is a single conditional `UPDATE`, so it can run *inside* the
   transaction that creates the resident instead of before it, and then a failure rolls the
   increment back with everything else. EC-2.1 still holds — a competitor blocks on the row lock
   and re-evaluates `uses < max_uses` when it clears, which is how `claim_join_code` was written.
   The count is still never decremented; a failed attempt simply never increments it.
   The one thing outside the transaction is the Supabase Auth user, created before it because an
   external call must not be held inside a database transaction. That is cleaned up best-effort on
   failure, exactly as `undoRegisterHousehold` and `undoClaimResidentProfile` already do. Design
   decision 2 records the ordering and the alternative.
3. **A rate-limited refusal is distinguishable from an invalid-link refusal, and this does not
   violate FR-2.8.** FR-2.8 forbids distinguishing *between FR-2.7's three reasons* — expired,
   used up, deleted. A rate limit is none of them, and AC-2.25 requires the refusal to happen
   *"without being checked against any link"*, so it cannot be a statement about a link even in
   principle. Telling a visitor they are being rate-limited discloses nothing about any code;
   telling them their link is invalid when it is not would send them to ask a flatmate for a link
   they already have.
4. **A successful join lands on `/dashboard` until B1 exists.** FR-2.18 and `screens/A-zugang.md`
   A3 both require Start, and Start is screen B1, which change 4 builds. `/dashboard` is screen
   **O1** — the wrong audience and the wrong content. Named here rather than left implicit,
   because R-2.5's failure is precisely *"onboarding is cheap but Start is unclear, so residents
   arrive and stall"*. This is a temporary landing target with a change that removes it.
5. **Registration gains a second step, and `screens/A-zugang.md` A1 describes only the first.**
   A1's Kernelemente are *„E-Mail + Passwort"*; there is no screen anywhere in `docs/screens/`
   where a household name is entered or edited, and `household.name` is written once, as the
   literal `"WG"`. FR-2.9 and AC-2.1 need a name a joiner can recognise. **Human decision,
   2026-09-22:** it is asked for on its own step *after* email and password — *„Wie soll dein
   Haushalt heißen?"* with an example in the field — not as a third field beside them. A1 does not
   *forbid* a second step the way A3 fixes *„zwei Pflichtfelder"* for the join form, so this is
   read as a gap rather than a conflict — **reported, not resolved here**: whether
   `docs/screens/A-zugang.md` A1 should describe the step is a docs decision, and this proposal
   does not make it.
   What the decision buys, beyond being the nicer flow: A1's own two fields stay exactly two, so
   nothing about the screen the docs *do* describe changes.
6. **The join route ships functional and plain; A3 ships in change 3.** This change's route
   renders the household name, the fields and the refusal, and it is not screen A3: G-N6's four
   mandatory states (Laden · Leer · Fehler · Keine Berechtigung), the manual code-entry screen and
   the invalid-link recovery wording are change 3's work, listed in its own section of the plan.
   Splitting this way is what lets FR-2.28 and the atomic join be tested before any of it is
   dressed; the cost is that `main` briefly carries a join screen that does not yet meet G-N6.
7. **The access-log half of G-A5's enforcement is outside this application.** G-A5 asks for
   *„Pfad-Redaktion im Zugriffslog für genau die Einladungsroute"*. This application writes no
   access log — the request log belongs to whatever serves it — so the enforceable halves here are
   the query-string rule (tested) and the rule that no application log line ever carries the code
   (tested). The access-log redaction is a deployment obligation, recorded rather than quietly
   dropped.
8. **`signIn` gains `rememberMe` as a parameter defaulting to `true`.** Registration and claim
   keep today's behaviour unchanged; only the join form passes the checkbox. FR-2.12 is about the
   join form, so screen A2 gets no checkbox in this change — a resident signing in again still
   gets the 90-day session.
