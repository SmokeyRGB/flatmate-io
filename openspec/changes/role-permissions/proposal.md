## Why

Identity still answers about 20 authorization and visibility questions by reading
`membership.role` (`assertIsAdministration`, `assertIsAdministrationOrModerator`, inline
`role === …`), next to the stored permissions that change 2 (`application-capture`) made the only
rights mechanism. A permission granted or revoked in storage is honoured by `assertHasPermission`
and silently ignored by every role check. The human decided on 2026-09-28/29 that *"the terms
'household' or 'moderator' should simply map to permissions; they shouldn't be a separate
workaround for permissions"*, and on 2026-10-01 (Exercise 16 code audit,
`audit/technical-debt.md` finding #1) called the surviving role checks a critical error to fix
before v0.1 ships. This is F3 change 2b, promoted ahead of change 4 by the human on 2026-10-01.

## What Changes

- **One permission per row of the Rechtematrix** (`docs/03-PRD.md` §4.0.1) for every action that
  is built, declared in one table with the roles that may hold it, so each row can later move to
  another role on its own (human, 2026-10-01: the assignment stays debatable). New or changed:
  - `manage_join_codes`, `create_resident_profile`, `appoint_moderator`, `manage_members`
    (remove / move out / reactivate), `export_subject_access`: household and moderator, never a
    plain member;
  - `issue_password_reset_link`: household only (the O-16 box, `domain/identity.md` §2.1);
  - **`manage_rounds` replaces `close_round`**, which today gates creating and opening a round
    (closing is not built yet) and so names the opposite of what it does. Matrix row
    *„`CastingRound` anlegen / schließen / wiedereröffnen"*;
  - **`manage_round_participation`** (moderator only) for adding participants, its own matrix row.

  - **`vote`**, the resident set's first permission (*„`Vote` abgeben / ändern"*: moderator ✅ only
    if a resident, resident ✅). F4 change 1 already built voting; its gate (`assertAccountCanVote`)
    reads `is_resident` directly. It now checks `vote`, and `castVote` and the screening-pass reads
    check it inside their transaction. **2b is therefore applied after F4 change 1 merges** (design
    D11), which also lets migration `0029` follow F4's `0028` without journal surgery.

  - **`manage_voting_procedure` replaces `manage_settings`** (human, 2026-10-02: too broad).
    *„Household anlegen"* is registration and needs no permission; every built setting is the voting
    procedure, which has its own matrix row; household-level settings (name, contact address,
    privacy page) get `manage_household_settings` when they are built. Household set, moderator ⬜,
    open to debate.
  - Renames and splits are declared (`REPLACED_PERMISSIONS`): the migration carries holders over,
    the old name is retired, the contract migration strips it.

  Unchanged: `manage_rooms`, `create_application`, `change_application_state`,
  `reverse_application_state`.
- **Residents only vote and take part in the casting (human decision, 2026-10-01).** Rounds,
  participants and applications are moderation, reached only from the organisation area. No
  permission is holdable by a plain resident any more; individual grants (⬜) remain only for the
  moderator. This amends SRD **S-04** (precedence 2), the resident column and an AC of
  `03-PRD.md` §4.0.1, and FR-1.8. The database enforces it for the new values now and, after the
  contract step, for `create_application`, `change_application_state` and `manage_rooms` too (old-code tests on other branches still grant those to residents on dev).
- **Behaviour change by human decision (2026-10-01): a moderator may create resident profiles and
  appoint or demote moderators.** Creating a profile for a newcomer to claim by personal join link
  is part of the casting; appointing more moderators shares the organising load. Today both are
  household-only, and the matrix gives the moderator ❌. This change amends `03-PRD.md` §4.0.1
  (the two rows), FR-1.3 and EC-1.7 to match, with the decision recorded.
- **Every role check becomes a permission check**, with one denial error (`PermissionDeniedError`).
  `assertIsAdministration` and `assertIsAdministrationOrModerator` are removed; the household
  settings read gates on `manage_voting_procedure`. Each mutator checks inside its own write transaction with the
  caller's membership locked `FOR SHARE`, as `captureApplication` already does, so a demotion or
  removal committed first is seen.
- **`getResidentList` returns capability flags** derived from the stored permissions
  (`canManageMembers`, `canIssueResetLink`) instead of
  `isAdmin`/`canAct`, and `getNavigationAccess` derives its two flags from permissions alone. The members page renders from those flags
  only. **BREAKING** (internal API): the `isAdmin`/`canAct` fields go away.
- **Access is lost at once, on every route** (human, 2026-10-01): every page of the organisation
  area checks the caller's stored permissions on each request and shows the access message when
  none grants an organisation action, so a demoted moderator loses the area on reload. The
  overview's links are offered by permission, and its household-account shortcut
  (`profileId === null`) goes. This takes over the permission-based half of change 5's planned
  organisation guard.
