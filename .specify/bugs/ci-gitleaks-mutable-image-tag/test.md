# Bug Verification: gitleaks CI job uses mutable `:latest` image tag

- **Slug**: ci-gitleaks-mutable-image-tag
- **Tested**: 2026-09-18
- **Assessment**: ./assessment.md
- **Fix**: ./fix.md
- **Result**: verified

## Summary

The workflow no longer references `ghcr.io/gitleaks/gitleaks:latest`; it now pins to
`ghcr.io/gitleaks/gitleaks:v8.30.1`, a confirmed released version tag. YAML syntax is valid.

## Checks Performed

| Check | Command / Action | Result | Notes |
|-------|------------------|--------|-------|
| Reproduction (post-fix) | grep for `:latest` in `.github/workflows/ci.yml` | pass | no mutable tag remains; `v8.30.1` present |
| YAML syntax | `python -c "import yaml; yaml.safe_load(open('.github/workflows/ci.yml'))"` | pass | "YAML OK" |
| Tag exists upstream | web fetch of github.com/gitleaks/gitleaks/releases | pass | v8.30.1 listed as latest release |
| Actual `docker pull`/digest resolution | n/a | not-run | no docker/registry network access in this sandbox |

## Output Excerpts

```
YAML OK
```

`.github/workflows/ci.yml:23`:
```
        uses: docker://ghcr.io/gitleaks/gitleaks:v8.30.1
```

## Residual Risks

- Digest pinning (`@sha256:...`) was not applied, per the fix report's noted environment
  limitation — a tag re-push upstream (unlikely but not impossible) would still be picked up.
  Tracked as a follow-up.
- Could not actually pull the image to confirm the tag resolves on ghcr.io from this sandbox;
  relied on the public releases page instead.

## Recommendation

Close the bug — the mutable `:latest` reference is gone, replaced with a documented, released
version pin, and the workflow YAML remains syntactically valid. Digest pinning remains a
nice-to-have follow-up once registry access is available.
