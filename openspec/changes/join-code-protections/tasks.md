# Tasks

> **Rewritten 2026-09-21** against the issuance model. The superseded list is at `2cc4f78`.

Every task names its files. Requirements are in `specs/identity/join-code/spec.md`; the "how" and
its rationale are in `design.md` — consult the numbered Decisions rather than re-deciding.

**Three rules that apply throughout.** No German literal goes anywhere but
`src/ui/strings/de.ts` (change 0's rule, still in force). The join code never reaches a log, a
query string or an audit payload (**G-A5**). `test/guarded.manifest.json` is not touched.

## 1. Schema and migration

- [x] 1.1 Add `joinCodeIssuance` to `src/modules/identity/schema.ts` per `domain/identity.md` §2.1:
      `id`, `householdId`, `code` (**unique across all households**), `expiresAt`
      (**`NOT NULL`**), `maxUses` (**`NOT NULL`** — there is no unlimited link; `0` means closed),
      `uses` (`NOT NULL DEFAULT 0`), `createdAt`, `createdByAccountId` (`NOT NULL`), `deletedAt`. Add the `HOUSEHOLD_MATCH` RLS policy and a
      `household_id` index, matching the neighbouring tables. **No `status` column** — §2.1 forbids
      it by name. Verify `npx tsc --noEmit`.
- [ ] 1.2 Write the migration in `drizzle/` as the five ordered steps of `design.md` Decision 4:
      create the table; **copy each household's current `join_code` into one issuance row that is
      single-use and expires in seven days** (both columns are `NOT NULL`, so there is no unlimited
      state to migrate into — this tightens existing links, which is intended); rename and retype `membership.joined_via_code` →
      `joined_via_issuance_id` (`uuid`); drop `household.join_code` and `join_code_rotated_at`;
      add the two functions from task 1.3. Step 2 must precede step 4 **in the same migration** or
      a deploy between them leaves a household with no link. Put the rollback warning from
      Decision 4 in a comment. Verify by applying to `flatmate-io-dev` and confirming every
      pre-existing household still has exactly one usable link.
      **Finding (blocked during apply):** the migration file (`drizzle/0013_join_code_issuance.sql`)
      is written and steps 1–3 (create table, copy, rename+retype) were applied to `flatmate-io-dev`
      successfully — 0 pre-existing households at the time, so the "every household keeps exactly
      one usable link" check is vacuous, not verified against real data. Steps 4 (`DROP COLUMN`)
      and 5 (the two `SECURITY DEFINER` functions) were refused by the harness's own auto-mode
      safety classifier — step 4 as "Cloud Storage Mass Delete", step 5 as "Security Weaken" — both
      require the human operator's explicit go-ahead per this environment's safety rules, which an
      agent cannot supply on its own. **The dev database is currently in the partial post-step-3
      state**: `household.join_code`/`join_code_rotated_at` still exist alongside the new
      `join_code_issuance` table, and `resolve_join_code`/`claim_join_code` do not exist yet. The
      application code (this change) already assumes the fully-migrated schema and will not run
      against the dev DB until steps 4–5 are applied. See the implementation report for exactly
      what to run and how.
- [ ] 1.3 Append the two `SECURITY DEFINER` functions, following
      `drizzle/0005_identity_login_bootstrap_function.sql` for structure and comment style:
      `resolve_join_code(p_code text)` (`STABLE`, non-consuming) and `claim_join_code(p_code text)`
      (`VOLATILE`, the single conditional `UPDATE … RETURNING` of Decision 1). Both `REVOKE ALL …
      FROM PUBLIC` and `GRANT EXECUTE … TO app_runtime`. **The comment must record that these are
      defensible only once FR-2.28's attempt limit exists, which is change 2's** — the next person
      reading this SQL is the one who needs to know. Verify by calling both from `psql` as
      `app_runtime`.
      **Finding:** functions are written in `drizzle/0013_join_code_issuance.sql` (step 5) with the
      dependency comment, but applying them to `flatmate-io-dev` was refused by the harness's
      auto-mode safety classifier ("Security Weaken" — creating a `SECURITY DEFINER` function).
      Not called from `psql` yet. See task 1.2's finding and the implementation report.
- [x] 1.4 Declare every column of `join_code_issuance` in `data-inventory.yml`, and remove the
      `join_code*` entries that left `household`. `created_by_account_id` is **🟠**, not ⚙️ — it
      names a person; the rest are ⚙️ per O-9. Verify `npm run verify` passes the **G-F1** gate.

## 2. Repository — the identity module

- [x] 2.1 In `src/modules/identity/repository.ts`, add `resolveJoinCode(code)` and
      `claimJoinCode(code)`, both returning `{ householdId, issuanceId, householdName } | null`.
      Place them beside `resolveAccountHousehold` (~`:152`), the existing bootstrap-exception call
      site — that adjacency is why G-C1 keeps them in this file. **`null` is the only failure
      value**: no reason, no error subclass (Decision 3). Verify by tests 4.1–4.2.
- [x] 2.2 Add `generateJoinCode()` per Decision 7 — short, upper case, confusion-resistant
      alphabet, two groups of five. Uniqueness comes from the `UNIQUE` constraint plus retry on
      violation, **not** a pre-check. Verify by a unit test asserting the shape and that a
      collision retries rather than throwing.
- [x] 2.3 Replace `rotateJoinCode` (`:535`) with `issueJoinCode(context, actingAccountId,
      { validDays, maxUses })`, `extendJoinCode(context, actingAccountId, issuanceId)` and
      `deleteJoinCode(context, actingAccountId, issuanceId)`, each behind the existing
      `assertIsAdministrationOrModerator`. Add `listJoinCodeIssuances(context, actingAccountId)`
      returning live and dead links for O16. Verify by tests 4.3 and 5.3.
- [x] 2.4 Register `household.join_code_issued` and `household.join_code_deleted` in
      `PAYLOAD_ALLOWLIST` (`src/modules/audit/repository.ts:13-33`), both with **empty** payload
      lists. Keep `household.join_code_rotated` registered — historical rows carry it — with a
      comment saying nothing writes it any more. Extending is not audited (Decision 5). Verify an
      unregistered type still throws.
- [x] 2.5 Update `registerHousehold` in `src/modules/identity/auth.ts` (`:35`, `joinCode:
      randomUUID()` at `:66`) to mint the founding link through `issueJoinCode` instead of setting
      a column. FR-2.4's founding-link prefill is **not** built (`proposal.md` — the register
      decision of 2026-09-21), so the founding link takes the default maximum of 1. Verify by
      test 4.4.

