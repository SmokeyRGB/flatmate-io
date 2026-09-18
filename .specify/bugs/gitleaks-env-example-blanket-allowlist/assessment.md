# Bug Assessment: gitleaks blanket path allowlist for `.env.example`

- **Slug**: gitleaks-env-example-blanket-allowlist
- **Created**: 2026-09-18
- **Source**: pasted text (GitHub Copilot PR review, PR #4, file `.gitleaks.toml` around line 17)
- **Verdict**: valid
- **Severity**: medium

## Report (verbatim)

> This path allowlist suppresses every gitleaks finding in `.env.example`, not just
> placeholder-shaped values. If a real Supabase key or password is accidentally copied into that
> file, both the pre-commit hook and CI will ignore it, contradicting the stated guardrail.
> Replace the blanket path exemption with narrowly scoped allowlisted placeholder patterns (or
> remove the exemption and tune individual false positives).

## Symptom

`.gitleaks.toml` has a top-level `[allowlist]` with `paths = ['''(^|/)\.env\.example$''']`. Any
gitleaks rule match anywhere in `.env.example` is suppressed unconditionally, regardless of
whether the matched string is an actual placeholder (`[YOUR-...]`) or a real-looking credential
that someone pastes into the file by mistake (e.g. during local debugging, then forgets to revert
before `git add -A`). This contradicts the file's own comment ("every value in it must already be
a placeholder, never a real credential") and the guardrail it cites, G-A1 ("Kein Secret im
Repository" — enforced via "Secret-Scanning (Pre-Commit + CI)", `docs/GUARDRAILS.md:1254`) and
G-A2 ("Konfiguration nur über Umgebungsvariablen, Vorlage nur als `.env.example`",
`docs/GUARDRAILS.md:94`, `:1255`), which assumes the template itself stays scannable.

Expected: gitleaks should only ignore the specific placeholder tokens/shapes that are known-safe
in `.env.example` (e.g. `[YOUR-PROJECT-REF]`, `[YOUR-ANON-KEY]`), and should still flag anything
in that file that doesn't match a placeholder shape.

## Reproduction

1. Open `.gitleaks.toml` — the `[allowlist]` block (lines 9–17) exempts the whole file
   `.env.example` via `paths`, not `regexes` or per-rule scoping.
2. Hypothetically paste a real Supabase service-role JWT into `.env.example` in place of
   `[YOUR-SERVICE-ROLE-KEY]` and run `gitleaks protect --staged` or `gitleaks detect`.
3. Expected (per G-A1/G-A2): gitleaks flags the real-looking secret.
4. Actual: gitleaks skips the entire file because of the path-level allowlist, so no finding is
   raised — pre-commit hook and CI both pass silently.
   [NEEDS CLARIFICATION: gitleaks binary was not available in this environment to empirically
   confirm step 2–4; behavior is inferred from `path` allowlist semantics in gitleaks' documented
   config format, where a path match short-circuits scanning of that file entirely.]

## Suspected Code Paths

- `.gitleaks.toml:9-17` — the `[allowlist]` block; `paths` entry on line 16 is the blanket
  exemption Copilot flagged.
- `.env.example:1-24` — the file being over-exempted; contains exactly 4 placeholder values
  (`DATABASE_URL` line 13 with 3 bracketed placeholders, `NEXT_PUBLIC_SUPABASE_URL` line 16,
  `NEXT_PUBLIC_SUPABASE_ANON_KEY` line 17, `SUPABASE_SERVICE_ROLE_KEY` line 23), all in the
  consistent `[YOUR-...]` bracket shape.
- `docs/GUARDRAILS.md:80-105` — defines G-A1/G-A2, the guardrails this allowlist entry cites and
  currently undermines.
- `tools/README.md` — not yet checked in detail for whether it documents this allowlist rule; a
  fix should keep the tools README's rationale (if any) in sync. [NEEDS CLARIFICATION: whether
  tools/README.md references this allowlist entry — not confirmed in this session.]

