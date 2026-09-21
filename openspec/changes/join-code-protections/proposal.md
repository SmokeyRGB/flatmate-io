# Proposal

## Why

The household join code is today an unbounded credential. `Household.join_code` is generated at
registration and rotated on demand, and that is all: it never expires, it can be redeemed any
number of times, and nothing counts its use. `docs/backlog/requirements/F2-requirements.md` C-2.4
states why that is not survivable once F2 ships a self-service join path:

> The join link is the **only remaining access control**, because S-03 removed the mandatory email
> and **U-22** removed the resident-visible member list and the right to remove members. […] The
> protections stay a precondition, not an enhancement.

`domain/identity.md` §2.1 puts the same point at the model layer: since `Account.email` became
nullable for resident accounts and the join form's email requirement fell away, *„gibt es **keine
zweite Zugangskontrolle** mehr […] Der Code trägt die gesamte Absicherung allein, und ein Code ohne
Ablauf ist dann ein Passwortäquivalent ohne Verfallsdatum."*

This is change 1 of F2's four. It is deliberately first because it has no dependency on the join
UI: the columns, the validation and the moderator controls can land and be tested before any
stranger can reach a join form. Building the join path first would mean shipping the unbounded
code to the public.

## What Changes

- **Three columns on `household`**, named exactly as `domain/identity.md` §2.1 declares them:
  - `join_code_expires_at` — FR-2.3: *"The join code shall have an expiry timestamp, changeable by
    the household, defaulting to 7 days from issue."*
  - `join_code_max_uses` — FR-2.4: the default is **1**, a single-use link.
  - `join_code_uses` — FR-2.6: *"Every successful join shall increment the code's use count."*
    Reset to 0 on rotation, because a rotated code is a new value.
- **All three declared in `data-inventory.yml`** beside the existing `join_code` entry. Not
  optional and not a follow-up: C-2.11 and **G-F1** make an undeclared column a build failure,
  *„es gibt keinen stillen Default"*.
- **Resolution of a code to its household** — a query that does not exist anywhere today. The code
  is displayed and rotatable; nothing has ever read it back.
- **One validation outcome, not three.** FR-2.7 names three rejection causes (expired, cap reached,
  rotated); FR-2.8 as corrected on 2026-09-21 requires *"exactly **one** message that does not
  distinguish between FR-2.7's three reasons"*. The function therefore returns a household or a
  single `invalid`, with no reason attached — the reason cannot leak through a type that never
  carried it. EC-2.8 (a cap of 0 means "closed") then needs no code of its own: the cap predicate
  is already false at zero.
- **Atomic consumption.** EC-2.1 is no longer an edge case. With a default cap of 1, *every*
  ordinary invitation is a race of one, so the count is claimed by a single conditional statement
  that both decides and counts, never by a read followed by a write.
- **Screen O16 (`(org)/members/`)** gains the controls S-49 requires: the warning where the link is
  copied (FR-2.2), an expiry control, a max-uses control, the full invite URL beside the raw code,
  and the invalidate action relabelled **"Löschen"**.

Not in this change: the join route, the join form, and any caller of the validation function.
Those are changes 2 and 3. This change builds the mechanism and tests it directly.

## Capabilities

### New Capabilities

- `identity/join-code`: the lifecycle of the household join code — its expiry, its usage cap and
  count, how a code resolves to a household, what makes a redemption attempt valid, how a
  redemption is claimed atomically, and what the moderating person can see and change about it.

`openspec/specs/` is empty by design: the governance decision recorded in `CLAUDE.md` is that a
capability spec is written on first touch, describing implemented behaviour and citing its
`FR-n.m`, never by copying `docs/backlog/requirements/` prose. This is the first change to seed it.

### Modified Capabilities

None — there are no existing specs to modify.

## Impact

**Guardrails this change touches**, named plainly:

- **G-A5** — *„Der Beitrittscode verlässt niemals das System"*. Two new surfaces make this live
  rather than theoretical: O16 renders the full invite URL, and the validation function takes the
  code as an argument. Neither may reach a log, and the code may never be assembled into a query
  string. The invite URL carries the code as a **path segment** for exactly this reason.
- **G-F1** — the three new columns break the build unless declared in `data-inventory.yml`.
- **G-C1** — the raw Postgres/Drizzle client stays inside `src/modules/identity/repository.ts`;
  the server actions call exported functions.
- **G-C7** — `household` is RLS-scoped, so the new columns need tests on both sides: through the
  policy layer and via raw SQL bypassing it.
- **G-C8** — unchanged; session context still comes only from `src/db/session-context.ts`.
- **G-D** — **no guarded test is touched, and none closes.** `test/guarded.manifest.json` stays
  byte-identical. G-D12, the nearest-looking entry, is the v0.2 `ApplicationInviteToken` (*"Du bist
  bereits als Bewohner:in registriert"*), not the household join code — a different token with a
  different lifecycle.
- **G-L / P-5** — not touched; nothing here decides anything.

**Code:** `src/modules/identity/schema.ts` (three columns), `src/modules/identity/repository.ts`
(resolution, validation, atomic consume; `rotateJoinCode` gains the reset), `drizzle/` (one
generated migration), `data-inventory.yml`, `src/app/(org)/members/page.tsx` and
`.../actions.ts`, `src/app/globals.css` (the stacked copy-button pair, which does not exist yet).

**Compliance:** the three columns are `⚙️` like `join_code` itself — the code identifies a
household, not a person (`domain/identity.md` §2.1, O-9), so they belong on the TOM list rather
than in the Art. 30 register. C-2.5 still binds every string on O16: these protections are
**social visibility, not hardening**, and must never be presented as security.

## Assumptions

Recorded rather than silently resolved, per this project's proposal rules.

1. **The invite URL is `/join/<code>`, a path segment, and it 404s until change 2 lands.** The
   shape is forced by G-A5 (never a query string) and is fixed here rather than discovered later,
   because O16 must render the whole URL to satisfy S-49's "warning where the link is copied". The
   consequence is named rather than hidden: between this change and change 2, a copied link leads
   nowhere. That is acceptable only because O16 is a moderator surface behind authentication, and
   no resident is invited to use it yet.
2. **"Löschen" relabels the existing rotation action; it does not add a second one.** `join_code`
   is `NOT NULL`, and the model carries one rotating code rather than a history of issued links
   (**O-18**, open). So "delete this link" and "replace this link" are one operation, and
   `screens/rahmenwerk.md` §8.6 governs only what it is called: **"Löschen"**, never
   *„Widerrufen"* and never *„Zurückziehen"*.
3. **Existing households migrate to `join_code_max_uses = null`, meaning unlimited — not to 1.**
   This follows `domain/identity.md` §2.1 verbatim (*„`null` = unbegrenzt (Default für
   Bestandshaushalte bei Migration)"*). Defaulting them to 1 would retroactively invalidate links
   already in flight, which is a behaviour change no requirement asks for.
4. **Rotation resets both counters**: `join_code_uses` to 0, and `join_code_expires_at` re-based on
   the rotation time, per `domain/identity.md` §2.1 (*„Vorschlag `join_code_rotated_at + 7 Tage`"*)
   and its note that the use counter *„setzt sich bei Rotation zurück"*.
5. **FR-2.4's founding-link exception is not built.** FR-2.4 pre-fills the founding link with the
   number of expected residents; no such number is captured anywhere, and the decision of
   2026-09-21 in `review-log.md` §Offene-Punkte-Register defers that prefill for v0.1 rather than
   abolishing it. Every code, including the founding one, therefore defaults to 1, and whoever
   shares a link into a group chat raises the cap by hand on O16.
