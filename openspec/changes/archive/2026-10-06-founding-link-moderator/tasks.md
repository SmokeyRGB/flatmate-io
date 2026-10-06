## 1. Schema and migration

- [x] 1.1 `src/modules/identity/schema.ts`: on `joinCodeIssuance`, add:
  - `isFoundingLink: boolean("is_founding_link").notNull().default(false)`;
  - the CHECK `join_code_issuance_founding_shape`: `NOT is_founding_link OR (purpose = 'join' AND resident_profile_id IS NULL)`, written as `${t.residentProfileId}` (the table column is `resident_profile_id`, never `bound_resident_profile_id`);
  - the partial unique index `join_code_issuance_one_founding_link` on `(household_id) WHERE is_founding_link`, using `uniqueIndex().where(sql…)` as schema.ts already does elsewhere.
  - A comment citing design D1. Export no function from schema.ts (the data-inventory lint refuses it).
- [x] 1.2 `data-inventory.yml`: under `join_code_issuance`, add `is_founding_link: { category: "⚙️" }`, following the file's existing shape.
- [x] 1.3 Write `drizzle/0034_founding_link.sql` (0034, reserved for this change):
  - Merge `origin/main` first.
  - Run `drizzle-kit generate` for the snapshot, then hand-edit the SQL to design D5's re-runnable form and order.
  - The journal entry's `when` must be greater than every existing `when` (currently max 1791220900000).
  - `scripts/lint/migration-shape.ts` must pass.
- [x] 1.4 Apply the migration to `flatmate-io-dev`. Use Supabase MCP `apply_migration` if it is available to you. Otherwise stop and report that the human must run the file in the SQL editor.
  - Then confirm in the catalog (Supabase MCP `execute_sql` read-only, or `list_tables`) that the column, the CHECK and the index exist with exactly those names.
  - Stop and report if any is missing; never infer it is "not yet applied".

## 2. Registration marks the founding link

- [x] 2.1 `src/modules/identity/repository.ts`:
  - `issueJoinCodeTx` accepts an internal `founding?: true` option that writes `is_founding_link = true` and forces `purpose 'join'`, `maxUses 1` and no `residentProfileId`.
  - Change `PublicIssueJoinCodeOptions` to `Omit<IssueJoinCodeOptions, "purpose" | "founding">`, and have `issueJoinCode` strip `founding` at runtime before forwarding.
  - In the insert retry loop, retry only when the unique violation's constraint is the code index (check the exact constraint name in schema/migrations). Rethrow every other `23505`, so a founding-index hit cannot loop forever.
- [x] 2.2 `src/modules/identity/auth.ts` `registerHousehold`: pass `founding: true` on the founding-link call.
- [x] 2.3 `tests/integration/policy/join-code-issuance.test.ts`:
  - a new household has exactly one issuance with `isFoundingLink = true`, purpose `join`, no profile, max 1;
  - links issued afterwards via `issueJoinCode` (by the household account, and by a moderator) have `false`, including when a caller smuggles `founding: true` through a cast.
  - Deliberate breaks: drop `founding: true` in 2.2 and see the first test fail; drop the runtime strip and see the smuggle test fail. Report both.
- [x] 2.4 Raw-SQL tests in `tests/integration/raw-sql/` (G-C7), as `app_runtime`:
  - a second founding link in the same household is refused by `join_code_issuance_one_founding_link`;
  - a founding row with `resident_profile_id` set, or with purpose `password_reset`, is refused by `join_code_issuance_founding_shape`.
  - Assert the exact constraint names (memory: DB breaks by assertion). Positive control: one founding link inserts fine.
  - Deliberate break: assert the wrong constraint name once and see it fail. Report it.
- [x] 2.5 `scripts/seed-demo-household.ts` (~lines 100-111): it prints the founding link for the AC-2.8 single-use cap demo. Issue and print a separate ordinary single-use link for that demo instead, and say in the printed text that the founding link makes its redeemer moderator. Keep the explicit Alex appointment. Don't touch `scripts/demo/seed-round.ts` (F5 owns it).

## 3. The founding join stores the appointment

- [x] 3.1 `src/modules/identity/repository.ts`: export `appointedPermissions(base: readonly string[]): string[]`, the deduplicated union with `MODERATOR_PERMISSIONS`, sorted (design D2). NOT in `schema.ts`.
- [x] 3.2 `src/modules/identity/auth.ts` `joinHousehold`, inside the transaction after `claimJoinCodeTx`:
  - Read the claimed issuance's `is_founding_link` with an explicit `household_id` predicate.
  - When set, insert the membership as `role 'moderator'` with `appointedPermissions(RESIDENT_PERMISSIONS)`.
  - Add `.returning({ id })` to the insert.
  - After `membership.joined`, record `membership.role_changed {fromRole:'member', toRole:'moderator'}` with `subjectType 'membership'`, `subjectId` = the new membership id, and the joiner as actor, exactly like `setMemberRole`.
  - Update the comment that says nothing is inferred from being first, so it names the founding-link exception.
  - `claimResidentProfile` stays unchanged.
  - No `row.role ===` comparisons (`role-reads.ts`).
