# Bug Assessment: `afterEach` coerces `undefined` env var to string "undefined"

- **Slug**: session-token-hash-test-env-cleanup
- **Created**: 2026-09-18
- **Source**: pasted text (GitHub Copilot review comment, PR #4)
- **Verdict**: valid
- **Severity**: low

## Report (verbatim or summarized)

> When the test starts without `SESSION_TOKEN_HASH_SECRET`, assigning `undefined` back to
> `process.env` can coerce it to the string `"undefined"` rather than removing the variable. The
> final test deletes the variable, so this leaves process-global environment state polluted for
> later tests and can make missing-secret behavior order-dependent. Restore with
> `delete process.env.SESSION_TOKEN_HASH_SECRET` when `originalSecret` is undefined, otherwise
> assign the saved value.

Found in PR #4 review, file `tests/unit/identity/session-token-hash.test.ts` around line 15, via
GitHub Copilot.

## Symptom

In `tests/unit/identity/session-token-hash.test.ts`, `originalSecret` is captured once at
`describe`-body evaluation time (line 7). The `afterEach` (line 13-15) does
`process.env.SESSION_TOKEN_HASH_SECRET = originalSecret;` unconditionally. When the suite starts
with the variable unset, `originalSecret` is `undefined`; assigning `undefined` to a
`process.env` property coerces it to the literal string `"undefined"` (Node's `process.env` is a
string-only proxy), rather than removing the key. This leaves `SESSION_TOKEN_HASH_SECRET` set to
`"undefined"` (a truthy, non-empty string) after every test in this file, for the remainder of
the process — polluting any other test file that runs in the same worker/process and relies on
the secret being genuinely absent to exercise the "not configured" code path.

Expected: after each test, `process.env.SESSION_TOKEN_HASH_SECRET` should be restored to
exactly what it was before the test file ran — either the original string, or absent entirely.

## Reproduction

1. Run the suite in an environment where `SESSION_TOKEN_HASH_SECRET` is not set beforehand
   (the common case locally and in CI unless something upstream exports it).
2. `originalSecret` captures `undefined`.
3. Any test in the file runs `beforeEach` (sets `"test-secret"`) then `afterEach` (line 14) sets
   `process.env.SESSION_TOKEN_HASH_SECRET = undefined`, which Node coerces to the string
   `"undefined"`.
4. After this test file finishes, `process.env.SESSION_TOKEN_HASH_SECRET === "undefined"` (a
   truthy string), even though it started unset.
5. [NEEDS CLARIFICATION: whether the vitest config runs each test file in an isolated worker
   process (in which case the pollution is contained to this file's own run) or shares a process
   across files in the same worker — pollution is only observable by *other* files under the
   latter]. Even in the isolated-process case, the bug is real within this file: the final test
   (line 36-39) itself calls `delete process.env.SESSION_TOKEN_HASH_SECRET` before asserting the
   throw, then its own `afterEach` runs and reintroduces the `"undefined"` string, so the module
   under test's already-executed state and any process-exit hooks see the variable "set" — and if
   test order or file grouping ever changes, the guarantee that "unset before the suite = unset
   after" silently breaks.

## Suspected Code Paths

- `tests/unit/identity/session-token-hash.test.ts:7` — captures `originalSecret`, may be `undefined`.
- `tests/unit/identity/session-token-hash.test.ts:13-15` — `afterEach` unconditionally assigns
  `originalSecret` back, coercing `undefined` to `"undefined"`.
- `tests/unit/identity/session-token-hash.test.ts:36-39` — the one test that expects the secret
  to be genuinely *absent*; most exposed to this bug since it's the only place absence is
  asserted, and every other test file's absence-of-secret behavior is exposed to whatever
  contaminated state this file leaves behind if the process/worker is shared.

## Root Cause Hypothesis

Confidence: high. `process.env` is not a plain object — reading works normally, but any
assignment coerces the value with `String(value)` (Node/V8 behavior), so
`process.env.X = undefined` sets `X` to the 5-character string `"undefined"` instead of leaving
it unset or deleting it. The test's `afterEach` doesn't distinguish "originally absent" from
"originally present"; it always assigns. The fix is a straightforward conditional restore.

## Proposed Remediation

**Preferred**: In `afterEach`, branch on whether `originalSecret === undefined`: if so, call
`delete process.env.SESSION_TOKEN_HASH_SECRET`; otherwise assign
`process.env.SESSION_TOKEN_HASH_SECRET = originalSecret`. This exactly restores pre-suite state
regardless of whether the variable was originally set.

**Alternatives** (optional): none needed — this is the minimal, direct fix Copilot's comment
already specifies, and no broader abstraction (e.g., a shared env-snapshot test helper) is
justified for a single test file.

**Files likely to change**:
- `tests/unit/identity/session-token-hash.test.ts`

**Tests to add or update**:
- No new test required; this is a hygiene fix to existing `afterEach` cleanup. Optionally, a
  test could assert `process.env.SESSION_TOKEN_HASH_SECRET` is restored to its pre-suite value
  after the file completes, but that's normally out of scope for a single spec file to assert
  about itself and would be YAGNI here — the existing "throws if not configured" test (line
  36-39) is sufficient evidence that the fix keeps working going forward, since it will now
  reliably run against the correct absent/coerced state each time.

## Risks & Considerations

- None expected: the change only affects test teardown, not production code (`hashSessionToken`
  in `@/modules/identity/auth` is untouched).
- Low risk of regression: the conditional restore is strictly more correct than the current
  unconditional assignment.

## Open Questions

- [NEEDS CLARIFICATION: whether vitest runs this project's test files in a shared process/worker
  such that this pollution could actually leak into other test files today, or whether each file
  is isolated — doesn't change the fix, but affects how severe the historical blast radius was]
