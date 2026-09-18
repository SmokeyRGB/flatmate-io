import { afterEach, describe, expect, it } from "vitest";
import { assertAccountCanVote, HouseholdAccountCannotVoteError } from "@/modules/identity/repository";
import { registerTestHousehold, type TestHousehold } from "../../helpers/identity";

let hh: TestHousehold | undefined;

afterEach(async () => {
  if (hh) await hh.cleanup();
  hh = undefined;
});

// AC-1.5/FR-1.7: the household account cannot cast a vote, by any route the repository exposes.
describe("The household account cannot vote (FR-1.7)", () => {
  it("refuses assertAccountCanVote for the household account itself", async () => {
    hh = await registerTestHousehold();

    await expect(assertAccountCanVote(hh.context, hh.accountId)).rejects.toThrow(
      HouseholdAccountCannotVoteError,
    );
  });
});
