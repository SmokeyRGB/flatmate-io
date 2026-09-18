# Bug Assessment: gitleaks gate may fail on existing baseline material

- **Slug**: ci-gitleaks-fails-on-existing-baseline
- **Created**: 2026-09-18
- **Source**: pasted text (GitHub Copilot PR review finding)
- **Verdict**: likely valid, needs reproduction (see nuance below — partially reproduced, partially refuted)
- **Severity**: medium

## Report (verbatim)

> This new gate will fail on the repository's current baseline: the added gitleaks verification
> records 15 findings, including `prototype/.env`, and this job scans the checkout with no
> `--no-git`/path exclusion. Until those existing findings are removed or explicitly reviewed and
> allowlisted, every CI run will be red rather than providing a usable gate. Please clean the
> tracked fixture/secret material (preferred) or add narrowly-scoped, justified exclusions and
> verify the job against a clean checkout.

## Symptom

Claimed: the gitleaks CI job (`.github/workflows/ci.yml`, gitleaks job) will fail every run
because of 15 pre-existing findings in the repo, including a secret in `prototype/.env`.

## Reproduction

1. Ran `gitleaks detect --no-git -c .gitleaks.toml -s . --report-format json` against the full
   working tree (filesystem scan, ignoring git). **Result: 15 findings**, matching the report's
   count exactly. Files hit: `.claude/mcp.json` (1), `.env.local` (2), `prototype/.env` (2), and
   9 findings scattered across `.next/**` build-artifact JSON/cache files (`.next/cache/.rscinfo`,
   `.next/cache/.previewinfo`, `.next/dev/cache/.rscinfo`, `.next/dev/prerender-manifest.json`,
   `.next/dev/server/server-reference-manifest.json`, `.next/prerender-manifest.json`,
   `.next/server/server-reference-manifest.json`).
