<!-- Moved verbatim from CLAUDE.md on 2026-09-28 (it had grown to 384 lines; the target is ~200).
     Loaded at session start like CLAUDE.md itself: no `paths:` frontmatter, by decision.
     Section names match what code comments and docs cite. -->

# ID registry — one authoritative file per ID family

Every ID family (`S-*` scope lines, `E-*` evidence, `P-1…P-5` principles, `ADR-*`, `V-*`
invariants, `G-*` guardrails, `U-*` UX decisions, `O-*`/`Q-*` open points, screen IDs, `FR-n.m`/
`AC-n.m` requirements, `H-*` hypotheses) has exactly one **maßgeblich** (authoritative) source,
listed in `docs/README.md` §3. Any other mention is a citation, not a definition — if it
contradicts the source, the citation is the bug. **Don't restate a rule in new prose; cite
`docs/SPEC-INDEX.md` and quote.** Watch for near-collisions with the same-looking ID: `O-06` (SRD)
vs `O-6` (domain model), `C-1` (content rule) vs `C1` (screen), `EP-D` (epic) vs `D1`–`D4` (screens).
