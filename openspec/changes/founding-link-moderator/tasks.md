## 1. Schema and migration

- [ ] 1.1 `src/modules/identity/schema.ts`: add `isFoundingLink: boolean("is_founding_link").notNull().default(false)` to `joinCodeIssuance`, plus the `join_code_issuance_founding_shape` CHECK and the partial unique index `join_code_issuance_one_founding_link` (design D1). Add a comment citing D1.
- [ ] 1.2 `data-inventory.yml`: entry for `join_code_issuance.is_founding_link`, category operational (⚙️), no personal data.
- [ ] 1.3 Before numbering, merge `origin/main`. Then write `drizzle/0034_founding_link.sql` (0034, reserved for this change), using the statement order and re-runnable forms of design D5. Update the drizzle journal/snapshot the way earlier hand-written migrations did (compare `drizzle/0032_*`). `scripts/lint/migration-shape.ts` must pass.
- [ ] 1.4 Apply the migration to `flatmate-io-dev` by the established path: Supabase MCP `apply_migration`, or the human in the SQL editor if refused. Then confirm in the catalog (`list_tables` / `information_schema`) that the column, the CHECK and the index exist. Stop and report if any is missing; never infer it is "not yet applied".

## 2. Registration marks the founding link

- [ ] 2.1 `src/modules/identity/repository.ts` `issueJoinCodeTx`: accept an internal `founding?: true` option that writes `is_founding_link = true`. The public `issueJoinCode` keeps its signature and never passes it.
- [ ] 2.2 `src/modules/identity/auth.ts` `registerHousehold`: pass `founding: true` on the founding-link call.
- [ ] 2.3 Tests in `tests/integration/policy/join-code-issuance.test.ts`:
  - a new household has exactly one issuance with `isFoundingLink = true`, neutral, purpose `join`;
  - a link issued afterwards through `issueJoinCode` (by the household account and by a moderator) has `false`.
  - Deliberate break: drop `founding: true` in 2.2. The first test must fail. Report it.
- [ ] 2.4 Raw-SQL tests in `tests/integration/raw-sql/` (G-C7, both sides):
  - as `app_runtime`, a second founding link in the same household is refused by `join_code_issuance_one_founding_link`;
  - a founding link with a bound profile, or with purpose `password_reset`, is refused by `join_code_issuance_founding_shape`.
  - Assert the exact constraint names (memory: DB breaks by assertion). Include a positive control: one founding link inserts fine.
  - Deliberate break: run against a copy of the CHECK predicate weakened in the test's expectation, i.e. assert the wrong constraint name, and see it fail.

## 3. The founding join stores the appointment

- [ ] 3.1 `src/modules/identity/schema.ts` (or the identity module file where `MODERATOR_PERMISSIONS` lives): export `appointedPermissions(base: readonly string[])`, the sorted, deduplicated union with `MODERATOR_PERMISSIONS` (design D2).
- [ ] 3.2 `src/modules/identity/auth.ts` `joinHousehold`, inside the transaction after `claimJoinCodeTx`:
  - read the claimed issuance's `is_founding_link` with an explicit `household_id` predicate;
  - when it is set, insert the membership as `role 'moderator'` with `appointedPermissions(RESIDENT_PERMISSIONS)`;
  - after `membership.joined`, record `membership.role_changed {fromRole:'member', toRole:'moderator'}` with the joiner as actor.
  - Update the comment that says nothing is inferred from being first, so it names the founding-link exception.
  - Keep `claimResidentProfile` unchanged.
- [ ] 3.3 New `tests/integration/policy/founding-link-join.test.ts`:
  - (a) Joining through the founding link gives role `moderator`, permissions equal to `appointedPermissions(['vote'])`, `isResident` true, `joinedViaIssuanceId` = the founding issuance, link `uses` 1. There is exactly one `membership.joined` and exactly one `membership.role_changed {member→moderator}`, both with the joiner as actor and neither with the code.
  - (b) The joiner holds `manage_rounds` and `change_application_state` and may open a round right away (F5 invite relies on the stored set).
  - (c) Joining through an ordinary neutral link of the same household gives role `member` and permissions `['vote']`.
  - (d) `appointedPermissions(['vote'])` equals what `setMemberRole` stores when appointing a freshly joined member.
  - (e) Two concurrent founding joins: exactly one succeeds, the other gets `invalid_link`, and there is one moderator. Make it deterministic by holding the first transaction open (implementation-hazards "concurrent request"), or label it an invariant guard.
  - Teardown in `afterEach`. Auth addresses are random per run.
  - Deliberate breaks: for (a), replace the founding check with `false` and see (a)/(b) fail. For (c), make every join founding and see (c) fail. Report both.
- [ ] 3.4 Update pinned expectations that change meaning:
  - `tests/integration/policy/founding-resident-permission.test.ts`: it claims via `claimResidentProfile` and stays valid. Re-read its comments and add a note that the founding-*link* join is covered in `founding-link-join.test.ts`.
  - Audit every test that redeems a household's founding issuance: grep `tests/` for joins whose code comes from the registration's own issuance, e.g. `listJoinCodeIssuances(...)` / `issuances[0]` / `foundingCode`. Any such test now creates a moderator. Make it issue its own link, or update the expectation with a stated reason. List each file touched in the report.
