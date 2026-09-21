# Design

## Context

See `proposal.md` — Why. What shapes the approach here is one structural fact: **the party who
presents a join code has no session, and `household` is RLS-scoped on `app.household_id`.**

```
pgPolicy("household_is_own_household", { using: IS_OWN_HOUSEHOLD, … })
```

`withSessionContext` (`src/db/session-context.ts`) requires a `householdId` before it will open a
transaction — and discovering the household is exactly what resolving a code is *for*. So the read
that this capability is built around cannot go through the normal path, by construction.

This project has met that problem once already and solved it deliberately rather than by
weakening a policy. `resolveAccountHousehold` (`src/modules/identity/repository.ts:152`) calls a
`SECURITY DEFINER` function created in `drizzle/0005_identity_login_bootstrap_function.sql`,
described in its own comment as *"the ONE deliberate hole"*, revoked from `PUBLIC` and granted only
to `app_runtime`. This change follows that precedent rather than inventing a second pattern — but
it is not a free copy, because the inputs differ in a way that matters (Decision 2).

Everything else in this change is authenticated and ordinary: the moderator controls on O16 run
through `withSessionContext` and the existing
`assertIsAdministrationOrModerator`, exactly as `rotateJoinCode` already does.

## Goals / Non-Goals

**Goals**

- The counter can never exceed its cap, under any interleaving, without a lock held across a
  round trip.
- A refusal is structurally incapable of carrying its reason — not merely careful about it.
- Exactly one new hole in the RLS wall, as narrow as `resolve_account_household`, in the same
  place and confined by the same lint.
- Change 2 can call the claim inside its own larger transaction without losing atomicity.

**Non-Goals**

- No rate limiting or lockout on code presentation. Nothing in F2 requires it, and adding it
  would be a new decision rather than an implementation detail. See Risks.
- No audit event for changing the expiry or the cap. FR-2.19 audits *joins* (change 2);
  `household.join_code_rotated` already exists for rotation. Registering event types no
  requirement asks for would widen `PAYLOAD_ALLOWLIST` on speculation.
- No issuance history. That is **O-18**, open, and deliberately not pre-empted here — the
  single-outcome refusal (Decision 3) was chosen partly so this change does not need it.
- No change to how the code is generated. `randomUUID()` stays.

## Decisions

### 1 · The counter is claimed by one conditional `UPDATE`, not a read then a write

```sql
UPDATE household
   SET join_code_uses = join_code_uses + 1
 WHERE join_code = p_code
   AND deleted_at IS NULL
   AND (join_code_expires_at IS NULL OR join_code_expires_at > now())
   AND (join_code_max_uses  IS NULL OR join_code_uses < join_code_max_uses)
RETURNING id, name;
```

One statement decides and counts. Returning no row *is* the refusal; there is no window between
the two halves for a competing attempt to slip through, because PostgreSQL re-evaluates the `WHERE`
against the updated row when two writers contend for it.

**Alternative considered: `SELECT … FOR UPDATE`, then update** — the pattern `openRound` uses
(`src/modules/casting/repository.ts:255-261`, its race proven by the EC-1.9 test at
`tests/integration/policy/round-open-atomicity.test.ts:117`). Correct, and it is the right shape
*there*, because `openRound` must run several precondition checks in application code between the
read and the write. Here there are no such checks: the whole decision is expressible as a `WHERE`
clause. A lock held across a round trip to Node buys nothing and costs a held row lock on a path a
stranger can trigger. Rejected on those grounds, not on style.

**Alternative considered: a uniqueness constraint or a check constraint** — cannot express
"increment only while below a per-row limit". Rejected.

### 2 · Two `SECURITY DEFINER` functions, and the second one's input is *not* pre-verified

`drizzle/00NN_join_code_protections.sql` adds:

