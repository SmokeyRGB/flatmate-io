import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { blankComments, lineOf, walk } from "../../../scripts/lint/_shared";

let fixtureDir: string | undefined;

afterEach(() => {
  if (fixtureDir) rmSync(fixtureDir, { recursive: true, force: true });
});

describe("blankComments", () => {
  it("blanks a line comment and keeps the code and the newline", () => {
    const input = "const a = 1; // hidden\n";
    const comment = "// hidden";
    expect(blankComments(input)).toBe(`const a = 1; ${" ".repeat(comment.length)}\n`);
  });

  it("blanks a block comment that spans lines and preserves length and newlines", () => {
    const input = "a /* b\nc */ d";
    const output = blankComments(input);
    expect(output).toBe("a     \n     d");
    expect(output.length).toBe(input.length);
    expect(output.split("\n").length).toBe(input.split("\n").length);
  });

  it("keeps // inside a double-quoted string, a single-quoted string, and a template literal", () => {
    expect(blankComments('const u = "http://x";\n')).toBe('const u = "http://x";\n');
    expect(blankComments("const u = 'http://x';\n")).toBe("const u = 'http://x';\n");
    expect(blankComments("const u = `http://x`;\n")).toBe("const u = `http://x`;\n");
  });

  it("keeps a block comment that sits inside a string", () => {
    expect(blankComments('const u = "/* */";\n')).toBe('const u = "/* */";\n');
  });

  it("keeps // inside a string in a template interpolation", () => {
    const input = "const u = `a ${ \"//\" } b`;\n";
    expect(blankComments(input)).toBe(input);
  });

  it("keeps // after an escaped quote", () => {
    const input = '"a\\"//b"';
    expect(blankComments(input)).toBe(input);
  });

  it("keeps CRLF line breaks and blanks only the comment text", () => {
    const input = "const a = 1; // x\r\nnext;\r\n";
    const output = blankComments(input);
    expect(output).toBe(`const a = 1; ${" ".repeat("// x".length)}\r\nnext;\r\n`);
    expect(output.length).toBe(input.length);
  });

  it("blanks an unterminated block comment through to EOF", () => {
    expect(blankComments("a /* b")).toBe("a     ");
  });

  // An apostrophe in JSX text opens a quoted string. Quoted strings end at the first
  // unescaped newline, so the // on that same line is inside the string and is kept.
  it("keeps // after an apostrophe in JSX text on the same line", () => {
    expect(blankComments("Don't // not a comment")).toBe("Don't // not a comment");
  });
});

describe("lineOf", () => {
  it("counts the first line as 1 for both LF and CRLF", () => {
    expect(lineOf("a", 0)).toBe(1);
    expect(lineOf("a\nb", 0)).toBe(1);
    expect(lineOf("a\r\nb", 0)).toBe(1);
  });

  it("reports the same line for the same logical line under LF and CRLF", () => {
    const lf = "a\nb\nc";
    const crlf = "a\r\nb\r\nc";
    expect(lineOf(lf, lf.indexOf("b"))).toBe(2);
    expect(lineOf(crlf, crlf.indexOf("b"))).toBe(2);
    expect(lineOf(lf, lf.indexOf("c"))).toBe(3);
    expect(lineOf(crlf, crlf.indexOf("c"))).toBe(3);
  });
});

describe("walk", () => {
  it("returns matching files recursively, sorted, and skips node_modules and dot-directories", () => {
    fixtureDir = mkdtempSync(join(tmpdir(), "flatmate-walk-"));
    mkdirSync(join(fixtureDir, "sub"));
    mkdirSync(join(fixtureDir, "node_modules", "pkg"), { recursive: true });
    mkdirSync(join(fixtureDir, ".hidden"));
    mkdirSync(join(fixtureDir, "sub", ".secret"));
    writeFileSync(join(fixtureDir, "b.ts"), "");
    writeFileSync(join(fixtureDir, "a.ts"), "");
    writeFileSync(join(fixtureDir, "sub", "c.ts"), "");
    writeFileSync(join(fixtureDir, "node_modules", "pkg", "e.ts"), "");
    writeFileSync(join(fixtureDir, ".hidden", "d.ts"), "");
    writeFileSync(join(fixtureDir, "sub", ".secret", "f.ts"), "");
    writeFileSync(join(fixtureDir, ".dotfile.ts"), "");
    writeFileSync(join(fixtureDir, "note.md"), "");

    const found = walk(fixtureDir, (name) => name.endsWith(".ts"));
    expect(found).toEqual(
      [
        join(fixtureDir, ".dotfile.ts"),
        join(fixtureDir, "a.ts"),
        join(fixtureDir, "b.ts"),
        join(fixtureDir, "sub", "c.ts"),
      ].sort(),
    );
  });

  it("passes the file name and the full path to the predicate", () => {
    fixtureDir = mkdtempSync(join(tmpdir(), "flatmate-walk-"));
    mkdirSync(join(fixtureDir, "sub"));
    writeFileSync(join(fixtureDir, "sub", "c.ts"), "");
    writeFileSync(join(fixtureDir, "a.ts"), "");

    const seen: Array<{ name: string; fullPath: string }> = [];
    walk(fixtureDir, (name, fullPath) => {
      seen.push({ name, fullPath });
      return false;
    });
    expect(seen.map((entry) => entry.name).sort()).toEqual(["a.ts", "c.ts"]);
    expect(seen.map((entry) => entry.fullPath).sort()).toEqual(
      [join(fixtureDir, "a.ts"), join(fixtureDir, "sub", "c.ts")].sort(),
    );
  });
});
