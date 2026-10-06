import { afterEach, describe, expect, it, vi } from "vitest";

// G-D15 (b) / F4 change 1 tasks 6.3: a household-account session (profileId null) reaches nothing
// of the vote surface, and no query is issued at all. Isolated in its own file for the same reason
// as start-overview-household-account.test.ts: the spy replaces @/db/session-context.
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
const uuid5 = "00000000-0000-0000-0000-000000000005";

describe("deliberation: a household-account session", () => {
  it("castVote throws ProfileRequiredError and issues no query", async () => {
    const { castVote } = await import("@/modules/deliberation/repository");
    const { ProfileRequiredError } = await import("@/modules/casting/repository");
    let caught: unknown;
    try {
      await castVote(householdContext, { roundId: uuid5, applicationId: uuid5, value: "good" });
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(ProfileRequiredError);
    expect(withSessionContextSpy).not.toHaveBeenCalled();
  });

  it("getScreeningPass throws ProfileRequiredError and issues no query", async () => {
    const { getScreeningPass } = await import("@/modules/deliberation/repository");
    const { ProfileRequiredError } = await import("@/modules/casting/repository");
    await expect(getScreeningPass(householdContext, null)).rejects.toBeInstanceOf(ProfileRequiredError);
    await expect(getScreeningPass(householdContext, uuid5)).rejects.toBeInstanceOf(ProfileRequiredError);
    expect(withSessionContextSpy).not.toHaveBeenCalled();
  });

  it("getRanking throws ProfileRequiredError and issues no query", async () => {
    const { getRanking } = await import("@/modules/deliberation/repository");
    const { ProfileRequiredError } = await import("@/modules/casting/repository");
    await expect(getRanking(householdContext, null)).rejects.toBeInstanceOf(ProfileRequiredError);
    await expect(getRanking(householdContext, uuid5)).rejects.toBeInstanceOf(ProfileRequiredError);
    expect(withSessionContextSpy).not.toHaveBeenCalled();
  });

  it("getAwaitingVoteCounts returns an empty map and issues no query", async () => {
    const { getAwaitingVoteCounts } = await import("@/modules/deliberation/repository");
    const counts = await getAwaitingVoteCounts(householdContext);
    expect(counts.size).toBe(0);
    expect(withSessionContextSpy).not.toHaveBeenCalled();
  });

  it("the three casting ports throw ProfileRequiredError before any query", async () => {
    const { listVoterRoundsTx, listVoteCandidatesTx, getRoundTallyBasisTx, ProfileRequiredError } = await import(
      "@/modules/casting/repository"
    );
    // The transaction is never touched: a profile-less context refuses first.
    const tx = {} as never;
    await expect(listVoterRoundsTx(tx, householdContext)).rejects.toBeInstanceOf(ProfileRequiredError);
    await expect(listVoteCandidatesTx(tx, householdContext, [uuid5], { scope: "votable", fields: "cards" })).rejects.toBeInstanceOf(
      ProfileRequiredError,
    );
    await expect(getRoundTallyBasisTx(tx, householdContext, uuid5)).rejects.toBeInstanceOf(ProfileRequiredError);
    expect(withSessionContextSpy).not.toHaveBeenCalled();
  });
});
