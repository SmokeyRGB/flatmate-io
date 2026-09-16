# Quickstart: Validating F0 — The Substrate

Proves the three FR groups in `spec.md` hold, once implemented. Not a build guide — see
`tasks.md` (from `/speckit-tasks`) for implementation steps.

## Prerequisites

- Supabase project `flatmate-io` (`cjinhzzvjryojvhngjjn`, `eu-west-1`, Postgres 17) — already
  provisioned, currently empty. Migrations from this feature create its first tables.
- `DATABASE_URL` pointed at **Supabase's transaction-mode pooler** (port `6543`), per `research.md`
  §1 and `docs/adr/0006-*.md` (confirmed 2026-09-16, Vercel serverless hosting) — with prepared
  statements disabled on the client (`{ prepare: false }` for `postgres-js`), or writes fail.
- Test runner: Vitest (working assumption, `tools/README.md`; open to challenge per constitution
  Principle IX).

## 1. Authorization enforced twice (FR-0.1–FR-0.4, AC-0.6, AC-0.7)

```bash
vitest run tests/integration/policy      # visibility invariants via the policy layer
vitest run tests/integration/raw-sql     # the SAME invariants via raw SQL, RLS only, no app code
```

**Expected**: both suites pass independently. A change that makes only the policy-layer suite
pass while the raw-SQL suite would fail is exactly the "illusion" G-C7 warns about — it must be
caught here, not discovered later.

```bash
grep -rn "SET " src/ | grep -v "SET LOCAL"   # manual smoke check for FR-0.4's lint target
```

**Expected**: no output. Any bare `SET` on the session-context connection is the G-C8 leak this
project explicitly guards against.

## 2. Application state machine (FR-0.9–FR-0.12, AC-0.10)

```bash
vitest run tests/unit/casting/state-machine
```

**Expected**: all eleven states from `03-PRD.md` §4.2.1 exist after the first migration
(`SELECT unnest(enum_range(NULL::application_state))` returns 11 rows); every permitted
transition succeeds, every non-listed `(from, to)` pair throws; a backward transition produces
exactly one `ActivityEvent` with `actor_account_id` and `actor_profile_id` set.

## 3. Audit log immutability (FR-0.13–FR-0.15, AC-0.11)

```bash
vitest run tests/unit/audit
```

**Expected**: an `UPDATE` or `DELETE` on an existing `ActivityEvent` fails through the
application, a migration, and raw SQL. A payload write with a disallowed key for its `event_type`
(a bare `value`, or free text) is rejected. A simulated end-of-retention redaction leaves the row
readable (id, timestamps, actor, `event_type`) with only its 🔴/⚫ payload fields set to `null`.

## 4. Full gate

```bash
bash tools/check-refs.sh --quiet   # unrelated to F0's runtime behavior, but must stay green —
                                    # this feature's own spec/plan/data-model live under specs/
vitest run
```

**Expected**: `check-refs.sh` exits 0 (as it does today); the full Vitest suite is green with no
`.skip`/`.only` on any `[GUARDED]`-marked test (G-D's own enforcement, `test/guarded.manifest.json`).
