# Proposal

> **Rewritten 2026-09-21.** An earlier version of these four artifacts planned this change against
> a single rotating `Household.join_code`. That model was superseded before any code was written —
> **O-18** was resolved in favour of an issuance history (PR #13), and `domain/identity.md` §2.1 now
> carries `JoinCodeIssuance`. The superseded artifacts are in this branch's history at `2cc4f78`.

## Why

The household join code is an unbounded credential, and it is the only one the product has left.
`docs/backlog/requirements/F2-requirements.md` C-2.4:

> The join link is the **only remaining access control**, because S-03 removed the mandatory email
> and **U-22** removed the resident-visible member list and the right to remove members. […] The
> protections stay a precondition, not an enhancement.

`domain/identity.md` §2.1 says the same at the model layer: since `Account.email` became nullable
for resident accounts, *„gibt es **keine zweite Zugangskontrolle** mehr […] Der Code trägt die
gesamte Absicherung allein, und ein Code ohne Ablauf ist dann ein Passwortäquivalent ohne
Verfallsdatum."*

Today `household.join_code` is a `randomUUID()` generated at registration, rotatable and nothing
else: no expiry, no cap on redemptions, no count, and nothing anywhere reads a code back.

This is change 1 of F2's four, first because it has no dependency on the join UI: the table, the
validation and the moderator controls can land and be tested before any stranger can reach a join
form. Building the join path first would mean shipping the unbounded code to the public.

## What Changes

- **A new table, `join_code_issuance`**, replacing five columns on `household`. Per
  `domain/identity.md` §2.1: `code` (unique across all households), `expires_at` and `max_uses`
  (**both `NOT NULL`** — there is no unlimited link and no link without an end; default **1**,
  with `0` meaning closed), `uses` (default 0, never reset), `created_by_account_id`,
  `deleted_at`. A household holds **several links at once** (FR-2.1 as amended), each with its own
  limits and its own end.
- **`household.join_code`, `join_code_rotated_at` and the three columns PR #13 moved off the
  entity are dropped**, and each existing household's current code migrates into one issuance row.
  This is not an additive migration — F1 shipped these columns, a `rotateJoinCode` function and an
  O16 UI that renders them.
- **`membership.joined_via_code` becomes `joined_via_issuance_id`** — declared since F1, never
  written. A reference, not a copy: storing the code on that row would undercut G-A5. It is what
  answers *"who joined through which link"* (AC-2.26).
- **Codes become short and hand-typeable** — `UAMPN-QACVZ`, not a UUID (FR-2.26). **P-1
  Kanalneutralität** requires anything arriving by link to be enterable by hand.
- **Rotation is replaced by issue / extend / delete**, per FR-2.5 as amended. Deleting every live
  link does what rotation did; deleting one leaves the others alone and leaves the memberships it
  created untouched.
- **One validation outcome.** FR-2.7 names three rejection causes; FR-2.8 requires *"exactly
  **one** message that does not distinguish between FR-2.7's three reasons"*. EC-2.8 (a cap of 0)
  then needs no code of its own.
- **Atomic consumption.** EC-2.1 is the ordinary case, not an edge case: with a default cap of 1,
  every normal invitation is a race for the only redemption a link has.
- **Screen O16** gets what `screens/O-organisation.md` O16 now describes: the warning, a *create*
  form, and the list of links — live and dead — each with its remaining validity, its count, `+7
  Tage`, `Löschen`, the code, the full URL and the stacked copy pair.

Not in this change: the join route, the join form, manual code entry, and rate limiting. Those are
changes 2 and 3.

## Capabilities

### New Capabilities

- `identity/join-code`: the lifecycle of a household's join links — what makes one valid, how a
  code resolves to a household, how a redemption is claimed atomically, what a moderating person
  can see and change, and what the history of dead links preserves.

### Modified Capabilities

None. `openspec/specs/` holds only `ui/vocabulary`, seeded by change 0.

## Impact

**Guardrails this change touches:**

- **G-A5** — *„Der Beitrittscode verlässt niemals das System"*. Live rather than theoretical here:
  O16 renders the full invite URL, and the validation function takes a code as an argument. Neither
  may reach a log, and the code may never be assembled into a query string. It travels as a **path
  segment**.
- **G-F1** — every column of the new table must be declared in `data-inventory.yml` or the build
  fails. Note `created_by_account_id` is 🟠, not ⚙️ like the rest: it names a person.
- **G-C1** — the raw Postgres/Drizzle client stays inside `src/modules/identity/repository.ts`.
- **G-C7** — a new household-scoped table needs tests on both sides: through the policy layer and
  via raw SQL bypassing it.
- **G-C8** — unchanged; session context still comes only from `src/db/session-context.ts`.
- **G-D** — **no guarded test is touched and none closes.** `test/guarded.manifest.json` stays
  byte-identical. G-D12, the nearest-looking entry, is the v0.2 `ApplicationInviteToken`, a
  different token with a different lifecycle.
- **G-L / P-5** — not in play; nothing here decides anything.

**Code:** `src/modules/identity/schema.ts`, `repository.ts`, `auth.ts`; `drizzle/` (one migration);
`data-inventory.yml`; `src/app/(org)/members/page.tsx` and `actions.ts`; `src/ui/strings/de.ts`;
`src/app/globals.css`.

**Compliance:** the code identifies a household, not a person (`domain/identity.md` §2.1, O-9), so
the issuance columns are ⚙️ and belong on the TOM list rather than in the Art. 30 register —
except `created_by_account_id`. C-2.5 binds every string on O16: these protections are **social
visibility, not hardening**, and must never be presented as security.

## Assumptions

1. **The short code ships here; its attempt limit ships in change 2, and C-2.12 is not violated.**
   C-2.12 says FR-2.26 and FR-2.28 are one decision that cannot be split. The reason is that a
   shorter code is an oracle against the whole estate — but **the oracle is the public redemption
   route, and that route does not exist until change 2.** Nothing in this change lets an
   unauthenticated party test a code at all. The pair therefore reaches the public together, which
   is what C-2.12 protects. **If change 2 ships without FR-2.28, that is the violation** — named
   here so the obligation is carried rather than lost between two changes.
2. **Existing households migrate to a real single-use link, not to an unlimited one.** Each
   household's current `join_code` becomes one issuance row keeping the same code value, with
   `max_uses = 1`, `uses = 0` and an expiry seven days out. **There is deliberately no
   "unlimited" state to migrate into**: `domain/identity.md` §2.1 declares both columns
   `NOT NULL`, and a link redeemable without end is the thing these limits exist to prevent. An
   earlier draft of this proposal carried `null = unbegrenzt` over from the superseded
   `Household.join_code_max_uses`, which survives only in the frozen V0.4 snapshot; that was an
   error, not a decision.
   This tightens existing links rather than loosening them, and `uses = 0` is the honest value
   because the old model never counted — nobody knows how many times those codes were used. On
   `flatmate-io-dev`, the only deployment, there are no invitations in flight for this to
   disturb.
3. **The invitation URL is `/join/<code>` and 404s until change 2.** The shape is decided
   (PR #13); the route arrives with the join path. Named rather than hidden: between this change
   and change 2 a copied link leads nowhere. Acceptable only because O16 sits behind
   authentication and nobody is invited to use it yet.
4. **Issuing and deleting a link get their own audit event types.** `household.join_code_rotated`
   is registered today and its action is disappearing. Rather than leave a dead type or stretch it
   over two different actions, `household.join_code_issued` and `household.join_code_deleted` are
   registered with empty payloads, and the old type stays registered because historical rows carry
   it. **The code never enters a payload** (G-A5).
5. **No `status` column on the new table.** A link's state is derivable from `deleted_at`,
   `expires_at` and `uses < max_uses`, and `domain/identity.md` §2.1 says so explicitly — *„Bewusst
   kein `status`-Enum: die drei Gründe sind aus den Daten ablesbar, und ein zusätzliches Feld
   könnte ihnen widersprechen."*
