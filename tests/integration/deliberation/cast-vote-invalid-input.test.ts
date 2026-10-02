import { afterEach, describe, expect, it, vi } from "vitest";

// F4 change 1 tasks 6.1 (D5 step order): malformed input is refused with `invalid_input` BEFORE any
// query, including assertAccountCanVote's. Isolated in its own file because mocking
// @/db/session-context would disturb the real-database cases of cast-vote.test.ts.
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

const context = {
  accountId: "00000000-0000-0000-0000-000000000001",
  householdId: "00000000-0000-0000-0000-000000000002",
  profileId: "00000000-0000-0000-0000-000000000003",
};
const roundId = "00000000-0000-0000-0000-000000000004";
const applicationId = "00000000-0000-0000-0000-000000000005";

describe("castVote: invalid input issues no query", () => {
  it.each([
    ["a value that is not one of the four", { roundId, applicationId, value: "maybe" }],
    ["an empty value", { roundId, applicationId, value: "" }],
    ["a round id that is not a UUID", { roundId: "not-a-uuid", applicationId, value: "good" }],
    ["an application id that is not a UUID", { roundId, applicationId: "1; drop table vote", value: "good" }],
  ])("%s -> invalid_input, withSessionContext never called", async (_label, input) => {
    const { castVote, VoteError } = await import("@/modules/deliberation/repository");
    let caught: unknown;
    try {
      await castVote(context, input);
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(VoteError);
    expect((caught as InstanceType<typeof VoteError>).code).toBe("invalid_input");
    expect(withSessionContextSpy).not.toHaveBeenCalled();
  });
});