- **Hardening:** `getResidentList` takes an `accountId` argument, and today a caller can pass
  another account's id and so borrow that account's rights (audit finding #1, the PR #19 hole). It
  now refuses any id that is not the session's own. Who may *see* the list is unchanged.
- **Database, expand/contract** (human instruction, 2026-10-01: other branches still write the old
  sets on the shared dev database). This change's re-runnable migration `0029_role_permissions`
  backfills the new values into the live household and moderator memberships, raises only the
  household CHECK's upper bound, and adds three holder CHECKs (household-only, household-or-moderator,
  resident-only) beside the widened moderator-only one: household-only permissions are held only by
  the administering membership, and the household-or-moderator permissions are never held by a
  plain member (matrix ❌ for residents, not ⬜). The lower bounds (household exact again,
  moderator holding the new values) come in a follow-up change `role-permissions-contract`
  (numbered when written; WP01 holds `0030`), once every open branch has rebased onto this one.
- **A ninth guardrail lint** (`scripts/lint/role-reads.ts`) refuses a comparison against a role
  outside named state reads, so a role check cannot come back.
- **Docs:** `03-PRD.md` §4.0.1 (two matrix rows), `backlog/requirements/F1-requirements.md`
  FR-1.3 and EC-1.7, `domain/identity.md` §2.1 (permission list, the reset-link box, the „hängen an der
  Rolle" sentence), `screens/O-organisation.md` O20 access rule, `docs/review-log.md`.

## Capabilities

### New Capabilities

- `identity/member-administration`: who may see the resident list and act on it, create a
  profile, appoint a moderator, issue a reset link, manage join links and trigger a subject-access
  export, all as stored permissions; the capability flags the list returns; the lint that keeps
  role reads out of authorization.

### Modified Capabilities

- `identity/permissions`: one permission per matrix row with declared holders; the household and
  moderator sets grow; `close_round` is renamed `manage_rounds`; participation splits off; the
  CHECKs derive from the declaration; the backfill and transition scenarios.
- `identity/password-reset`: the issuing right is named as the stored, household-only
  permission `issue_password_reset_link`; observable behaviour is unchanged.

## Impact

- **Code:** `src/modules/identity/{schema,repository}.ts`; `src/modules/casting/repository.ts` (the `close_round` gates → `manage_rounds`, `addResidentToRound` → `manage_round_participation`); `src/app/(org)/rounds/new/{page,actions}.ts`; `src/app/(org)/members/{page,actions}.tsx`,
  `src/app/(org)/settings/page.tsx`, `src/app/(org)/organization/page.tsx`, every other
  `src/app/(org)/**/page.tsx` (the area check); `scripts/lint/role-reads.ts`;
  `package.json` (`verify`). RLS policies and the `SECURITY DEFINER` functions read no role and are
  untouched.
- **Database:** migration `0029_role_permissions.sql` (agent-appliable: no `DROP COLUMN`, no
  `SECURITY DEFINER`), after F4's `0028_vote`.
- **Depends on** F4 change 1 (`screening-pass`) being merged; `src/modules/deliberation/repository.ts`
  is touched for the vote gates.
- **Tests:** the authorization matrix gains a moderator and an individually-granted-member
  column; new characterization tests for the moderator gaps the audit lists; the constants test
  and a backfill test for 0029.
- **Unblocks** the Cursor work packages WP09–WP12 (`audit/cursor/README.md`).
- **Guardrails touched:** **G-C** (authorization within a household — every gate in identity moves
  to a different mechanism; behaviour preserved except where the matrix says otherwise, listed in
  design.md); **G-D**: no `expect` line in a guarded test changes; G-D15's vote tests call
  `castVote` and the screening reads, which keep their `profileId === null` early exit before the new
  `vote` check, so those assertions hold; **G-L**: not touched. No RLS policy changes, so G-C7's two-sided rule applies only to
  the new CHECKs (raw-SQL tests).

## Assumptions

1. **No permission for actions not built yet** (deletion, notes, slots, appointments, retention,
   votes, individual grants): each arrives with its feature as one new row, per D1's walk through
   the matrix.
2. **The moderator gains `export_subject_access`** (behaviour change), because the matrix gives it
   ✅. Only the household's variant exists today (a stub returning a handle, AC-1.17 *"without its
   contents being displayed"*); the moderator's *„mit Einsicht"* content arrives with the real
   export (G-D6, v0.2). No screen calls the stub.
3. **A moderator individually granted `manage_voting_procedure` sees the voting-procedure settings**
   (the only kind of individual grant left) once it gates on `manage_voting_procedure`
   (matrix ⬜ for the moderator). No such grant exists, and no screen grants one.
4. **Out of scope, unchanged:** voting eligibility (`is_resident`, `assertAccountCanVote`) and the
   credential flows' `is_resident` checks in `auth.ts` decide the account type (ADR-013, S-04's
   "three independent things"), not a role's rights; `vote` is added here, as the resident set; F4/F5's later resident actions add theirs. Role **writes** (registration, appointment, revocation) and
   the role↔set CHECKs stay.
