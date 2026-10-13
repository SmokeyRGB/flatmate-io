import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// candidate-revise D2: the detail card's two rating actions, in the shape of invite-action.test.ts.
// The repository, the session, next/cache and next/navigation are mocked. They must pass only the ids
// and the value, refuse malformed ids before any call, map every refusal to its code, log nothing but
// a class name, revalidate the three paths on a change and on a refusal (not on an unknown failure),
// and on a withdrawal revalidate two paths and replace-redirect to the pass.
vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({ cookies: vi.fn() }));

const revalidatePath = vi.hoisted(() => vi.fn());
vi.mock("next/cache", () => ({ revalidatePath }));

// Next's redirect throws; so does this one, so a call after it would never run, as in production.
const redirect = vi.hoisted(() =>
  vi.fn((url: string, type?: string) => {
    throw new Error(`NEXT_REDIRECT ${url} ${type}`);
  }),
);
vi.mock("next/navigation", () => ({ redirect, RedirectType: { push: "push", replace: "replace" } }));

const CONTEXT = {
  accountId: "11111111-1111-1111-1111-111111111111",
  householdId: "22222222-2222-2222-2222-222222222222",
  profileId: "44444444-4444-4444-4444-444444444444",
};
const getCurrentSession = vi.hoisted(() => vi.fn());
vi.mock("@/modules/identity/session-cookie", () => ({ getCurrentSession }));

const castVote = vi.hoisted(() => vi.fn());
const withdrawVote = vi.hoisted(() => vi.fn());
vi.mock("@/modules/deliberation/repository", async () => {
  const actual = await vi.importActual<typeof import("@/modules/deliberation/repository")>(
    "@/modules/deliberation/repository",
  );
  return { ...actual, castVote, withdrawVote };
});

const { changeRatingAction, withdrawRatingAction } = await import("@/app/(resident)/casting/candidate-actions");
const { VoteError } = await import("@/modules/deliberation/repository");
const { ProfileRequiredError } = await import("@/modules/casting/repository");

const ROUND_ID = "33333333-3333-3333-3333-333333333333";
const APPLICATION_ID = "55555555-5555-5555-5555-555555555555";
const change = { roundId: ROUND_ID, applicationId: APPLICATION_ID, value: "good" };
const CARD_PATHS = ["/casting", `/casting/candidate/${APPLICATION_ID}`, "/dashboard"];
const paths = () => revalidatePath.mock.calls.map((c) => c[0]);

let logged: unknown[][] = [];
beforeEach(() => {
  logged = [];
  vi.spyOn(console, "error").mockImplementation((...args: unknown[]) => {
    logged.push(args);
  });
  getCurrentSession.mockResolvedValue({ context: CONTEXT });
  castVote.mockResolvedValue(undefined);
  withdrawVote.mockResolvedValue(undefined);
});
afterEach(() => {
  vi.restoreAllMocks();
  for (const fn of [revalidatePath, redirect, castVote, withdrawVote, getCurrentSession]) fn.mockClear();
  getCurrentSession.mockReset();
});

const VOTE_CODES = [
  "invalid_input",
  "not_found",
  "round_not_open",
  "not_eligible",
  "not_votable",
  "own_application",
] as const;