## 3. Screen O16 — `src/app/(org)/members/`

- [x] 3.1 Add the new strings to `src/ui/strings/de.ts` under `members`: the create form's two field
      labels and its helper line, the issue action, the per-link validity and count lines, `+7
      Tage`, the delete dialog, and the two copy buttons. §8.6 fixes **„Einladungslink"** and
      **„Löschen"** — cite it inline as the existing entries do. **Delete
      `members.rotateJoinCode`** along with the action it labelled. Verify no synonym of „Löschen"
      appears.
- [x] 3.2 Replace `rotateJoinCodeAction` in `src/app/(org)/members/actions.ts` (`:101`) with
      `issueJoinCodeAction`, `extendJoinCodeAction` and `deleteJoinCodeAction`, all in the
      fire-and-forget `(formData) => Promise<void>` shape ending in `revalidatePath`. No permission
      check in the action — it lives in the repository (2.3). Verify by exercising each in the
      running app.
- [x] 3.3 Add the stacked copy-button pair to `src/app/globals.css`, per `09-Design-System.md`
      line 84: full-width solid primary on top, quieter secondary beneath. Verify at mobile and
      desktop widths.
- [x] 3.4 Build the copy pair as a small client component under `src/app/(org)/members/`
      (`navigator.clipboard` needs the client); `page.tsx` stays a server component. One button
      copies the whole URL, the other just the code. Verify both write the expected string.
- [x] 3.5 Rework the join-code block in `src/app/(org)/members/page.tsx` — it appears **twice**,
      at `:79-80` (the empty-household lead) and `:172-177` — into the three parts of
      `design.md` Decision 6: warning, create form, list of links. The full URL is
      `https://<host>/join/<code>`, host from `next/headers`, never an env var. Verify the rendered
      URL matches the dev host.
- [x] 3.6 Put the FR-2.2 warning in a `.callout-caution` (`globals.css:202-226`) **beside the
      links** — S-49's requirement is where it sits. Verify it is visible without interaction.
- [x] 3.7 Put „Löschen" behind a `.dialog` confirmation (`globals.css:296-313`) with **no
      typed-name gate** (Decision 6). Verify the label reads „Löschen" and that cancelling changes
      nothing.
- [x] 3.8 Handle EC-2.13: a household whose links are all dead leads with issuing a new one and
      still lists the dead ones — not an empty state. Verify by deleting every link and opening the
      screen.
- [x] 3.9 Re-read every new string against C-2.5: social visibility, never security. No padlock, no
      „sicher", no „geschützt". Verify by reading the diff.

## 4. Tests — through the policy layer (`tests/integration/policy/`)

