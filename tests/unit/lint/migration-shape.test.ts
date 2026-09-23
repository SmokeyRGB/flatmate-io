import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { checkMigrationShape } from "../../../scripts/lint/migration-shape";

let fixtureDir: string;

function writeMigration(fileName: string, content: string): void {
  const full = join(fixtureDir, "drizzle", fileName);
  mkdirSync(join(full, ".."), { recursive: true });
  writeFileSync(full, content);
}

afterEach(() => {
  if (fixtureDir) rmSync(fixtureDir, { recursive: true, force: true });
});

// P5/M4: repo-specific migration mechanics (drizzle/0013-0017) that cost a production migration
// abort and a half-applied dev database. Only files numbered after 0017 are checked.
describe("migration-shape lint", () => {
  describe("cutoff (files <= 0017 are applied history)", () => {
    it("ignores violations in a file at or below the cutoff", () => {
      fixtureDir = mkdtempSync(join(tmpdir(), "flatmate-migration-shape-"));
      writeMigration(
        "0017_at_cutoff.sql",
        `ALTER TYPE "public"."x" ADD VALUE 'y';\n--> statement-breakpoint\nSELECT 1;`,
      );

      expect(checkMigrationShape(fixtureDir)).toHaveLength(0);
    });

    it("checks a file above the cutoff", () => {
      fixtureDir = mkdtempSync(join(tmpdir(), "flatmate-migration-shape-"));
      writeMigration(
        "0018_above_cutoff.sql",
        `ALTER TYPE "public"."x" ADD VALUE 'y';\n--> statement-breakpoint\nSELECT 1;`,
      );

      const violations = checkMigrationShape(fixtureDir);
      expect(violations.some((v) => v.rule === 1)).toBe(true);
    });

    it("ignores files in drizzle/meta/", () => {
      fixtureDir = mkdtempSync(join(tmpdir(), "flatmate-migration-shape-"));
      const metaFile = join(fixtureDir, "drizzle", "meta", "0018_snapshot.sql");
      mkdirSync(join(metaFile, ".."), { recursive: true });
      writeFileSync(metaFile, `ALTER TYPE "public"."x" ADD VALUE 'y';\n--> statement-breakpoint\nSELECT 1;`);

      expect(checkMigrationShape(fixtureDir)).toHaveLength(0);
    });
  });

  describe("rule 1: ALTER TYPE ... ADD VALUE must be the file's only statement", () => {
    it("fails when another statement follows in the same file", () => {
      fixtureDir = mkdtempSync(join(tmpdir(), "flatmate-migration-shape-"));
      writeMigration(
        "0018_enum_plus_use.sql",
        `ALTER TYPE "public"."resident_profile_status" ADD VALUE 'removed';\n` +
          `--> statement-breakpoint\n` +
          `UPDATE "resident_profile" SET status = 'removed' WHERE status = 'moved_out';`,
      );

      const violations = checkMigrationShape(fixtureDir);
      expect(violations).toHaveLength(1);
      expect(violations[0].rule).toBe(1);
    });

    it("passes when the ADD VALUE statement is alone (drizzle/0016 shape)", () => {
      fixtureDir = mkdtempSync(join(tmpdir(), "flatmate-migration-shape-"));
      writeMigration(
        "0018_enum_only.sql",
        `-- a comment explaining why\nALTER TYPE "public"."resident_profile_status" ADD VALUE IF NOT EXISTS 'removed';`,
      );

      expect(checkMigrationShape(fixtureDir)).toHaveLength(0);
    });

    // review fix: rule 1 used to split on `--> statement-breakpoint` markers ONLY. A hand-written
    // migration (drizzle/0005, 0016 shape) carries none, so the whole file was treated as ONE
    // segment/statement regardless of how many real statements it held — this file has two real
    // statements and no breakpoint between them, and the old splitter would have seen
    // `statements.length === 1`, so the `statements.length > 1` guard could never fire.
    it("fails on a hand-written file (no breakpoints at all) where ADD VALUE isn't alone", () => {
      fixtureDir = mkdtempSync(join(tmpdir(), "flatmate-migration-shape-"));
      writeMigration(
        "0018_enum_plus_use_no_breakpoint.sql",
        `ALTER TYPE "public"."resident_profile_status" ADD VALUE 'removed';\n` +
          `UPDATE "resident_profile" SET status = 'removed' WHERE status = 'moved_out';`,
      );

      const violations = checkMigrationShape(fixtureDir);
      expect(violations.some((v) => v.rule === 1)).toBe(true);
    });
  });

  describe("rule 2: ADD COLUMN carries IF NOT EXISTS", () => {
    it("fails when IF NOT EXISTS is missing", () => {
      fixtureDir = mkdtempSync(join(tmpdir(), "flatmate-migration-shape-"));
      writeMigration(
        "0018_add_column.sql",
        `ALTER TABLE "join_code_issuance" ADD COLUMN "resident_profile_id" uuid;`,
      );

      const violations = checkMigrationShape(fixtureDir);
      expect(violations).toHaveLength(1);
      expect(violations[0].rule).toBe(2);
    });

    it("passes when IF NOT EXISTS is present (drizzle/0015 shape)", () => {
      fixtureDir = mkdtempSync(join(tmpdir(), "flatmate-migration-shape-"));
      writeMigration(
        "0018_add_column.sql",
        `ALTER TABLE "join_code_issuance" ADD COLUMN IF NOT EXISTS "resident_profile_id" uuid;`,
      );

      expect(checkMigrationShape(fixtureDir)).toHaveLength(0);
    });

    // review fix: Postgres accepts `ADD <col> <type>` with the COLUMN keyword omitted entirely —
    // the old regex required the literal text `ADD COLUMN` and missed this form completely.
    it("fails on ADD without the COLUMN keyword, and without IF NOT EXISTS", () => {
      fixtureDir = mkdtempSync(join(tmpdir(), "flatmate-migration-shape-"));
      writeMigration(
        "0018_add_no_column_keyword.sql",
        `ALTER TABLE "join_code_issuance" ADD "resident_profile_id" uuid;`,
      );

      const violations = checkMigrationShape(fixtureDir);
      expect(violations).toHaveLength(1);
      expect(violations[0].rule).toBe(2);
    });

    it("passes ADD without COLUMN when IF NOT EXISTS is present", () => {
      fixtureDir = mkdtempSync(join(tmpdir(), "flatmate-migration-shape-"));
      writeMigration(
        "0018_add_no_column_keyword_safe.sql",
        `ALTER TABLE "join_code_issuance" ADD IF NOT EXISTS "resident_profile_id" uuid;`,
      );

      expect(checkMigrationShape(fixtureDir)).toHaveLength(0);
    });

    // review fix: these six ADD forms aren't a column add at all and don't take IF NOT EXISTS the
    // same way — the old regex's literal `ADD\s+COLUMN\s+(?!IF NOT EXISTS)` never matched any of
    // them (they don't contain the word COLUMN), so this is a non-regression guard for the new,
    // broader ADD-without-COLUMN detection above.
    it.each([
      `ALTER TABLE "t" ADD CONSTRAINT "t_check" CHECK ("x" > 0);`,
      `ALTER TABLE "t" ADD PRIMARY KEY ("id");`,
      `ALTER TABLE "t" ADD UNIQUE ("code");`,
      `ALTER TABLE "t" ADD CHECK ("x" > 0);`,
      `ALTER TABLE "t" ADD FOREIGN KEY ("owner_id") REFERENCES "owner" ("id");`,
      `ALTER TABLE "t" ADD EXCLUDE USING gist ("during" WITH &&);`,
      `ALTER TYPE "t_status" ADD VALUE 'new_status';`,
    ])("does not flag %j as a missing-IF-NOT-EXISTS column add", (statement) => {
      fixtureDir = mkdtempSync(join(tmpdir(), "flatmate-migration-shape-"));
      writeMigration("0018_add_non_column_form.sql", statement);

      const violations = checkMigrationShape(fixtureDir);
      expect(violations.some((v) => v.rule === 2)).toBe(false);
    });
  });

  describe("rule 3: a re-creatable function needs a preceding DROP FUNCTION IF EXISTS", () => {
    it("fails a RETURNS TABLE function with no preceding DROP", () => {
      fixtureDir = mkdtempSync(join(tmpdir(), "flatmate-migration-shape-"));
      writeMigration(
        "0018_returns_table_no_drop.sql",
        `CREATE FUNCTION resolve_join_code(p_code text) RETURNS TABLE (household_id uuid)\n` +
          `LANGUAGE sql SECURITY DEFINER SET search_path = public STABLE AS $$ SELECT 1 $$;`,
      );

      const violations = checkMigrationShape(fixtureDir);
      expect(violations.some((v) => v.rule === 3)).toBe(true);
    });

    it("fails a bare CREATE FUNCTION (no OR REPLACE, no RETURNS TABLE) with no preceding DROP", () => {
      fixtureDir = mkdtempSync(join(tmpdir(), "flatmate-migration-shape-"));
      writeMigration(
        "0018_bare_create_no_drop.sql",
        `CREATE FUNCTION record_join_attempt(p_source_hash text) RETURNS boolean\n` +
          `LANGUAGE plpgsql SECURITY DEFINER SET search_path = public VOLATILE AS $$ BEGIN RETURN true; END; $$;`,
      );

      const violations = checkMigrationShape(fixtureDir);
      expect(violations.some((v) => v.rule === 3)).toBe(true);
    });

    it("passes a RETURNS TABLE function preceded by DROP FUNCTION IF EXISTS of the same name (drizzle/0015 shape)", () => {
      fixtureDir = mkdtempSync(join(tmpdir(), "flatmate-migration-shape-"));
      writeMigration(
        "0018_returns_table_with_drop.sql",
        `DROP FUNCTION IF EXISTS resolve_join_code(text);\n` +
          `--> statement-breakpoint\n` +
          `CREATE FUNCTION resolve_join_code(p_code text) RETURNS TABLE (household_id uuid)\n` +
          `LANGUAGE sql SECURITY DEFINER SET search_path = public STABLE AS $$ SELECT 1 $$;`,
      );

      expect(checkMigrationShape(fixtureDir)).toHaveLength(0);
    });

    it("passes CREATE OR REPLACE FUNCTION with no RETURNS TABLE and no prior drop", () => {
      fixtureDir = mkdtempSync(join(tmpdir(), "flatmate-migration-shape-"));
      writeMigration(
        "0018_or_replace_scalar.sql",
        `CREATE OR REPLACE FUNCTION touch_updated_at() RETURNS trigger\n` +
          `LANGUAGE plpgsql AS $$ BEGIN RETURN NEW; END; $$;`,
      );

      expect(checkMigrationShape(fixtureDir)).toHaveLength(0);
    });

    it("does not accept a DROP of a DIFFERENT function name as satisfying the rule", () => {
      fixtureDir = mkdtempSync(join(tmpdir(), "flatmate-migration-shape-"));
      writeMigration(
        "0018_wrong_drop.sql",
        `DROP FUNCTION IF EXISTS some_other_function(text);\n` +
          `--> statement-breakpoint\n` +
          `CREATE FUNCTION resolve_join_code(p_code text) RETURNS TABLE (household_id uuid)\n` +
          `LANGUAGE sql SECURITY DEFINER SET search_path = public STABLE AS $$ SELECT 1 $$;`,
      );

      const violations = checkMigrationShape(fixtureDir);
      expect(violations.some((v) => v.rule === 3)).toBe(true);
    });

    // review fix: function-name regexes must accept schema-qualified and/or quoted names and
    // compare on the unqualified name, so a DROP of `public.resolve_join_code` (or
    // `"public"."resolve_join_code"`) satisfies the rule for a later bare `resolve_join_code`.
    it.each([
      ["public.resolve_join_code", "resolve_join_code"],
      [`"public"."resolve_join_code"`, "resolve_join_code"],
      ["resolve_join_code", "public.resolve_join_code"],
    ])("treats %s (DROP) and %s (CREATE) as the same unqualified name", (dropName, createName) => {
      fixtureDir = mkdtempSync(join(tmpdir(), "flatmate-migration-shape-"));
      writeMigration(
        "0018_qualified_names.sql",
        `DROP FUNCTION IF EXISTS ${dropName}(text);\n` +
          `--> statement-breakpoint\n` +
          `CREATE FUNCTION ${createName}(p_code text) RETURNS TABLE (household_id uuid)\n` +
          `LANGUAGE sql SECURITY DEFINER SET search_path = public STABLE AS $$ SELECT 1 $$;`,
      );

      expect(checkMigrationShape(fixtureDir)).toHaveLength(0);
    });

    // review fix: rule 3 used to `.exec()` (single match) per breakpoint-delimited segment, so a
    // hand-written file with no breakpoints and TWO CREATE FUNCTIONs collapsed into one segment —
    // only the FIRST one was ever checked. Neither function here has a preceding DROP, so both
    // must be flagged.
    it("evaluates every CREATE FUNCTION in a hand-written file with no breakpoints at all", () => {
      fixtureDir = mkdtempSync(join(tmpdir(), "flatmate-migration-shape-"));
      writeMigration(
        "0018_two_functions_no_breakpoint.sql",
        `CREATE FUNCTION first_fn(p_id uuid) RETURNS uuid\n` +
          `LANGUAGE sql SECURITY DEFINER SET search_path = public STABLE AS $$ SELECT p_id $$;\n` +
          `CREATE FUNCTION second_fn(p_id uuid) RETURNS uuid\n` +
          `LANGUAGE sql SECURITY DEFINER SET search_path = public STABLE AS $$ SELECT p_id $$;`,
      );

      const violations = checkMigrationShape(fixtureDir);
      const rule3Reasons = violations.filter((v) => v.rule === 3).map((v) => v.reason);
      expect(rule3Reasons.some((r) => r.includes("first_fn"))).toBe(true);
      expect(rule3Reasons.some((r) => r.includes("second_fn"))).toBe(true);
    });
  });

  describe("rule 4: SECURITY DEFINER requires SET search_path", () => {
    it("fails when SET search_path is missing", () => {
      fixtureDir = mkdtempSync(join(tmpdir(), "flatmate-migration-shape-"));
      writeMigration(
        "0018_definer_no_search_path.sql",
        `DROP FUNCTION IF EXISTS resolve_join_code(text);\n` +
          `--> statement-breakpoint\n` +
          `CREATE FUNCTION resolve_join_code(p_code text) RETURNS TABLE (household_id uuid)\n` +
          `LANGUAGE sql SECURITY DEFINER STABLE AS $$ SELECT 1 $$;`,
      );

      const violations = checkMigrationShape(fixtureDir);
      expect(violations.some((v) => v.rule === 4)).toBe(true);
    });

    it("passes when SET search_path is present", () => {
      fixtureDir = mkdtempSync(join(tmpdir(), "flatmate-migration-shape-"));
      writeMigration(
        "0018_definer_with_search_path.sql",
        `DROP FUNCTION IF EXISTS record_join_attempt(text);\n` +
          `--> statement-breakpoint\n` +
          `CREATE FUNCTION record_join_attempt(p_source_hash text) RETURNS boolean\n` +
          `LANGUAGE plpgsql SECURITY DEFINER SET search_path = public VOLATILE AS $$ BEGIN RETURN true; END; $$;`,
      );

      expect(checkMigrationShape(fixtureDir)).toHaveLength(0);
    });
  });

  it("passes a clean multi-statement file with none of the four hazards", () => {
    fixtureDir = mkdtempSync(join(tmpdir(), "flatmate-migration-shape-"));
    writeMigration(
      "0018_clean.sql",
      `CREATE TABLE IF NOT EXISTS "widget" ("id" uuid PRIMARY KEY);\n` +
        `--> statement-breakpoint\n` +
        `CREATE INDEX IF NOT EXISTS "widget_id_idx" ON "widget" USING btree ("id");`,
    );

    expect(checkMigrationShape(fixtureDir)).toHaveLength(0);
  });
});
