// M2 (P6, "no foreign keys means a hand-kept deletion inventory"): mechanically ties the
// household-scoped delete set that tests/helpers/identity.ts exports (HOUSEHOLD_SCOPED_TABLES) to
// what the schema actually declares, and ties undoRegisterHousehold's delete set to what
// registerHousehold actually inserts. Closes carried debt 2 — a new household-scoped table (or a
// new insert in registerHousehold) now fails this test until someone adds it to the right list,
// instead of silently orphaning rows the way join_code_issuance did twice (4a9724f, 29792fa).
//
// This is textual/regex parsing of the .ts source, not a real TS/AST parser — same honesty
// tradeoff as scripts/lint/session-context.ts and import-boundary.ts. Where the parse genuinely
// cannot see something (a table inserted by a function registerHousehold CALLS rather than
// inserts into directly), that is called out in a comment below rather than silently trusted.
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { HOUSEHOLD_SCOPED_TABLES } from "../../helpers/identity";

const ROOT = join(__dirname, "..", "..", "..");
const MODULES_DIR = join(ROOT, "src", "modules");

interface ParsedTable {
  name: string;
  varName: string;
  moduleFile: string;
  hasHouseholdId: boolean;
}

// Splits each src/modules/*/schema.ts on `export const <var> = pgTable("<name>", ...)` and treats
// the text up to the next such match (or EOF) as that table's own definition — good enough as
// long as schema.ts keeps one `pgTable(` call per exported table, which every module here does
// today (comment, not enforced: if that ever stops being true this parse silently misclassifies).
// "Declares household_id" is a literal substring check for `"household_id"` as a column name
// within that chunk (covers both a plain household_id column and household_settings' own
// household_id-as-primary-key) — this also technically matches the literal
// `current_setting('app.household_id', ...)` string inside a *different* table's RLS policy
// constant, but those constants (HOUSEHOLD_MATCH etc.) are declared once, above every pgTable(
// call, never inside one, so they never land inside any table's own chunk.
function parseSchemaTables(): ParsedTable[] {
  const tables: ParsedTable[] = [];
  for (const moduleName of readdirSync(MODULES_DIR)) {
    const schemaPath = join(MODULES_DIR, moduleName, "schema.ts");
    let content: string;
    try {
      content = readFileSync(schemaPath, "utf8");
    } catch {
      continue; // not every module dir necessarily has a schema.ts
    }
    const moduleFile = `src/modules/${moduleName}/schema.ts`;
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
      });
    }
  }
  return tables;
}

// activity_event is the one deliberate exception: FR-0.13 makes it append-only (RESTRICTIVE
// policies plus FORCE ROW LEVEL SECURITY on the table itself), so a test transaction could not
// delete it even if HOUSEHOLD_SCOPED_TABLES named it — see audit/schema.ts's own comment.
const ALLOWLIST: Record<string, string> = {
  activity_event:
    'FR-0.13 append-only (RESTRICTIVE policies + FORCE ROW LEVEL SECURITY) — teardown cannot remove it, only redactExpiredActivityEvents() can touch it at all.',
};

describe("cleanup-inventory lint (M2/P6): schema vs. tests/helpers/identity.ts", () => {
  const tables = parseSchemaTables();

  it("finds at least the tables this repo is known to have (parse sanity check)", () => {
    // If this ever comes back empty/tiny, the regex above has stopped matching schema.ts's actual
    // shape — a silent false-negative would be worse than a loud failure here.
    const names = tables.map((t) => t.name);
    expect(names).toEqual(
      expect.arrayContaining(["account", "session", "household", "resident_profile", "application", "room"]),
    );
  });

  it("every household-scoped table (household_id column) is in HOUSEHOLD_SCOPED_TABLES, is `household` itself, or is allowlisted", () => {
    const missing: string[] = [];
    for (const table of tables) {
      if (!table.hasHouseholdId) continue;
      if (table.name === "household") continue; // keyed by its own id, deleted as the CTE's outer target — see below
      if (table.name in ALLOWLIST) continue;
      if (!(HOUSEHOLD_SCOPED_TABLES as readonly string[]).includes(table.name)) {
        missing.push(`${table.name} (${table.moduleFile})`);
      }
    }
    expect(missing, `New household-scoped table(s) not in HOUSEHOLD_SCOPED_TABLES: ${missing.join(", ")}`).toEqual([]);
  });

  it("HOUSEHOLD_SCOPED_TABLES has no stale entry (every listed table still exists and still carries household_id)", () => {
    const known = new Set(tables.filter((t) => t.hasHouseholdId).map((t) => t.name));
    const stale = HOUSEHOLD_SCOPED_TABLES.filter((name) => !known.has(name));
    expect(stale, `Stale entries in HOUSEHOLD_SCOPED_TABLES: ${stale.join(", ")}`).toEqual([]);
  });

  it("`household` itself (keyed by id, not household_id) is the cleanup CTE's own outer delete target", () => {
    // household has no household_id column at all (its RLS predicate matches on `id`), so it can
    // never appear in HOUSEHOLD_SCOPED_TABLES — the cleanup statement deletes it as the CTE's
    // final statement instead. This asserts that wiring hasn't silently regressed, by checking the
    // literal SQL text tests/helpers/identity.ts builds.
    const helperSource = readFileSync(join(ROOT, "tests", "helpers", "identity.ts"), "utf8");
    expect(helperSource).toMatch(/delete from household where id = \$\{id\}/);
  });
});

