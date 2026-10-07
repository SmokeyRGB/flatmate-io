import { beforeEach, describe, expect, it, vi } from "vitest";

// F5 candidate-detail D7: the settings action turns the checkbox into a boolean. The repository
// and the session are mocked, as in invite-action.test.ts.
vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({ cookies: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const CONTEXT = {
  accountId: "11111111-1111-1111-1111-111111111111",
  householdId: "22222222-2222-2222-2222-222222222222",
  profileId: null,
};
const getCurrentSession = vi.hoisted(() => vi.fn());
vi.mock("@/modules/identity/session-cookie", () => ({ getCurrentSession }));

const updateHouseholdSettings = vi.hoisted(() => vi.fn());
vi.mock("@/modules/casting/repository", () => ({ updateHouseholdSettings }));

const { updateSettingsAction } = await import("@/app/(org)/settings/actions");

const idle = { error: null, saved: false };

function form(fields: Record<string, string>) {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.set(k, v);
  return fd;
}

beforeEach(() => {
  updateHouseholdSettings.mockReset();
  updateHouseholdSettings.mockResolvedValue({});
  getCurrentSession.mockResolvedValue({ context: CONTEXT });
});

describe("updateSettingsAction", () => {
  it("sends true for a checked box", async () => {
    await updateSettingsAction(idle, form({ quorumShare: "0.5", revealVoteAuthorship: "on" }));
    expect(updateHouseholdSettings.mock.calls[0][1].revealVoteAuthorship).toBe(true);
  });

  it("sends false for an absent box", async () => {
    await updateSettingsAction(idle, form({ quorumShare: "0.5" }));
    expect(updateHouseholdSettings.mock.calls[0][1].revealVoteAuthorship).toBe(false);
  });

  it("still passes quorumShare through", async () => {
    await updateSettingsAction(idle, form({ quorumShare: "0.7" }));
    expect(updateHouseholdSettings.mock.calls[0][1].quorumShare).toBe("0.7");
  });
});
