# Tasks

> Read `design.md` before starting. Three things will otherwise be discovered late: the enum value
> and its first use **must** be in two migrations (Decision 3); the predicate table (Decision 4) is
> what planning found, so **re-run the grep** and report anything it missed; and the backfill is
> tested by running the migration's own statement, read from the file (Decision 8).

## 1. Docs first: the decisions live in `docs/`

> German for `docs/domain/`, `docs/screens/`, `docs/review-log.md`; English for
> `docs/backlog/**` (ADR-012). **Nothing under `docs/` may cite `openspec/`** (check-refs Rule 7).
> Frozen files (`04`, `05`, `07`) are not touched.

- [x] 1.1 `docs/domain/identity.md` §2.1: `ResidentProfile.status` row becomes
  `enum(prepared, active, moved_out, removed)` with one sentence on `removed` (U-27's hard tier, no
  transition out, enforced in the database). The three *„`status != moved_out`"* uniqueness mentions
  (the derived-address rule 1, the O-12 box, the `display_name` row) become *„weder `moved_out`
  noch `removed`"*. `Session.revoked_at`'s third trigger names removal as well as `moved_out_on`.
- [x] 1.2 `docs/backlog/requirements/F1-requirements.md`: amend **FR-1.4** to *"neither
  `moved_out` nor `removed`"* with a dated *(Amended 2026-09-22)* note; add to **FR-1.26** that a
  removed member is not shown on the resident list. Do not touch AC-1.4's wording beyond what
  FR-1.4 needs.
- [x] 1.3 `docs/screens/O-organisation.md` O16: under *Zweistufiges Entfernen*, record that removed
  members are not listed, and that a not-yet-deleted link a removed person joined through carries
  a caution beside „Löschen" (the person unnamed).
- [x] 1.4 `docs/review-log.md` §Offene-Punkte-Register: one struck-through row, **Menschliche
  Entscheidung (2026-09-22)**, in the `close_round` row's shape. It covers the defect (hard tier
  landed in `moved_out`, reactivatable) and the three decisions (name freed, hidden from O16, link
  flag, not auto-deleted), and names the two V-3 gaps found in planning (sign-in, participant list).
- [x] 1.5 `docs/SPEC-INDEX.md`: if no row covers two-tier member removal, add one, maßgeblich
  `08-UX-Entscheidungen.md` U-27.
- [x] 1.6 Run `node tools/check-refs.ts`: 0 findings.

## 2. Status value and transitions

- [x] 2.1 `src/modules/identity/schema.ts`: add `"removed"` to `residentProfileStatusEnum`; change
  the partial unique index's `.where` to `status NOT IN ('moved_out', 'removed')`, and update its
  comment to name `NAME_RELEASING_STATUSES`.
- [x] 2.2 `src/modules/identity/transitions.ts`: add `["active","removed"]` and
  `["moved_out","removed"]`; export `NAME_RELEASING_STATUSES = ["moved_out","removed"] as const`;
  rewrite the header comment (it currently says both tiers land in `moved_out` and that reactivation
  reverses either).
- [x] 2.3 `tests/unit/identity/resident-profile-transitions.test.ts`: **update** (not guarded,
  checked; G-G1: never delete) to four statuses, both new transitions accepted, every `removed → *`
  refused.

## 3. Migrations (Decision 3)

- [x] 3.1 Run `npx drizzle-kit generate` after group 2. Keep the generated file as
  `drizzle/0016_resident_profile_removed_status.sql` with **only** `ALTER TYPE
  "public"."resident_profile_status" ADD VALUE IF NOT EXISTS 'removed';`. Move the index statements
  out of it.
