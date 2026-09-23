// Shared by migration-shape.ts and definer-coverage.ts: splits a raw .sql migration file's
// content into its real top-level statements, independent of drizzle-kit's own
// `--> statement-breakpoint` markers. Hand-written migrations (drizzle/0005, 0016) carry no such
// markers at all — without a real splitter, the whole file is one segment, which is why rule 1
// could never see more than one "statement" in a hand-written file, and why a CREATE/DROP FUNCTION
// regex trying to match a whole statement in one shot could spill from one function's body into
// the next.
//
// Strips `--` line comments and dollar-quoted bodies ($$...$$, $tag$...$tag$) first — both can
// contain semicolons, comment markers, or text that looks like SQL keywords — then splits on `;`.
// A dollar-quoted body is replaced by its own empty delimiters (`$$` -> `$$$$`, `$fn$` ->
// `$fn$$fn$`) rather than deleted outright, so a statement's own shape (RETURNS TABLE, trailing
// attributes written AFTER the body like `$$ LANGUAGE sql SECURITY DEFINER SET search_path =
// public;`) is still visible to callers, while nothing inside the body can shift where this
// splitter thinks the statement ends.
//
// This is intentionally not a full SQL parser (same honesty tradeoff as this repo's other
// hand-written lints, e.g. session-context.ts, import-boundary.ts): a semicolon inside an
// ordinary (non-dollar-quoted) string literal would still split incorrectly. No migration in this
// repo does that today.
const DOLLAR_QUOTED_BODY = /\$(\w*)\$[\s\S]*?\$\1\$/g;
const LINE_COMMENT = /--.*$/gm;

/**
 * Strips comments and dollar-quoted bodies, then returns the non-blank top-level statements, in
 * file order. Each statement retains its full signature/attributes text (everything up to its own
 * terminating `;`), with only its dollar-quoted body's inner content removed.
 */
export function splitSqlStatements(content: string): string[] {
  const withoutBodies = content.replace(DOLLAR_QUOTED_BODY, (_match, tag: string) => `$${tag}$$${tag}$`);
  const withoutComments = withoutBodies.replace(LINE_COMMENT, "");
  return withoutComments
    .split(";")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}
