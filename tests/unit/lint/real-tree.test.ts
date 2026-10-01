// Snapshots of the six lints that WP05 migrates onto shared helpers or a real schema
// read. Each one is green on the repository today. After every migration commit the same
// call must still return no findings; a new finding means the migration changed behaviour
// on the real tree and is a stop, not something to exempt.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { checkInventory, loadSchemaTables } from "../../../scripts/lint/data-inventory";
import { checkDefinerCoverageLint } from "../../../scripts/lint/definer-coverage";
import { checkImportBoundaryLint } from "../../../scripts/lint/import-boundary";
import { checkPendingFeedbackLint } from "../../../scripts/lint/pending-feedback";
import { checkRlsCoverage } from "../../../scripts/lint/rls-coverage";
import { checkSessionContextLint } from "../../../scripts/lint/session-context";

const root = process.cwd();

describe("real-tree lint snapshots", () => {
  it("session-context reports nothing", () => {
    expect(checkSessionContextLint(root)).toEqual([]);
  });

  it("pending-feedback reports nothing", () => {
    expect(checkPendingFeedbackLint(root)).toEqual([]);
  });

  it("definer-coverage reports nothing", () => {
    expect(checkDefinerCoverageLint(root)).toEqual([]);
  });

  it("data-inventory reports nothing", async () => {
    const { tables, violations } = await loadSchemaTables(root);
    const inventoryText = readFileSync(join(root, "data-inventory.yml"), "utf8");
    expect(violations).toEqual([]);
    expect(checkInventory(tables, inventoryText)).toEqual([]);
  });

  it("rls-coverage reports nothing", () => {
    expect(checkRlsCoverage(root)).toEqual([]);
  });

  it("import-boundary reports nothing", () => {
    expect(checkImportBoundaryLint(root)).toEqual([]);
  });
});
