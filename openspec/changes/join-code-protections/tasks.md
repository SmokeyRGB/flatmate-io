# Tasks

Every task names its files. Requirements come from `specs/identity/join-code/spec.md`; the "how"
and its rationale come from `design.md` — consult the numbered Decisions rather than re-deciding.

## 1. Schema and migration

- [ ] 1.1 Add three columns to `household` in `src/modules/identity/schema.ts`:
      `joinCodeExpiresAt` (`timestamp`, with timezone, nullable), `joinCodeMaxUses` (`integer`,
      nullable — `null` means no limit), `joinCodeUses` (`integer`, `NOT NULL DEFAULT 0`). Verify
      with `npx tsc --noEmit` and by the generated migration in 1.2 containing exactly these three.
- [ ] 1.2 Generate the migration (`npx drizzle-kit generate`) into `drizzle/`. Verify the generated
      SQL adds the three columns, backfills nothing, and touches no other table — per
      `design.md` Migration Plan, existing households must read as unlimited and unexpiring.
- [ ] 1.3 Append the two `SECURITY DEFINER` functions to that same migration file, following
      `drizzle/0005_identity_login_bootstrap_function.sql` as the template for structure and
      comment style: `resolve_join_code(p_code text)` (`STABLE`, non-consuming) and
      `claim_join_code(p_code text)` (`VOLATILE`, the single conditional `UPDATE … RETURNING` from
      `design.md` Decision 1). Both return only `(household_id uuid, household_name text)`. Both
      `REVOKE ALL … FROM PUBLIC` and `GRANT EXECUTE … TO app_runtime`. The comment must record the
      dependency `design.md` Decision 2 names: this is safe only while the code is a full-entropy
      `randomUUID()`. Verify by applying the migration to `flatmate-io-dev` and calling both
      functions from `psql` as `app_runtime`.
- [ ] 1.4 Declare all three columns in `data-inventory.yml` beside the existing `join_code` entry
      (category `⚙️`, same reasoning — the code identifies a household, not a person). Verify
      `npm run verify` does not fail the C-2.11 / **G-F1** gate.

## 2. Repository — the identity module's own surface

- [ ] 2.1 In `src/modules/identity/repository.ts`, add `resolveJoinCode(code: string)` and
      `claimJoinCode(code: string)`, both returning
      `{ householdId: string; householdName: string } | null`. Place them beside
      `resolveAccountHousehold` (~line 152), which is the existing bootstrap-exception call site
      and the reason G-C1 keeps these confined to this file. The `null` must be the only failure
      value — no reason, no error subclass, per `design.md` Decision 3. Verify by unit test in 4.1.
- [ ] 2.2 Extend `rotateJoinCode` in the same file to also set `joinCodeUses: 0` and
      `joinCodeExpiresAt` to seven days from the rotation instant. Do not add an event type: the
      existing `household.join_code_rotated` entry with its empty payload already covers it, and
      the code must never enter a payload (G-A5). Verify by test 4.4.
- [ ] 2.3 Add `setJoinCodeLimits(context, actingAccountId, { expiresAt, maxUses })` to the same
      file, guarded by the existing `assertIsAdministrationOrModerator` exactly as `rotateJoinCode`
      is. Verify by test 5.3 (a plain member is refused).
- [ ] 2.4 Give `registerHousehold` in `src/modules/identity/auth.ts` the defaults for a new
      household: `joinCodeMaxUses: 1` and `joinCodeExpiresAt` seven days out (FR-2.3, FR-2.4).
      FR-2.4's founding-link exception is **not** built — see `proposal.md` assumption 5. Verify by
      test 4.5.

## 3. Screen O16 — `src/app/(org)/members/`

- [ ] 3.1 Add `setJoinCodeLimitsAction` to `src/app/(org)/members/actions.ts`, following the
      fire-and-forget `(formData) => Promise<void>` shape that `rotateJoinCodeAction` already uses,
      ending in `revalidatePath`. No permission check in the action — it lives in the repository
      (2.3). Verify by exercising the form in the running app.
- [ ] 3.2 Add the stacked copy-button pair to `src/app/globals.css`, per the literal wording of
      `09-Design-System.md` line 84: full-width solid primary on top, quieter secondary beneath.
      Verify visually at both mobile and desktop widths.
- [ ] 3.3 Build the copy pair as a small client component under `src/app/(org)/members/`
      (`navigator.clipboard` needs the client); `page.tsx` stays a server component. One button
      copies the whole URL, the other just the code. Verify both write the expected string.
- [ ] 3.4 Rework the join-code block in `src/app/(org)/members/page.tsx` (currently lines 79-80 and
      172-177, two places): the code in monospace as a small headline, the full
      `https://<host>/join/<code>` URL in muted text beneath it — host read from `next/headers`,
      never an env var (`design.md` Decision 5) — then the copy pair, then the expiry and max-uses
      controls, then the invalidate action. Verify the rendered URL matches the host in dev.
