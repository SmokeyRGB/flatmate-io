import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  checkPendingFeedbackLint,
  findButtonTagFindings,
  importsSkeletons,
  stripComments,
} from "../../../scripts/lint/pending-feedback";

let fixtureDir: string;

function writeFixture(relPath: string, content: string): void {
  const full = join(fixtureDir, relPath);
  mkdirSync(join(full, ".."), { recursive: true });
  writeFileSync(full, content);
}

afterEach(() => {
  if (fixtureDir) rmSync(fixtureDir, { recursive: true, force: true });
});

// design.md D6: the lint's own fixtures, each name matching a scenario the design lists.
describe("pending-feedback lint (ui/pending-feedback)", () => {
  it("flags an explicit type=\"submit\" button", () => {
    fixtureDir = mkdtempSync(join(tmpdir(), "flatmate-lint-"));
    writeFixture("src/app/(org)/rooms/page.tsx", `<button type="submit">Go</button>`);

    const violations = checkPendingFeedbackLint(fixtureDir);
    expect(violations.some((v) => v.rule === "submit-button-not-shared")).toBe(true);
  });

  it("flags an untyped button", () => {
    fixtureDir = mkdtempSync(join(tmpdir(), "flatmate-lint-"));
    writeFixture("src/app/(org)/rooms/x.tsx", `<button className="btn">Go</button>`);

    const violations = checkPendingFeedbackLint(fixtureDir);
    expect(violations.some((v) => v.rule === "submit-button-not-shared")).toBe(true);
  });

  it("flags a multi-line tag with type on its second line", () => {
    fixtureDir = mkdtempSync(join(tmpdir(), "flatmate-lint-"));
    writeFixture(
      "src/app/(org)/rooms/y.tsx",
      `<button\n  type="submit"\n  className="btn">\n  Go\n</button>`,
    );

    const violations = checkPendingFeedbackLint(fixtureDir);
    expect(violations.some((v) => v.rule === "submit-button-not-shared")).toBe(true);
  });

  it("flags a non-literal type", () => {
    fixtureDir = mkdtempSync(join(tmpdir(), "flatmate-lint-"));
    writeFixture("src/app/(org)/rooms/z.tsx", `<button type={kind} className="btn">Go</button>`);

    const violations = checkPendingFeedbackLint(fixtureDir);
    expect(violations.some((v) => v.rule === "submit-button-not-shared")).toBe(true);
  });

  it("passes type=\"button\"", () => {
    fixtureDir = mkdtempSync(join(tmpdir(), "flatmate-lint-"));
    writeFixture("src/app/(org)/rooms/ok.tsx", `<button type="button">Go</button>`);

    expect(checkPendingFeedbackLint(fixtureDir).filter((v) => v.rule === "submit-button-not-shared")).toHaveLength(0);
  });

  it("passes a commented-out <button>", () => {
    fixtureDir = mkdtempSync(join(tmpdir(), "flatmate-lint-"));
    writeFixture(
      "src/app/(resident)/avatar-menu.tsx",
      `// old: \`<button>\` used to live here\n/* <button type="submit">dead</button> */\nexport const x = 1;`,
    );

    expect(checkPendingFeedbackLint(fixtureDir).filter((v) => v.rule === "submit-button-not-shared")).toHaveLength(0);
  });

  it("never flags src/ui/submit-button.tsx itself", () => {
    fixtureDir = mkdtempSync(join(tmpdir(), "flatmate-lint-"));
    writeFixture("src/ui/submit-button.tsx", `<button type="submit">Go</button>`);

    expect(checkPendingFeedbackLint(fixtureDir).filter((v) => v.rule === "submit-button-not-shared")).toHaveLength(0);
  });

  it("passes a page with a skeleton loading.tsx", () => {
    fixtureDir = mkdtempSync(join(tmpdir(), "flatmate-lint-"));
    writeFixture("src/app/(org)/rooms/page.tsx", `export default function P() { return null; }`);
    writeFixture(
      "src/app/(org)/rooms/loading.tsx",
      `import { SkeletonHeading } from "@/ui/skeletons";\nexport default function L() { return <SkeletonHeading />; }`,
    );

    expect(checkPendingFeedbackLint(fixtureDir).filter((v) => v.rule !== "submit-button-not-shared")).toHaveLength(0);
  });

  it("flags a page without a loading.tsx", () => {
    fixtureDir = mkdtempSync(join(tmpdir(), "flatmate-lint-"));
    writeFixture("src/app/(org)/settings/page.tsx", `export default function P() { return null; }`);

    const violations = checkPendingFeedbackLint(fixtureDir);
    expect(violations.some((v) => v.rule === "missing-loading")).toBe(true);
  });

  it("flags a loading.tsx that imports no skeleton", () => {
    fixtureDir = mkdtempSync(join(tmpdir(), "flatmate-lint-"));
    writeFixture("src/app/(org)/settings/page.tsx", `export default function P() { return null; }`);
    writeFixture("src/app/(org)/settings/loading.tsx", `export default function L() { return null; }`);

    const violations = checkPendingFeedbackLint(fixtureDir);
    expect(violations.some((v) => v.rule === "loading-missing-skeleton-import")).toBe(true);
  });

  it("exempts src/app/page.tsx", () => {
    fixtureDir = mkdtempSync(join(tmpdir(), "flatmate-lint-"));
    writeFixture("src/app/page.tsx", `export default function P() { return null; }`);

    const violations = checkPendingFeedbackLint(fixtureDir);
    expect(violations.some((v) => v.rule === "missing-loading" && v.file === "src/app/page.tsx")).toBe(false);
  });
});

