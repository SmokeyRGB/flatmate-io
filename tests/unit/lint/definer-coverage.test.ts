import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { checkDefinerCoverageLint } from "../../../scripts/lint/definer-coverage";

let fixtureDir: string;

function writeFixture(relPath: string, content: string): void {
  const full = join(fixtureDir, relPath);
  mkdirSync(join(full, ".."), { recursive: true });
  writeFileSync(full, content);
}

afterEach(() => {
  if (fixtureDir) rmSync(fixtureDir, { recursive: true, force: true });
});

// M3/P1: every SECURITY DEFINER function needs SET search_path and raw-SQL test coverage.
describe("definer-coverage lint (M3/P1)", () => {
  it("flags a SECURITY DEFINER function with no SET search_path", () => {
    fixtureDir = mkdtempSync(join(tmpdir(), "flatmate-lint-"));
    writeFixture(
      "drizzle/0001_test.sql",
      `CREATE FUNCTION dangerous_fn(p_id uuid) RETURNS uuid
LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT p_id
$$;`,
    );
    writeFixture(
      "tests/integration/raw-sql/dangerous.test.ts",
      `it("calls dangerous_fn", () => { dangerous_fn(); });`,
    );

    const violations = checkDefinerCoverageLint(fixtureDir);
    expect(violations).toContainEqual(
      expect.objectContaining({ functionName: "dangerous_fn", rule: "missing-search-path" }),
    );
    expect(violations).not.toContainEqual(
      expect.objectContaining({ functionName: "dangerous_fn", rule: "missing-raw-sql-test" }),
    );
  });

  it("flags a SECURITY DEFINER function with SET search_path but no raw-SQL test", () => {
    fixtureDir = mkdtempSync(join(tmpdir(), "flatmate-lint-"));
    writeFixture(
      "drizzle/0001_test.sql",
      `CREATE FUNCTION untested_fn(p_id uuid) RETURNS uuid
LANGUAGE sql SECURITY DEFINER SET search_path = public STABLE AS $$
  SELECT p_id
$$;`,
    );

    const violations = checkDefinerCoverageLint(fixtureDir);
    expect(violations).toEqual([
      { functionName: "untested_fn", file: "0001_test.sql", rule: "missing-raw-sql-test" },
    ]);
  });

  it("passes a SECURITY DEFINER function with search_path set and raw-SQL coverage", () => {
    fixtureDir = mkdtempSync(join(tmpdir(), "flatmate-lint-"));
    writeFixture(
      "drizzle/0001_test.sql",
      `CREATE FUNCTION covered_fn(p_id uuid) RETURNS uuid
LANGUAGE sql SECURITY DEFINER SET search_path = public STABLE AS $$
  SELECT p_id
$$;`,
    );
    writeFixture(
      "tests/integration/raw-sql/covered.test.ts",
      `it("calls covered_fn", () => { covered_fn(); });`,
    );

    expect(checkDefinerCoverageLint(fixtureDir)).toHaveLength(0);
  });

  it("ignores a plain (non-DEFINER) function", () => {
    fixtureDir = mkdtempSync(join(tmpdir(), "flatmate-lint-"));
    writeFixture(
      "drizzle/0001_test.sql",
      `CREATE FUNCTION plain_trigger_fn() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RETURN NEW;
END;
$$;`,
    );

    expect(checkDefinerCoverageLint(fixtureDir)).toHaveLength(0);
  });

  it("does not treat a DROP-then-CREATE re-definition (this project's own idiom) as removal", () => {
    fixtureDir = mkdtempSync(join(tmpdir(), "flatmate-lint-"));
    writeFixture(
      "drizzle/0001_test.sql",
      `CREATE FUNCTION resolve_it(p_code text) RETURNS uuid
LANGUAGE sql SECURITY DEFINER SET search_path = public STABLE AS $$
  SELECT p_code::uuid
$$;`,
    );
    writeFixture(
      "drizzle/0002_test.sql",
      `DROP FUNCTION IF EXISTS resolve_it(text);
CREATE FUNCTION resolve_it(p_code text) RETURNS TABLE (a uuid, b uuid)
LANGUAGE sql SECURITY DEFINER SET search_path = public STABLE AS $$
  SELECT p_code::uuid, p_code::uuid
$$;`,
    );
    writeFixture(
      "tests/integration/raw-sql/resolve-it.test.ts",
      `it("calls resolve_it", () => { resolve_it(); });`,
    );

    // Exactly one entry considered (the latest definition), not flagged as dropped.
    expect(checkDefinerCoverageLint(fixtureDir)).toHaveLength(0);
  });

  // review fix: the old CREATE_FUNCTION_RE captured a whole statement in one regex, including its
  // args via `\([^)]*\)` — a nested paren in an argument's type (e.g. `numeric(10,2)`) broke that
  // capture. Splitting into real statements first and matching only up to the function's OWN
  // opening paren sidesteps the problem entirely.
  it("handles a nested paren in an argument type (numeric(10,2))", () => {
    fixtureDir = mkdtempSync(join(tmpdir(), "flatmate-lint-"));
    writeFixture(
      "drizzle/0001_test.sql",
      `CREATE FUNCTION priced_fn(p_amount numeric(10,2)) RETURNS uuid
LANGUAGE sql SECURITY DEFINER SET search_path = public STABLE AS $$
  SELECT gen_random_uuid()
$$;`,
    );
    writeFixture(
      "tests/integration/raw-sql/priced.test.ts",
      `it("calls priced_fn", () => { priced_fn(); });`,
    );

    expect(checkDefinerCoverageLint(fixtureDir)).toHaveLength(0);
  });

  // review fix: a dollar-quoted body may use any tag, not just bare $$.
  it("handles a non-default dollar tag ($fn$...$fn$)", () => {
    fixtureDir = mkdtempSync(join(tmpdir(), "flatmate-lint-"));
    writeFixture(
      "drizzle/0001_test.sql",
      `CREATE FUNCTION tagged_fn(p_id uuid) RETURNS uuid
LANGUAGE sql SECURITY DEFINER SET search_path = public STABLE AS $fn$
  SELECT p_id
$fn$;`,
    );
    writeFixture(
      "tests/integration/raw-sql/tagged.test.ts",
      `it("calls tagged_fn", () => { tagged_fn(); });`,
    );

    expect(checkDefinerCoverageLint(fixtureDir)).toHaveLength(0);
  });

  // review fix: the old regex required the closing `$$` to be followed IMMEDIATELY by `;` —
  // trailing attributes written AFTER the body (this exact shape) either went undetected or bled
  // into the next statement. SECURITY DEFINER / SET search_path must be seen wherever they're
  // written in the statement.
  it("detects SECURITY DEFINER and SET search_path written AFTER the function body", () => {
    fixtureDir = mkdtempSync(join(tmpdir(), "flatmate-lint-"));
    writeFixture(
      "drizzle/0001_test.sql",
      `CREATE FUNCTION trailing_attrs_fn(p_id uuid) RETURNS uuid AS $$
  SELECT p_id
$$ LANGUAGE sql SECURITY DEFINER SET search_path = public;`,
    );
    writeFixture(
      "tests/integration/raw-sql/trailing.test.ts",
      `it("calls trailing_attrs_fn", () => { trailing_attrs_fn(); });`,
    );

    expect(checkDefinerCoverageLint(fixtureDir)).toHaveLength(0);
  });

  // review fix: trailing attributes after the body, with NO raw-sql test and NO search_path, must
  // still be caught as two separate violations — proves this isn't accidentally swallowed by the
  // statement boundary.
  it("still flags missing search_path/test when attributes are written after an untested function's body", () => {
    fixtureDir = mkdtempSync(join(tmpdir(), "flatmate-lint-"));
    writeFixture(
      "drizzle/0001_test.sql",
      `CREATE FUNCTION untested_trailing_fn(p_id uuid) RETURNS uuid AS $$
  SELECT p_id
$$ LANGUAGE sql SECURITY DEFINER;`,
    );

    const violations = checkDefinerCoverageLint(fixtureDir);
    expect(violations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ functionName: "untested_trailing_fn", rule: "missing-search-path" }),
        expect.objectContaining({ functionName: "untested_trailing_fn", rule: "missing-raw-sql-test" }),
      ]),
    );
  });

  // review fix: function-name regexes must accept schema-qualified and/or quoted names, compared
  // on the unqualified name — both for the DROP-then-CREATE re-create idiom and for the function
  // definition itself. Asserted both ways: covered means zero violations, AND (separately) an
  // uncovered qualified-name function is still flagged — proving the name is actually being
  // tracked, not just silently invisible to the scanner (a regex that fails to match the
  // qualified CREATE FUNCTION at all would also produce zero violations, for the wrong reason).
  it("handles a schema-qualified, quoted function name", () => {
    fixtureDir = mkdtempSync(join(tmpdir(), "flatmate-lint-"));
    writeFixture(
      "drizzle/0001_test.sql",
      `CREATE FUNCTION "public"."qualified_fn"(p_id uuid) RETURNS uuid
LANGUAGE sql SECURITY DEFINER SET search_path = public STABLE AS $$
  SELECT p_id
$$;`,
    );
    writeFixture(
      "tests/integration/raw-sql/qualified.test.ts",
      `it("calls qualified_fn", () => { qualified_fn(); });`,
    );

    expect(checkDefinerCoverageLint(fixtureDir)).toHaveLength(0);
  });

  it("still flags an uncovered schema-qualified, quoted function name (proves it's tracked, not invisible)", () => {
    fixtureDir = mkdtempSync(join(tmpdir(), "flatmate-lint-"));
    writeFixture(
      "drizzle/0001_test.sql",
      `CREATE FUNCTION "public"."uncovered_qualified_fn"(p_id uuid) RETURNS uuid
LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT p_id
$$;`,
    );

    const violations = checkDefinerCoverageLint(fixtureDir);
    expect(violations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ functionName: "uncovered_qualified_fn", rule: "missing-search-path" }),
        expect.objectContaining({ functionName: "uncovered_qualified_fn", rule: "missing-raw-sql-test" }),
      ]),
    );
  });

  // review fix: a name merely MENTIONED in a comment (not an actual SQL call) must not count as
  // coverage — the old check matched the bare name anywhere in the file, comments included.
  it("does not count a name that only appears in a comment, never as an actual call", () => {
    fixtureDir = mkdtempSync(join(tmpdir(), "flatmate-lint-"));
    writeFixture(
      "drizzle/0001_test.sql",
      `CREATE FUNCTION mentioned_only_fn(p_id uuid) RETURNS uuid
LANGUAGE sql SECURITY DEFINER SET search_path = public STABLE AS $$
  SELECT p_id
$$;`,
    );
    writeFixture(
      "tests/integration/raw-sql/mentioned.test.ts",
      `// mentioned_only_fn is exercised elsewhere, see docs\n` +
        `/* also mentioned_only_fn here, in a block comment */\n` +
        `it("does something unrelated", () => { doesNotCallIt(); });`,
    );

    const violations = checkDefinerCoverageLint(fixtureDir);
    expect(violations).toContainEqual(
      expect.objectContaining({ functionName: "mentioned_only_fn", rule: "missing-raw-sql-test" }),
    );
  });

  it("treats a DROP with no following CREATE as real removal — nothing to flag", () => {
    fixtureDir = mkdtempSync(join(tmpdir(), "flatmate-lint-"));
    writeFixture(
      "drizzle/0001_test.sql",
      `CREATE FUNCTION removed_fn(p_id uuid) RETURNS uuid
LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT p_id
$$;`,
    );
    writeFixture("drizzle/0002_test.sql", `DROP FUNCTION removed_fn(uuid);`);

    // No SET search_path and no raw-sql test — but the function no longer exists, so nothing to
    // flag (a lint that flagged a dropped function would be exactly the false-positive shape
    // P9 warns against).
    expect(checkDefinerCoverageLint(fixtureDir)).toHaveLength(0);
  });
});

// Run against the REAL repo, not a fixture: this is the honest "does the lint see today's
// database" check. As of this commit it must fail for exactly resolve_account_household (0005,
// no raw-sql test names it) and record_join_attempt (0014, only tested under
// tests/integration/policy/) — the two gaps M3's own tasks.md/plan section fixes by adding tests,
// never by allowlisting. Once resolve-account-household.test.ts and record-join-attempt.test.ts
// (tests/integration/raw-sql/) exist, this must be empty.
describe("definer-coverage lint against the real repo", () => {
  it("has no violations (resolve_account_household and record_join_attempt are now covered)", () => {
    const rootDir = join(__dirname, "..", "..", "..");
    const violations = checkDefinerCoverageLint(rootDir);
    expect(violations).toEqual([]);
  });
});