// --- Second assertion (M2): registerHousehold's inserts vs. undoRegisterHousehold's deletes ---

const AUTH_FILE = join(MODULES_DIR, "identity", "auth.ts");

function extractFunctionBody(source: string, exportSignature: RegExp): string {
  const match = exportSignature.exec(source);
  if (!match) throw new Error(`Could not find function matching ${exportSignature}`);
  // From the match to the next top-level `export ` after it (or EOF) — good enough given this
  // file's own convention of one blank-line-separated export per concern.
  const start = match.index!;
  const rest = source.slice(start + match[0].length);
  const nextExport = rest.search(/\nexport /);
  return rest.slice(0, nextExport === -1 ? undefined : nextExport);
}

// Maps a drizzle import identifier (e.g. `household`, `joinCodeIssuance`) to its SQL table name,
// by re-using the same pgTable(...) parse as above across every module's schema.ts.
function varNameToTableName(varName: string, tables: ParsedTable[]): string | undefined {
  return tables.find((t) => t.varName === varName)?.name;
}

describe("cleanup-inventory lint (M2/P6): registerHousehold vs. undoRegisterHousehold", () => {
  const authSource = readFileSync(AUTH_FILE, "utf8");
  const tables = parseSchemaTables();

  const registerBody = extractFunctionBody(authSource, /export async function registerHousehold\(/);
  const undoBody = extractFunctionBody(authSource, /export async function undoRegisterHousehold\(/);

  // Direct `.insert(x)` calls visible in registerHousehold's own text.
  const directInsertVars = [...registerBody.matchAll(/\.insert\((\w+)\)/g)].map((m) => m[1]);
  const directInsertTables = directInsertVars
    .map((v) => varNameToTableName(v, tables))
    .filter((t): t is string => t !== undefined);

  // What a static, textual parse of THIS file cannot see: registerHousehold also calls
  // issueJoinCodeTx(tx, householdId, accountId, ...) (identity/repository.ts), which itself
  // inserts into join_code_issuance — a table this parse has no way to discover without following
  // the call into another file's AST. Verified by reading issueJoinCodeTx directly (repository.ts,
  // `tx.insert(joinCodeIssuance)`, currently ~line 824); recorded here by hand rather than derived,
  // so if issueJoinCodeTx's own inserts ever change, this line is what goes stale, not what this
  // test discovers on its own.
  const CALLS_ISSUE_JOIN_CODE_TX = /issueJoinCodeTx\(/.test(registerBody);
  const transitiveInsertTables = CALLS_ISSUE_JOIN_CODE_TX ? ["join_code_issuance"] : [];

  const expectedTables = [...new Set([...directInsertTables, ...transitiveInsertTables])].sort();

  const deleteVars = [...undoBody.matchAll(/\.delete\((\w+)\)/g)].map((m) => m[1]);
  const undoDeletedTables = [
    ...new Set(deleteVars.map((v) => varNameToTableName(v, tables)).filter((t): t is string => t !== undefined)),
  ].sort();

  it("parse sanity: found registerHousehold's direct inserts and issueJoinCodeTx call", () => {
    expect(directInsertTables).toEqual(
      expect.arrayContaining(["household", "household_settings", "account", "membership"]),
    );
    expect(CALLS_ISSUE_JOIN_CODE_TX).toBe(true);
  });

  it("undoRegisterHousehold deletes exactly the tables registerHousehold writes", () => {
    expect(undoDeletedTables, "undoRegisterHousehold is missing a delete for a table registerHousehold inserts").toEqual(
      expectedTables,
    );
  });
});
