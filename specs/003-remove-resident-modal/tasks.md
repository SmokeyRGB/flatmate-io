# Tasks: Remove-Resident Confirmation Dialog

**Input**: Design documents from `specs/003-remove-resident-modal/`
**Prerequisites**: plan.md, spec.md, research.md, quickstart.md

**Tests**: Not included as new automated tasks — `research.md` Decision 5 explains why (no jsdom/
component-testing harness exists in this project; DOM-level behavior is verified manually against
the dev server, matching `002-f1-casting-round`'s own established practice). FR-004's underlying
removal logic is already covered by existing tests and is run, unchanged, as a regression check
(T007).

**Organization**: by user story, per `spec.md`'s two priorities (P1 confirm-and-remove, P2
cancel/dismiss). Both stories share the same dialog wrapper built in Foundational — this feature
is small enough that no story-specific *code* remains once Foundational is done; each story's own
tasks are its acceptance-scenario verification.

## Phase 1: Foundational (blocking prerequisites for both user stories)

**⚠️ CRITICAL**: No user story task may begin until this phase is complete.

- [X] T001 [P] Add `.dialog` and `.dialog::backdrop` component classes to `src/app/globals.css`
      (`research.md` Decision 6), in the same `@layer components` block as the existing
      `.callout`/`.card-featured` classes: a centered panel using the project's existing card
      tokens (radius, shadow, `bg-card`), a max-width appropriate for the confirmation form it
      wraps, and a dimmed `::backdrop`.
- [X] T002 [P] Document the new dialog pattern in `docs/09-Design-System.md`, scoped to this one
      confirmation-dialog use case (`research.md` Decision 6) — describe it as derived from the
      prototype's `Dialog`/`AlertDialog` visual shape (`prototype/src/components/ui/dialog.tsx`,
      `prototype/src/components/fm/Confirm.tsx`) without introducing that library; note this is
      the project's first dialog pattern and is deliberately not a general-purpose spec for every
      future confirmation. **Found already done**: `docs/09-Design-System.md`'s existing
      "Dialogs & confirmations" section (line 82) already fully specifies this exact pattern —
      title, consequence explanation, nested cautionary callout, typed-name field with a
      placeholder previewing the expected value, and a **solid** destructive confirm button
      disabled at 50% opacity — meaning F1's inline implementation was a deviation from the
      project's own design-system doc, not only from the prototype (research.md's finding).
      No new documentation written; T003 was corrected to match the existing spec exactly
      (including switching the confirm button from a link-style to the documented solid
      `.btn-destructive`).
- [X] T003 Rewrite `src/app/(org)/members/remove-member-form.tsx`: wrap the existing form in a
      native `<dialog ref={...}>` element opened via `dialogRef.current.showModal()`
      (`research.md` Decision 1 — plain `open` attribute alone does not get modal/focus-trap
      behavior); add a "Remove" trigger button (replacing the always-visible input as the row's
      default state, FR-001); move the cautionary text currently in `page.tsx`'s standalone
      callout into the dialog (FR-002, `spec.md` Assumptions); keep the existing typed-name
      input, `disabled={pending || typedName !== displayName}` logic, and `state.error` display
      unchanged (FR-003, FR-004, FR-008).
- [X] T004 In the same file, add a "Cancel" `<button type="button">` that calls
      `dialogRef.current.close()` and resets `typedName` to `""`; attach the same reset to the
      dialog's native `close` event (covers the Escape-dismiss path, which fires `close` without
      a separate handler needed) so both the explicit cancel and the standard dismiss gesture
      leave the field empty on next open (`research.md` Decisions 2/3, FR-005, FR-006).
- [X] T005 Update `src/app/(org)/members/page.tsx`: remove the standalone `callout
      callout-caution` block at the bottom of the member list (its text now lives in the dialog
      per T003) and confirm no other reference to that callout's text remains on the page
      (FR-001, FR-002, `spec.md` Assumptions). Also removed the now-unused `TriangleAlert` import.

**Checkpoint**: the dialog exists, opens/closes/resets correctly, and contains the same
functional removal logic as before — both user stories are now verifiable.

---

## Phase 2: User Story 1 - Confirm a resident removal through a focused dialog (Priority: P1) 🎯 MVP

