# Quickstart: Validating Remove-Resident Confirmation Dialog

Proves the two user stories in `spec.md` hold, once implemented. Not a build guide — see
`tasks.md` (from `/speckit-tasks`) for implementation steps.

## Prerequisites

- `002-f1-casting-round` merged — this feature only changes `/members`'s presentation of an
  already-implemented, already-tested removal flow (`removeMemberAction`, `removeMember`).
- A household with at least one removable member — `npm run seed:demo` creates one (household
  `demo-household@example.test`, residents "Alex"/"Sam") in under a minute.

## 1. Confirm a removal through the dialog (US1, FR-001–FR-004, FR-006–FR-008)

```bash
npm run dev
npm run seed:demo   # if you need a fresh member to remove
```

**Manual UI check** (this feature has no new automated DOM-level test — see `research.md`
Decision 5): sign in to the seeded household as administration, open `/members`, and confirm:

1. No member row shows a "type the name to confirm" input by default (FR-001).
2. Clicking "Remove" on a member opens a dialog containing the cautionary explanation and a
   confirm control that starts disabled (FR-002, FR-003).
3. Typing anything other than the exact display name keeps the confirm control disabled; typing
   the exact name enables it (FR-003).
4. Activating confirm removes the member — `removeMember` performs a soft `moved_out`
   transition (not a deletion), so the row stays in the list and re-renders with a "moved out"
   badge and a "Reactivate" action, matching today's behavior (FR-004) — and the dialog closes
   itself once the action resolves successfully (research.md's corrected Decision 4).
5. Reopening the dialog for a *different* member and then cancelling, reopening it again for the
   *same* member, shows an empty confirmation field both times (FR-006).
6. With the network throttled or a breakpoint held (or by reading the code), confirm the button
   disables itself while the request is in flight, before the row disappears (FR-007).

```bash
vitest run tests/integration/policy/resident-list-access.test.ts
vitest run tests/integration/policy/resident-list-audit.test.ts
```

**Expected**: both pass unchanged — FR-004 requires the exact same permission check, access
revocation, and audit-event behavior as `002-f1-casting-round` already tests; this feature does
not modify `removeMember`'s own logic, only what calls it.

## 2. Cancel or dismiss without changing anything (US2, FR-005–FR-006)

**Manual UI check**:

1. Open the dialog for a member, activate its Cancel control. Confirm: the dialog closes, the
   member's row is unchanged (still present, same role/status badges).
2. Open the dialog again, dismiss it via Escape instead of Cancel. Confirm the same: dialog
   closes, member unchanged.
3. In neither case does a network request fire — confirm via the browser's network panel that no
   `removeMemberAction` submission occurs on cancel/dismiss (only on confirming with the matching
   name).

## 3. Design-system pattern check

Confirm `docs/09-Design-System.md` gained a scoped dialog-pattern entry (research.md Decision 6)
and that `src/app/globals.css`'s new `.dialog`/`.dialog::backdrop` classes are the only new CSS
this feature adds — no new dependency in `package.json` (per `concept.md`'s recommended option).

```bash
git diff 002-f1-casting-round -- package.json package-lock.json
```

**Expected**: no output against this feature's actual base branch — this feature adds zero new
dependencies. (Diffing against `main` instead would also show `002-f1-casting-round`'s own
earlier dependency additions, e.g. `lucide-react`/`husky` — not a regression from this feature.)

## 4. Full gate

```bash
npm run verify
npm run build
bash tools/check-refs.sh --quiet
```

**Expected**: all three clean, consistent with every prior feature in this repository.