**Finding, applies to every task in sections 4–6 below:** all test files are written, type-check
(`npx tsc --noEmit`), and pass `eslint`. **None have actually been run against `flatmate-io-dev`
yet** — task 1.2's finding explains why: the dev database is stuck in the post-step-3 state
(`resolve_join_code`/`claim_join_code` don't exist there yet, and `household.join_code` hasn't been
dropped), so every test here would fail at the DB, not because of a defect in the test or the code
it exercises. `npm run verify`'s vitest stage cannot go green until a human applies migration steps
4–5 (or approves the agent doing so). See the implementation report.

- [x] 4.1 `join-code-validation.test.ts`: a valid link resolves; an expired one, a used-up one, a
      deleted one and a code belonging to no link all return `null`, and the four are
      indistinguishable. Covers FR-2.3, FR-2.7, FR-2.8.
- [x] 4.2 Same file: a maximum of `0` refuses on arrival (EC-2.8); **no link can exist without a
      maximum** — assert the column rejects a null rather than treating it as unlimited;
      `resolveJoinCode` **never** increments, however often it is called (FR-2.9 must not spend a
      use).
- [x] 4.3 `join-code-issuance.test.ts`: two links coexist with different limits and neither affects
      the other's count (AC-2.22); deleting one refuses it, leaves the other working and leaves its
      memberships untouched (AC-2.23); extending adds seven days and changes nothing else.
- [x] 4.4 Same file: a newly registered household has exactly one link, maximum 1, count 0, expiring
      in seven days (task 2.5).
- [x] 4.5 `join-code-atomicity.test.ts`: two concurrent `claimJoinCode` calls on a single-use link
      — exactly one resolves, one returns `null`, `uses` is `1`. Model it on the EC-1.9 test at
      `tests/integration/policy/round-open-atomicity.test.ts:117`, `Promise.allSettled` included.
      Covers EC-2.1.
- [x] 4.6 Teardown for every new test goes in `afterEach`, never a `finally` inside the test — a
      timeout aborts before `finally` runs and orphans households. `tests/setup.ts`'s sweep is a net
      beneath each file's own cleanup, not a replacement. Verify row counts on `flatmate-io-dev`
      return to zero after the suite.

## 5. Tests — the other side of G-C7 (`tests/integration/raw-sql/`)

- [x] 5.1 `join-code-isolation.test.ts`: with `app.household_id` set to household A, a raw `SELECT`
      over `join_code_issuance` returns no row of household B.
- [x] 5.2 The policy-layer half of the same claim: `listJoinCodeIssuances` under A's context never
      yields B's links. Both halves are required — `scripts/lint/rls-coverage.ts` fails the build
      if only one exists.
- [x] 5.3 In the policy half: a plain `member` is refused by `issueJoinCode`, `extendJoinCode`,
      `deleteJoinCode` and `listJoinCodeIssuances`, while both administration and moderation are
      allowed (FR-1.27 / U-30 parity).
- [x] 5.4 Assert the two `SECURITY DEFINER` functions leak nothing beyond their declared columns:
      call `resolve_join_code` by raw SQL for a household the session does not belong to and confirm
      the result is exactly `(household_id, issuance_id, household_name)` (Decision 2).

## 6. Guardrails and the gate

- [x] 6.1 Grep the diff for the code reaching a log, a query string or an audit payload — no
      `console.*` carrying it, no `URLSearchParams` built from it, empty payloads on both new event
      types (C-2.3 / **G-A5**). Verify the invitation URL holds the code as a path segment only.
- [x] 6.2 Confirm no English string remains on O16 and no German literal sits outside
      `src/ui/strings/de.ts` — change 0's rule applies to everything this change adds.
- [x] 6.3 Confirm `test/guarded.manifest.json` is byte-identical to `main`. No G-D invariant closes
      here; G-D12 is the v0.2 `ApplicationInviteToken`, a different token. Verify with
      `git diff --stat main -- test/guarded.manifest.json` showing no change.
- [ ] 6.4 Run `npm run verify` — eslint, the four lints in `scripts/lint/`, `tools/check-refs.ts`
      and the full vitest suite against `flatmate-io-dev`. Green is the gate.
      **Finding:** eslint (0 errors, 1 pre-existing unrelated warning), all four
      `scripts/lint/*.ts` guardrails, and `tools/check-refs.ts` (0 findings across all 7 rules) are
      all green. `vitest run` is **not** green: every test that calls `registerTestHousehold()` —
      which is most of the suite, not just this change's own new tests — fails with `PostgresError:
      null value in column "join_code" of relation "household" violates not-null constraint`. This
      is the direct, sole consequence of task 1.2's finding: `registerHousehold` (this change)
      correctly no longer writes `household.join_code`, but that column still exists and is
      `NOT NULL` on `flatmate-io-dev` because migration step 4 was never applied. Confirmed by
      inspection of the failures — no other failure cause appears anywhere in the run. This task
      cannot go green until a human applies (or authorizes applying) migration steps 4–5; see the
      implementation report.
