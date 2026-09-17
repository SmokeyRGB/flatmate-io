// Constitution Principle I / Minimal-Gate item 6: every test file registered as "implemented" in
// test/guarded.manifest.json (the fifteen G-D invariants plus the AC-0.6/G-C7 visibility
// invariants) must exist, must not be skipped/exclusive, and must still contain a real test body.
// Promotes T040's one-off manual grep into a persisted, re-runnable check.
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

export interface GuardedTestViolation {
  file: string;
  reason: string;
}

interface Manifest {
  invariants: Array<{ id: string; status: string; testFiles: string[] }>;
  visibilityInvariants: Record<string, { status?: string; testFile?: string; $comment?: string }>;
}

function registeredFiles(manifest: Manifest): Array<{ label: string; file: string }> {
  const files: Array<{ label: string; file: string }> = [];

  for (const inv of manifest.invariants) {
    if (inv.status !== "implemented") continue;
    for (const f of inv.testFiles) files.push({ label: inv.id, file: f });
  }

  for (const [key, entry] of Object.entries(manifest.visibilityInvariants)) {
    if (key === "$comment" || entry.status !== "implemented" || !entry.testFile) continue;
    files.push({ label: key, file: entry.testFile });
  }

  return files;
}

export function checkGuardedTests(rootDir: string): GuardedTestViolation[] {
  const manifestPath = join(rootDir, "test", "guarded.manifest.json");
  const manifest: Manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  const violations: GuardedTestViolation[] = [];

  for (const { label, file } of registeredFiles(manifest)) {
    const fullPath = join(rootDir, file);

    if (!existsSync(fullPath)) {
      violations.push({ file, reason: `registered for ${label} but does not exist` });
      continue;
    }

    const content = readFileSync(fullPath, "utf8");
    // Strip `//` line comments before testing — otherwise a commented-out `it(...)` reads as a
    // real test body, and a comment mentioning ".skip(" as prose would false-positive.
    const uncommented = content
      .split("\n")
      .map((line) => line.replace(/\/\/.*$/, ""))
      .join("\n");

    if (/\.(skip|only)\s*\(/.test(uncommented)) {
      violations.push({ file, reason: `registered for ${label} but contains .skip(/.only(` });
    }

    if (!/\b(it|test)\s*\(/.test(uncommented)) {
      violations.push({ file, reason: `registered for ${label} but has no it(/test( body` });
    }
  }

  return violations;
}

import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  const violations = checkGuardedTests(process.cwd());
  if (violations.length > 0) {
    console.error("Guarded-test check (Constitution I / Minimal-Gate item 6) failed:");
    for (const v of violations) console.error(`  ${v.file}: ${v.reason}`);
    process.exit(1);
  }
  console.log("Guarded-test check: OK");
}
