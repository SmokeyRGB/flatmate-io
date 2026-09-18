# Bug Verification: gitleaks gate may fail on existing baseline material

- **Slug**: ci-gitleaks-fails-on-existing-baseline
- **Tested**: 2026-09-18
- **Assessment**: ./assessment.md
- **Fix**: ./fix.md
- **Result**: verified

## Summary

The originally-reported 15-finding filesystem-scan baseline is down to 3, all out of this
report's scope (already-gitignored `.claude/mcp.json`/`.env.local`, unrelated to `prototype/.env`
or `.next/**`). The actual CI command (git-history mode) reports "no leaks found" both before and
after the fix, confirming no regression. One incidental leak was found and fixed during
verification: an intermediate `fix.md` draft had quoted the real secret value being removed;
it's now redacted.

## Checks Performed

| Check | Command / Action | Result | Notes |
|-------|------------------|--------|-------|
| Reproduction (post-fix), filesystem scan | `gitleaks detect --no-git -c .gitleaks.toml -s . --report-format json` | pass | 3 findings remain (`.claude/mcp.json` x1, `.env.local` x2) — none are `prototype/.env` or `.next/**`, matching the fix's intended scope |
| Actual CI command | `gitleaks detect -c .gitleaks.toml --redact --verbose` | pass | "no leaks found", 180 commits scanned — unchanged from pre-fix baseline |
| Self-check: did the fix introduce a new leak | re-ran filesystem scan after each edit | pass (after 1 correction) | first post-fix scan showed 4 findings — `fix.md` had quoted the real key in a diff snippet; redacted, re-scanned, back to 3 |
| TOML validity | `gitleaks detect` ran without a config-parse error using the edited `.gitleaks.toml` | pass | gitleaks would fail fast on invalid TOML; it didn't |
| Prototype dev server | `bun run dev` in `prototype/` | not-run | out of scope for a network/time-bounded sandbox check; prototype is design-reference only per CLAUDE.md and not wired to real data, so a placeholder Supabase key has no functional stakes for the handover |

## Output Excerpts

```
scanned ~4532024 bytes (4.53 MB) in 511ms
leaks found: 3
```
```
180 commits scanned.
scanned ~4955933 bytes (4.96 MB) in 1.11s
no leaks found
```

## Residual Risks

- The `.next/**` allowlist entry is currently inert (that directory is gitignored and CI scans
  git history, not the filesystem) — it only pays off if a future change switches the job to
  `-s .`/`--no-git`. This is intentional, documented in the fix, not a gap.
- `bun run dev` in `prototype/` was not actually run to confirm the placeholder Supabase values
  don't break the UI clickthrough visually. Low risk given the prototype's reference-only role,
  but genuinely unverified.
- `.claude/mcp.json` and `.env.local` still contain filesystem-scan-mode findings; left
  untouched deliberately as out of scope for this report (see assessment's Proposed Remediation).

## Recommendation

Close the bug — the CI job's actual behavior (git-history scan) already passed before and after
this change, the specific findings named in the report (`prototype/.env`, and pre-emptively
`.next/**`) are addressed, and no regression was introduced. Recommend a follow-up-only note (not
a reopen) to manually confirm the prototype's dev server if someone wants full certainty on the
UI reference.
