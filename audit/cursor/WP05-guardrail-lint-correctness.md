# WP05 · Guardrail-lint correctness

> Paste into a fresh Cursor Agent session; read `audit/cursor/README.md` first.

## 1. Goal

Make the hand-written guardrail lints under `scripts/lint/` mean what they claim, and stop them drifting apart:

- **#8** `guarded-tests.ts` must strip comments correctly on CRLF checkouts, and must detect every spelling of a skipped or placeholder test.
- **#22** The five recursive file walkers, the comment strippers and the line-number helper become one `scripts/lint/_shared.ts`. One lint per commit.
- **#36** `rls-coverage.ts` reads the real Drizzle schema (`getTableConfig`) instead of segmenting source text with regexes.
- **#13 (lint part only)** `import-boundary.ts` also sees `import()`, `require()`, side-effect imports and `export … from`, and only allows `src/modules/<name>/repository.ts`.

## 2. Branch, dependencies, conflicts

- Branch: `fix/wp05-guardrail-lints`, from current `main`. No dependencies.
- **Must not run in parallel with WP07** (WP07 edits `tests/helpers/` and CI, which the lints scan). WP05 and WP06 may run in parallel; they share no file.
- Touches only `scripts/lint/**`, `tests/unit/lint/**`, and (human-gated, Phase C) `.gitattributes`. It must not edit anything under `src/`, `docs/` or `test/guarded.manifest.json`.
- Not in scope: dependency-cruiser and the module-boundary leak itself (`identity/api.ts`, WP12), and everything in the "reserved for 2b" list in the README.

## 3. Read first

1. `audit/cursor/README.md`, `CLAUDE.md`, `.claude/rules/guardrail-lints.md`, `.claude/rules/implementation-hazards.md` ("Tests that can fail").
2. `audit/technical-debt.md`: findings #8, #13 (lint bullets), #22, #36.
3. All of `scripts/lint/*.ts` (read `sql-statements.ts` first: it is the shared-helper precedent) and every file in `tests/unit/lint/`.
4. `test/guarded.manifest.json` (25 distinct registered test files across `invariants` and `visibilityInvariants`).

## 4. Current state (verified 2026-10-01 on main @ 3401c94)

**How the lints run.** `package.json` `verify` runs `tsx scripts/lint/<name>.ts` for eight lints, then `node tools/check-refs.ts --quiet`, then `vitest run`. Each lint exports a `check…(rootDir)` function and runs it under an `if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1]))` main-guard. Relative imports are extensionless (`import … from "./sql-statements"`, used by `migration-shape.ts` and `definer-coverage.ts`), which works under both `tsx` and vitest, so `import … from "./_shared"` works the same way. `tsc --noEmit` includes `scripts/` (tsconfig `include: **/*.ts`), so `_shared.ts` must type-check under `strict`. `package.json` has `"type": "module"`.

**#8 (audit claim confirmed).** `guarded-tests.ts:48-51` does `content.split("\n").map(line => line.replace(/\/\/.*$/, ""))`. The working tree is CRLF (`git ls-files --eol`: 784 files `i/lf w/crlf`, including this file). On a CRLF line `.` does not match `\r` and `$` (no `m` flag) is end-of-string, so the regex never matches and **nothing is stripped**. Consequences on the author's machine: a fully commented-out `it(...)` still reads as a real body, and a prose `.skip(` in a comment is a false failure. CI (LF) behaves differently. The test file `tests/unit/lint/guarded-tests.test.ts` uses LF fixtures only. Today no file under `tests/` contains `.skipIf(`, `.runIf(`, `.todo(`, `.fails(`, `xit(`, `xtest(` or `xdescribe(`; the only `.skip(` is in the lint's own test fixture. The current check `/\.(skip|only)\s*\(/` already catches `it.skip(`, `describe.skip(` and `.only(`, but not `.skipIf(`, `.todo(` or `xit(`. `.gitattributes` has rules for `*.sh`, `*.md`, `*.sha256` and none for `*.ts`.

