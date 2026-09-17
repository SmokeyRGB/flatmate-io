// FR-0.2 / EC-0.1 / EC-0.2 / Minimal-Gate item 5: every table carrying a household_id column
// must have at least one RLS policy. Found missing for ActivityEvent by /speckit-analyze
// (2026-09-16) — this generic check exists so that gap-by-omission can't happen silently again.
//
// Static, source-level check (not a live-DB introspection): assumes one `pgTable(...)` per
// schema.ts file, this project's own convention (src/modules/*/schema.ts). A table carrying
// `household_id` is flagged unless the same file also calls `pgPolicy(`.
import { readFileSync, readdirSync, statSync } from "node:fs";
import { relative } from "node:path";

export interface RlsCoverageViolation {
  file: string;
  reason: string;
}

function findSchemaFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = `${dir}/${entry}`;
    if (statSync(full).isDirectory()) {
      out.push(...findSchemaFiles(full));
    } else if (/schema\.ts$/.test(entry)) {
      out.push(full);
    }
  }
  return out;
}

export function checkRlsCoverage(rootDir: string): RlsCoverageViolation[] {
  const srcDir = `${rootDir}/src`;
  const violations: RlsCoverageViolation[] = [];

  for (const file of findSchemaFiles(srcDir)) {
    const content = readFileSync(file, "utf8");
    const relPath = relative(rootDir, file).replace(/\\/g, "/");

    const hasHouseholdId = /household_id/.test(content);
    const hasPolicy = /\bpgPolicy\s*\(/.test(content);

    if (hasHouseholdId && !hasPolicy) {
      violations.push({
        file: relPath,
        reason: "declares a household_id column but no pgPolicy in the same file",
      });
    }
  }

  return violations;
}

import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  const violations = checkRlsCoverage(process.cwd());
  if (violations.length > 0) {
    console.error("RLS-coverage check (FR-0.2/EC-0.1/EC-0.2) failed:");
    for (const v of violations) console.error(`  ${v.file}: ${v.reason}`);
    process.exit(1);
  }
  console.log("RLS-coverage check: OK");
}
