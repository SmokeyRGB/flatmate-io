import { beforeEach, describe, expect, it, vi } from "vitest";

// language-switch D8: switchLanguage's three branches. next/headers, the session and setOwnLocale
// are mocked: this file tests the action's own logic, the integration test covers the database.

const cookieSet = vi.fn();
vi.mock("next/headers", () => ({ cookies: async () => ({ set: cookieSet }) }));
const revalidatePath = vi.fn();
vi.mock("next/cache", () => ({ revalidatePath: (...args: unknown[]) => revalidatePath(...args) }));
const getCurrentSession = vi.fn();
vi.mock("@/modules/identity/session-cookie", () => ({ getCurrentSession: () => getCurrentSession() }));
const setOwnLocale = vi.fn();
vi.mock("@/modules/identity/repository", () => ({
  setOwnLocale: (...args: unknown[]) => setOwnLocale(...args),
}));

import { switchLanguage } from "@/app/_frame/language-actions";

function form(locale: string): FormData {
  const data = new FormData();
  data.set("locale", locale);
  return data;
}

const context = { accountId: "acc", householdId: "hh", profileId: null };

beforeEach(() => {
  cookieSet.mockReset();
  revalidatePath.mockReset();
  getCurrentSession.mockReset().mockResolvedValue(null);
  setOwnLocale.mockReset().mockResolvedValue(undefined);
});

describe("switchLanguage", () => {
  it("with a session, stores the choice on the session's own account and sets the cookie", async () => {
    getCurrentSession.mockResolvedValue({ sessionId: "s", context });
    await switchLanguage(form("en"));
    expect(setOwnLocale).toHaveBeenCalledWith(context, "en");
    expect(cookieSet).toHaveBeenCalledWith(
      "flatmate_locale",
      "en",
      expect.objectContaining({ httpOnly: true, sameSite: "lax", path: "/", maxAge: 60 * 60 * 24 * 365 }),
    );
    expect(revalidatePath).toHaveBeenCalledWith("/", "layout");
  });

  it("without a session, sets only the cookie", async () => {
    await switchLanguage(form("en"));
    expect(setOwnLocale).not.toHaveBeenCalled();
    expect(cookieSet).toHaveBeenCalledWith("flatmate_locale", "en", expect.any(Object));
  });

  // Break: re-throw in the catch around setOwnLocale in switchLanguage, and this fails.
  it("when storing the choice on the account fails, the device still switches and the action does not throw", async () => {
    getCurrentSession.mockResolvedValue({ sessionId: "s", context });
    setOwnLocale.mockRejectedValue(new Error("database is down"));
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      await expect(switchLanguage(form("en"))).resolves.toBeUndefined();
      expect(cookieSet).toHaveBeenCalledWith("flatmate_locale", "en", expect.any(Object));
      expect(revalidatePath).toHaveBeenCalledWith("/", "layout");
      expect(logged).toHaveBeenCalled();
    } finally {
      logged.mockRestore();
    }
  });

  it("an invalid value does neither", async () => {
    getCurrentSession.mockResolvedValue({ sessionId: "s", context });
    await switchLanguage(form("fr"));
    expect(setOwnLocale).not.toHaveBeenCalled();
    expect(cookieSet).not.toHaveBeenCalled();
  });
});
