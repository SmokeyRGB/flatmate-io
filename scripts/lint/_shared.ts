// Shared by the hand-written guardrail lints: one file walk, one comment blanker, one
// line-number helper. The lints used to each carry their own copy, and the copies had already
// drifted (the CRLF comment-strip bug in guarded-tests.ts is the one that shipped).
//
// blankComments is a single left-to-right scan. It replaces every character of a comment with a
// space, except `\r` and `\n`, which stay. The result has the same length and the same line
// breaks as the input, so a later index still points at the same place in the original file.
// It is intentionally not a JavaScript parser (same honesty tradeoff as sql-statements.ts):
//
// - `'` and `"` strings end at the first unescaped newline. JavaScript forbids a raw line break
//   inside them, so the damage is one line. An apostrophe in JSX text (`Don't`) opens such a
//   string, and a `//` later on that same line is kept, not treated as a comment.
// - Template literals may span lines. `${ ... }` is scanned as code, including nested templates
//   and strings. `//` and `/*` in the template's own raw text are kept: they are not comments.
// - A regex literal is not recognised. One that contains a quote (`/["']/`) has the same
//   one-line effect as a string. One that contains `/*` can blank through to the next `*/`.
// - An unterminated block comment is blanked through to EOF.
//
// walk is recursive and returns paths sorted, so two runs over the same tree agree. It skips
// `node_modules` and dot-directories. None of the five walkers it replaces did that; dot-files
// are still visited. A missing directory throws, as those walkers did.
import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";

export function walk(dir: string, predicate: (name: string, fullPath: string) => boolean): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    if (name === "node_modules") continue;
    const fullPath = join(dir, name);
    if (statSync(fullPath).isDirectory()) {
      if (name.startsWith(".")) continue;
      out.push(...walk(fullPath, predicate));
    } else if (predicate(name, fullPath)) {
      out.push(fullPath);
    }
  }
  out.sort();
  return out;
}

function isNewline(ch: string): boolean {
  return ch === "\n" || ch === "\r";
}

/**
 * Blanks comments in `source`, preserving length and line breaks. See the file header for the
 * cases this scanner does not understand.
 */
export function blankComments(source: string): string {
  const out = new Array<string>(source.length);
  const n = source.length;
  let i = 0;

  function blankRange(start: number, end: number): void {
    for (let k = start; k < end; k++) out[k] = isNewline(source[k]) ? source[k] : " ";
  }

  function copyString(quote: string): void {
    out[i] = source[i];
    i++;
    while (i < n) {
      const ch = source[i];
      if (ch === "\\") {
        out[i] = ch;
        i++;
        if (i < n) {
          out[i] = source[i];
          i++;
        }
        continue;
      }
      out[i] = ch;
      i++;
      if (isNewline(ch) || ch === quote) return;
    }
  }

  function scanTemplate(): void {
    while (i < n) {
      const ch = source[i];
      if (ch === "\\") {
        out[i] = ch;
        i++;
        if (i < n) {
          out[i] = source[i];
          i++;
        }
        continue;
      }
      if (ch === "`") {
        out[i] = ch;
        i++;
        return;
      }
      if (ch === "$" && i + 1 < n && source[i + 1] === "{") {
        out[i] = ch;
        out[i + 1] = source[i + 1];
        i += 2;
        scanCode(true);
        continue;
      }
      out[i] = ch;
      i++;
    }
  }

  function scanCode(stopOnBrace: boolean): void {
    let depth = 0;
    while (i < n) {
      const ch = source[i];
      const next = i + 1 < n ? source[i + 1] : "";

      if (ch === "/" && next === "/") {
        const start = i;
        i += 2;
        while (i < n && source[i] !== "\n") i++;
        blankRange(start, i);
        continue;
      }
      if (ch === "/" && next === "*") {
        const start = i;
        i += 2;
        while (i < n && !(source[i] === "*" && (i + 1 < n && source[i + 1] === "/"))) i++;
        if (i < n) i += 2;
        blankRange(start, i);
        continue;
      }
      if (ch === "'" || ch === '"') {
        copyString(ch);
        continue;
      }
      if (ch === "`") {
        out[i] = ch;
        i++;
        scanTemplate();
        continue;
      }
      if (stopOnBrace && ch === "}" && depth === 0) {
        out[i] = ch;
        i++;
        return;
      }
      if (ch === "{") depth++;
      else if (ch === "}" && depth > 0) depth--;
      out[i] = ch;
      i++;
    }
  }

  scanCode(false);
  return out.join("");
}

/** 1-based line number of `index`. `\n` is the line break, so LF and CRLF agree. */
export function lineOf(source: string, index: number): number {
  let line = 1;
  const end = Math.min(Math.max(index, 0), source.length);
  for (let k = 0; k < end; k++) {
    if (source[k] === "\n") line++;
  }
  return line;
}
