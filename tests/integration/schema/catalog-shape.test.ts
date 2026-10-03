// Live catalog check for finding #25: policy names, row-security flags, triggers, and the set of
// SECURITY DEFINER functions. Columns stay in data-inventory-live.test.ts. Same strictness as
// that test (design.md D5): a repository-built database fails on a finding; shared hosted dev
// only warns, because an unmerged migration may already be applied there.
//
// Policies are one direction, like columns. A policy schema.ts declares must exist. A policy the
// database has beyond schema.ts (a hand-written migration, or another branch's table) is a
// warning and never a failure.
import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { is, sql } from "drizzle-orm";
import { getTableConfig, PgTable } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";
import { db } from "@/db/client";
import { isStrictCatalogCheck } from "../../helpers/live-catalog";

// Add a table here only together with the migration that forces row level security on it.
const FORCE_RLS_TABLES = ["activity_event"] as const;

// Built from `CREATE TRIGGER` in drizzle/*.sql. Each pair is [table, trigger].
const EXPECTED_TRIGGERS = [
  ["session", "session_acting_profile_id_immutable"],
  ["membership", "membership_auto_join_open_rounds"],
  ["resident_profile", "resident_profile_unremoval_final"],
  ["application", "application_round_same_household"],
  ["casting_round", "casting_round_keeps_applications"],
] as const;

// Every SECURITY DEFINER function this repository defines. definer-coverage.ts reads this list.
const KNOWN_DEFINERS = [
  "resolve_account_household",
  "resolve_join_code",
  "claim_join_code",
  "record_join_attempt",
  "casting_round_keeps_applications",
] as const;

// Supabase installs rls_auto_enable() as the function behind the ensure_rls event trigger.
// It is not ours: no migration creates it, and a local stack may not have it. Revoking EXECUTE
// from anon/authenticated/PUBLIC does not stop the trigger (the owner, postgres, keeps EXECUTE).
const IGNORED_PLATFORM_FUNCTIONS = ["rls_auto_enable"] as const;

function reportFindings(findings: string[]): void {
  if (isStrictCatalogCheck()) {
    expect(findings, findings.join("\n")).toEqual([]);
    return;
  }
  if (findings.length > 0) {
    console.warn(
      `catalog-shape live check: ${findings.length} finding(s) against a non-local database ` +
        `(${new URL(process.env.DATABASE_URL!).hostname}) — the branch may be behind the ` +
        `database's migrations, or the database ahead of this branch:\n  ${findings.join("\n  ")}`,
    );
  }
}

async function schemaPolicies(rootDir: string): Promise<Map<string, Set<string>>> {
  const out = new Map<string, Set<string>>();
  const modulesDir = join(rootDir, "src", "modules");
  for (const mod of readdirSync(modulesDir)) {
    const schemaFile = join(modulesDir, mod, "schema.ts");
    if (!existsSync(schemaFile)) continue;
    const moduleExports: Record<string, unknown> = await import(pathToFileURL(schemaFile).href);
    for (const value of Object.values(moduleExports)) {
      if (!is(value, PgTable)) continue;
      const config = getTableConfig(value);
      out.set(config.name, new Set(config.policies.map((policy) => policy.name)));
    }
  }
  return out;
}