**#22 inventory (the audit says "walkers in 7 lints"; the real picture is below).**

| Lint | Recursive walker | Comment stripper | Line-of helper |
|---|---|---|---|
| `data-inventory.ts` | `walkTsFiles(dir, out)` L168 (`.tsx?`) | `stripComments` L138, **deletes** (`/* */` then `//`) | none |
| `import-boundary.ts` | `walk(dir)` L18 (`.ts/.tsx`) | none (line-based) | index+1 |
| `pending-feedback.ts` | `walk(dir, pattern)` L26 | exported `stripComments` L43, **deletes**; tested directly | `lineOf(source, index)` L79 |
| `session-context.ts` | `walk(dir, pattern)` L27 | `blankComments` L62, **blanks, keeps newlines** | inline `content.slice(0, i).split("\n").length` |
| `rls-coverage.ts` | `findSchemaFiles(dir)` (`schema.ts$`) | `stripLineComments`, **deletes** | none |
| `definer-coverage.ts` | non-recursive `readdirSync` (x2) | `stripJsComments` L114, **deletes** | none |
| `migration-shape.ts` | non-recursive `readdirSync` (`findMigrationFiles`) | SQL only (`sql-statements.ts`) | none |
| `guarded-tests.ts` | none | inline, per line (the bug) | none |

So there are **5 recursive walkers** (`walk` is byte-identical in `pending-feedback` and `session-context`), **2 non-recursive directory listings**, and **6 comment strippers** (4 deleting, 1 blanking, 1 buggy inline). None of them respects string or template literals: a `//` inside `"http://…"` truncates the rest of the line, and a `/*` inside a string opens a phantom block comment. Deleting strippers shift offsets and line numbers; only `blankComments` preserves them.

**#36 (audit claim confirmed).** `rls-coverage.ts` segments `schema.ts` source by `^(?:export\s+)?const NAME =` and looks for `household_id` / `pgPolicy(` in the segment. `data-inventory.ts` already imports each `src/modules/*/schema.ts` and reads `getTableConfig(table)`. The real schemas declare 21 `pgPolicy` lines across `audit` (98 lines), `casting` (289), `identity` (452). No real schema uses the `// rls-coverage: zero-policy by design` marker today (grep finds none in `src/`); only the test fixtures do. `rls-coverage.test.ts` has 8 cases, all of which write a throwaway `src/modules/example/schema.ts` into an **OS temp dir** and call the **synchronous** `checkRlsCoverage(fixtureDir)`.

**#13 lint part (audit claim confirmed).** `import-boundary.ts:11-15` matches three single-line `from "…"` patterns; allowed = path starts with `src/db/` **or** `basename(file) === "repository.ts"` (any directory). Only `src/modules/{audit,casting,identity}/repository.ts` exist. It scans `src/` only (`scripts/seed-demo-household.ts` imports `db` from `@/db/client`; leave that as is). 7 test cases in `tests/unit/lint/import-boundary.test.ts`.

## 5. Package-specific hazards

