import { afterEach, describe, expect, it, vi } from "vitest";

// G-D15 obligation (a), for the two functions F3 change 2 adds: a household-account session
// (profileId null) is refused BEFORE any query runs. Asserted with a spy on withSessionContext,
// the start-overview Decision 9 precedent (tests/integration/policy/start-overview-household-
// account.test.ts). Isolated in its own file because mocking @/db/session-context would disturb the
// other capture tests, which need the real implementation. Needs no database: no query is the point.
const withSessionContextSpy = vi.fn();
vi.mock("@/db/session-context", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/db/session-context")>();
  withSessionContextSpy.mockImplementation(actual.withSessionContext);
  return {
    ...actual,
    withSessionContext: (...args: Parameters<typeof actual.withSessionContext>) =>
      withSessionContextSpy(...args),
  };
});

afterEach(() => {
  withSessionContextSpy.mockClear();
});

const householdContext = {
  accountId: "00000000-0000-0000-0000-000000000001",
  householdId: "00000000-0000-0000-0000-000000000002",
  profileId: null,
};
const ROUND_ID = "00000000-0000-0000-0000-000000000003";
const APPLICATION_ID = "00000000-0000-0000-0000-000000000004";

describe("a household-account session issues no query for the capture functions", () => {
  it("captureApplication refuses with ProfileRequiredError, and withSessionContext is never called", async () => {
    const { captureApplication, ProfileRequiredError } = await import("@/modules/casting/repository");
    let caught: unknown;
    try {
      await captureApplication(householdContext, {
        roundId: ROUND_ID,
        applicantName: "Testbewerbung Haushalt",
        collectedFrom: "data_subject",
      });
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(ProfileRequiredError);
    expect((caught as InstanceType<typeof ProfileRequiredError>).code).toBe("profile_required");
    expect(withSessionContextSpy).not.toHaveBeenCalled();
  });

  it("getOrganisationApplication returns null, and withSessionContext is never called", async () => {
    const { getOrganisationApplication } = await import("@/modules/casting/repository");
    const result = await getOrganisationApplication(householdContext, ROUND_ID, APPLICATION_ID);
    expect(result).toBeNull();
    expect(withSessionContextSpy).not.toHaveBeenCalled();
  });

  // F3 change 3 (application-pipeline): the three functions it adds or guards. The household
  // account is refused (or gets null from the read) before any query.
  it("transitionApplication refuses with ProfileRequiredError, and withSessionContext is never called", async () => {
    const { transitionApplication, ProfileRequiredError } = await import("@/modules/casting/repository");
    let caught: unknown;
    try {
      await transitionApplication(householdContext, APPLICATION_ID, "screened");
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(ProfileRequiredError);
    expect((caught as InstanceType<typeof ProfileRequiredError>).code).toBe("profile_required");
    expect(withSessionContextSpy).not.toHaveBeenCalled();
  });

  // F5 candidate-invite: the invitation.
  it("inviteApplication refuses with ProfileRequiredError, and withSessionContext is never called", async () => {
    const { inviteApplication, ProfileRequiredError } = await import("@/modules/casting/repository");
    let caught: unknown;
    try {
      await inviteApplication(householdContext, { roundId: ROUND_ID, applicationId: APPLICATION_ID });
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(ProfileRequiredError);
    expect((caught as InstanceType<typeof ProfileRequiredError>).code).toBe("profile_required");
    expect(withSessionContextSpy).not.toHaveBeenCalled();
  });

  it("listOrganisationApplications returns null, and withSessionContext is never called", async () => {
    const { listOrganisationApplications } = await import("@/modules/casting/repository");
    const result = await listOrganisationApplications(householdContext, ROUND_ID);
    expect(result).toBeNull();
    expect(withSessionContextSpy).not.toHaveBeenCalled();
  });

  it("updateApplication refuses with ProfileRequiredError, and withSessionContext is never called", async () => {
    const { updateApplication, ProfileRequiredError } = await import("@/modules/casting/repository");
    let caught: unknown;
    try {
      await updateApplication(householdContext, {
        roundId: ROUND_ID,
        applicationId: APPLICATION_ID,
        baseline: "unused",
        applicantName: "Testbewerbung Haushalt",
        collectedFrom: "data_subject",
      });
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(ProfileRequiredError);
    expect((caught as InstanceType<typeof ProfileRequiredError>).code).toBe("profile_required");
    expect(withSessionContextSpy).not.toHaveBeenCalled();
  });

  // Deliberate break, RUN and seen failing: removing the early `if (context.profileId === null)`
  // guard from captureApplication and from getOrganisationApplication makes both tests fail. The
  // spy shows withSessionContext called, and captureApplication throws a PermissionDeniedError
  // (the household account has no membership row for this profile) instead of a
  // ProfileRequiredError. The only queries that ran were read-only lookups with invented ids.
});