describe("catalog shape (finding #25, design.md D5)", () => {
  it("every policy schema.ts declares exists on that table", async () => {
    const declared = await schemaPolicies(process.cwd());
    expect(declared.size).toBeGreaterThan(0);

    const rows = await db.execute<{ tablename: string; policyname: string }>(sql`
      SELECT tablename, policyname
      FROM pg_catalog.pg_policies
      WHERE schemaname = 'public'
    `);
    const live = new Map<string, Set<string>>();
    for (const row of rows) {
      const names = live.get(row.tablename) ?? new Set<string>();
      names.add(row.policyname);
      live.set(row.tablename, names);
    }

    const missing: string[] = [];
    const extra: string[] = [];
    for (const [table, policies] of declared) {
      const present = live.get(table) ?? new Set<string>();
      for (const policy of policies) {
        if (!present.has(policy)) missing.push(`${table}.${policy}`);
      }
      for (const policy of present) {
        if (!policies.has(policy)) extra.push(`${table}.${policy}`);
      }
    }
    for (const [table, policies] of live) {
      if (declared.has(table)) continue;
      for (const policy of policies) extra.push(`${table}.${policy}`);
    }

    if (extra.length > 0) {
      console.warn(
        `catalog-shape live check: ${extra.length} policy(ies) in the database are not declared ` +
          `in schema.ts (hand-written, or another branch's migration):\n  ${extra.join("\n  ")}`,
      );
    }
    reportFindings(missing.map((name) => `missing policy: ${name}`));
  });

  it("row level security is enabled on every ordinary table, and forced exactly on FORCE_RLS_TABLES", async () => {
    const rows = await db.execute<{ relname: string; enabled: boolean; forced: boolean }>(sql`
      SELECT c.relname, c.relrowsecurity AS enabled, c.relforcerowsecurity AS forced
      FROM pg_catalog.pg_class c
      JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public'
        AND c.relkind = 'r'
        AND NOT c.relispartition
    `);
    expect(rows.length).toBeGreaterThan(0);

    const forcedExpected = new Set<string>(FORCE_RLS_TABLES);
    const findings: string[] = [];
    for (const row of rows) {
      if (!row.enabled) findings.push(`${row.relname}: relrowsecurity is false`);
      const shouldForce = forcedExpected.has(row.relname);
      if (row.forced !== shouldForce) {
        findings.push(
          `${row.relname}: relforcerowsecurity is ${row.forced}, expected ${shouldForce}`,
        );
      }
    }
    const seen = new Set(rows.map((row) => row.relname));
    for (const table of FORCE_RLS_TABLES) {
      if (!seen.has(table)) findings.push(`${table}: ordinary table not in the catalog`);
    }
    reportFindings(findings);
  });

  it("each expected trigger exists and is enabled", async () => {
    const rows = await db.execute<{ table_name: string; tgname: string }>(sql`
      SELECT c.relname AS table_name, t.tgname
      FROM pg_catalog.pg_trigger t
      JOIN pg_catalog.pg_class c ON c.oid = t.tgrelid
      JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public'
        AND NOT t.tgisinternal
        AND t.tgenabled <> 'D'
    `);
    const present = new Set(rows.map((row) => `${row.table_name}.${row.tgname}`));
    if (isStrictCatalogCheck()) {
      expect(rows.length).toBeGreaterThanOrEqual(EXPECTED_TRIGGERS.length);
    } else {
      expect(rows.length).toBeGreaterThan(0);
    }
    const findings = EXPECTED_TRIGGERS.filter(([table, trigger]) => !present.has(`${table}.${trigger}`)).map(
      ([table, trigger]) => `missing trigger: ${table}.${trigger}`,
    );
    reportFindings(findings);
  });

  it("every non-extension SECURITY DEFINER function in public is known or a platform function", async () => {
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
    const known = new Set<string>(KNOWN_DEFINERS);
    const ignored = new Set<string>(IGNORED_PLATFORM_FUNCTIONS);
    const findings = rows
      .map((row) => row.proname)
      .filter((name) => !known.has(name) && !ignored.has(name))
      .map(
        (name) =>
          `${name}: add it to KNOWN_DEFINERS and to the grants coverage in definer-coverage.ts`,
      );
    if (isStrictCatalogCheck()) {
      const names = new Set(rows.map((row) => row.proname));
      const missing = KNOWN_DEFINERS.filter((name) => !names.has(name));
      expect(missing, "repository-built database is missing DEFINER functions").toEqual([]);
    } else {
      expect(rows.length).toBeGreaterThan(0);
    }
    reportFindings(findings);
  });
});