- `resolve_join_code(p_code text) RETURNS TABLE (household_id uuid, household_name text)` —
  `STABLE`. The non-consuming read. FR-2.9 requires the household's name to be shown *before* any
  input is requested, so looking at a join link must not spend one of its uses.
- `claim_join_code(p_code text) RETURNS TABLE (household_id uuid, household_name text)` —
  `VOLATILE`. Decision 1's statement.

Both `REVOKE ALL … FROM PUBLIC` and `GRANT EXECUTE … TO app_runtime`, matching migration 0005.

**The honest difference from the 0005 precedent, stated rather than glossed over.**
`resolve_account_household` takes an `account_id` *the caller already verified through Supabase
Auth* — its own comment leans on that: *"Not callable to enumerate accounts; the caller must
already hold a verified account_id."* These two take a code supplied by an anonymous stranger.
That is not an oversight in the design; it is what a join link *is*. What keeps it acceptable is
narrowness and entropy, and both must hold:

- the code is a `randomUUID()` — 122 random bits, so guessing is not a strategy;
- the functions return **two columns and nothing else**, so a correct guess reveals a household id
  and the name the joiner is about to be shown anyway;
- the outcome is identical for every failure mode (Decision 3), so the oracle answers exactly one
  question — "does this link work" — which is the question the link exists to answer.

If the code generation ever stops being a full-entropy UUID, this reasoning collapses. That
dependency is written into the migration's comment, not left in this document.

**Alternative considered: relax the `household` RLS policy to permit a lookup by code** — rejected
outright. It widens the policy for every query rather than one call site, and G-C is a hard floor.

**Alternative considered: resolve the code in application code with the service-role key** —
rejected: it bypasses RLS wholesale instead of narrowly, and no existing code path does this.

### 3 · The refusal type cannot carry a reason

The repository exports one function whose result is a household or `null`:

```ts
export type JoinCodeResolution = { householdId: string; householdName: string } | null;
```

FR-2.8 as corrected on 2026-09-21 requires *"exactly **one** message that does not distinguish
between FR-2.7's three reasons"*. Encoding that as a discriminated union of causes and then asking
every caller to collapse it would make correctness a matter of discipline at each call site. A
type that never held the cause cannot leak it at any of them. EC-2.8 (a cap of `0`) then needs no
branch at all: `join_code_uses < join_code_max_uses` is already false at zero.

The cost is real and accepted: **server-side diagnosis gets harder**. A moderator asking "why
didn't my link work?" cannot be answered from the outcome. It can be answered by looking at the
household row on O16, which shows all three values — which is one of the reasons O16 displays them
rather than hiding them behind the controls.

### 4 · Rotation stays inside the authenticated path

`rotateJoinCode` already runs under `withSessionContext` with an authorization assert. It gains
two fields in the same `.set({…})` — `joinCodeUses: 0` and a re-based `joinCodeExpiresAt` — and
nothing else changes. No bootstrap hole, no new function, no new event type: the existing
`household.join_code_rotated` audit entry already covers it, with an empty payload, which is
correct because **the code must never enter a payload** (G-A5).

### 5 · The invitation URL is built from the request, not from configuration

O16 renders `https://<host>/join/<code>`, with the host read from the incoming request via
`next/headers`. The code is a **path segment**: G-A5 forbids a query string, and
`domain/identity.md` §2.1 says the same — *„Der Einladungslink trägt den Code im **Pfad**"*.

**Alternative considered: a `NEXT_PUBLIC_SITE_URL` env var** — rejected. It is one more deployment
knob, and when it is unset or stale it produces a link that looks right and goes nowhere, which is
worse than no link. No such variable exists in `.env.local` today.

Consequence, carried forward from `proposal.md` assumption 1: **this URL 404s until change 2 adds
the route.** Acceptable only because O16 is behind authentication and nobody is invited to use the
link yet.

### 6 · O16's layout follows the design system literally

