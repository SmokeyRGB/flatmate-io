import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { TRANSITION_RULES } from "@/modules/casting/transitions";
import {
  PERMISSIONS,
  REPLACED_PERMISSIONS,
  RETIRED_PERMISSIONS,
  ROLE_SETS,
  type PermissionName,
} from "@/modules/identity/schema";

// Drift guard (design D10): one declaration of permissions, holders and role sets, and every check
// in src/ names a key of it. A gate on a misspelled or retired permission, which nobody could ever
// pass, fails the build here.

const ROOT = join(__dirname, "..", "..", "..");
const SRC = join(ROOT, "src");

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else if (/\.(ts|tsx)$/.test(name)) out.push(full);
  }
  return out;
}

const CHECK_CALLS = [
  "assertHasPermission",
  "assertHasPermissionTx",
  "assertHoldsAnyPermissionTx",
  "assertHoldsAllPermissionsTx",
  "membershipHoldsPermission",
];

// Every permission literal passed to a check call in src/. The argument text of a call is taken up
// to its balanced closing parenthesis, and its snake_case string literals are the permissions.
function permissionLiteralsPassedToChecks(): { file: string; name: string }[] {
  const found: { file: string; name: string }[] = [];
  for (const file of walk(SRC)) {
    const text = readFileSync(file, "utf8");
    for (const call of CHECK_CALLS) {
      const re = new RegExp(`\\b${call}\\(`, "g");
      let m: RegExpExecArray | null;
      while ((m = re.exec(text)) !== null) {
        // skip the declarations themselves: `function name(` / `export async function name(`
        const before = text.slice(Math.max(0, m.index - 20), m.index);
        if (/function\s+$/.test(before)) continue;
        let depth = 1;
        let i = m.index + m[0].length;
        const start = i;
        while (i < text.length && depth > 0) {
          if (text[i] === "(") depth++;
          else if (text[i] === ")") depth--;
          i++;
        }
        for (const lit of text.slice(start, i).matchAll(/"([a-z]+(?:_[a-z]+)*)"/g)) {
          found.push({ file: file.slice(ROOT.length + 1).replace(/\\/g, "/"), name: lit[1] });
        }
      }
    }
  }
  return found;
}

const HOLDER_OF_SET = { household: "household_admin", moderator: "moderator", resident: "resident" } as const;

describe("permission declarations", () => {
  it("every role-set entry is a key of PERMISSIONS whose holders include that set's role", () => {
    for (const [set, entries] of Object.entries(ROLE_SETS)) {
      for (const name of entries) {
        const entry: { holders: readonly string[] } | undefined = (PERMISSIONS as Record<string, { holders: readonly string[] }>)[name];
        expect(entry, `${name} in the ${set} set`).toBeDefined();
        expect(entry.holders, `${name} in the ${set} set`).toContain(HOLDER_OF_SET[set as keyof typeof HOLDER_OF_SET]);
      }
    }
  });

  it("every permission literal passed to a check in src/ is declared and not retired", () => {
    const found = permissionLiteralsPassedToChecks();
    expect(found.length).toBeGreaterThan(10);
    for (const { file, name } of found) {
      expect(Object.keys(PERMISSIONS), `${name} in ${file}`).toContain(name);
      expect(RETIRED_PERMISSIONS, `${name} in ${file}`).not.toContain(name);
    }
  });

  it("every `requires` entry of casting's TRANSITION_RULES is declared and not retired", () => {
    for (const [key, rule] of TRANSITION_RULES) {
      if (rule.kind !== "state_only") continue;
      for (const p of rule.requires) {
        expect(Object.keys(PERMISSIONS), `${p} in ${key}`).toContain(p);
        expect(RETIRED_PERMISSIONS, `${p} in ${key}`).not.toContain(p);
      }
    }
  });

  it("every declared permission is checked somewhere in src/ (no dead permission)", () => {
    const checked = new Set<string>(permissionLiteralsPassedToChecks().map((f) => f.name));
    for (const rule of TRANSITION_RULES.values()) if (rule.kind === "state_only") for (const p of rule.requires) checked.add(p);
    for (const name of Object.keys(PERMISSIONS)) expect(checked, name).toContain(name);
  });

  it("every REPLACED_PERMISSIONS target is declared, no replaced name is, and 0029 carries each over", () => {
    const file = readdirSync(join(ROOT, "drizzle")).find((f) => f.startsWith("0029_"));
    expect(file).toBeDefined();
    const migration = readFileSync(join(ROOT, "drizzle", file as string), "utf8");
    const updates = migration.split("--> statement-breakpoint").filter((s) => /^\s*UPDATE "membership"/.test(s));
    for (const [oldName, targets] of Object.entries(REPLACED_PERMISSIONS)) {
      expect(Object.keys(PERMISSIONS), oldName).not.toContain(oldName);
      for (const target of targets as readonly PermissionName[]) {
        expect(Object.keys(PERMISSIONS), target).toContain(target);
        const carried = updates.some((u) => u.includes(`'${oldName}'`) && u.includes(`'${target}'`));
        expect(carried, `0029 carries ${oldName} over to ${target}`).toBe(true);
      }
    }
  });
});