2. Ran `gitleaks detect -c .gitleaks.toml --redact --verbose` — i.e. the **actual command the CI
   job runs**, with no `-s`/`--no-git` flag, so it operates in gitleaks' default git-history mode
   (`git log` over the repo's commits), not a raw filesystem walk. **Result: "no leaks found"**,
   180 commits scanned.
3. Checked whether any of the 15 filesystem-mode hits are actually tracked by git:
   `git ls-files .claude/mcp.json .env.local .next prototype/.env` → empty (none tracked).
   `git log --all --oneline -- prototype/.env` → empty (never committed, in any branch, ever).
   `git check-ignore -v` confirms all four paths are covered by `.gitignore`
   (`/.claude/`, `/.env*.local`, `/.next/`, `*.env`).

So the report's factual premise ("15 findings... this job scans the checkout with no
`--no-git`/path exclusion") is subtly wrong on the second half: as configured today, the gitleaks
job does **not** hit these 15 findings, because it never leaves git-history mode and none of the
flagged files were ever committed. The 15-finding count is real, but only reproducible via a
filesystem scan mode the workflow doesn't currently invoke.

## Suspected Code Paths

- `.github/workflows/ci.yml:22-25` — the gitleaks step; no `-s`/`--no-git` flag present today.
- `prototype/.env` — untracked, gitignored, but present on disk with a real-shaped Supabase
  `sb_publishable_...` key and project ref/URL.
- `.gitignore:14,26,33,25` — `/.claude/`, `/.env*.local`, `/.next/`, `*.env` already exclude all
  15-finding sources from git tracking.

## Root Cause Hypothesis

Two independent things are true and worth fixing even though the CI job doesn't currently fail:

1. **Latent risk, not an active break**: `prototype/.env` sits on disk with a real-looking secret.
   It is gitignored today, but nothing stops a future `git add -f`, a change to `.gitignore`, or a
   contributor unfamiliar with the ignore rules from committing it — at which point the *current*
   default-mode gitleaks job (git-history scan) would immediately flag it and go red, since a
   newly-committed file is exactly what that mode does catch. Confidence: high.
2. **Robustness gap**: if the gitleaks step is ever changed to add `-s .`/`--no-git` (e.g., to
   also catch staged-but-uncommitted secrets, a reasonable future hardening), it would immediately
   go red on the 9 `.next/**` build-artifact findings, since those are regenerated JSON/cache
   files with high-entropy-looking keys that are not real secrets. There is no allowlist entry for
   them today. Confidence: high.

Copilot's claim that "every CI run will be red" is not true of the job *as merged*; it is true of
the filesystem-scan variant reviewers likely ran to produce the "15 findings" number. Confidence
in this read: high (verified empirically above, reproducibly).

## Proposed Remediation

**Preferred** (matches the report's stated preference — clean over exclude):
- Replace the real-looking `sb_publishable_...` key and project ref/URL in `prototype/.env` with
  clearly-placeholder values, consistent with `prototype/.env.example`'s existing placeholder
  convention and CLAUDE.md's framing of `prototype/` as a reference-only clickthrough that is
  never used for real data. This removes the latent risk even though it isn't tracked by git,
  and costs nothing since the prototype isn't wired to a real backend for implementation purposes.
  Note: Supabase's `sb_publishable_...` key format is explicitly designed to be non-secret/public
  (successor to the anon key), same category as `NEXT_PUBLIC_SUPABASE_ANON_KEY` in `ci.yml`'s own
  `gitleaks:allow`-annotated line — so this is precautionary hygiene, not a live leak of something
  that grants privileged access.
- Add a narrowly-scoped `[allowlist] paths` entry (or `.gitleaksignore`) for `.next/**` in
  `.gitleaks.toml`, since those are generated build artifacts, not source, and would only ever be
  caught in a filesystem-scan mode CI doesn't currently use — but should be excluded pre-emptively
  so a future switch to `--no-git`/`-s .` doesn't regress this gate back to "always red".
- Leave `.claude/mcp.json` and `.env.local` alone: both are already correctly gitignored local
  tooling/env files outside the scope named by this report, and adding allowlist entries for them
  would be a wider, unjustified exclusion (the report asks for "narrowly-scoped, justified
  exclusions" only where needed).
- Leave the existing `.env.example` allowlist regex untouched — it is already correctly scoped
  (placeholder-shaped only, `regexTarget = "match"`).

**Alternatives**:
- Add `--no-git` to CI and rely purely on `.gitleaksignore`/allowlist to cover everything —
  rejected: broader change to the job's semantics (stops catching secrets introduced only via
  working-tree edits before commit) than the report asks for, and turns every generated-artifact
  directory into an ongoing allowlist maintenance burden.
- Do nothing, since the job already passes — rejected: doesn't address the real latent risk in
  `prototype/.env`, and leaves the `.next/**` gap for whoever tightens the scan mode next.

**Files likely to change**:
- `prototype/.env`
- `.gitleaks.toml` (or new `.gitleaksignore`)

**Tests to add or update**:
- Re-run `gitleaks detect --no-git -c .gitleaks.toml -s .` post-fix and confirm the `.next/**`
  and `prototype/.env` findings are gone/allowlisted.
- Re-run `gitleaks detect -c .gitleaks.toml --redact --verbose` (the actual CI invocation) and
  confirm it still reports "no leaks found" against a clean checkout.

## Risks & Considerations

- `.next/**` is already gitignored, so an `[allowlist] paths` entry for it is currently inert
  (defense-in-depth for a future scan-mode change) rather than fixing an active failure — worth
  flagging so it isn't mistaken for "the gate was red and now it's green."
- Replacing `prototype/.env`'s values must not break `bun run dev` in a way that's silently
  unnoticed — the prototype is reference-only per CLAUDE.md, so a broken dev server there is low
  stakes, but should still be checked/noted rather than assumed.

## Open Questions

- [NEEDS CLARIFICATION: none blocking — the report's technical premise about current CI failure
  was checked empirically rather than left open.]