describe("changeRatingAction", () => {
  it("passes only the ids and the value, with the session's context, then revalidates the three paths", async () => {
    await expect(changeRatingAction({ ...change, extra: "SENTINEL" } as typeof change)).resolves.toEqual({ ok: true });
    expect(castVote).toHaveBeenCalledOnce();
    expect(castVote).toHaveBeenCalledWith(CONTEXT, change);
    expect(paths()).toEqual(CARD_PATHS);
    expect(redirect).not.toHaveBeenCalled();
  });

  it.each([
    ["a malformed round id", { ...change, roundId: "../../etc" }],
    ["a malformed application id", { ...change, applicationId: "not-a-uuid" }],
    ["a non-string id", { ...change, applicationId: 42 as unknown as string }],
    ["no input", undefined as unknown as typeof change],
  ])("%s is not_found, before the session or the repository is asked", async (_label, input) => {
    await expect(changeRatingAction(input)).resolves.toEqual({ ok: false, code: "not_found" });
    expect(getCurrentSession).not.toHaveBeenCalled();
    expect(castVote).not.toHaveBeenCalled();
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("no session is no_session, with no repository call and no revalidation", async () => {
    getCurrentSession.mockResolvedValue(null);
    await expect(changeRatingAction(change)).resolves.toEqual({ ok: false, code: "no_session" });
    expect(castVote).not.toHaveBeenCalled();
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it.each(VOTE_CODES)("the refusal %s is passed through with its round status", async (code) => {
    castVote.mockRejectedValue(new VoteError(code, "paused"));
    await expect(changeRatingAction(change)).resolves.toEqual({ ok: false, code, roundStatus: "paused" });
    // A refusal re-renders the card in its current state, except an input the card never sends.
    expect(paths()).toEqual(code === "invalid_input" ? [] : CARD_PATHS);
  });

  it("a missing profile is not_eligible, with no revalidation", async () => {
    castVote.mockRejectedValue(new ProfileRequiredError("castVote"));
    await expect(changeRatingAction(change)).resolves.toEqual({ ok: false, code: "not_eligible" });
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("any other error is failed, with no revalidation, and only its class name is logged", async () => {
    castVote.mockRejectedValue(new TypeError(`row ${APPLICATION_ID} SENTINEL-DRIVER-DETAIL`));
    await expect(changeRatingAction(change)).resolves.toEqual({ ok: false, code: "failed" });
    expect(revalidatePath).not.toHaveBeenCalled();
    const text = JSON.stringify(logged);
    expect(text).toContain("TypeError");
    expect(text).not.toContain("SENTINEL-DRIVER-DETAIL");
    expect(text).not.toContain(APPLICATION_ID);
  });
});

describe("withdrawRatingAction", () => {
  const input = { applicationId: APPLICATION_ID };

  it("withdraws with the session's context, revalidates two paths, never the card, and replace-redirects", async () => {
    await expect(withdrawRatingAction({ ...input, extra: "SENTINEL" } as typeof input)).rejects.toThrow(
      /NEXT_REDIRECT/,
    );
    expect(withdrawVote).toHaveBeenCalledWith(CONTEXT, input);
    expect(paths()).toEqual(["/casting", "/dashboard"]);
    expect(redirect).toHaveBeenCalledWith("/casting/screening", "replace");
  });

  it("an already withdrawn vote (not_found) is the same success", async () => {
    withdrawVote.mockRejectedValue(new VoteError("not_found"));
    await expect(withdrawRatingAction(input)).rejects.toThrow(/NEXT_REDIRECT/);
    expect(paths()).toEqual(["/casting", "/dashboard"]);
    expect(redirect).toHaveBeenCalledWith("/casting/screening", "replace");
  });

  it.each([
    ["a malformed id", { applicationId: "not-a-uuid" }],
    ["a non-string id", { applicationId: 7 as unknown as string }],
    ["no input", undefined as unknown as typeof input],
  ])("%s is not_found, before the session or the repository is asked, and does not redirect", async (_l, bad) => {
    await expect(withdrawRatingAction(bad)).resolves.toEqual({ ok: false, code: "not_found" });
    expect(getCurrentSession).not.toHaveBeenCalled();
    expect(withdrawVote).not.toHaveBeenCalled();
    expect(redirect).not.toHaveBeenCalled();
  });

  it("no session is no_session, with no redirect", async () => {
    getCurrentSession.mockResolvedValue(null);
    await expect(withdrawRatingAction(input)).resolves.toEqual({ ok: false, code: "no_session" });
    expect(withdrawVote).not.toHaveBeenCalled();
    expect(redirect).not.toHaveBeenCalled();
  });

  it.each(VOTE_CODES.filter((c) => c !== "not_found"))(
    "the refusal %s revalidates like a change and does not redirect",
    async (code) => {
      withdrawVote.mockRejectedValue(new VoteError(code, "paused"));
      await expect(withdrawRatingAction(input)).resolves.toEqual({ ok: false, code, roundStatus: "paused" });
      expect(paths()).toEqual(code === "invalid_input" ? [] : CARD_PATHS);
      expect(redirect).not.toHaveBeenCalled();
    },
  );

  it("an unknown error is failed, with no revalidation and no redirect", async () => {
    withdrawVote.mockRejectedValue(new TypeError("SENTINEL"));
    await expect(withdrawRatingAction(input)).resolves.toEqual({ ok: false, code: "failed" });
    expect(revalidatePath).not.toHaveBeenCalled();
    expect(redirect).not.toHaveBeenCalled();
    expect(JSON.stringify(logged)).not.toContain("SENTINEL");
  });

  it("a missing profile is not_eligible", async () => {
    withdrawVote.mockRejectedValue(new ProfileRequiredError("withdrawVote"));
    await expect(withdrawRatingAction(input)).resolves.toEqual({ ok: false, code: "not_eligible" });
    expect(redirect).not.toHaveBeenCalled();
  });
});
