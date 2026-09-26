# Version pins

`postgres-version` and `gotrue-version` each hold one image tag, read from hosted `flatmate-io-dev`
on 2026-09-26 (Supabase `get_project` and `/auth/v1/health`). The CI workflow copies both into
`supabase/.temp/` before `supabase start` (the CLI reads its version pins there, not from
`config.toml`), and `scripts/ci/bootstrap-local-db.sh` asserts the running Postgres and GoTrue
images match them exactly, so a CLI release that ignores the files fails loudly instead of testing
a silently different stack (openspec/changes/ci-local-database, design.md D2).

When bumping a pin, re-read hosted dev's **exact** image with Supabase `get_project` (not just
`server_version`, which only reports major.minor) before writing the new tag — the `verify-hosted`
pin-drift step only catches a major.minor mismatch, so a patch-level move at hosted dev needs a
human to notice it here on purpose.
