# Bug Fix: gitleaks CI job uses mutable `:latest` image tag

- **Slug**: ci-gitleaks-mutable-image-tag
- **Fixed**: 2026-09-18
- **Assessment**: ./assessment.md
- **Status**: applied

## Summary

Pinned the gitleaks Docker image in `.github/workflows/ci.yml` from the mutable `:latest` tag to
the released version tag `v8.30.1` (current latest stable release, confirmed via
github.com/gitleaks/gitleaks/releases), and added a comment documenting how to bump it
deliberately.

## Changes

| File | Change | Notes |
|------|--------|-------|
| `.github/workflows/ci.yml` | modified | `docker://ghcr.io/gitleaks/gitleaks:latest` → `docker://ghcr.io/gitleaks/gitleaks:v8.30.1`, plus a comment on the bump procedure |

## Diff Highlights

```yaml
-      - name: Gitleaks scan
-        uses: docker://ghcr.io/gitleaks/gitleaks:latest
+      # Pinned to a released version, not :latest — a future image update must not be able to
+      # change scan rules/behavior without a deliberate bump of this line. Bump by editing the
+      # tag after checking https://github.com/gitleaks/gitleaks/releases.
+      - name: Gitleaks scan
+        uses: docker://ghcr.io/gitleaks/gitleaks:v8.30.1
```

## Tests Added or Updated

- None — this is a CI workflow config change with no unit-test surface. Verification is by
  inspection and (per assessment) checking the tag resolves.

## Local Verification

- Commands run: none — this sandboxed environment has no `docker`/`gh` access to pull
  `ghcr.io/gitleaks/gitleaks:v8.30.1` or resolve its digest directly.
- Manual checks: confirmed `v8.30.1` is the latest gitleaks release tag via a web fetch of
  `github.com/gitleaks/gitleaks/releases` (dated 2026-03-21, newest listed). Digest pinning
  (`@sha256:...`) was not applied because the digest could not be resolved from this environment;
  documented as a residual gap in the assessment's Risks section.

## Deviations from Assessment

Used a version-tag pin rather than a digest pin, per the assessment's stated fallback ("if
reachable, resolve and use `...@sha256:<digest>` instead") — registry access to resolve the
digest was not available in this session.

## Follow-ups

- If/when this pipeline has registry access, upgrade the pin to include the immutable digest
  (`ghcr.io/gitleaks/gitleaks:v8.30.1@sha256:<digest>`) for full reproducibility.
