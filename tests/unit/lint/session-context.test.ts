import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { checkSessionContextLint } from "../../../scripts/lint/session-context";

let fixtureDir: string;

function writeFixture(relPath: string, content: string): void {
  const full = join(fixtureDir, relPath);
  mkdirSync(join(full, ".."), { recursive: true });
  writeFileSync(full, content);
}

afterEach(() => {
  if (fixtureDir) rmSync(fixtureDir, { recursive: true, force: true });
});

// FR-0.4/G-C8: a bare SET is always rejected; SET LOCAL for the session context is only allowed
// in src/db/session-context.ts.
describe("session-context lint (FR-0.4, T006/T011)", () => {
  it("flags a bare SET anywhere in src/", () => {
    fixtureDir = mkdtempSync(join(tmpdir(), "flatmate-lint-"));
    writeFixture("src/modules/casting/schema.ts", `await tx.execute(sql\`SET app.household_id = 'x'\`);`);

    const violations = checkSessionContextLint(fixtureDir);
    expect(violations.some((v) => v.rule === "bare-set")).toBe(true);
  });

  it("flags SET LOCAL for the session context outside src/db/session-context.ts", () => {
    fixtureDir = mkdtempSync(join(tmpdir(), "flatmate-lint-"));
    writeFixture(
      "src/modules/casting/repository.ts",
      `await tx.execute(sql\`SET LOCAL app.household_id = 'x'\`);`,
    );

    const violations = checkSessionContextLint(fixtureDir);
    expect(violations.some((v) => v.rule === "set-local-outside-session-context")).toBe(true);
  });

  it("allows SET LOCAL inside src/db/session-context.ts", () => {
    fixtureDir = mkdtempSync(join(tmpdir(), "flatmate-lint-"));
    writeFixture("src/db/session-context.ts", `await tx.execute(sql\`SET LOCAL app.household_id = 'x'\`);`);

    expect(checkSessionContextLint(fixtureDir)).toHaveLength(0);
  });

  // loading-feedback design.md D9: fixes the whole class the pre-mortem found — set_config wasn't
  // recognised at all before, and SET SESSION/TO/LOCAL-TO bypassed the old regex.
  it("flags SET SESSION anywhere", () => {
    fixtureDir = mkdtempSync(join(tmpdir(), "flatmate-lint-"));
    writeFixture(
      "src/modules/casting/schema.ts",
      `await tx.execute(sql\`SET SESSION app.household_id = 'x'\`);`,
    );

    const violations = checkSessionContextLint(fixtureDir);
    expect(violations.some((v) => v.rule === "bare-set")).toBe(true);
  });

  it("flags a bare SET using TO instead of =", () => {
    fixtureDir = mkdtempSync(join(tmpdir(), "flatmate-lint-"));
    writeFixture(
      "src/modules/casting/schema.ts",
      `await tx.execute(sql\`SET app.household_id TO 'x'\`);`,
    );

    const violations = checkSessionContextLint(fixtureDir);
    expect(violations.some((v) => v.rule === "bare-set")).toBe(true);
  });

  it("flags SET LOCAL … TO outside session-context.ts", () => {
    fixtureDir = mkdtempSync(join(tmpdir(), "flatmate-lint-"));
    writeFixture(
      "src/modules/casting/repository.ts",
      `await tx.execute(sql\`SET LOCAL app.household_id TO 'x'\`);`,
    );

    const violations = checkSessionContextLint(fixtureDir);
    expect(violations.some((v) => v.rule === "set-local-outside-session-context")).toBe(true);
  });

  it("flags set_config anywhere outside session-context.ts", () => {
    fixtureDir = mkdtempSync(join(tmpdir(), "flatmate-lint-"));
    writeFixture(
      "src/modules/casting/repository.ts",
      `await tx.execute(sql\`SELECT set_config('app.household_id', 'x', true)\`);`,
    );

    const violations = checkSessionContextLint(fixtureDir);
    expect(violations.some((v) => v.rule === "set-config-outside-session-context")).toBe(true);
  });

  it("flags set_config with a non-true third argument, even inside session-context.ts", () => {
    fixtureDir = mkdtempSync(join(tmpdir(), "flatmate-lint-"));
    writeFixture(
      "src/db/session-context.ts",
      `await tx.execute(sql\`SELECT set_config('app.household_id', 'x', false)\`);`,
    );

    const violations = checkSessionContextLint(fixtureDir);
    expect(violations.some((v) => v.rule === "set-config-not-local")).toBe(true);
  });

  it("flags a set_config call whose args span multiple lines, even inside session-context.ts", () => {
    fixtureDir = mkdtempSync(join(tmpdir(), "flatmate-lint-"));
    writeFixture(
      "src/db/session-context.ts",
      `await tx.execute(sql\`SELECT set_config(\n  'app.household_id', 'x', true)\`);`,
    );

    const violations = checkSessionContextLint(fixtureDir);
    expect(violations.some((v) => v.rule === "set-config-not-local")).toBe(true);
  });

  it("allows a well-formed single-line set_config(…, true) inside session-context.ts", () => {
    fixtureDir = mkdtempSync(join(tmpdir(), "flatmate-lint-"));
    writeFixture(
      "src/db/session-context.ts",
      `await tx.execute(sql\`SELECT set_config('app.household_id', 'x', true)\`);`,
    );

    expect(checkSessionContextLint(fixtureDir)).toHaveLength(0);
  });

  it("scans drizzle/*.sql for a non-local set_config", () => {
    fixtureDir = mkdtempSync(join(tmpdir(), "flatmate-lint-"));
    writeFixture("drizzle/0099_definer.sql", `SELECT set_config('app.household_id', v_id, false);`);

    const violations = checkSessionContextLint(fixtureDir);
    expect(violations.some((v) => v.rule === "set-config-not-local" && v.file === "drizzle/0099_definer.sql")).toBe(
      true,
    );
  });
});

