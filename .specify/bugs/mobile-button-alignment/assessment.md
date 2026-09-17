# Bug Assessment: Icon/text buttons misaligned on mobile (Members page) — re-assessed

- **Slug**: mobile-button-alignment
- **Created**: 2026-09-17
- **Re-assessed**: 2026-09-17 (previous fix confirmed live but did not resolve the symptom — see
  `./test.md`)
- **Source**: pasted text + screenshot of `/members` in mobile view (same report, second pass)
- **Verdict**: valid
- **Severity**: low

## Report (verbatim or summarized)

"The buttons do not align properly in mobile view." A first pass (this same `assessment.md`,
superseded below) diagnosed and fixed an icon-vs-text baseline issue inside `.btn-link`. That fix
was confirmed deployed (live served CSS checked directly) and the user still reports the same
layout. This is a corrected root-cause analysis.

## Symptom

On `/members`, each resident row's action area (`src/app/(org)/members/page.tsx:114-159`) renders
*all* of its controls — the admin role-toggle button ("Make moderator"/"Make member") and the two
destructive link actions ("Moved out", "Remove") — inside one single `flex flex-wrap items-center
gap-2` container. These controls have very different visual weight and box height:

- `.btn`/`.btn-secondary` ("Make moderator"): a solid pill, `padding: 0.625rem 1.25rem`
  (`globals.css:104-129`) — tall, ~40px.
- `.btn-link` ("Moved out", "Remove"): plain underlined text, no padding — short, ~20px.

Mixed into one wrapping row, the point at which the row wraps depends on the pixel width of the
toggle button's label. "Make moderator" (9 chars) is wide enough that "Remove" gets pushed to its
own line; "Make member" (7 chars, on Alex's row) is short enough that everything fits on one line
instead. The result: two structurally-identical resident rows end up with visibly different action
layouts next to each other on a narrow screen — which is what reads as "buttons don't align."

This is not a CSS bug in `.btn`/`.btn-link` (both individually render correctly) — it is a markup
structure issue: these two families of controls, of very different shape, are sharing one flex-wrap
container instead of being deliberately grouped.

## Reproduction

1. Open `/members` as an administrator with at least one active resident.
2. Resize to a phone-width viewport (< 400px).
3. Compare two resident rows where one's toggle label is long ("Make moderator") and another's is
   short ("Make member"): the long-label row wraps its destructive actions ("Moved out"/"Remove")
   differently than the short-label row does, producing a visually uneven, "misaligned" set of rows.

## Suspected Code Paths

- `src/app/(org)/members/page.tsx:114-159` — the `canAct && m.accountId` block renders the toggle
  button and both destructive actions inside one shared `<div className="mt-3 flex flex-wrap
  items-center gap-2">` (line 115), with no grouping between "reversible admin toggle" and
  "destructive-weight leave actions."
- `docs/09-Design-System.md:84` — the authoritative visual spec for this exact roster row already
  describes the intended structure: "a richer roster row … adds … **then two rows of actions**:
  neutral secondary buttons for reversible administrative toggles … and brick-red icon+text
  link-style actions for the two ways a person leaves." The current markup collapses this into one
  row, deviating from the documented pattern.
- `src/app/globals.css:104-140` — `.btn`/`.btn-secondary`/`.btn-link` definitions themselves are
  fine (and the earlier icon-baseline fix on `.btn-link` here was legitimate, just not the dominant
  cause of the reported symptom).

## Root Cause Hypothesis

High confidence: the resident-row action area mixes a tall pill button with short plain-text link
actions in a single flex-wrap row, instead of the two separate action rows `docs/09-Design-System.md`
already specifies. Flex-wrap's break point is then driven by incidental label-text width (differs
per member: "moderator" vs "member"), so different resident rows wrap differently and look
inconsistent on narrow viewports — this, not any single button's internal alignment, is what a user
perceives as "buttons do not align."

## Proposed Remediation

**Preferred**: Split the action container in `src/app/(org)/members/page.tsx` into two rows, matching
`docs/09-Design-System.md:84`'s documented pattern:
- Row 1 (only rendered when `isAdmin` and a toggle applies): the "Make moderator"/"Make member"
  secondary button, in its own `flex flex-wrap items-center gap-2` row.
- Row 2: the "Moved out" and "Remove" destructive link actions together, in their own
  `flex flex-wrap items-center gap-2` row.
- The `Reactivate` case (moved-out member) stays a single-row block, unchanged.

Wrap both rows in a `space-y-2` (or similar) container replacing the current single flex row, so
each row's wrap behavior is now internally consistent (same control type/height within a row) and
independent between rows — every resident row will look the same shape regardless of label length.

**Alternatives** (optional):
- Give `.btn-secondary` a fixed/matching min-height with `.btn-link` so they can stay in one row
  and still look aligned — rejected: fights the documented two-row pattern and doesn't fix the
  underlying wrap-inconsistency-by-label-length problem, only makes the mismatch less visually
  jarring.

**Files likely to change**:
- `src/app/(org)/members/page.tsx` (restructure the `canAct && m.accountId` block into two rows)

**Tests to add or update**:
- None required — this is a markup/layout restructuring with no new conditional logic; existing
  tests around `setMemberRoleAction`/`setMovedOutAction`/`removeMemberAction` already cover the
  underlying behavior and are unaffected by a pure DOM-grouping change.

## Risks & Considerations

- Must preserve all existing conditionals exactly (`isAdmin && m.role === "member"`, `isAdmin &&
  m.role === "moderator"`, the `m.status !== "moved_out"` branch, `RemoveMemberForm`) — this is a
  restructuring of the JSX tree, not a change to which controls render or when.
- Should double check the earlier `.btn-link` icon-centering fix (`globals.css:134`) is left in
  place — it was a legitimate, if secondary, correctness fix and should not be reverted.

## Open Questions

- None.