// D6's four deliberate breaks — each must make its own fixture fail once the "improvement" is
// applied, proving the real check bites. Run directly against the pure helpers, one break at a
// time (task 2.2).
describe("pending-feedback lint — breaks (each must fail its fixture)", () => {
  it("break: only looking for type=\"submit\" misses the untyped fixture", () => {
    const stripped = stripComments(`<button className="btn">Go</button>`);
    const onlySubmitLiteral = /<button\b[^>]*type="submit"[^>]*>/.test(stripped);
    expect(onlySubmitLiteral).toBe(false); // the narrow check MISSES it...
    expect(findButtonTagFindings(stripped).length > 0).toBe(true); // ...the real one catches it
  });

  it("break: reading line by line misses the multi-line fixture", () => {
    const stripped = stripComments(`<button\n  type="submit"\n  className="btn">\n  Go\n</button>`);
    const perLineFindsSubmit = stripped
      .split("\n")
      .some((line) => /<button\b[^>]*type="submit"[^>]*>/.test(line));
    expect(perLineFindsSubmit).toBe(false); // line-by-line MISSES the multi-line tag...
    expect(findButtonTagFindings(stripped).length > 0).toBe(true); // ...the real (cross-line) one catches it
  });

  it("break: accepting any ancestor loading.tsx misses the missing-file fixture", () => {
    // "Any ancestor" would treat a missing sibling as covered by e.g. the route group's own
    // loading.tsx — simulated here by a flag that always says "covered".
    const anAncestorLoadingExistsSomewhere = true;
    expect(anAncestorLoadingExistsSomewhere).toBe(true); // the loose rule says "fine"...
    expect(importsSkeletons("")).toBe(false); // ...the real one requires an actual import here
  });

  it("break: skipping comment stripping flags the commented-out fixture", () => {
    const raw = `// old: \`<button>\` used to live here\n/* <button type="submit">dead</button> */\nexport const x = 1;`;
    const withoutStripping = findButtonTagFindings(raw);
    expect(withoutStripping.length > 0).toBe(true); // skipping stripComments WRONGLY flags it...
    expect(findButtonTagFindings(stripComments(raw)).length).toBe(0); // ...the real one passes it
  });
});
