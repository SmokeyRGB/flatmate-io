# Review guidance for flatmate-io

Read `CLAUDE.md`, section "Implementation hazards specific to this repo", before reviewing. The
findings that mattered most in this repo's past reviews were all of one shape: a rule enforced on
the path the change was written for, and not on another path into the same state. For each
changed invariant, check:

- raw SQL as the `app_runtime` role (RLS applies, application-level transition tables do not);
- every `SECURITY DEFINER` function in `drizzle/` (runs past RLS; some answer unauthenticated
  callers; the schema has no foreign keys, so stored ids are not guaranteed consistent);
- a concurrent second request (read-then-write without a constraint or lock; the connection
  pooler can hide the race from tests);
- sibling functions that create, read or revoke the same state;
- request data a caller controls (headers, cookies, route params).

For migrations, check the constraints that exist at each statement, including ones the file
drops later. For tests, check the test could fail: does it assert the column or error code that
matters, and does it run against the state that matters (for a migration, the state before it)?

Authoritative rules live in `docs/GUARDRAILS.md`; do not treat this file as a source of rules.