- [ ] 3.5 Put the FR-2.2 warning in a `.callout-caution` (`globals.css:202-226`) **beside the link**
      — S-49's requirement is where it sits, not merely that it exists. Verify by reading the
      rendered page: the warning is visible without interaction.
- [ ] 3.6 Relabel the invalidate action **"Löschen"** — never *„Widerrufen"*, never
      *„Zurückziehen"* (`screens/rahmenwerk.md` §8.6) — and put it behind a `.dialog` confirmation
      (`globals.css:296-313`) with no typed-name gate (`design.md` Decision 6). Verify the label
      and that cancelling changes nothing.
- [ ] 3.7 Re-read every new string on the page against C-2.5: these limits are social visibility,
      never security. No padlock, no "sicher", no "geschützt". Verify by reading the diff.

## 4. Tests — behaviour, through the policy layer (`tests/integration/policy/`)

- [ ] 4.1 `join-code-validation.test.ts`: a valid code resolves to its household; an expired code,
      a used-up code, a rotated code and a code belonging to no household all return `null`, and
      the four results are indistinguishable. Covers FR-2.3, FR-2.7, FR-2.8 and the spec's
      "A refusal discloses no reason".
- [ ] 4.2 In the same file: a cap of `0` refuses every attempt (EC-2.8), and a `null` cap permits
      redemption past any count (the migration state from `proposal.md` assumption 3).
- [ ] 4.3 `join-code-atomicity.test.ts`: two concurrent `claimJoinCode` calls on a single-use code
      — exactly one resolves to a household, one returns `null`, and `join_code_uses` is `1`.
      Model it on the EC-1.9 test at `tests/integration/policy/round-open-atomicity.test.ts:117`,
      including its `Promise.allSettled` shape. Covers EC-2.1.
- [ ] 4.4 In the same file: `resolveJoinCode` does **not** increment the count, however many times
      it is called — FR-2.9 requires showing the household name before input, which must not spend
      a use.
- [ ] 4.5 `join-code-lifecycle.test.ts`: a newly registered household has cap `1`, count `0` and an
      expiry seven days out; rotating resets the count to `0`, re-bases the expiry, refuses the old
      value, and leaves memberships created through the old code untouched. Covers FR-2.5, FR-2.6
      and task 2.4.
- [ ] 4.6 Teardown for every new test goes in `afterEach`, never a `finally` inside the test — a
      timeout aborts before `finally` runs and orphans households. `tests/setup.ts`'s sweep is a
      net beneath each file's own cleanup, not a replacement for it. Verify row counts on
      `flatmate-io-dev` return to zero after the suite.

## 5. Tests — the other side of G-C7 (`tests/integration/raw-sql/`)

- [ ] 5.1 `join-code-isolation.test.ts`: with `app.household_id` set to household A, a raw
      `SELECT` over `household` returns no row of household B — so B's code, expiry, cap and count
      are unreachable. The policy-layer half of the same claim goes in 5.2.
- [ ] 5.2 In `tests/integration/policy/`: the same isolation asserted through the repository —
      `getHousehold` under A's context never yields B's limits. Both halves are required by G-C7;
      `scripts/lint/rls-coverage.ts` fails the build if only one exists.
- [ ] 5.3 In the policy half: a session whose membership role is plain `member` is refused by
      `setJoinCodeLimits`, matching how `rotateJoinCode` is already guarded (FR-1.27 / U-30 give
      administration and moderation parity, and nobody else).
- [ ] 5.4 Assert the two `SECURITY DEFINER` functions leak nothing beyond their two columns: call
      `resolve_join_code` by raw SQL for a household the session does not belong to and confirm the
      result is `(household_id, household_name)` and nothing more (`design.md` Decision 2).

## 6. Guardrails and the gate

- [ ] 6.1 Grep the diff for the code reaching a log or a query string — no `console.*` carrying it,
      no `URLSearchParams` built from it (C-2.3 / **G-A5**). Verify the invitation URL holds the
      code as a path segment only.
- [ ] 6.2 Confirm `test/guarded.manifest.json` is byte-identical to `main`. No G-D invariant closes
      here; G-D12 is the v0.2 `ApplicationInviteToken`, a different token
      (`proposal.md` — Impact). Verify with `git diff --stat main -- test/guarded.manifest.json`
      showing no change.
- [ ] 6.3 Run `npm run verify` — eslint, the four lints in `scripts/lint/`, `tools/check-refs.ts`
      and the full vitest suite against `flatmate-io-dev`. Green is the gate; a change is not
      archived on a red suite.