- **A string-aware comment stripper meets JSX.** `pending-feedback.ts` scans `.tsx` where an apostrophe in JSX text (`Don't`) looks like a string opener. Rule: `'` and `"` strings end at the first unescaped **newline** (JS forbids multi-line quoted strings), so damage is limited to one line; only template literals span lines (track `${ … }` nesting). A regex literal containing a quote (`/["']/`) has the same bounded effect. List this limitation in the `_shared.ts` header, same honesty as `sql-statements.ts`.
- **Behaviour differences between the old strippers are decision points.** Every migrated lint must be run on the real tree before and after and produce identical findings (all are green today). Write down every difference found by the fixture test below; do not silently pick a winner. Known candidates: (a) string-aware vs naive on `"//"` / `"/*"` inside strings; (b) deleting vs blanking (blanking keeps column positions, so a regex with `\s*` between tokens may now match across what used to be removed text, e.g. `foo/* x */(` deleted becomes `foo(`, blanked becomes `foo    (`); (c) `pending-feedback.ts` deletes `/* */` before `//` and `session-context.ts` blanks both in a single left-to-right pass: a `// … /*` line comment is handled differently; the scanner must be a single left-to-right pass, which is the correct semantics.
- **Fixtures for the `rls-coverage` rewrite cannot live in the OS temp dir.** `drizzle-orm/pg-core` does not resolve from `os.tmpdir()`, so `import()`ing a fixture schema there fails. Put them in a git-ignored scratch directory **inside the repo** (e.g. `tests/unit/lint/.tmp-fixtures/`, `mkdtempSync` under it, removed in `afterEach`; add the directory to `.gitignore` in the same commit) or build the tables in-process with `pgTable(...)` and call the pure function. Do not weaken the 8 cases: port each one.
- **`checkRlsCoverage` is synchronous today; `loadSchemaTables` (`data-inventory.ts`) is async** because it `await import()`s. Moving to introspection makes the lint async. Keep a sync, pure core `checkRlsCoverageOfTables(tables)` (takes `PgTable[]` plus a file map) and an async wrapper `checkRlsCoverage(rootDir)`; update the CLI main-guard and the test call sites to `await`. That test edit is an adaptation, not a weakening; say so in the commit body.
- **Do not skip `loadSchemaTables`' own guard rails** (builder-use outside `schema.ts`, unexported tables). Reuse its exported tables (`LoadResult.tables` carries only names, so export what you need, or import the module exports the same way) instead of copying the import logic. If reuse requires exporting a new symbol from `data-inventory.ts`, that is a small, allowed edit; keep `data-inventory.ts`'s behaviour unchanged.
- **CRLF vs LF:** run every new/changed lint test with both line endings (a fixture written once with `\n`, once with `\r\n`).
- **Never run `npm run verify` by guessing**: the full suite hits `flatmate-io-dev` (~90 s). For fast iteration use `npx vitest run tests/unit/lint` plus the individual `npx tsx scripts/lint/<name>.ts`.
- G-D: `guarded-tests.ts` protects the guarded manifest. Do not edit `test/guarded.manifest.json` or any registered test file. If the stricter detector flags a real registered file, stop and report (it means a guarded test was already skipped or empty).

## 6. Plan

### Phase A — characterization / failing tests

Write these first, all in `tests/unit/lint/`. Each must be seen red/green as stated before any production change.

1. **`guarded-tests.test.ts` (extend), fix-style.** Add cases using a helper that writes fixtures with a chosen EOL:
   - CRLF fixture `// it("leaks", () => {});\r\n// another comment\r\n` registered as implemented -> expects a violation "no it(/test( body". **Expected today: RED** (comment not stripped on CRLF, the lint reads a body). Same fixture with `\n`: green today (pin it).
   - CRLF fixture `it("ok", () => {}); // never .skip( this\r\n` -> expects **no** violation. **Expected today: RED** (prose `.skip(` is a false positive on CRLF). LF twin: green.
   - One case each for `it.skipIf(cond)("x", …)`, `it.runIf(cond)("x", …)`, `it.todo("x")`, `xit("x", …)`, `xtest`, `xdescribe`, `describe.skip(`, `it.only(`: expects a violation. **Expected today: RED** for `skipIf`, `runIf`, `todo`, `xit`, `xtest`, `xdescribe`; green for `.skip(`/`.only(`.
   - A `.skip(` inside a string literal is still ignored? **Decide and pin**: with a string-aware stripper `"it.skip("` inside a string is not a comment, but it is also not code; the detector runs on comment-blanked text only, so it would flag it. Pin whatever the implementation does and list it in the hand-back (conservative: flagging is fine, this is a guard).
   - Deliberate break: revert the fix to the old `split("\n")` line, rerun, see the two CRLF cases red.
