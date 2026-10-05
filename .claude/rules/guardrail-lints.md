<!-- Moved verbatim from CLAUDE.md on 2026-09-28 (it had grown to 384 lines; the target is ~200).
     Loaded at session start like CLAUDE.md itself: no `paths:` frontmatter, by decision.
     Section names match what code comments and docs cite. -->

# Guardrail lints

The nine custom lints under `scripts/lint/` are hand-written checks (not eslint plugins), each
enforcing one guardrail mechanically:

| Script | Guardrail | What it checks |
|---|---|---|
| `import-boundary.ts` | G-C1 / FR-0.1 | only `src/db/` and each module's own `repository.ts` may import the raw Postgres/Drizzle client |
| `session-context.ts` | G-C8 / FR-0.4 | bare `SET` is never allowed; `SET LOCAL`/`set_config(…, true)` for session context only in `src/db/session-context.ts`; also rejects `SET SESSION …`/`SET … TO` everywhere and a non-local `set_config` in `drizzle/*.sql` |
| `rls-coverage.ts` | FR-0.2 / EC-0.1 | every table declaring `household_id` has a `pgPolicy` of its own — per table, not per schema file |
| `data-inventory.ts` | G-F1 / G-F3 / FR-0.6 | every column any `schema.ts` declares is in `data-inventory.yml` (and vice versa — a dropped column can't stay in the file), each entry carries a valid category and, for personal data, purpose/legal_basis/retention, and no table or column name matches the Art.-9 blocklist |
| `definer-coverage.ts` | G-C7 | every `SECURITY DEFINER` function in `drizzle/` sets `search_path`, is called by name in a `tests/integration/raw-sql/` test, and is listed in `KNOWN_DEFINERS` of the catalog test |
| `migration-shape.ts` | — (re-runnability) | migrations after `0017`: an enum `ADD VALUE` alone in its file, `ADD COLUMN IF NOT EXISTS`, `DROP FUNCTION IF EXISTS` before a bare or `RETURNS TABLE` create, `search_path` on `SECURITY DEFINER` |
| `guarded-tests.ts` | G-D | every entry in `test/guarded.manifest.json` (G-D1…G-D15) stays honest: `pending`/`implemented` must match reality |
| `pending-feedback.ts` | `ui/pending-feedback` | no plain submit button anywhere in `src/` (only `src/ui/submit-button.tsx`'s shared one); every `page.tsx` under `src/app/` has a sibling `loading.tsx` importing `@/ui/skeletons`, short named exemptions aside |
| `role-reads.ts` | identity/member-administration | no comparison against a role in `src/` (`m.role ===`, `eq(membership.role, …)`, SQL `role <> '…'`) outside a `role-state-read: <reason>` marker on the same or previous line; `src/modules/identity/schema.ts` (the CHECKs) exempt |

`tests/unit/lint/cleanup-inventory.test.ts` is the vitest-side check, run inside vitest: it fails when
a household-scoped table is missing from the delete set in `tests/helpers/identity.ts`, or when
`undoRegisterHousehold` misses a table `registerHousehold` writes.

`tests/integration/schema/data-inventory-live.test.ts` is the other half of the data-inventory
gate, also run inside vitest: it queries the migrated database's own catalog, so a column a
hand-written migration adds without ever touching `schema.ts` is still caught. Strict against a
database built from `drizzle/` alone (CI's `verify` job); a warning only against the shared hosted
`flatmate-io-dev` database, since another branch's still-unmerged migration can legitimately put
it ahead of this one (design.md D5, `openspec/changes/archive/2026-09-28-data-inventory-gate`).
