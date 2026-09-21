## Why

35 test files register a real household via `registerTestHousehold()` and clean it up in a
`finally` inside the `it()` body. That teardown call therefore spends the test's own
`testTimeout` budget, and — per `vitest.config.ts:22-23`'s own comment — when a test hangs long
enough to hit that timeout, the abandoned promise never reaches `finally`, so `hh.cleanup()`
never runs. That is how the failed CI run left 8 households and 5 Supabase Auth users orphaned in
the `flatmate-io-dev` project. Moving teardown to `afterEach` takes it out of the timed region
entirely, so it runs whether the test passes, fails, or times out. Two files
(`display-name-uniqueness.test.ts`, `account-cannot-vote.test.ts`) already use this shape — it's
existing precedent in this codebase, not a new pattern.

## What Changes

- In the 35 affected test files, replace the per-`it()` `let hh: TestHousehold | undefined; try {
  ... } finally { if (hh) await hh.cleanup(); }` shape with a module- (or describe-)scoped
  `let hh`/`hhA`/`hhB` declaration plus a single `afterEach` that cleans up whatever was assigned
  and resets it to `undefined`.
- Files that register two households in one test (`hhA`/`hhB`) get both cleaned in the same
  `afterEach`.
- Files with multiple `it()`s sharing one local `hh` per test keep one `let` per test but hoist it
  to `describe`/module scope so `afterEach` can reach it; `afterEach` still runs once per test.
- Update the two comments that describe the current try/finally behavior as fact
  (`vitest.config.ts:21-23`, `tests/helpers/identity.ts:43-44`) so they describe the new shape
  instead of going stale.
- No production code, no test assertions, and no test titles change — this is purely a teardown
  relocation. `tests/integration/raw-sql/pool-reuse.test.ts` also has a `finally`, but it closes a
  raw `postgres` client, not a household, and is out of scope.

## Capabilities

No spec-level behavior changes — this only moves *when* test teardown runs, not what the system
under test does. `skip_specs: true` is set in this change's `.openspec.yaml`.

### New Capabilities

(none)

### Modified Capabilities

(none)

## Impact

- **Affected code**: 35 files under `tests/unit/**` and `tests/integration/{policy,raw-sql}/**`
  (full list in `design.md`/`tasks.md`), plus `tests/helpers/identity.ts` and `vitest.config.ts`
  (comments only).
- **Guardrails touched**: none behaviorally. Four of the affected files back G-D invariants
  (`household-account-identity.test.ts`, `session-immutable-profile.test.ts`,
  `round-visibility-household-account.test.ts` in both `policy/` and `raw-sql/`) — their test
  bodies and titles are unchanged, only teardown timing moves, so `test/guarded.manifest.json`
  needs no update.
- **Dependencies**: none — uses Vitest's existing `afterEach` hook, already imported in the two
  precedent files.
- **Assumption**: Vitest still runs registered `afterEach` hooks after a test that hit
  `testTimeout`, even though the test's own abandoned promise never resolves. This is the premise
  the fix depends on; if it doesn't hold in this Vitest version, the fix needs revisiting in
  design.md.
