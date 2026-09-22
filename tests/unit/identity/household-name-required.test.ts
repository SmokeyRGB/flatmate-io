import { afterEach, describe, expect, it } from "vitest";
import { RegistrationError, registerHousehold } from "@/modules/identity/auth";
import { getHousehold } from "@/modules/identity/repository";
import { cleanupAll, registerTestHousehold, testEmail, type TestHousehold } from "../../helpers/identity";

// FR-2.9/AC-2.1 (design.md Decision 6): the household name is required at registration, trimmed,
// non-empty — replacing the old hardcoded "WG" default. A required parameter, not an optional one
// with a default, is the whole point: a default is how "WG" got there in the first place.
describe("registerHousehold requires a household name", () => {
  let hh: TestHousehold | undefined;

  afterEach(async () => {
    await cleanupAll(hh?.cleanup());
    hh = undefined;
  });

  // These two never create anything (RegistrationError is thrown before the Auth user is
  // created), so no cleanup is needed for them.
  it("refuses an empty name with missing_name", async () => {
    await expect(
      registerHousehold(testEmail(), "test-password-not-real-1234", ""),
    ).rejects.toMatchObject({ code: "missing_name" });
  });

  it("refuses a whitespace-only name the same way, and it is a RegistrationError instance", async () => {
    const attempt = registerHousehold(testEmail(), "test-password-not-real-1234", "   ");
    await expect(attempt).rejects.toMatchObject({ code: "missing_name" });
    await expect(attempt).rejects.toBeInstanceOf(RegistrationError);
  });

  it("stores exactly the name that was given — never WG unless that is what was typed", async () => {
    hh = await registerTestHousehold("Hausprojekt Nordstadt");
    const household = await getHousehold(hh.context);
    expect(household?.name).toBe("Hausprojekt Nordstadt");
    expect(household?.name).not.toBe("WG");
  });

  it("trims surrounding whitespace off an otherwise-valid name", async () => {
    hh = await registerTestHousehold("  Nordstadt WG  ");
    const household = await getHousehold(hh.context);
    expect(household?.name).toBe("Nordstadt WG");
  });
});
