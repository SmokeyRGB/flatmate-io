import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { checkRoleReadsLint, findRoleReads } from "../../../scripts/lint/role-reads";

let fixtureDir: string | undefined;

afterEach(() => {
  if (fixtureDir) rmSync(fixtureDir, { recursive: true, force: true });
  fixtureDir = undefined;
});

// role-permissions design D7: a comparison against a role is refused outside a marked state read.
describe("role-reads lint (identity/member-administration)", () => {
  it("flags a role comparison", () => {
    const findings = findRoleReads(`const isAdmin = m.role === "moderator";\n`);
    expect(findings).toHaveLength(1);
    expect(findings[0].line).toBe(1);
  });

  it("flags a comparison with the role on the right-hand side", () => {
    expect(findRoleReads(`if ("moderator" !== row.role) return;\n`)).toHaveLength(1);
  });

  it("passes the same comparison with a marker and a reason on the line above", () => {
    const source = `// role-state-read: describes the listed member, not the caller\nconst isMod = m.role === "moderator";\n`;
    expect(findRoleReads(source)).toEqual([]);
  });

  it("passes a marker on the same line, and a JSX comment marker", () => {
    expect(findRoleReads(`const x = m.role === "member"; // role-state-read: a state read\n`)).toEqual([]);
    expect(
      findRoleReads(`{/* role-state-read: describes the listed member */}\n{m.role === "moderator" && <b />}\n`),
    ).toEqual([]);
  });

  it("flags a marker without a reason", () => {
    expect(findRoleReads(`// role-state-read:\nconst isMod = m.role === "moderator";\n`)).toHaveLength(1);
    expect(findRoleReads(`{/* role-state-read: */}\n{m.role === "moderator" && <b />}\n`)).toHaveLength(1);
  });

  it("flags a drizzle comparison on a role column", () => {
    expect(findRoleReads(`.where(eq(membership.role, "household_admin"))\n`)).toHaveLength(1);
    expect(findRoleReads(`.where(inArray(membership.role, ["moderator"]))\n`)).toHaveLength(1);
  });

  it("flags SQL text comparing a role in a template string", () => {
    expect(findRoleReads("const q = sql`SELECT 1 FROM membership WHERE role <> 'moderator'`;\n")).toHaveLength(1);
    expect(findRoleReads("const q = sql`... AND role IN ('household_admin', 'moderator')`;\n")).toHaveLength(1);
  });

  it("does not flag toRole / fromRole comparisons or a role write", () => {
    expect(findRoleReads(`if (toRole !== "member") return;\nif (fromRole === toRole) return;\n`)).toEqual([]);
    expect(findRoleReads(`await tx.update(membership).set({ role: "member", permissions: [] });\n`)).toEqual([]);
  });

  it("does not flag `role ===` inside a comment", () => {
    expect(findRoleReads(`// we used to test role === "moderator" here\n/* role !== x */\nconst a = 1;\n`)).toEqual([]);
  });

  it("scratch copy of the pre-change shape is flagged (the break)", () => {
    fixtureDir = mkdtempSync(join(tmpdir(), "flatmate-lint-"));
    mkdirSync(join(fixtureDir, "src"), { recursive: true });
    writeFileSync(
      join(fixtureDir, "src", "scratch.ts"),
      `export const f = (membershipRow: { role: string }) => {\n  const isAdmin = membershipRow.role === "household_admin";\n  return isAdmin;\n};\n`,
    );
    const violations = checkRoleReadsLint(fixtureDir);
    expect(violations).toHaveLength(1);
    expect(violations[0]).toMatchObject({ file: "src/scratch.ts", line: 2 });
  });

  it("exempts the schema file, which holds the role-pairing CHECKs", () => {
    fixtureDir = mkdtempSync(join(tmpdir(), "flatmate-lint-"));
    mkdirSync(join(fixtureDir, "src", "modules", "identity"), { recursive: true });
    writeFileSync(
      join(fixtureDir, "src", "modules", "identity", "schema.ts"),
      "export const c = sql`role <> 'household_admin' OR resident_profile_id IS NULL`;\n",
    );
    expect(checkRoleReadsLint(fixtureDir)).toEqual([]);
  });

  it("finds nothing in the real src/", () => {
    expect(checkRoleReadsLint(process.cwd())).toEqual([]);
  });
});
