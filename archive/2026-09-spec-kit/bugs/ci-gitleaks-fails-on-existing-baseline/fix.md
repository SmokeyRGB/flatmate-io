# Bug Fix: gitleaks gate may fail on existing baseline material

- **Slug**: ci-gitleaks-fails-on-existing-baseline
- **Fixed**: 2026-09-18
- **Assessment**: ./assessment.md
- **Status**: applied

## Summary

Replaced the real-looking Supabase publishable key/project ref in `prototype/.env` with
`[YOUR-...]`-shaped placeholders (matching `.env.example`'s existing convention), and added a
narrowly-scoped `.next/**` path allowlist to `.gitleaks.toml` as pre-emptive hardening for a
future filesystem-scan mode, even though the assessment confirmed the CI job as configured today
(git-history mode, no `-s`/`--no-git`) already reports "no leaks found."

## Changes

| File | Change | Notes |
|------|--------|-------|
| `prototype/.env` | modified | real-shaped `sb_publishable_...` key, project ref, and URL replaced with placeholders; added a comment noting the file is reference-only per CLAUDE.md |
| `.gitleaks.toml` | modified | added `[allowlist] paths = ['''^\.next/''']` with a comment explaining it's inert today (git-history scan mode) but guards a future scan-mode change |

## Diff Highlights

`prototype/.env`:
```diff
-SUPABASE_PUBLISHABLE_KEY="sb_publishable_[REDACTED]"
+SUPABASE_PUBLISHABLE_KEY="[YOUR-PUBLISHABLE-KEY]"
```

`.gitleaks.toml`:
```toml
paths = [
  '''^\.next/''',
]
```

## Tests Added or Updated

- None (no test framework covers config/fixture files); verified via direct `gitleaks detect` runs, see below.

## Local Verification

- `gitleaks detect --no-git -c .gitleaks.toml -s . --report-format json` (filesystem scan,
  reproducing the report's original 15-finding count) → **3 findings remain**, down from 15. All
  three are `.claude/mcp.json` (1) and `.env.local` (2) — both already correctly gitignored,
  out of scope per the assessment (not `prototype/.env` or any `.next/**` file), and not part of
  this report's named findings.
- `gitleaks detect -c .gitleaks.toml --redact --verbose` (the exact command CI runs) → **"no
  leaks found"**, 180 commits scanned — unchanged from pre-fix, confirming no regression.
- Manual check: did not run `bun install`/`bun run dev` in `prototype/` to confirm the UI still
  loads with placeholder env values — this environment doesn't have time/network budget for that,
  and per CLAUDE.md the prototype is a design/UX reference never wired to live data, so a
  non-functional Supabase call there has no product impact. Flagged as unverified rather than
  assumed.

## Deviations from Assessment

None — applied exactly the preferred remediation (clean `prototype/.env`, narrow `.next/**`
allowlist, leave `.claude/mcp.json`/`.env.local`/`.env.example` allowlist untouched).

## Follow-ups

- If someone verifies `bun run dev` in `prototype/` after this change and finds a placeholder
  value breaks something visibly, restore a working (but still non-secret) value.
- If the gitleaks job is ever switched to `-s .`/`--no-git`, re-run the filesystem scan to confirm
  the remaining `.claude/mcp.json`/`.env.local` findings are still acceptable to leave unaddressed
  (they're local tooling files, out of this report's scope).
