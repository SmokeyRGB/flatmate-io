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