**Goal**: Clicking "Remove" opens a dialog with the cautionary text and a disabled confirm
control; typing the exact display name enables it; confirming removes the member exactly as
`002-f1-casting-round` already does, with no behavior regression.

**Independent Test**: Click "Remove" on a member row, confirm the dialog opens with the
cautionary explanation and a disabled confirm action; type the exact display name; confirm the
action becomes enabled and, once activated, removes the member exactly as today (access revoked,
one audit entry naming both the account and the acting profile).

- [X] T006 [US1] Manual UI check against `npm run seed:demo`'s household (`quickstart.md` §1,
      steps 1–4): no member row shows the confirmation input by default (FR-001); clicking
      "Remove" opens the dialog with the cautionary text and a disabled confirm control (FR-002,
      FR-003); typing the exact display name enables it; confirming removes the member — the row
      stays present, correctly re-rendering as "moved out" with a Reactivate action (`removeMember`
      is a soft transition, not a deletion) — and the dialog closes itself once the action
      resolves (FR-004). **Found and fixed during this check**: the dialog initially did not
      close on success at all, because research.md's original Decision 4 wrongly assumed the row
      would unmount; corrected in both the code (`remove-member-form.tsx`'s new `useEffect`) and
      `research.md`/`quickstart.md`. Verified via a Playwright walkthrough against the live dev
      server.
- [X] T007 [P] [US1] Run `vitest run tests/integration/policy/resident-list-access.test.ts
      tests/integration/policy/resident-list-audit.test.ts` and confirm both pass unchanged — the
      regression check for FR-004 (`quickstart.md` §1). Confirmed: 2 files, 3 tests, all pass
      unmodified.
- [X] T008 [US1] Manual UI check (`quickstart.md` §1 step 6): the confirm control disables itself
      while the removal request is in flight (FR-007). Confirmed via Playwright: the button's
      `disabled` state is `true` ~150ms after clicking, well before the ~2–4s live-Supabase round
      trip resolves.
- [~] T009 [US1] Manual UI check (`quickstart.md` §1's note on FR-008): trigger a removal failure
      and confirm the dialog shows an inline error rather than closing silently (FR-008). **Not
      independently exercised**: the client already disables the confirm button until the typed
      name matches, so the mismatch error path isn't reachable through normal UI interaction, and
      reproducing the narrower race (name matches client-side, then a concurrent change causes
      the server call to fail) wasn't attempted in this pass. The rendering logic itself
      (`{state.error && <p className="field-error">...}`) is unchanged from the original inline
      implementation and the underlying `DisplayNameConfirmationMismatchError` path is already
      covered by `tests/integration/policy/resident-list-audit.test.ts` (T077,
      `002-f1-casting-round`) — but that test doesn't exercise this dialog's rendering. Flagging
      as a real, acknowledged gap rather than claiming verification that didn't happen.

**Checkpoint**: User Story 1 is independently functional and verified — the core confirm-and-
remove flow works with no regression from `002-f1-casting-round`.

---

## Phase 3: User Story 2 - Dismiss the dialog without changing anything (Priority: P2)

**Goal**: The dialog can always be closed without side effects, via both an explicit control and
the standard dismiss gesture, and never leaves stale input behind.

**Independent Test**: Open the dialog for a member, then close it via a visible cancel control
and separately via the standard dismiss gesture, in each case without completing the typed-name
confirmation; confirm the member's status is unchanged and no audit entry was recorded either
time.

- [X] T010 [US2] Manual UI check (`quickstart.md` §2, steps 1–2): activating Cancel closes the
      dialog with the member unchanged; dismissing via Escape does the same (FR-005). Confirmed
      via Playwright for both Sam (Cancel) and Alex (Escape) — dialog closes, member row
      unchanged in both cases.
- [X] T011 [US2] Manual UI check (`quickstart.md` §2 step 3, browser network panel): no
      `removeMemberAction` submission fires on cancel or dismiss — only on confirming with the
      matching name. Confirmed: request count was 0 after Cancel, exactly 1 total across the
      whole walkthrough (from the single real confirm).
- [X] T012 [US2] Manual UI check (`quickstart.md` §1 step 5): after cancelling an attempt for a
      member, reopening that same member's dialog shows an empty confirmation field, not the
      previously typed text (FR-006). Confirmed: field value was `""` on reopen after typing
      "wrong" and cancelling.

**Checkpoint**: Both user stories are independently functional and verified.

---

## Phase 4: Polish & Cross-Cutting Concerns

- [X] T013 [P] Confirm zero new dependencies: `git diff 002-f1-casting-round -- package.json
      package-lock.json` produces no output (`quickstart.md` §3, `concept.md`'s recommended
      option). Confirmed — zero output against this feature's actual base branch (corrected from
      an initial diff against `main`, which would have shown `002-f1-casting-round`'s own
      pre-existing dependency additions as a false positive).
- [X] T014 Run the full gate: `npm run verify`, `npm run build`,
      `bash tools/check-refs.sh --quiet` — all clean (`quickstart.md` §4). Confirmed: 91/91 tests
      (49 files), clean build (12 routes), 0 `check-refs.sh` findings.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Foundational (Phase 1)**: no dependencies on other phases. **Blocks both user stories** —
  T003/T004 build the dialog both stories verify; T005 depends on T003 (the callout's text must
  exist in the dialog before it's removed from the page).
- **User Story 1 (Phase 2)**: depends on Foundational only.
- **User Story 2 (Phase 3)**: depends on Foundational only — independently verifiable from User
  Story 1, though both exercise the same dialog built once in Phase 1.
- **Polish (Phase 4)**: depends on both user stories being verified.

### Parallel Opportunities

- T001 and T002 (Foundational) in parallel — different files, no ordering dependency.
- T007 (Phase 2) can run in parallel with the manual checks around it — it's an automated,
  non-interactive check.
- T013 (Polish) can run any time after Foundational — independent of the manual UI checks.

## Implementation Strategy

**MVP first**: Phase 1 (Foundational) → Phase 2 (User Story 1). The dialog's cancel/dismiss
behavior (User Story 2) is built in Phase 1 alongside the confirm flow (native `<dialog>`
provides Escape-dismiss for free, per `research.md` Decision 2) — Phase 3 is verification of
behavior that already exists once Phase 1 is done, not additional implementation.

**Incremental delivery**: Foundational → US1 (confirm flow, MVP) → US2 (cancel/dismiss
verification) → Polish.

---

## Phase 5: Convergence (2026-09-17, /speckit-converge)

- [X] T015 Broaden `removeMemberAction`'s error handling
      (`src/app/(org)/members/actions.ts`) to gracefully surface **any** `removeMember` failure
      as the dialog's inline `{error}` message — not only `DisplayNameConfirmationMismatchError`.
      Previously any other failure (e.g. `Error("Membership not found for account
      ${targetAccountId}")`, `src/modules/identity/repository.ts:404`) was rethrown unhandled,
      which is exactly spec.md's own named edge case ("the member's own state changes... e.g.
      someone else already removed them") — it would have surfaced as Next's default crash
      screen instead of the calm inline error FR-008 requires. Fixed with a broadened catch
      returning a deliberately generic message (the underlying repository errors like "Membership
      not found for account &lt;uuid&gt;" aren't written for a moderator to read). Per FR-008 /
      spec.md Edge Cases (partial).

      **Verification**: a browser-level reproduction was attempted (tampering the dialog's hidden
      `accountId` field via Playwright before submit) but proved unreliable — React's form
      reconciliation resubmitted the real value regardless, actually removing the test member
      instead of simulating a stale target. Verified instead at the repository layer, which is
      directly testable without fighting the framework: new test
      `tests/integration/policy/resident-list-audit.test.ts` ("removeMember throws a plain
      (non-mismatch) error for a target with no Membership row") pins the exact failure
      `removeMember` produces for a stale/nonexistent target, confirming it's a plain `Error`,
      not `DisplayNameConfirmationMismatchError` — exactly the case `actions.ts`'s broadened catch
      must (and, by code review, does) handle. The dialog-level rendering of that generic message
      was not independently re-verified in a browser after this fix, beyond the code review that
      it reuses the same `state.error` rendering already confirmed working for the mismatch case
      (T006).

**Checkpoint**: re-run `/speckit-converge` after T015 lands.