`09-Design-System.md` already specifies this exact component: *"a short machine-readable value (an
invite code) renders in monospace as a small headline with the full URL in muted text beneath,
followed by a **stacked pair of copy buttons** — a full-width solid primary 'copy the whole thing'
action on top, a quieter secondary 'copy just the short value' option beneath it."*

- The warning (FR-2.2) is a `.callout-caution` (`src/app/globals.css:202-226`), placed beside the
  link rather than elsewhere on the page — S-49's requirement is *where* it sits.
- The copy pair is new CSS and needs `navigator.clipboard`, so it is a small client component;
  `members/page.tsx` stays a server component.
- **"Löschen"**, never *„Widerrufen"* and never *„Zurückziehen"* (`screens/rahmenwerk.md` §8.6).
  It opens a confirmation dialog (`.dialog`, `globals.css:296-313`), because the design system
  requires one for hard-to-reverse actions and invalidating outstanding invitations is one. It
  does **not** use the typed-name gate — that is reserved for U-27's permanent member removal, and
  reusing it here would flatten a distinction the design system draws deliberately.
- C-2.5 binds every string here: these limits are social visibility, never security. No padlock
  iconography, no "secure", no "protected".

### 7 · Where the code lives, per ADR-001 and G-C1

Everything new is inside the `identity` module. `schema.ts` gets three columns, `repository.ts`
gets the two wrappers and the limit-setters — it is the only file outside `src/db/` permitted to
touch the raw client (G-C1, enforced by `scripts/lint/import-boundary.ts`), and the two
`db.execute` calls sit beside `resolveAccountHousehold` for that reason. `members/actions.ts`
calls exported functions only. No other module is touched, so no cross-context question arises.

## Risks / Trade-offs

**An anonymous validity oracle with no rate limit** → Mitigated by 122 bits of entropy and a
two-column return; *not* mitigated by rate limiting, which this change deliberately does not add.
Named here so the absence is a recorded choice rather than an oversight. Revisit if the code ever
becomes shorter or human-typed.

**A second hole in the RLS wall** → Two more `SECURITY DEFINER` functions is a real widening of the
trusted surface. Mitigated by returning two columns, by `REVOKE … FROM PUBLIC`, by the `G-C1` lint
confining the call sites to `repository.ts`, and by G-C7 tests that assert the functions leak
nothing beyond those columns.

**The migration's default could invalidate links in flight** → `join_code_max_uses` is added as
nullable with no backfill, so existing households read as unlimited
(`proposal.md` assumption 3). Defaulting them to `1` would silently break invitations already
sent. The default of `1` applies to newly created households only.

**A dead invitation URL between this change and change 2** → Named, bounded, and behind
authentication. The alternative — deferring the URL to change 2 — would leave S-49's "warning where
the link is copied" with no link to sit beside.

**Diagnosis gets harder** (Decision 3) → O16 shows expiry, cap and count, so the question is
answerable from the moderator's own screen rather than from the refusal.

## Migration Plan

One generated migration plus one hand-written SQL file, in this order:

1. Drizzle-generated: three nullable columns on `household`; `join_code_uses` gets
   `NOT NULL DEFAULT 0`, the other two stay nullable (`NULL` means "no limit" / "no expiry").
2. Hand-written in the same migration file: the two `SECURITY DEFINER` functions, their `REVOKE`
   and their `GRANT` to `app_runtime`.

No backfill. Existing rows become unlimited-and-unexpiring, which is what they effectively are
today — the migration changes no household's behaviour on the day it runs.

**Rollback:** dropping the two functions and the three columns is safe while no join route exists
(it does not, until change 2). After change 2 ships, rollback would need the route removed first.

## Open Questions

None that can be deferred without changing the specs or the tasks. Two things are *open* but
settled for this change and recorded where status belongs: **O-18** (issuance history) stays open
and untouched in `review-log.md` §Offene-Punkte-Register, and FR-2.4's founding-link prefill is
deferred there too (`proposal.md` assumption 5).
