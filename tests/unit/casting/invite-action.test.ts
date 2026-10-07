import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// F5 candidate-invite (design D4): the „Eingeladen!" server action, in the shape of
// update-action.test.ts (Copilot, PR #58: the action boundary had no tests of its own). The
// repository and the session are mocked. It must read only the two ids, refuse malformed ones
// before any call, map every repository refusal to its code, log nothing but an error's class name,
// and revalidate the three paths on success only.
vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({ cookies: vi.fn() }));

const revalidatePath = vi.hoisted(() => vi.fn());
vi.mock("next/cache", () => ({ revalidatePath }));

const CONTEXT = {
  accountId: "11111111-1111-1111-1111-111111111111",
  householdId: "22222222-2222-2222-2222-222222222222",
  profileId: "44444444-4444-4444-4444-444444444444",
};
const getCurrentSession = vi.hoisted(() => vi.fn());
vi.mock("@/modules/identity/session-cookie", () => ({ getCurrentSession }));

const inviteApplication = vi.hoisted(() => vi.fn());
vi.mock("@/modules/casting/repository", async () => {
  const actual = await vi.importActual<typeof import("@/modules/casting/repository")>(
    "@/modules/casting/repository",
  );
  return { ...actual, inviteApplication };
});

const { inviteApplicationAction } = await import("@/app/(org)/rounds/[id]/applications/invite-actions");
const { ApplicationTransitionError, ProfileRequiredError } = await import("@/modules/casting/repository");
const { PermissionDeniedError } = await import("@/modules/identity/repository");

const ROUND_ID = "33333333-3333-3333-3333-333333333333";
const APPLICATION_ID = "55555555-5555-5555-5555-555555555555";
const idle = { status: "idle" } as const;

function formData(fields: Record<string, string | Blob> = { roundId: ROUND_ID, applicationId: APPLICATION_ID }) {
  const fd = new FormData();
  for (const [key, value] of Object.entries(fields)) fd.set(key, value);
  return fd;
}

let logged: unknown[][] = [];
beforeEach(() => {
  logged = [];
  vi.spyOn(console, "error").mockImplementation((...args: unknown[]) => {
    logged.push(args);
  });
  getCurrentSession.mockResolvedValue({ context: CONTEXT });
  inviteApplication.mockResolvedValue({ alreadyInvited: false });
});
afterEach(() => {
  vi.restoreAllMocks();
  revalidatePath.mockReset();
  inviteApplication.mockReset();
  getCurrentSession.mockReset();
});

describe("inviteApplicationAction", () => {
  it("invites with the session's context and the two ids only, then revalidates the four paths", async () => {
    const fd = formData({ roundId: ROUND_ID, applicationId: APPLICATION_ID, text: "SENTINEL-TEXT" });
    await expect(inviteApplicationAction(idle, fd)).resolves.toEqual({ status: "ok" });
    expect(inviteApplication).toHaveBeenCalledOnce();
    expect(inviteApplication).toHaveBeenCalledWith(CONTEXT, { roundId: ROUND_ID, applicationId: APPLICATION_ID });
    expect(revalidatePath.mock.calls.map((c) => c[0])).toEqual([
      "/casting",
      `/rounds/${ROUND_ID}`,
      `/rounds/${ROUND_ID}/applications/${APPLICATION_ID}`,
      `/casting/candidate/${APPLICATION_ID}`,
    ]);
  });

  it("an already invited application is success too", async () => {
    inviteApplication.mockResolvedValue({ alreadyInvited: true });
    await expect(inviteApplicationAction(idle, formData())).resolves.toEqual({ status: "ok" });
    expect(revalidatePath).toHaveBeenCalledTimes(4);
  });

  it.each([
    ["a missing round id", { applicationId: APPLICATION_ID }],
    ["a missing application id", { roundId: ROUND_ID }],
    ["a malformed round id", { roundId: "../../etc", applicationId: APPLICATION_ID }],
    ["a malformed application id", { roundId: ROUND_ID, applicationId: "not-a-uuid" }],
    ["a file instead of an id", { roundId: new Blob([ROUND_ID]), applicationId: APPLICATION_ID }],
  ])("%s is not_found, before the session or the repository is asked", async (_label, fields) => {
    await expect(inviteApplicationAction(idle, formData(fields))).resolves.toEqual({
      status: "error",
      code: "not_found",
    });
    expect(getCurrentSession).not.toHaveBeenCalled();
    expect(inviteApplication).not.toHaveBeenCalled();
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("no session is no_session, and the repository is never asked", async () => {
    getCurrentSession.mockResolvedValue(null);
    await expect(inviteApplicationAction(idle, formData())).resolves.toEqual({
      status: "error",
      code: "no_session",
    });
    expect(inviteApplication).not.toHaveBeenCalled();
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it.each([
    ["not_invitable", () => new ApplicationTransitionError("not_invitable"), "not_invitable"],
    ["not_found", () => new ApplicationTransitionError("not_found"), "not_found"],
    ["step_not_available", () => new ApplicationTransitionError("step_not_available"), "failed"],
    ["a missing permission", () => new PermissionDeniedError("change_application_state"), "not_allowed"],
    ["a missing profile", () => new ProfileRequiredError("inviteApplication"), "not_allowed"],
  ])("a refusal (%s) maps to its code, with no revalidation", async (_label, error, code) => {
    inviteApplication.mockRejectedValue(error());
    await expect(inviteApplicationAction(idle, formData())).resolves.toEqual({ status: "error", code });
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("any other error is failed, and only its class name is logged, never its message", async () => {
    inviteApplication.mockRejectedValue(new TypeError(`row ${APPLICATION_ID} SENTINEL-DRIVER-DETAIL`));
    await expect(inviteApplicationAction(idle, formData())).resolves.toEqual({
      status: "error",
      code: "failed",
    });
    expect(revalidatePath).not.toHaveBeenCalled();
    const text = JSON.stringify(logged);
    expect(text).toContain("TypeError");
    expect(text).not.toContain("SENTINEL-DRIVER-DETAIL");
    expect(text).not.toContain(APPLICATION_ID);
  });
});
