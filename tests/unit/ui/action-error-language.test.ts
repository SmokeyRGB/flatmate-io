import { describe, expect, it, vi } from "vitest";
import { de } from "@/ui/strings/de";
import { en } from "@/ui/strings/en";

// language-switch D2/D10: a real server action's error path, run under an English request. The
// request module is mocked to English (tests/setup.ts defaults every other test to German); the
// action must hand back the English text, not the German one.
vi.mock("@/ui/strings/request", () => ({
  LOCALE_COOKIE: "flatmate_locale",
  getRequestLocale: async () => "en",
  getStrings: async () => en,
}));
vi.mock("next/headers", () => ({ headers: async () => new Headers(), cookies: async () => ({ set: vi.fn() }) }));
vi.mock("next/navigation", () => ({
  redirect: () => {
    throw new Error("redirect must not be reached on a refusal");
  },
}));
vi.mock("@/modules/identity/session-cookie", () => ({
  setSessionCookie: vi.fn(),
  sessionCookieMaxAge: () => 0,
}));

import { signInAction } from "@/app/(auth)/sign-in/actions";

describe("a server action's error text follows the request's language", () => {
  // Break: make signInAction read `de.auth.errors.signIn.missingFields`, and this fails.
  it("signInAction's missing-fields refusal is English under an English request", async () => {
    const form = new FormData();
    // The name sign-in with its fields empty is refused before any database or provider call.
    form.set("mode", "resident");
    form.set("householdCode", "");
    form.set("displayName", "");
    form.set("password", "");

    const state = await signInAction({ error: null }, form);

    expect(state.error).toBe(en.auth.errors.signIn.missingFields);
    expect(state.error).not.toBe(de.auth.errors.signIn.missingFields);
  });
});