// D9's four deliberate breaks — each must make its own fixture fail once the "improvement" is
// applied, proving the real check bites (task 7.4).
// Code review of loading-feedback: the first rewrite of the SET rule required a dotted name and
// read line by line, so undotted and multi-line statements passed. Deliberate breaks, run once:
// requiring a dotted name again fails the first fixture; matching per line fails the second.
describe("session-context lint — SET coverage after the code review", () => {
  it("flags an undotted session-level SET (search_path, role)", () => {
    fixtureDir = mkdtempSync(join(tmpdir(), "flatmate-lint-"));
    writeFixture(
      "src/modules/casting/repository.ts",
      ["await tx.execute(sql`SET search_path = public`);", "await tx.execute(sql`SET role = postgres`);"].join("\n"),
    );
    const violations = checkSessionContextLint(fixtureDir).filter((v) => v.rule === "bare-set");
    expect(violations.map((v) => v.line)).toEqual([1, 2]);
  });

  it("flags a SET statement split across lines", () => {
    fixtureDir = mkdtempSync(join(tmpdir(), "flatmate-lint-"));
    writeFixture(
      "src/modules/casting/repository.ts",
      ["await tx.execute(sql`SET", "    app.household_id = 'x'`);"].join("\n"),
    );
    expect(checkSessionContextLint(fixtureDir).some((v) => v.rule === "bare-set")).toBe(true);
  });

  it("does not flag an UPDATE's column assignment", () => {
    fixtureDir = mkdtempSync(join(tmpdir(), "flatmate-lint-"));
    writeFixture(
      "src/modules/casting/repository.ts",
      [
        "await tx.execute(sql`UPDATE room SET status = 'open' WHERE id = ${id}`);",
        "await tx.execute(sql`UPDATE ONLY room r SET label = ${label}`);",
      ].join("\n"),
    );
    expect(checkSessionContextLint(fixtureDir)).toHaveLength(0);
  });

  it("flags SET ... to with a lowercase to", () => {
    // Copilot review of PR #26. Break: make the TO form case-sensitive again, and this fails.
    fixtureDir = mkdtempSync(join(tmpdir(), "flatmate-lint-"));
    writeFixture(
      "src/modules/casting/repository.ts",
      ["await tx.execute(sql`SET search_path to public`);", "await tx.execute(sql`set role to postgres`);"].join("\n"),
    );
    const lines = checkSessionContextLint(fixtureDir).filter((v) => v.rule === "bare-set").map((v) => v.line);
    expect(lines).toEqual([1, 2]);
  });

  it("does not flag English prose in a comment", () => {
    fixtureDir = mkdtempSync(join(tmpdir(), "flatmate-lint-"));
    writeFixture(
      "src/modules/casting/repository.ts",
      ["// the callback's own last statement set it to `true` and returns", "const x = 1;"].join("\n"),
    );
    expect(checkSessionContextLint(fixtureDir)).toHaveLength(0);
  });
});

describe("session-context lint — breaks (each must fail its fixture)", () => {
  it("break: dropping the /i flag misses an upper-case SET_CONFIG", () => {
    const text = `SELECT SET_CONFIG('app.household_id', 'x', true)`;
    const caseSensitive = /"?set_config"?\s*\(([^)]*)\)/.test(text);
    expect(caseSensitive).toBe(false); // case-sensitive-only regex MISSES it...
    expect(/"?set_config"?\s*\(([^)]*)\)/i.test(text)).toBe(true); // ...the real (case-insensitive) one catches it
  });

  it("break: accepting false as the third argument misses the false fixture", () => {
    const argsText = `'app.household_id', 'x', false`;
    const looselyAccepted = true; // a rule that accepted anything would say "fine"...
    expect(looselyAccepted).toBe(true);
    expect(/,\s*true\s*$/.test(argsText.trimEnd())).toBe(false); // ...the real one requires literal true
  });

  it("break: not scanning outside the helper misses the outside fixture", () => {
    const relPath: string = "src/modules/casting/repository.ts";
    const wouldSkipOutsideFiles = relPath === "src/db/session-context.ts"; // the loose rule's check
    expect(wouldSkipOutsideFiles).toBe(false); // it's not the helper file, so a rule that only
    // checked the helper file would never even look here — the real rule scans every file.
  });

  it("break: keeping the old SET regex misses SET SESSION / SET … TO", () => {
    const line = `await tx.execute(sql\`SET SESSION app.household_id = 'x'\`);`;
    const oldRegex = /\bSET\s+LOCAL\s+[\w."]+\s*=/i; // isSetLocal
    const oldBareSet = !oldRegex.test(line) && /\bSET\s+(?!LOCAL\b)[\w."]+\s*=/i.test(line);
    // The old bare-set regex actually DOES match "SET SESSION app.household_id = " textually
    // (SESSION reads as the identifier position isn't why it was missed) — the real bypass the
    // pre-mortem found was `TO` instead of `=`, which the old regex requires literally:
    const oldRegexToVariant = /\bSET\s+(?!LOCAL\b)[\w."]+\s*=/i.test(`SET app.household_id TO 'x'`);
    expect(oldRegexToVariant).toBe(false); // the old regex MISSES the TO variant...
    expect(/\bSET\s+(LOCAL|SESSION)?\s*"?\w+"?\."?\w+"?\s*(?:=|\bTO\b)/i.test(`SET app.household_id TO 'x'`)).toBe(
      true,
    ); // ...the real one catches it
    void oldBareSet;
  });
});
// import-boundary lint tests moved to tests/unit/lint/import-boundary.test.ts (FR-0.1/G-C1).