- [ ] 3.5 `tests/integration/policy/authorization-matrix.test.ts`: confirm it still passes. If `isFoundingLink` (4.1) or `appointedPermissions` is a new repository export, classify it in the matching NOT_APPLICABLE list with a reason.

## 4. Household account redeems its own founding link

- [ ] 4.1 `src/modules/identity/repository.ts`: add `isFoundingLink(context, issuanceId): Promise<boolean>`. It is read-only, runs under `withSessionContext`, and uses an explicit `household_id` predicate.
- [ ] 4.2 `src/app/(auth)/join/[code]/join-screen-state.ts`: add the input `householdAccountFoundingLink: boolean`. When the session's household is the link's household and the flag is true, return the link's ordinary form (`neutral`) instead of `already_member`. Resident sessions are unchanged. Unit tests in the existing `join-screen-state` test file:
  - household account + founding gives `neutral`;
  - household account + ordinary link gives `already_member`;
  - resident + founding gives `already_member`.
  - Deliberate break: ignore the flag, and the first test must fail.
- [ ] 4.3 `src/app/(auth)/join/[code]/page.tsx`: compute the flag only when `current.context.householdId === resolved.householdId && current.context.profileId === null`, via `isFoundingLink(current.context, resolved.issuanceId)`. Opening the page writes nothing.
- [ ] 4.4 `src/modules/identity/auth.ts` `joinHousehold`:
  - change `options.currentSession` to `CurrentSession`;
  - apply the pre-Auth rule of design D3;
  - inside the transaction, after the membership insert, revoke the household session with the conditional `UPDATE … WHERE id AND account_id AND household_id AND revoked_at IS NULL`, using `clock_timestamp()`;
  - re-check the claimed mark and throw `already_member` for a household-account session on an unmarked link.
  - `src/app/(auth)/join/[code]/actions.ts`: pass `current` (with `sessionId`), not `current.context`. Update every other caller of `joinHousehold` (grep tests too).
- [ ] 4.5 Tests in `tests/integration/policy/founding-link-join.test.ts`:
  - (f) The household account's session submits the founding join. The household session row has `revoked_at` set, the new resident has a live session, the membership is moderator. Assert every column the revocation writes.
  - (g) The household account's session submits an ordinary link: `already_member`, no account, no Auth user left behind, household session still live.
  - (h) A founding join refused inside the transaction (e.g. the link was already used by another join) leaves the household session live.
  - (i) A resident session of the same household on the founding link: `already_member`.
  - Deliberate breaks: for (f), skip the revocation and see (f) fail. For (h), move the revocation before the claim and outside the rollback path, and see (h) fail. Report both.
- [ ] 4.6 `tests/integration/policy/join-*.test.ts`: confirm the existing "household account follows its own link" tests use a non-founding link, or update them to (per the delta spec) assert the founding exception separately.

## 5. Members screen names the founding link

- [ ] 5.1 `listJoinCodeIssuances` (identity repository): add `isFoundingLink` to each row.
- [ ] 5.2 `src/app/(org)/members/members-view.tsx`: on the founding link's row, only while it is unused, not deleted and not expired, show the label and hint.
  - Strings in `src/ui/strings/de.ts`: draft `foundingLinkLabel: "Dein Gründungslink"`, `foundingLinkHint: "Tritt selbst darüber bei, dann bist du Moderator:in."`. Report the wording for the human to confirm.
  - Unit test in `tests/unit/identity/members-page-capabilities.test.ts`: the label shows for a live founding link and not for a used or ordinary one. Deliberate break: drop the "unused" condition.

## 6. Docs and specs

- [ ] 6.1 `docs/domain/identity.md` (Rolle-Vorbelegung box): add a dated amendment in German: since 2026-10-06, whoever joins through the founding link becomes moderator (human decision), why this isn't the 2026-09-22 first-joiner automatism, and that `claimResidentProfile` stays plain. Same for `docs/03-PRD.md` §4.0.1 (moderator-appointment row or its note) and `docs/backlog/requirements/F1-requirements.md` FR-1.8 and `F2-requirements.md` (founding link), in their amendment styles. Never translate a German quote.
- [ ] 6.2 `docs/review-log.md` §Offene-Punkte-Register: a closed row recording the 2026-10-06 decision (founding link confers moderator; household account may redeem it; round rights for the household account dropped, S-50/U-20 unchanged), in the register's format.
- [ ] 6.3 Run `node tools/check-refs.ts` and `npx openspec validate founding-link-moderator --strict`.

## 7. Gate

- [ ] 7.1 Run `npm run verify` green. A single 60 s timeout on shared dev is re-run once; never raise a timeout.
- [ ] 7.2 Walk through it in the browser on the local dev server: register a test household (synthetic data, `@example.test`), open the founding link from the members screen while signed in as Verwaltung, join, land on Start as moderator, open the organisation tab and reach „Runde eröffnen". Screenshot for the PR.
