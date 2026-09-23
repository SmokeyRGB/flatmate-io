// FR-0.2 / EC-0.1 / EC-0.2 / Minimal-Gate item 5: every table carrying a household_id column
// must have at least one RLS policy. Found missing for ActivityEvent by /speckit-analyze
// (2026-09-16) — this generic check exists so that gap-by-omission can't happen silently again.
//
// Static, source-level check (not a live-DB introspection). Per-table, not per-file: a
// schema.ts file can (and does — src/modules/identity/schema.ts has 8) declare several
// pgTable(...) calls, so the check first splits each file into one segment per table and then
// requires a pgPolicy( inside that table's OWN segment. A file-granular version of this check
// let a new household_id table pass silently as long as any sibling table in the same file had
// a policy — found latent, not yet exploited (pr-review-lessons-countermeasures.md P9).
//
// Segmentation: a table's segment runs from its own top-level `export const NAME = ...` down to
// (but not including) the next top-level `export const` / EOF. This is deliberately keyed off
// `export const`, not `pgTable(`, so that the doc comment block written directly above a table
// (this project's convention — see joinAttempt in identity/schema.ts) is attributed to THAT
// table's segment, not the previous one; a marker comment living in that block (see below) must
// land in the right segment to work.
//
// A table with no household_id at all (join_attempt — deliberately RLS-enabled with zero
// policies, no tenant to key a policy on, EC-2.14) is never flagged: the rule only fires when a
// segment contains household_id without a pgPolicy. For the rare case where that's still not
// enough (a household_id column that genuinely has no policy by design), a table's segment may
// carry a marker comment to document and silence it explicitly:
//   // rls-coverage: zero-policy by design - <reason>
import { readFileSync, readdirSync, statSync } from "node:fs";
import { relative } from "node:path";

export interface RlsCoverageViolation {
  file: string;
  table: string;
  reason: string;
}

const TOP_LEVEL_EXPORT_CONST = /^export const (\w+)\s*=/;
const TABLE_NAME = /pgTable\s*\(\s*["'`]([a-zA-Z0-9_]+)["'`]/;
const ESCAPE_HATCH = /\/\/\s*rls-coverage:\s*zero-policy by design/;
const COMMENT_OR_BLANK_LINE = /^\s*(\/\/.*)?$/;

interface TableSegment {
  /** The Drizzle export identifier, e.g. "joinAttempt" — used when the SQL table name can't be found. */
  exportName: string;
  /** The SQL table name from pgTable("..."), when the segment declares one. */
  tableName: string | null;
  segment: string;
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

export function splitIntoTableSegments(content: string): TableSegment[] {
  // Split on CRLF too: with core.autocrlf the Windows checkout is CRLF while CI's is LF, and a
  // trailing \r defeats COMMENT_OR_BLANK_LINE's `.*$`, which silently moved a marker comment into
  // the PREVIOUS table's segment — so the lint would silence the wrong table on Windows only.
  const lines = content.split(/\r?\n/);

  const rawStarts: Array<{ lineIdx: number; name: string }> = [];
  lines.forEach((line, lineIdx) => {
    const m = TOP_LEVEL_EXPORT_CONST.exec(line);
    if (m) rawStarts.push({ lineIdx, name: m[1] });
  });

  // Extend each segment's start backward over the contiguous run of blank/`//` comment lines
  // immediately above its `export const` line — this project's own doc-comment-above-the-table
  // convention (see joinAttempt in identity/schema.ts) — so a marker comment living in that
  // block, or an ordinary explanatory comment, is attributed to the table it explains rather
  // than to the previous table's segment.
  const extendedStarts = rawStarts.map(({ lineIdx }) => {
    let start = lineIdx;
    while (start > 0 && COMMENT_OR_BLANK_LINE.test(lines[start - 1])) start--;
    return start;
  });

  const segments: TableSegment[] = [];
  for (let i = 0; i < rawStarts.length; i++) {
    const startLine = extendedStarts[i];
    const endLine = i + 1 < rawStarts.length ? extendedStarts[i + 1] : lines.length;
    const segment = lines.slice(startLine, endLine).join("\n");

    // Only a segment that itself declares a pgTable(...) is a table segment — an exported enum
    // or a bare `const X = sql\`...\`` between two tables produces no violation either way,
    // since the household_id/pgPolicy check below only matters for a real table.
    const tableMatch = TABLE_NAME.exec(segment);
    if (!tableMatch) continue;

    segments.push({
      exportName: rawStarts[i].name,
      tableName: tableMatch[1],
      segment,
    });
  }

  return segments;
}

// Removes `//` comments (whole-line or trailing) and `/* */` blocks. A `//` inside a string
// literal is not expected in a schema file's table definitions; if one ever appears, the worst
// case is that the rest of that line is ignored for the household_id/pgPolicy match.
function stripLineComments(segment: string): string {
  return segment.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
}

export function checkRlsCoverage(rootDir: string): RlsCoverageViolation[] {
  const srcDir = `${rootDir}/src`;
  const violations: RlsCoverageViolation[] = [];

  for (const file of findSchemaFiles(srcDir)) {
    const content = readFileSync(file, "utf8");
    const relPath = relative(rootDir, file).replace(/\\/g, "/");

    for (const table of splitIntoTableSegments(content)) {
      // Column and policy are matched against CODE only: a doc comment that merely mentions
      // household_id (joinAttempt's explains why it has none) must not count as declaring it.
      // The marker is a comment by definition, so it is matched against the raw segment.
      const code = stripLineComments(table.segment);
      const hasHouseholdId = /household_id/.test(code);
      const hasPolicy = /\bpgPolicy\s*\(/.test(code);
      const hasEscapeHatch = ESCAPE_HATCH.test(table.segment);

      if (hasHouseholdId && !hasPolicy && !hasEscapeHatch) {
        violations.push({
          file: relPath,
          table: table.tableName ?? table.exportName,
          reason: "declares a household_id column but no pgPolicy in its own table segment",
        });
      }
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
    for (const v of violations) console.error(`  ${v.file} (table: ${v.table}): ${v.reason}`);
    process.exit(1);
  }
  console.log("RLS-coverage check: OK");
}
