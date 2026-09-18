# Bug Verification: gitleaks blanket path allowlist for `.env.example`

- **Slug**: gitleaks-env-example-blanket-allowlist
- **Tested**: 2026-09-18
- **Assessment**: ./assessment.md
- **Fix**: ./fix.md
- **Result**: verified

## Summary

The blanket `paths`-based exemption is gone; `.gitleaks.toml` now allowlists only strings shaped
like `[YOUR-...]`. Re-running gitleaks confirms the real `.env.example` still produces zero
findings (no false positives from the placeholder shapes) while a scratch copy with a real-looking
secret substituted for one placeholder is now flagged. No regressions found in the rest of the
repo scan (findings are the same pre-existing, unrelated ones in `.next/**` and
`prototype/.env`).

## Checks Performed

| Check | Command / Action | Result | Notes |
|-------|------------------|--------|-------|
| Reproduction (post-fix): placeholders still exempt | `gitleaks detect --no-git -c .gitleaks.toml -s .` (full repo) | pass | Zero findings in `.env.example`; 15 pre-existing findings elsewhere (`.next/**`, `prototype/.env`), unrelated to this bug. |
| Reproduction (post-fix): real secret now caught | Copied `.env.example` to scratch dir, replaced `SUPABASE_SERVICE_ROLE_KEY`'s placeholder with a real-looking test string, ran `gitleaks detect` against the copy | pass | 1 finding, `generic-api-key`, line 23 — confirms the blanket suppression is gone. |
| New/updated tests | n/a | not-run | No test harness wraps `.gitleaks.toml` in this repo; assessment and fix both scoped verification to direct `gitleaks` invocation rather than an added test file. |
| Regression suite | `gitleaks detect --no-git -c .gitleaks.toml -s .` (full repo, same command as above) | pass | Same 15 findings as the pre-fix baseline captured in `fix.md` — config change did not introduce new noise or suppress anything it shouldn't. |
| Lint / type-check | n/a | not-run | `.gitleaks.toml` is not JS/TS; no linter covers it in this repo. |

## Output Excerpts

```
=== .env.example specifically ===
NO FINDINGS in .env.example (expected)

=== scratch copy with real secret substituted ===
Finding:     SUPABASE_SERVICE_ROLE_KEY="<redacted test string>"
RuleID:      generic-api-key
leaks found: 1
```

## Residual Risks

- gitleaks' bundled rules did not flag a JWT-shaped fake value in the same slot during fix
  verification (noted in `fix.md` Follow-ups) — a pre-existing gap in gitleaks' default rule
  coverage, not something this change could address; only `generic-api-key`/entropy-style
  secrets were confirmed to be caught.
- `prototype/.env` contains a real Supabase publishable key today and is unrelated to this bug's
  scope (it isn't covered by the `.env.example` allowlist at all) — flagged as a follow-up in
  `fix.md`, not addressed here.
- No CI run was performed (only local `gitleaks detect`); the pre-commit hook and CI job both
  invoke gitleaks with this same config file, so the local result should transfer, but this
  wasn't observed running through the actual hook/CI wiring.

## Recommendation

Close the bug — verified end-to-end with the actual `gitleaks` binary against both the real
`.env.example` (no false positives) and a scratch copy with a substituted real-looking secret
(correctly flagged), and confirmed no change in the rest of the repo's baseline findings.
