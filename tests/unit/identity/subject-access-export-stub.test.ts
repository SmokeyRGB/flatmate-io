import { describe, expect, it } from "vitest";
import { triggerSubjectAccessExport } from "@/modules/identity/repository";
import { uuid } from "../../helpers/uuid";
import { registerTestHousehold, type TestHousehold } from "../../helpers/identity";

// AC-1.17/FR-1.24: administration can trigger an export without its contents being displayed to
// it — asserted here as an interface-level fact: the caller gets a handle, never rendered content.
describe("Subject-access export (stub, interface-level)", () => {
  it("returns a handle, not the export's contents", async () => {
    let hh: TestHousehold | undefined;
    try {
      hh = await registerTestHousehold();
      const result = await triggerSubjectAccessExport(hh.context, hh.accountId, uuid());
      expect(result).toHaveProperty("exportId");
      expect(Object.keys(result)).toEqual(["exportId"]);
    } finally {
      if (hh) await hh.cleanup();
    }
  });
});
