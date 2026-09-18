# Bug Fix: Icon/text buttons misaligned on mobile (Members page) — corrected

- **Slug**: mobile-button-alignment
- **Fixed**: 2026-09-17
- **Assessment**: ./assessment.md
- **Status**: applied

## Summary

Superseded the previous icon-baseline-only fix. The actual cause was that each resident row's
action area mixed a tall pill button ("Make moderator"/"Make member") with plain-text destructive
links ("Moved out"/"Remove") in one shared `flex flex-wrap` row, so the wrap point depended on the
toggle button's label width and differed between residents. Restructured
`src/app/(org)/members/page.tsx` into the two separate action rows `docs/09-Design-System.md:84`
already specifies — an admin-toggle row, then a destructive-links row — so each row's wrap behavior
is now internally consistent and independent of the other row's content.

## Changes

| File | Change | Notes |
|------|--------|-------|
| `src/app/(org)/members/page.tsx` | modified | Replaced the single `mt-3 flex flex-wrap items-center gap-2` action container with `mt-3 space-y-2`, and wrapped the admin-toggle button, the "Moved out"/"Remove" pair, and the `Reactivate` button each in their own `flex flex-wrap items-center gap-2` row |

## Diff Highlights

```tsx
<div className="mt-3 space-y-2">
  {m.status !== "moved_out" ? (
    <>
      {isAdmin && m.role === "member" && (
        <div className="flex flex-wrap items-center gap-2">
          {/* Make moderator */}
        </div>
      )}
      {isAdmin && m.role === "moderator" && (
        <div className="flex flex-wrap items-center gap-2">
          {/* Make member */}
        </div>
      )}
      <div className="flex flex-wrap items-center gap-2">
        {/* Moved out, Remove */}
      </div>
    </>
  ) : (
    <div className="flex flex-wrap items-center gap-2">
      {/* Reactivate */}
    </div>
  )}
</div>
```

All existing conditionals (`isAdmin && m.role === …`, `m.status !== "moved_out"`,
`RemoveMemberForm`) are unchanged — only the grouping/wrapper divs moved.

## Tests Added or Updated

- None — pure markup regrouping, no new conditional logic. Existing coverage for
  `setMemberRoleAction`/`setMovedOutAction`/`removeMemberAction`/`reactivateMemberAction` (in
  `tests/integration/policy/resident-list-audit.test.ts` and related) is unaffected since which
  controls render and their `action`/hidden-field wiring didn't change.

## Local Verification

- Commands run:
  - `npm run lint` → pass, clean.
  - `npx tsc --noEmit` → pass, clean.
  - `npm test` (vitest) → pass, 49 test files / 92 tests.
- Manual checks: confirmed the running dev server (`localhost:3001`) stayed up and served the page
  without errors after the edit (Turbopack hot-reload, no restart needed). Did not capture a new
  screenshot in this session — recommend the user re-check `/members` at phone width, comparing a
  resident with a long toggle label ("Make moderator") against one with a short one ("Make member")
  to confirm both rows now wrap the same way.

## Deviations from Assessment

None — applied exactly as proposed.

## Follow-ups

- User to visually re-confirm at phone width (the actual failure mode of the previous fix was that
  it looked right in isolation but didn't address what the user was seeing — worth closing the loop
  with a real look this time before marking it done).
