# Bug Fix: gitleaks blanket path allowlist for `.env.example`

- **Slug**: gitleaks-env-example-blanket-allowlist
- **Fixed**: 2026-09-18
- **Assessment**: ./assessment.md
- **Status**: applied

## Summary

Replaced the `.gitleaks.toml` `[allowlist]` block's blanket `paths` exemption for
`.env.example` (which suppressed every finding in that file, real secret or not) with a narrow
`regexTarget = "match"` + `regexes` exemption that only ignores strings matching the file's actual
placeholder shape (`[YOUR-...]`). A real credential pasted into that file is now caught again.

## Changes

| File | Change | Notes |
|------|--------|-------|
| `.gitleaks.toml` | modified | Swapped `paths = ['''(^|/)\.env\.example$''']` for `regexTarget = "match"` + `regexes = ['''^\[YOUR-[A-Z0-9-]+\]$''']`; updated the comment to explain why match-level scoping is used instead of file-level scoping. |

No test suite wraps gitleaks config in this repo, and the assessment did not call for adding one
beyond manual verification (see Local Verification below), so no test files changed.

## Diff Highlights

```toml
[allowlist]
-description = "Files that must contain placeholder-shaped values by design (G-A2)"
-paths = [
-  '''(^|/)\.env\.example$''',
-]
+description = "Placeholder tokens (G-A2), not whole files — a well-formed [YOUR-...] placeholder"
+regexTarget = "match"
+regexes = [
+  '''^\[YOUR-[A-Z0-9-]+\]$''',
+]
```

## Tests Added or Updated

None added — this repo has no test harness around `.gitleaks.toml`. Correctness was instead
verified directly with the `gitleaks` binary (see below), per the assessment's note that this is
the appropriate verification method here.

## Local Verification

- `gitleaks detect --no-git -c .gitleaks.toml -s .` (full repo scan) → 15 pre-existing findings,
  all in `.next/**` build artifacts and `prototype/.env` (a real Supabase publishable key
  committed there — out of scope for this bug, which is about `.gitleaks.toml`'s
  `.env.example`-specific allowlist, not `prototype/.env`). **Zero findings in `.env.example`
  itself**, confirming the new regex allowlist still correctly exempts the file's actual
  placeholders (`[YOUR-PROJECT-REF]`, `[YOUR-PASSWORD]`, `[YOUR-POOLER-HOST]`, `[YOUR-ANON-KEY]`,
  `[YOUR-SERVICE-ROLE-KEY]`, `[YOUR-RANDOM-SECRET]`) with no false positives.
- Regression check: copied `.env.example` to a scratch directory, replaced
  `SUPABASE_SERVICE_ROLE_KEY`'s placeholder with a realistic-shaped test secret,
  reran `gitleaks detect` against the copy →
  **finding raised** (`generic-api-key`, line 23), confirming the blanket suppression is gone and
  a real-looking credential in that file is now caught.
- Also tried a JWT-shaped fake value in the same slot — gitleaks' default rule set did not flag it
  (JWTs don't match gitleaks' bundled `generic-api-key`/JWT detection heuristics for this exact
  shape/context). This is a pre-existing gap in gitleaks' default rules, not something this
  allowlist change introduced or could fix; noted under Follow-ups.

## Deviations from Assessment

None. Implemented the assessment's preferred remediation as described: kept the exemption scoped
to the placeholder shape rather than removing it outright or over-scoping to a `paths`+`regexes`
AND-condition (gitleaks' allowlist match target for a global allowlist is per-secret via
`regexTarget`, not a path+content AND-condition, so `regexTarget = "match"` alone — without a
`paths` entry — was the correct mechanism; scoping was achieved by anchoring the regex to the
exact placeholder shape instead).

## Follow-ups

- `prototype/.env` currently contains a real Supabase publishable key and is flagged by this same
  `gitleaks detect` run — unrelated to this bug (that file isn't covered by the `.env.example`
  allowlist at all), but worth a human decision on rotating/removing it since it's the prototype's
  reference-only client and out of this fix's scope.
- gitleaks' default rule set does not reliably flag JWT-shaped strings pasted into `.env.example`
  in this test; if tighter coverage of that specific shape matters, consider adding a
  project-specific `[[rules]]` entry for Supabase JWT/service-role key shapes rather than relying
  solely on the bundled `generic-api-key`/entropy rule. Not done here — out of scope for the
  allowlist-narrowing bug reported.