## Root Cause Hypothesis

High confidence. The allowlist was written to solve a real problem (placeholder connection-string
shapes in `.env.example` naturally resemble real secret shapes and would otherwise false-positive
on every scan) but solved it at the wrong granularity: a `paths` entry suppresses the entire file
rather than the specific placeholder substrings. Gitleaks supports finer-grained suppression
(`regexes`/`stopwords` under a global `[allowlist]`, or per-rule `allowlist` blocks with
`regexTarget = "match"`) that would allow only strings matching the placeholder shape
(`\[YOUR-[A-Z0-9-]+\]`) to be exempted, leaving any other content in the file scannable.

## Proposed Remediation

**Preferred**: Replace the `paths`-based blanket exemption with a `regexes` (or `regexTarget`)
based allowlist scoped to the literal placeholder shape used throughout `.env.example` —
`\[YOUR-[A-Z0-9-]+\]` (matches `[YOUR-PROJECT-REF]`, `[YOUR-PASSWORD]`, `[YOUR-POOLER-HOST]`,
`[YOUR-ANON-KEY]`, `[YOUR-SERVICE-ROLE-KEY]`). Gitleaks' global `[allowlist]` supports `regexes`
alongside (or instead of) `paths`; when both `paths` and `regexes` are present in the same
allowlist entry, gitleaks requires *both* to match before suppressing (path scopes which files the
regex applies to, regex scopes which substrings within it are exempt) — so keep the `.env.example`
path scope but add the regex condition, rather than dropping the path entirely and risking the
regex matching a similarly-shaped placeholder elsewhere in the repo.

**Alternatives**:
- Remove the allowlist entry entirely and instead keep every value in `.env.example` in a shape
  that gitleaks' default rules don't flag at all (e.g. avoid JWT-shaped or high-entropy-looking
  placeholders). Rejected as primary approach: more fragile long-term, since any future env var
  added to the template could reintroduce false positives, and it doesn't document *why* certain
  strings are safe as clearly as an explicit regex allowlist does.
- Use per-rule `allowlist` blocks scoped to just the specific gitleaks rule IDs that fire on the
  connection-string/JWT shapes, instead of a global allowlist. More precise but more maintenance
  overhead for one file with one placeholder convention; not needed here since all placeholders
  share one consistent bracket shape.

**Files likely to change**:
- `.gitleaks.toml`

**Tests to add or update**:
- A manual/CI check (or a note in `tools/README.md` if such a smoke test already exists) that
  running `gitleaks detect`/`gitleaks protect` against a copy of `.env.example` with one
  placeholder replaced by a real-looking secret (e.g. a fake JWT) still produces a finding, while
  the unmodified `.env.example` produces none. Given no test framework wraps gitleaks itself, this
  is best captured as a one-off local verification step in the fix report if the `gitleaks` binary
  is available, per the task instructions.

## Risks & Considerations

- Regex allowlist scoped too narrowly could still false-positive on a legitimate future
  placeholder shape in `.env.example` that doesn't match `\[YOUR-...\]` — mitigate by keeping the
  placeholder convention consistent (all future example values also use `[YOUR-...]`).
- Regex allowlist scoped too broadly (e.g. matching any bracketed token) could reintroduce the
  same blanket-suppression problem in miniature — the fix should test the regex against the
  literal current file content, not guess.
- No test framework currently exercises `.gitleaks.toml`; verification is likely manual
  (`gitleaks detect --no-git -c .gitleaks.toml -s .` or similar) — note in the fix report if the
  binary isn't installed in this environment.

## Open Questions

- [NEEDS CLARIFICATION: gitleaks binary availability in this environment — needed to empirically
  verify the fix rather than relying on documented allowlist semantics.]
- [NEEDS CLARIFICATION: whether `tools/README.md` documents this allowlist entry and needs a
  matching update — not inspected in this assessment.]