2. **`tests/unit/lint/shared.test.ts` (new), characterization of the target helper API, written before `_shared.ts` exists.** Because the module does not exist the file fails to import; first create `_shared.ts` with the signatures only and `throw new Error("todo")`, commit nothing, run, see red, then implement in Phase B step 1. Cases for `blankComments(source)`: line comment; block comment spanning lines (newline count preserved, `output.length === input.length`); `//` inside `"…"`, `'…'` and a template literal is kept; `/* */` inside a string kept; `${ "//" }` inside a template; escaped quote `"a\"//b"`; CRLF input keeps `\r\n` and blanks only the comment text; unterminated block comment blanks to EOF; JSX text `Don't // not a comment` -> the `//` after the apostrophe: pin the documented behaviour (quoted strings end at newline). For `lineOf(source, index)`: first line is 1, works across CRLF and LF identically. For `walk(dir, filter)`: returns files recursively, sorted (determinism, see `check-refs` nondeterminism note in memory: never rely on directory order), skips `node_modules` and dot-directories, accepts a predicate.
3. **Parity snapshots of the *old* behaviour, one per lint to be migrated** (these protect the refactor; they pass against today's code). For each of `session-context`, `pending-feedback`, `definer-coverage`, `data-inventory`, `rls-coverage`, `import-boundary`: run the exported check against the **real repo root** and assert the result equals the committed expectation (`[]` for all). The point is not the empty array; it is that, after each migration commit, the same call still returns `[]` on the real tree. Put them in one file `tests/unit/lint/real-tree.test.ts`. Prove it can fail: temporarily add `import postgres from "postgres";` to a scratch `src/` file, see `import-boundary` red, remove it.
4. **`rls-coverage` parity test (before the rewrite).** `tests/unit/lint/rls-coverage-parity.test.ts`: load the real schema tables (via the `data-inventory.ts` export route above), compute for each table `{name, hasHouseholdIdColumn: getTableConfig(t).columns.some(c => c.name === "household_id"), policyCount: getTableConfig(t).policies.length}`, and compare to what the *old regex path* derives from `splitIntoTableSegments` for the same files (`tableName`, `household_id` in comment-stripped segment, `pgPolicy(` present). Assert the two agree table for table. **Expected today: green** if the regexes are right, and that is the finding; **if it is red the audit's concern is real**, report the disagreeing table and stop to ask. Also assert the known names (`session`, `room`, `application`, `household_settings`, `join_code_issuance`, `activity_event`, `membership`) are present so the test cannot pass vacuously.
5. **`import-boundary.test.ts` (extend), fix-style.** New cases, each expected **RED today**: `await import("postgres")` in `src/app/x.ts`; `const p = require("postgres")`; multi-line `import(\n  "@/db/client"\n)`; side-effect `import "postgres";`; `export { db } from "@/db/client";`; `export * from "drizzle-orm/postgres-js";`; subpath `from "postgres/types"`; a file `src/app/repository.ts` (wrong directory, must be flagged); `src/modules/casting/helpers/repository.ts` (nested, must be flagged); a commented-out `// import postgres from "postgres"` (must NOT be flagged); `import type { Sql } from "postgres"` (decide: type-only import does not reach the client at runtime; recommended: **not** flagged, pin it). Existing 7 cases stay green. Deliberate break: revert the path rule to `basename === "repository.ts"`, see the two path cases red.

### Phase B — change (one commit each, `verify`-green after each)

1. `test(lint): characterization for shared lint helpers` : adds the Phase A tests 2-4 and the `real-tree` snapshots, all green or excluded as stated; add `.tmp-fixtures` to `.gitignore` if used.
2. `fix(lint): guarded-tests strips comments on CRLF and detects every skip spelling` : implement against test 1 using a **local** minimal fix first (`split(/\r?\n/)` and the extended detector regex), so the bug fix ships independently of the refactor. Detector: `/\.(skip|only|skipIf|runIf|todo)\s*\(|\b(xit|xtest|xdescribe)\s*\(/`. Do not add `.fails`/`.concurrent`.
3. `refactor(lint): add shared lint helpers` : create `scripts/lint/_shared.ts` (header comment in the style of `sql-statements.ts` explaining what it is and its honesty limits). Exports:
   - `walk(dir: string, predicate: (name: string, fullPath: string) => boolean): string[]` : recursive, sorted, skips `node_modules` and dot-directories (record which of the 5 current walkers did that; none did, so listing the skip is a *difference* to put in the hand-back).
   - `blankComments(source: string): string` : single left-to-right scanner; replaces every character of a comment by a space except `\r` and `\n`, which are kept (so the output has the same length and the same line structure as the input, CRLF included); respects `'…'`, `"…"`, and template literals including `${ }` nesting; quoted strings end at an unescaped newline.
   - `lineOf(source: string, index: number): number`.
   - Make test 2 green. No lint is changed in this commit.
4. `refactor(lint): session-context uses shared helpers` : replace its `walk` and `blankComments`. Run `real-tree` + `session-context.test.ts` + `npx tsx scripts/lint/session-context.ts`.
5. `refactor(lint): pending-feedback uses shared helpers` : keep exporting `stripComments` (its test imports it; implement it as a re-export of `blankComments` and note the deleting-vs-blanking difference: the `<button` regex runs on the stripped source, and blanked text in `{/* … */}` leaves `{          }` which `findButtonTagFindings` already ignores; re-run all 4 "break:" cases).
6. `refactor(lint): data-inventory uses shared helpers` : replace `walkTsFiles` and `stripComments`. Its `TABLE_BUILDER_CALL` count runs on stripped code; blanked text keeps the count identical, verify with `data-inventory.test.ts` (including the fixtures that put `pgTable(` in comments).
7. `refactor(lint): definer-coverage uses shared helpers` : replace `stripJsComments`; keep `skipStringLiteral` / `skipNestedTemplate` (they serve the `sql` tagged-template walk, a different job).
8. `refactor(lint): import-boundary uses shared walk and sees every import form` : migrate `walk`, then implement the Phase A step 5 behaviour on the **whole blanked file** (not line by line): patterns for `from "<spec>"`, `import "<spec>"`, `import(\s*"<spec>"`, `require(\s*"<spec>"`, with `<spec>` = `postgres(/…)?`, `drizzle-orm/postgres-js(/…)?`, `…/db/client`; report line via `lineOf`. Allowed: `/^src\/db\//` or `/^src\/modules\/[^/]+\/repository\.ts$/`. `LintViolation` shape unchanged. Header comment updated: the lint now enforces what it claims, still not a full parser (computed specifiers such as `require(name)` are not seen).
9. `refactor(lint): rls-coverage reads the real schema` : `checkRlsCoverageOfTables` (pure) + async `checkRlsCoverage(rootDir)` that imports every `src/modules/*/schema.ts`, takes `getTableConfig(t)`, and flags a table when `columns.some(c => c.name === "household_id")` and `policies.length === 0` and the table is not in an explicit exemption list. The marker comment cannot be introspected: keep it by scanning only that table's source text for the marker, **or** replace it with a named exemption map in the lint (recommended; no real table uses the marker). Whichever is chosen, port all 8 fixture cases (fixtures under the in-repo scratch dir) and delete `splitIntoTableSegments` only after the parity test (Phase A 4) has been run and its result recorded in the commit body. Update the `verify` script? No: `tsx scripts/lint/rls-coverage.ts` stays. Update `.claude/rules/guardrail-lints.md` row for `rls-coverage.ts` only if its description becomes untrue (it says "has a `pgPolicy` of its own"; it stays true).
10. `chore(lint): remove dead duplicates` : delete any now-unused local helper; confirm `grep -rn "readdirSync" scripts/lint` shows only the two non-recursive listings, which stay (`migration-shape`, `definer-coverage` list a single directory, not a walk; migrating them is optional and out of scope).

### Phase C — follow-through

- Run `npm run verify` and paste the counts. Run the six migrated lints once with the working tree in CRLF (default on this machine) **and** once on a clean LF checkout (`git worktree add ../wp05-lf` with `core.autocrlf=false`, run `npx tsx scripts/lint/<each>.ts` there; never junction `node_modules`, run `npm ci` or skip and just run the vitest lint tests which need no DB). The results must agree.
- 🛑 HUMAN (optional, separate PR): add `*.ts text eol=lf` (and `*.tsx`) to `.gitattributes`. This is repo-wide: it changes how every `.ts` file is checked out. The index is already LF (`i/lf`), so no content changes and no `git add --renormalize` commit is needed; but every Windows clone keeps CRLF until files are re-checked out (`git rm --cached -r . && git reset --hard` is **destructive to uncommitted work** and is the human's call). It also interacts with the frozen-file hash rule in `tools/` only for `*.sha256`, not `.ts`. Recommend deferring: the lints are now EOL-independent, which was the actual defect. Do not commit this change in the WP05 PR.
- If the stricter `guarded-tests` detector flags a registered file, stop (see hazards).

## 7. Acceptance criteria

- [ ] CRLF and LF fixtures give identical results in `guarded-tests`; both CRLF cases were seen red before the fix and green after.
- [ ] `.skipIf(`, `.runIf(`, `.todo(`, `xit(`, `xtest(`, `xdescribe(` in a registered file are violations; `npx tsx scripts/lint/guarded-tests.ts` is still `OK` on the real tree.
- [ ] `scripts/lint/_shared.ts` exists with `walk`, `blankComments`, `lineOf`, a header stating its limits, and its own test file; the five recursive walkers and the comment strippers (except `sql-statements.ts`'s SQL-specific one and `definer-coverage`'s template walkers) are gone.
- [ ] One migrated lint per commit; every commit green; `real-tree.test.ts` returns `[]` for all six lints after each.
- [ ] Every behavioural difference between old strippers/walkers found while migrating is listed in the hand-back as a decision (even when all lints stayed green).
- [ ] `rls-coverage` derives tables and policies from `getTableConfig`; the parity test was run first and its result is in the commit body; all 8 old fixture cases still pass (ported).
- [ ] `import-boundary` flags `import()`, `require()`, side-effect imports, `export … from`, subpaths, and any `repository.ts` outside `src/modules/<name>/`; commented-out imports are not flagged; each new case was seen red.
- [ ] `npm run verify` green; no change under `src/`, `docs/`, `test/guarded.manifest.json`.

## 8. Out of scope & stop conditions

Out of scope: `.gitattributes` (human, separate PR), dependency-cruiser (WP06), `identity/api.ts` and the casting-to-identity schema leak (WP12), rewriting `session-context.ts`'s SQL regexes, migrating the two non-recursive directory listings, scanning `scripts/` or `tests/` for raw-client imports.

Stop and report if: the parity test is red (the regex and the schema disagree); a migrated lint's findings on the real tree change; the stricter guarded-tests detector flags a registered file; a lint needs a new exemption to stay green; the async `rls-coverage` cannot import a schema under `tsx` (report the error text).

## 9. Hand-back report (template)

```
WP05 hand-back
Commits: <hash> <subject> (one per line)
Characterization / failing tests added: <file: case> -> seen red how (deliberate break used) / green today
Guarded-tests: CRLF cases red before, green after: yes/no; new spellings detected: <list>; real tree still OK: yes/no
_shared.ts: exports <list>; limits documented: <list>
Lint migrations: <lint> -> real-tree [] before/after; differences found: <list or none>
rls-coverage parity: tables compared <n>; disagreements <none | list>; marker comment: kept / replaced by exemption map
import-boundary: forms now detected <list>; type-only imports: flagged/not flagged
npm run verify: <pass/fail counts>
LF-worktree run: <results>
Decisions for the human: .gitattributes eol=lf (recommend defer); string-aware blanking differences <list>; any other
Skipped / open questions: <...>
```