- [x] 3.2 `npx drizzle-kit generate --custom --name resident_profile_removal_final` →
  `drizzle/0017_…sql`, containing in order, each re-runnable: the **backfill** between `--
  backfill:begin` / `-- backfill:end` markers (Decision 8, column names checked against
  `src/modules/audit/schema.ts`); `DROP INDEX IF EXISTS` + `CREATE UNIQUE INDEX IF NOT EXISTS` with
  the new predicate and the **same name**; `CREATE OR REPLACE FUNCTION
  reject_resident_profile_unremoval()` (plain `plpgsql`, **not** `SECURITY DEFINER`) + `DROP TRIGGER
  IF EXISTS` + `CREATE TRIGGER … BEFORE UPDATE ON resident_profile FOR EACH ROW`. Comment style as
  `drizzle/0006` and `0013`.
- [x] 3.3 **Read both files back** before applying (plan lesson: an agent cannot find errors in
  SQL it is forbidden to run). Check `drizzle/meta/_journal.json` lists 0016 and 0017, and 0016's
  snapshot has the enum value and the new index predicate.
- [x] 3.4 Apply `0016`, then `0017`, to **`flatmate-io-dev`** as **separate** calls (never
  production; never one transaction). If the harness refuses a statement (possibly `DROP INDEX`),
  stop and hand **that statement** to the human. Do not rewrite it to get around the refusal.
  Verify by querying `pg_enum`, `pg_indexes.indexdef` and `pg_trigger`.

## 4. Removal, reactivation, predicates (`src/modules/identity/`)

- [x] 4.1 `repository.ts` `removeMember` → `transitionResidentProfileStatusTx(…, "removed", …)`;
  rewrite its comment block (the "not a new status value" paragraph is now wrong, but keep the
  F3+ purge note).
- [x] 4.2 `repository.ts` `transitionResidentProfileStatusTx`: `→ removed` sets no date; the
  `fromStatus === "moved_out"` date-clearing branch fires only when `toStatus === "active"`.
- [x] 4.3 `repository.ts` `revokeMembershipForProfileTx`: membership update gains `isNull(
  membership.revokedAt)` so a moved-out member's original revocation time survives; the audit
  event is still always written.
- [x] 4.4 `repository.ts` `reactivateMember`: one `withSessionContext` for transition + un-revoke +
  audit (use the `Tx` transition), so a refused `removed → active` rolls back everything. Rewrite
  its "one reactivate for both tiers" comment.
- [x] 4.5 `repository.ts` `isDisplayNameTaken` → `notInArray(residentProfile.status,
  [...NAME_RELEASING_STATUSES])`; update the FR-1.4 comment.
- [x] 4.6 `repository.ts` `getResidentList`: exclude `removed`. Confirm `leadWithJoinCode` then
  treats a household whose only resident was removed as empty (AC-1.22).
- [x] 4.7 `auth.ts` `signIn`: display-name lookup uses `NAME_RELEASING_STATUSES`; after loading
  the membership, a set `revokedAt` throws `SignInError(…, "invalid_credentials")` (Decision 6).
  Update the `deriveResidentEmail` comment's *"non-moved_out"* wording.
- [x] 4.8 Re-run `grep -rnE "moved_out|'active'|\"active\"|'prepared'|\"prepared\"|\.status"` over
  `src/`, `drizzle/*.sql`, `scripts/`. For every hit **not** in design Decision 4's table, decide
  and record it in the apply report. Check `scripts/seed-demo-household.ts` and
  `scripts/cleanup-demo-household.sql` too.

## 5. Participant list and link flag

- [x] 5.1 `src/modules/casting/repository.ts` `getRoundParticipants`: add
  `eq(residentProfile.status, "active")` with a V-3/FR-1.19 comment. Do **not** write
  `round_participation.removed_at` (Decision 7).
- [x] 5.2 `src/modules/identity/repository.ts` `listJoinCodeIssuances`: select the joiner's
  status; skip `removed` joiners from `joinedResidentNames`; add `hasRemovedJoiner: boolean` to
  `JoinCodeIssuanceWithJoiners` (Decision 9).