- [x] 3.3 New `tests/integration/policy/founding-link-join.test.ts`. Get the founding code from the registration's own issuance via `listJoinCodeIssuances` (`isFoundingLink`).
  - (a) Join through the founding link and check:
    - the membership: role `moderator`, permissions as a set equal to `appointedPermissions(['vote'])`, `isResident` true, `joinedViaIssuanceId` = the founding issuance;
    - the link's `uses` is 1;
    - the events: exactly one `membership.joined` and exactly one `membership.role_changed` with payload `{fromRole:'member', toRole:'moderator'}`, `subjectType 'membership'` and `subjectId` = the membership id, both with the joiner as actor, and neither carrying the code.
  - (b) The joiner holds `manage_rounds` and `change_application_state` and may open a round right away (F5's invite relies on the stored set).
  - (c) A join through an ordinary neutral link of the same household gives role `member` and permissions `['vote']`.
  - (d) `appointedPermissions(['vote'])` equals, as a set, what `setMemberRole` stores when appointing a freshly joined member.
  - (e) Invariant guard, labelled as such (the transaction is internal and can't be held open): two concurrent founding joins yield exactly one moderator, and the loser is refused.
  - Teardown in `afterEach`. Auth addresses are random per run.
  - Deliberate breaks: replace the founding check with `false` and see (a) and (b) fail; make every join founding and see (c) fail. Report both.
- [x] 3.4 `tests/integration/policy/founding-resident-permission.test.ts` uses `claimResidentProfile` and stays valid. Add a comment pointing to `founding-link-join.test.ts` for the founding-link join. (The pre-mortem found no existing test that redeems the founding link; re-confirm with a grep and list what you checked.)
- [x] 3.5 `tests/integration/policy/authorization-matrix.test.ts`: append to `NOT_APPLICABLE_IDENTITY`, without reformatting existing rows:
  - `appointedPermissions` (pure helper, no DB, no session);
  - `isFoundingLink` (read-only, 4.1);
  - the organisation read from 5.3 (read-only).

## 4. Household account redeems its own founding link

- [x] 4.1 `src/modules/identity/repository.ts`: add `isFoundingLink(context, issuanceId): Promise<boolean>`. It is read-only, runs under `withSessionContext`, and uses an explicit `household_id` predicate.
- [x] 4.2 `src/app/(auth)/join/[code]/join-screen-state.ts`: add an OPTIONAL input `householdAccountFoundingLink?: boolean` (default false), so existing calls in `tests/unit/identity/join-screen-state.test.ts` still compile. When the session's household is the link's household and the flag is true, return `neutral` instead of `already_member`. New unit cases:
  - household account + founding gives `neutral`;
  - household account + ordinary link gives `already_member`;
  - resident + founding gives `already_member`.
  - Deliberate break: ignore the flag and see the first case fail.
- [x] 4.3 `src/app/(auth)/join/[code]/page.tsx`: compute the flag only when `current.context.householdId === resolved.householdId && current.context.profileId === null`, via `isFoundingLink(current.context, resolved.issuanceId)`. Opening the page writes nothing.
- [x] 4.4 `src/modules/identity/auth.ts` `joinHousehold`:
  - Change `options.currentSession` to `CurrentSession`.
  - Apply design D3's pre-Auth rule.
  - Inside the transaction, after the membership insert, revoke the household session with the conditional `UPDATE … WHERE id AND account_id AND household_id AND revoked_at IS NULL`, setting `revoked_at = clock_timestamp()`.
  - Re-check the claimed mark, and throw `already_member` for a household-account session on an unmarked link.
  - `src/app/(auth)/join/[code]/actions.ts`: pass `current` (with `sessionId`), not `current.context`.
  - Fix the three call sites in `tests/integration/policy/join-existing-member.test.ts`, and grep for others.
- [x] 4.5 Tests in `tests/integration/policy/founding-link-join.test.ts`. Get a real household session with `signIn({ kind: "household", … })`, which returns `{ session, context }`. `registerTestHousehold().context` has no session row. Pass `{ sessionId: session.id, context }`.
  - (f) The household session submits the founding join:
    - the household session row now has `revoked_at` set, and no other column changes (assert the row before and after);
    - the new resident has a live session;
    - the membership is moderator.
  - (g) The household session submits an ordinary link of its household: `already_member`, no account, no Auth user left behind, the household session still live.
  - (h) Invariant guard, labelled (an in-transaction refusal needs a race; a spent link is refused pre-Auth): two concurrent founding joins, one from the household session. Exactly one succeeds. When the household-session join loses, its session is still live.
  - (i) A resident session of the same household on the founding link: `already_member`.
  - Deliberate break: skip the revocation and see (f) fail. Report it.
- [x] 4.6 Check that the existing "household account follows its own link" tests (grep `tests/integration/policy/join-*.test.ts`) use a non-founding link. If one uses the founding link, switch it to an issued link and keep the founding case in 4.5.

## 5. The founder is pointed at the founding link

- [x] 5.1 `listJoinCodeIssuances` (identity repository): add `isFoundingLink` to each row. Add `isFoundingLink: false` to the hand-built fixture in `tests/unit/identity/members-page-capabilities.test.ts` (~lines 52-66), or tsc fails.
- [x] 5.2 `src/app/(org)/members/members-view.tsx`: on the founding link's row, only while it is unused, not deleted and not expired:
  - show the label and hint in place of the generic warning;
  - render the URL as a plain `<a href>` to the join path (no `next/link`).
  - Draft strings in `src/ui/strings/de.ts`: `foundingLinkLabel: "Dein Gründungslink"`, `foundingLinkHint: "Nur für dich. Wer darüber beitritt, wird Moderator:in."`.
  - Unit test in `members-page-capabilities.test.ts`: the label and link show for a live founding link, not for a used or ordinary one, and the generic warning is absent on the founding row. Deliberate break: drop the "unused" condition.
- [x] 5.3 Identity repository: a read-only `getLiveFoundingLinkPath(context): Promise<string | null>`. It returns the join path of the household's founding link when it is unused, not deleted and not expired. It runs under the caller's context with a `household_id` predicate, and returns `null` for a caller without `manage_join_codes` (G-C: the code is a secret). Integration test: the household account gets the path; a plain resident gets `null`; after the founding join, the household account gets `null`.
- [x] 5.4 `src/app/(org)/organization/page.tsx`: for the household account (no `manage_rounds`), when 5.3 returns a path, render a featured card in place of the noRoundYet card. Draft copy in `de.ts`: heading „Tritt deiner WG selbst bei", body „Über deinen Gründungslink wirst du Bewohner:in und Moderator:in. Nur für dich — gib ihn nicht weiter.", and a primary plain `<a href>` „Jetzt beitreten". Extend `tests/unit/casting/organization-round-button.test.ts`'s mocks: the card shows for the household account with a path, and is hidden without one or once a round exists. Deliberate break: render it regardless of the path.

## 6. Docs and specs

- [x] 6.1 Add dated amendments (2026-10-06, human decision), German in German docs, never translating a quote. Call the rule „Moderation über den Gründungslink", distinct from the existing „Gründungs-Link-Ausnahme" (the deferred usage-limit prefill).
  - `docs/domain/identity.md`, Rolle-Vorbelegung box: say that this is not the 2026-09-22 first-joiner automatism, and address its „Abgabebedingung" explicitly: no template, no new permission set, the existing moderator set stored on one named path, so S-04 stays closed.
  - `docs/03-PRD.md` §4.0.1 (the moderator-appointment row or its note).
  - `docs/backlog/requirements/F1-requirements.md` FR-1.8.
  - `F2-requirements.md` (the founding link), each in its own amendment style.
- [x] 6.2 `docs/review-log.md` §Offene-Punkte-Register: add a closed row for the 2026-10-06 decisions, in the register's format:
  - the founding link confers moderator;
  - the household account may redeem it, ending its session;
  - round rights for the household account were dropped, and S-50/U-20 are unchanged.
- [x] 6.3 Run `node tools/check-refs.ts` and `npx openspec validate founding-link-moderator --strict`.

## 7. Gate

- [x] 7.1 `npm run verify` green. A single 60 s timeout on shared dev is re-run once; never raise a timeout.
- [ ] 7.2 (partial, 2026-10-06: register, founding card at 375 px and the join form for the household session checked in the browser; the submit-to-Start step is covered by integration tests only and is left for the human) Browser walkthrough on the local dev server (synthetic data, `@example.test`). Take screenshots for the PR:
  - register a test household and land on `/organization`, which shows the founding card;
  - click „Jetzt beitreten" while signed in as Verwaltung and join;
  - land on Start as moderator, with the moderation bridge showing the first round;
  - open the organisation tab and reach „Runde eröffnen".

## 8. Revision after the Copilot round on PR #56 (design R1–R3)

- [x] 8.1 R1: `isHouseholdAccount(context)` in the identity repository replaces every `profileId === null` identity check (join page, `joinHousehold` pre-Auth, organisation card). Classify it read-only in the authorization matrix. Test it: a non-resident moderator is refused the founding join with `already_member`. Deliberate break: revert to `profileId === null`.
- [x] 8.2 R2: amend `drizzle/0034_founding_link.sql` in place: the CHECK gains `max_uses = 1`, plus the `join_code_issuance_founding_guard` trigger. Raw-SQL tests for each refusal, with positive controls.
- [x] 8.3 Re-apply the amended 0034 to `flatmate-io-dev` and confirm the CHECK definition and the trigger in the catalog.
- [x] 8.4 R3: `MembersView` takes `callerIsHouseholdAccount`; moderators see caller-neutral copy. Unit test with a deliberate break.
- [x] 8.5 `.claude/rules/implementation-hazards.md`: two lessons (a privilege-granting value needs its whole write boundary in the DB; identify a role by stored permissions, not session shape).
- [x] 8.6 `npm run verify` green, then push and re-request review.
