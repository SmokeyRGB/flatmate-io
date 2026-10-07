import { beforeEach, describe, expect, it, vi } from "vitest";
import { de } from "@/ui/strings/de";
import { en } from "@/ui/strings/en";

// language-switch D2/D10: the resolver's order. tests/setup.ts mocks this module to German for
// every other test; this file takes the real one with vi.importActual.
vi.mock("server-only", () => ({}));

const cookieValue = vi.fn<() => string | undefined>();
const acceptLanguage = vi.fn<() => string | null>();
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: (name: string) => (name === "flatmate_locale" && cookieValue() ? { value: cookieValue() } : undefined) }),
  headers: async () => ({ get: (name: string) => (name === "accept-language" ? acceptLanguage() : null) }),
}));
const getRenderSession = vi.fn();
vi.mock("@/modules/identity/session-cookie", () => ({ getRenderSession: () => getRenderSession() }));
// React's `cache` is per request; outside one it does not memoise, so each call resolves afresh.

type Request = typeof import("@/ui/strings/request");
const request = () => vi.importActual<Request>("@/ui/strings/request");

beforeEach(() => {
  cookieValue.mockReset().mockReturnValue(undefined);
  acceptLanguage.mockReset().mockReturnValue(null);
  getRenderSession.mockReset().mockResolvedValue(null);
});

describe("getRequestLocale", () => {
  it("lets a session's account language beat the cookie", async () => {
    getRenderSession.mockResolvedValue({ locale: "de" });
    cookieValue.mockReturnValue("en");
    acceptLanguage.mockReturnValue("en");
    expect(await (await request()).getRequestLocale()).toBe("de");
  });

  it("lets the cookie beat the Accept-Language header", async () => {
    cookieValue.mockReturnValue("de");
    acceptLanguage.mockReturnValue("en");
    expect(await (await request()).getRequestLocale()).toBe("de");
  });

  it("lets the header beat the default", async () => {
    acceptLanguage.mockReturnValue("en-GB,en;q=0.9");
    expect(await (await request()).getRequestLocale()).toBe("en");
  });

  it("falls back to German with no session, cookie or header", async () => {
    expect(await (await request()).getRequestLocale()).toBe("de");
  });

  // Break: remove the try/catch around getRenderSession in getRequestLocale, and this fails.
  it("falls back to cookie, header, German and logs when the session lookup fails", async () => {
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      getRenderSession.mockRejectedValue(new Error("database is down"));
      cookieValue.mockReturnValue("en");
      expect(await (await request()).getRequestLocale()).toBe("en");

      cookieValue.mockReturnValue(undefined);
      acceptLanguage.mockReturnValue("en");
      expect(await (await request()).getRequestLocale()).toBe("en");

      acceptLanguage.mockReturnValue(null);
      expect(await (await request()).getRequestLocale()).toBe("de");
      expect(logged).toHaveBeenCalledTimes(3);
    } finally {
      logged.mockRestore();
    }
  });

  it("ignores a cookie that is not a supported language", async () => {
    cookieValue.mockReturnValue("fr");
    acceptLanguage.mockReturnValue("en");
    expect(await (await request()).getRequestLocale()).toBe("en");
  });
});

describe("getStrings", () => {
  it("returns the table of the request's language", async () => {
    const { getStrings } = await request();
    getRenderSession.mockResolvedValue({ locale: "en" });
    expect(await getStrings()).toBe(en);
    getRenderSession.mockResolvedValue({ locale: "de" });
    expect(await getStrings()).toBe(de);
  });
});
