import { describe, expect, it, vi, beforeEach } from "vitest";

// A tampered/stale `flatmate_session` cookie (e.g. `sessionId.not-a-uuid`) must make
// getCurrentSession() return null (treat as signed out), never reach resolveSessionContext /
// withSessionContext's assertUuid, whose plain Error previously surfaced as an unhandled crash
// (500) instead of the documented no-session path.

vi.mock("server-only", () => ({}));

const resolveSessionContext = vi.fn();
vi.mock("@/modules/identity/repository", () => ({ resolveSessionContext }));

let cookieValue: string | undefined;
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: () => (cookieValue === undefined ? undefined : { value: cookieValue }),
    set: () => {},
    delete: () => {},
  }),
}));

const validSessionId = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const validHouseholdId = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";

describe("getCurrentSession malformed cookie handling", () => {
  beforeEach(() => {
    resolveSessionContext.mockReset();
    cookieValue = undefined;
  });

  it("returns null for a malformed household segment without querying the DB", async () => {
    const { getCurrentSession } = await import("@/modules/identity/session-cookie");
    cookieValue = `${validSessionId}.not-a-uuid`;

    await expect(getCurrentSession()).resolves.toBeNull();
    expect(resolveSessionContext).not.toHaveBeenCalled();
  });

  it("returns null for a malformed session-id segment without querying the DB", async () => {
    const { getCurrentSession } = await import("@/modules/identity/session-cookie");
    cookieValue = `not-a-uuid.${validHouseholdId}`;

    await expect(getCurrentSession()).resolves.toBeNull();
    expect(resolveSessionContext).not.toHaveBeenCalled();
  });

  it("still resolves a well-formed cookie", async () => {
    const { getCurrentSession } = await import("@/modules/identity/session-cookie");
    cookieValue = `${validSessionId}.${validHouseholdId}`;
    resolveSessionContext.mockResolvedValue({ accountId: "x", householdId: validHouseholdId, profileId: null });

    const result = await getCurrentSession();
    expect(resolveSessionContext).toHaveBeenCalledWith(validSessionId, validHouseholdId);
    expect(result).not.toBeNull();
  });
});
