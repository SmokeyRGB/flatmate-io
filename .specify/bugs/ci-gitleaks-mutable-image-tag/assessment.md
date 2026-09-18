# Bug Assessment: gitleaks CI job uses mutable `:latest` image tag

- **Slug**: ci-gitleaks-mutable-image-tag
- **Created**: 2026-09-18
- **Source**: pasted text (GitHub Copilot PR review finding)
- **Verdict**: valid
- **Severity**: medium

## Report (verbatim)

> Using `ghcr.io/gitleaks/gitleaks:latest` makes the CI security gate non-reproducible: a future
> image update can change rules or behavior without any repository change, causing unexpected
> failures or coverage changes. Pin this job to a released version (preferably an immutable image
> digest) and update it deliberately.

## Symptom

`.github/workflows/ci.yml` line 23 runs the gitleaks job via `docker://ghcr.io/gitleaks/gitleaks:latest`.
Because `:latest` is a mutable tag, the exact ruleset/binary used by CI can change on any future
push without a corresponding commit to this repo, so the same commit could pass today and fail
(or silently stop catching something) tomorrow.

## Reproduction

1. Not a runtime bug — this is a supply-chain/reproducibility defect, visible by inspection of
   the workflow file.
2. `.github/workflows/ci.yml:23` — `uses: docker://ghcr.io/gitleaks/gitleaks:latest`.

## Suspected Code Paths

- `.github/workflows/ci.yml:23` — the only reference to the `gitleaks` image in the repo.

## Root Cause Hypothesis

The job was authored to use `:latest` for convenience when the gate was first added (per the
comment above it, replacing `gitleaks/gitleaks-action` ahead of the Node 20 runner deprecation).
No pinning was applied at that time. Confidence: high.

## Proposed Remediation

**Preferred**: Pin the `docker://` reference to a specific released gitleaks version tag,
`ghcr.io/gitleaks/gitleaks:v8.30.1` (latest stable release as of 2026-09-18, per
github.com/gitleaks/gitleaks/releases). A true immutable digest pin (`@sha256:...`) is preferable
per the report, but resolving the digest requires registry access to `ghcr.io` at fix time; if
reachable, resolve and use `ghcr.io/gitleaks/gitleaks:v8.30.1@sha256:<digest>` instead. Either way,
add a short comment noting how/when to bump the version deliberately.

**Alternatives**:
- Switch to `gitleaks/gitleaks-action` — rejected already by the existing comment (Node 20
  deprecation + v3 licensing not applicable to plain CLI use).

**Files likely to change**:
- `.github/workflows/ci.yml`

**Tests to add or update**:
- No automated test framework covers workflow YAML; verification is `git diff` review plus (if
  reachable) a manual `docker pull ghcr.io/gitleaks/gitleaks:v8.30.1` to confirm the tag resolves.

## Risks & Considerations

- Pinning to a tag (not a digest) still allows the tag to theoretically be re-pushed by upstream,
  though gitleaks' release tags are not observed to be mutated in practice. Document the residual
  gap if digest pinning isn't achievable in this environment.
- Future maintenance requires a deliberate version bump; this is the intended trade-off per the
  report.

## Open Questions

- [NEEDS CLARIFICATION: whether this CI environment has outbound access to ghcr.io to resolve an
  immutable digest at fix time — assessed as likely unavailable in this sandboxed session.]
