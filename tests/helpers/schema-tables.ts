// The textual table parser shared by the schema-vs-inventory lints (tests/unit/lint/
// cleanup-inventory.test.ts, application-deletion-inventory.test.ts). Moved out of the first so
// both read the schemas the same way.
//
// This is textual/regex parsing of the .ts source, not a real TS/AST parser — same honesty
// tradeoff as scripts/lint/session-context.ts and import-boundary.ts.
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(__dirname, "..", "..");
export const MODULES_DIR = join(ROOT, "src", "modules");

export interface ParsedTable {
  name: string;
  varName: string;
  moduleFile: string;
  hasHouseholdId: boolean;
  // `uuid("application_id"` — the column declaration, not a comment that names the column.
  declaresApplicationId: boolean;
}

// Splits a schema.ts on `export const <var> = pgTable("<name>", ...)` and treats the text up to the
// next such match (or EOF) as that table's own definition — good enough as long as schema.ts keeps
// one `pgTable(` call per exported table, which every module here does today (comment, not
// enforced: if that ever stops being true this parse silently misclassifies).
// "Declares household_id" is a literal substring check for `"household_id"` as a column name
// within that chunk (covers both a plain household_id column and household_settings' own
// household_id-as-primary-key) — this also technically matches the literal
// `current_setting('app.household_id', ...)` string inside a *different* table's RLS policy
// constant, but those constants (HOUSEHOLD_MATCH etc.) are declared once, above every pgTable(
// call, never inside one, so they never land inside any table's own chunk.
export function parseSchemaText(content: string, moduleFile: string): ParsedTable[] {
  const tables: ParsedTable[] = [];
  const defRe = /export const (\w+) = pgTable\(\s*\n?\s*"([a-z_]+)"/g;
  const matches = [...content.matchAll(defRe)];
  for (let i = 0; i < matches.length; i++) {
    const match = matches[i];
    const [, varName, name] = match;
    const start = match.index!;
    const end = i + 1 < matches.length ? matches[i + 1].index! : content.length;
    const chunk = content.slice(start, end);
    tables.push({
      name,
      varName,
      moduleFile,
      hasHouseholdId: /"household_id"/.test(chunk),
      declaresApplicationId: /uuid\(\s*"application_id"/.test(chunk),
    });
  }
  return tables;
}

// Every src/modules/*/schema.ts.
export function parseSchemaTables(): ParsedTable[] {
  const tables: ParsedTable[] = [];
  for (const moduleName of readdirSync(MODULES_DIR)) {
    const schemaPath = join(MODULES_DIR, moduleName, "schema.ts");
    let content: string;
    try {
      content = readFileSync(schemaPath, "utf8");
    } catch {
      continue; // not every module dir necessarily has a schema.ts
    }
    tables.push(...parseSchemaText(content, `src/modules/${moduleName}/schema.ts`));
  }
  return tables;
}
