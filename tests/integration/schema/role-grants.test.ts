// Live catalog check for finding #2: anon and authenticated must not be able to execute a
// SECURITY DEFINER function in public, and must not hold table or sequence privileges there.
// Supabase's default ACLs grant those roles explicitly, so REVOKE ... FROM PUBLIC does not
// remove them. has_*_privilege includes grants inherited through PUBLIC and through role
// membership, which is the privilege a Data API caller actually has.
//
// Strict on a repository-built database, a warning on shared hosted dev (design.md D5, the same
// rule as data-inventory-live.test.ts). A strict failure on flatmate-io-dev would block every
// other branch's pre-push. Positive controls are not behind that warning: losing app_runtime's
// own grants is a break of this branch, not another branch's unmerged migration.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { db } from "@/db/client";
import { isStrictCatalogCheck } from "../../helpers/live-catalog";
import { parseInventory } from "../../../scripts/lint/data-inventory";

const REQUIRED_DEFINERS = [
  "resolve_account_household",
  "resolve_join_code",
  "claim_join_code",
  "record_join_attempt",
  "casting_round_keeps_applications",
] as const;

function reportFindings(findings: string[]): void {
  if (isStrictCatalogCheck()) {
    expect(findings, findings.join("\n")).toEqual([]);
    return;
  }
  if (findings.length > 0) {
    console.warn(
      `role-grants live check: ${findings.length} finding(s) against a non-local database ` +
        `(${new URL(process.env.DATABASE_URL!).hostname}) — the branch may be behind the ` +
        `database's migrations, or the database ahead of this branch:\n  ${findings.join("\n  ")}`,
    );
  }
}

