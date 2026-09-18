import { afterEach, describe, expect, it } from "vitest";
import { getResidentList } from "@/modules/identity/repository";
import { registerTestHousehold, type TestHousehold } from "../../helpers/identity";

let hh: TestHousehold | undefined;

afterEach(async () => {
  if (hh) await hh.cleanup();
  hh = undefined;
});

// AC-1.22/FR-1.29: administration is the only member -> lead with the join-code action instead
// of an empty list.
describe("Resident list empty state", () => {
  it("leads with the join-code action when administration is the only member", async () => {
    hh = await registerTestHousehold();
    const result = await getResidentList(hh.context, hh.accountId);
    expect(result.members).toHaveLength(0);
    expect(result.leadWithJoinCode).toBe(true);
  });
});