- [x] 5.3 `src/ui/strings/de.ts`: add `members.joinCode.removedJoinerCaution` (German, uses
  „Löschen", names no one, not framed as security, C-2.5). Only here, never inline (change 0).

## 6. O16 (`src/app/(org)/members/`)

- [x] 6.1 `page.tsx`: show `RemoveMemberForm` for `active` **and** `moved_out` rows (explicit
  statuses, not `!== "removed"`); keep the „Ausgezogen" badge and Reaktivieren for `moved_out`.
  Render the caution callout (`.callout-caution`) on a link with `hasRemovedJoiner && !deletedAt`,
  beside its extend/delete controls.
- [x] 6.2 `remove-member-form.tsx`: rewrite the comment that says removal is a soft `moved_out`
  transition and the row stays. The row now unmounts. Keep the explicit close, which is harmless
  and still covers the dialog. The dialog's consequence/caution copy in `de.ts`: check it still
  says what now happens (final, cannot be undone). Adjust the German copy if it promised
  otherwise.

## 7. Tests

> Real `flatmate-io-dev`, teardown in `afterEach` (never `finally`), assert error **codes**, not
> only end states. `test/guarded.manifest.json` is **not** touched: no G-D entry closes here.

- [x] 7.1 `tests/integration/policy/member-removal-final.test.ts`: remove active → `removed`;
  remove moved-out → `removed` with original `revoked_at` kept; `reactivateMember` on removed
  throws `InvalidResidentProfileTransitionError` and membership stays revoked; moved-out reactivates;
  removed absent from `getResidentList`, moved-out present; only-resident-removed →
  `leadWithJoinCode`; audit has `membership.removed_as_intruder` vs `membership.revoked`.
- [x] 7.2 `tests/integration/raw-sql/resident-profile-removal-final.test.ts` (G-C7 raw side), as
  `app_runtime` inside session context: `SET status='active'` on a removed row raises; `SET
  status='moved_out'` on a removed row raises; updating `room_id` (or another column) on a removed
  row succeeds; `active → moved_out` by raw SQL is not blocked (trigger is narrow).
- [x] 7.3 `tests/unit/identity/display-name-uniqueness.test.ts`: **add** cases next to AC-1.4
  (don't rewrite existing ones): a removed member's name can be taken by a new profile; by a join
  (`joinHousehold`); display-name sign-in with it does not resolve to the removed profile.
- [x] 7.4 `tests/integration/policy/revoked-membership-sign-in.test.ts`: moved-out and removed
  members with correct password via the **email** branch
  (`deriveResidentEmail(profileId)`) and the display-name branch → `invalid_credentials`, no new
  `session` row; reactivated member signs in.
- [x] 7.5 `tests/unit/casting/round-participant-list.test.ts`: **add** a moved-out and a removed
  participant disappearing from `getRoundParticipants`, `round_participation` row untouched.
- [x] 7.6 Link flag (extend `tests/integration/policy/` where `listJoinCodeIssuances` is already
  tested, or a new `join-code-removed-joiner.test.ts`): removed joiner not named, `uses` unchanged,
  `hasRemovedJoiner` true on a live and on an expired link, false after delete.
- [x] 7.7 `tests/integration/raw-sql/removal-backfill.test.ts`: read the block between the markers
  from `drizzle/0017_…sql`, run it in `withSessionContext` for a fixture household (Decision 8);
  three fixtures (removed-as-intruder / revoked / removed→reactivated→moved-out); only the first is
  promoted, exactly one `resident_profile.status_changed` with the original remover as actor; a
  second run changes nothing. If `app_runtime` lacks a needed privilege, **report it and stop**.
  Do not widen a grant.
- [x] 7.8 `tests/unit/identity/name-releasing-statuses.test.ts`: the index predicate in
  `schema.ts` (and in `0017`'s SQL) lists exactly `NAME_RELEASING_STATUSES`.
- [x] 7.9 Existing tests that assumed hard removal lands in `moved_out`
  (`tests/integration/policy/resident-list-audit.test.ts`,
  `tests/unit/identity/moved-out-session-revocation.test.ts`, others found by grep): update to
  the new rule. None is guarded (checked), and none is deleted.

## 8. Verify and archive

- [x] 8.1 `npm run verify`: lint, the four guardrail lints, `check-refs`, full suite. Report the
  real output (counts of tests and files).
- [x] 8.2 Row counts on `flatmate-io-dev` back to zero for every household-scoped table after the
  suite (only the demo household may remain, if seeded).
- [x] 8.3 Hand walkthrough (human), **after group 9**. On Demo-WG (or after `npm run seed:demo`): join
  a third person through the **reusable 5-use** link, then remove them on O16. Expect: row gone, no
  Reaktivieren anywhere, and that link (still live, uses left) shows the caution. A used-up
  single-use link shows **no** caution, and dead links sit in the collapsed section, which opens to
  show them. Joining again with the same name succeeds; the old credentials are refused. Mark done
  only when the human confirms.
- [x] 8.4 `/opsx:archive final-member-removal` once 8.1–8.3 and group 9 are green, then one PR from
  `fix/final-member-removal`.

## 9. Walkthrough revision (human decisions, 2026-09-23)

> From the user's 8.3 walkthrough: the caution showed on a used-up single-use link, and dead links
> clutter O16. Design Decision 9 (revised) is authoritative. Groups 1–8.2 stay as done; this group
> changes the link-state derivation and the O16 list, nothing else.

- [x] 9.1 New `src/modules/identity/join-code-state.ts` (pure, no DB, no repository import):
  `joinCodeState(issuance, now)` → `"live" | "expired" | "used_up" | "deleted"` in the order
  deleted → expired → used up → live, and `removedJoinerCautionApplies(issuance, now)` =
  `hasRemovedJoiner && state === "live"`. New `tests/unit/identity/join-code-state.test.ts`: all
  four states, the boundaries (`expires_at == now` → expired, `uses == max_uses` → used up, deleted
  wins over both), caution true only for live, false for used up / expired-with-uses-left / deleted,
  true again once that expired link's `expires_at` is in the future. Falsify at least one case.
- [x] 9.2 `src/app/(org)/members/page.tsx`: rewrite `joinCodeStatusLabel` on top of `joinCodeState`
  (same texts, same order); render the caution only when `removedJoinerCautionApplies`; list live
  issuances first as today, and every other state inside a native `<details>` (no `open`, no client
  component) with a `<summary>` showing the count, rendered only when at least one dead link exists.
  Dead-link rendering inside is unchanged. The EC-2.13 lead state is unchanged.
- [x] 9.3 `src/ui/strings/de.ts`: add `members.joinCode.deadLinksSummary(n)` (e.g. „Nicht mehr
  nutzbare Links ({n})"). Check `removedJoinerCaution` still reads right now that it appears on
  live links only.
- [x] 9.4 Docs (German): `docs/screens/O-organisation.md` O16. The caution sentence becomes
  live-only: drop *„Der Hinweis folgt „nicht gelöscht", nicht „lebend" …"* and say why a used-up
  or deleted link never carries it and an expired one gets it back on „+7 Tage". The link-list
  paragraph (*„3. Die Liste der Links"*) records that dead links sit in a section collapsed by
  default, still listed, so *„Ein toter Link verschwindet nicht"* stays true. Amend this change's
  `docs/review-log.md` register row to the live-only rule and the collapsed list, dated
  2026-09-23. Nothing under `docs/` cites `openspec/`. Run `node tools/check-refs.ts`: 0 findings.
- [x] 9.5 Re-run the link-flag tests from 7.6 (`tests/integration/policy/join-code-removed-joiner.test.ts`).
  `hasRemovedJoiner` is unchanged in meaning, so they should pass as they are. If one asserts the
  old display condition, move that assertion to 9.1's unit test rather than deleting it (G-G1).
- [x] 9.6 `npm run verify` again. Report the real tail. Dev row counts back to Demo-WG only.