describe("role grants (finding #2, design.md D5)", () => {
  it("anon and authenticated have no EXECUTE on a non-extension SECURITY DEFINER function in public", async () => {
    const rows = await db.execute<{ role: string; proname: string; args: string }>(sql`
      SELECT r.rolname AS role,
             p.proname,
             pg_get_function_identity_arguments(p.oid) AS args
      FROM pg_catalog.pg_proc p
      JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
      JOIN pg_catalog.pg_roles r ON r.rolname IN ('anon', 'authenticated')
      WHERE n.nspname = 'public'
        AND p.prosecdef
        AND has_function_privilege(r.oid, p.oid, 'EXECUTE')
        AND NOT EXISTS (
          SELECT 1 FROM pg_catalog.pg_depend d
          WHERE d.objid = p.oid AND d.deptype = 'e'
        )
      ORDER BY r.rolname, p.proname
    `);

    const findings = rows.map((row) => `${row.role} ${row.proname}(${row.args})`);
    reportFindings(findings);
  });

  it("anon and authenticated have no table, view, or sequence privilege in public", async () => {
    const tables = await db.execute<{ role: string; relname: string; privilege: string }>(sql`
      SELECT r.rolname AS role, c.relname, priv.privilege
      FROM pg_catalog.pg_class c
      JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
      JOIN pg_catalog.pg_roles r ON r.rolname IN ('anon', 'authenticated')
      CROSS JOIN (VALUES
        ('SELECT'), ('INSERT'), ('UPDATE'), ('DELETE'), ('TRUNCATE'), ('REFERENCES'), ('TRIGGER')
      ) AS priv(privilege)
      WHERE n.nspname = 'public'
        AND c.relkind IN ('r', 'p', 'v')
        AND has_table_privilege(r.oid, c.oid, priv.privilege)
      ORDER BY r.rolname, c.relname, priv.privilege
    `);

    const sequences = await db.execute<{ role: string; relname: string; privilege: string }>(sql`
      SELECT r.rolname AS role, c.relname, priv.privilege
      FROM pg_catalog.pg_class c
      JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
      JOIN pg_catalog.pg_roles r ON r.rolname IN ('anon', 'authenticated')
      CROSS JOIN (VALUES ('USAGE'), ('SELECT'), ('UPDATE')) AS priv(privilege)
      WHERE n.nspname = 'public'
        AND c.relkind = 'S'
        AND has_sequence_privilege(r.oid, c.oid, priv.privilege)
      ORDER BY r.rolname, c.relname, priv.privilege
    `);

    const findings = [...tables, ...sequences].map(
      (row) => `${row.role} ${row.relname} ${row.privilege}`,
    );
    reportFindings(findings);
  });

  it("the catalog query is non-vacuous", async () => {
    const rows = await db.execute<{ proname: string }>(sql`
      SELECT p.proname
      FROM pg_catalog.pg_proc p
      JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public'
        AND p.prosecdef
        AND NOT EXISTS (
          SELECT 1 FROM pg_catalog.pg_depend d
          WHERE d.objid = p.oid AND d.deptype = 'e'
        )
    `);
    const names = new Set(rows.map((row) => row.proname));
    if (isStrictCatalogCheck()) {
      const missing = REQUIRED_DEFINERS.filter((name) => !names.has(name));
      expect(missing, "repository-built database is missing DEFINER functions").toEqual([]);
    } else {
      expect(names.size).toBeGreaterThan(0);
    }
  });

  it("app_runtime keeps EXECUTE on the definer functions and DML on every inventoried table", async () => {
    const functions = await db.execute<{ signature: string; ok: boolean }>(sql`
      SELECT sig.signature,
             has_function_privilege('app_runtime', sig.signature, 'EXECUTE') AS ok
      FROM (VALUES
        ('resolve_account_household(uuid)'),
        ('resolve_join_code(text)'),
        ('claim_join_code(text, join_code_purpose)'),
        ('record_join_attempt(text, integer, integer)')
      ) AS sig(signature)
    `);
    const missingExecute = functions.filter((row) => !row.ok).map((row) => row.signature);
    expect(missingExecute, "app_runtime lost EXECUTE").toEqual([]);

    const inventoryText = readFileSync(join(process.cwd(), "data-inventory.yml"), "utf8");
    const tableNames = Object.keys(parseInventory(inventoryText).tables);
    expect(tableNames.length).toBeGreaterThan(0);

    const privileges = await db.execute<{ relname: string; privilege: string; ok: boolean }>(sql`
      SELECT c.relname, priv.privilege,
             has_table_privilege('app_runtime', c.oid, priv.privilege) AS ok
      FROM pg_catalog.pg_class c
      JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
      CROSS JOIN (VALUES ('SELECT'), ('INSERT'), ('UPDATE'), ('DELETE')) AS priv(privilege)
      WHERE n.nspname = 'public'
        AND c.relkind IN ('r', 'p')
        AND c.relname IN (${sql.join(
          tableNames.map((name) => sql`${name}`),
          sql`, `,
        )})
    `);
    const missingDml = privileges
      .filter((row) => !row.ok)
      .map((row) => `${row.relname} ${row.privilege}`);
    expect(missingDml, "app_runtime lost DML").toEqual([]);
    expect(new Set(privileges.map((row) => row.relname)).size).toBe(tableNames.length);
  });

  it("service_role keeps SELECT and DELETE on join_attempt when the role exists", async () => {
    const roles = await db.execute<{ present: boolean }>(sql`
      SELECT EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'service_role') AS present
    `);
    if (!roles[0]?.present) return;

    const rows = await db.execute<{ privilege: string; ok: boolean }>(sql`
      SELECT priv.privilege,
             has_table_privilege('service_role', c.oid, priv.privilege) AS ok
      FROM pg_catalog.pg_class c
      JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
      CROSS JOIN (VALUES ('SELECT'), ('DELETE')) AS priv(privilege)
      WHERE n.nspname = 'public' AND c.relname = 'join_attempt'
    `);
    expect(rows).toHaveLength(2);
    expect(rows.every((row) => row.ok)).toBe(true);
  });

  it("postgres default privileges in public grant nothing to anon or authenticated", async () => {
    // No row for postgres in public is a pass: there is nothing granting the Data API roles.
    const rows = await db.execute<{ objtype: string; grantee: string; privilege: string }>(sql`
      SELECT d.defaclobjtype AS objtype,
             acl.grantee::regrole::text AS grantee,
             acl.privilege_type AS privilege
      FROM pg_catalog.pg_default_acl d
      JOIN pg_catalog.pg_roles owner ON owner.oid = d.defaclrole
      JOIN pg_catalog.pg_namespace n ON n.oid = d.defaclnamespace
      CROSS JOIN LATERAL aclexplode(d.defaclacl) AS acl
      WHERE owner.rolname = 'postgres'
        AND n.nspname = 'public'
        AND d.defaclobjtype IN ('r', 'f', 'S')
        AND acl.grantee::regrole::text IN ('anon', 'authenticated')
      ORDER BY d.defaclobjtype, 2, 3
    `);

    const findings = rows.map(
      (row) => `postgres default ${row.objtype} ${row.grantee} ${row.privilege}`,
    );
    reportFindings(findings);
  });
});
