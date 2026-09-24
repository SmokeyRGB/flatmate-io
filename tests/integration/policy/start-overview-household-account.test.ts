import { afterEach, describe, expect, it, vi } from "vitest";

// start-screen design.md Decision 9/tasks.md 3.5(a): a household-account (profileId null) session
// gets `null` from getStartOverview, and — because G-D15's refusal cannot depend on RLS alone
// (design.md Decision 9's finding) — no query is issued at all. Isolated in its own file because
// mocking @/db/session-context would disturb start-overview.test.ts's other cases, which need the
// real implementation.
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

describe("getStartOverview: a household-account session", () => {
  it("(a) gets null and issues no query at all", async () => {
    const { getStartOverview } = await import("@/modules/casting/repository");
    const householdContext = {
      accountId: "00000000-0000-0000-0000-000000000001",
      householdId: "00000000-0000-0000-0000-000000000002",
      profileId: null,
    };

    const result = await getStartOverview(householdContext);

    expect(result).toBeNull();
    expect(withSessionContextSpy).not.toHaveBeenCalled();
  });
});
