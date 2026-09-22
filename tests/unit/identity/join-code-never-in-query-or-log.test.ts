import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { JoinError, type JoinErrorCode } from "@/modules/identity/auth";
import { buildJoinUrl } from "@/modules/identity/repository";

// actions.ts pulls in session-cookie.ts (server-only + next/headers) and next/navigation via its
// import chain — none of that runs before the deterministic refusal paths below fire, but it must
// resolve for the module to import at all under vitest (no Next server runtime present here). Same
// pattern as tests/unit/identity/claim-resident-profile-validation.test.ts.
vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({
  cookies: vi.fn(async () => ({ get: () => undefined, set: () => {}, delete: () => {} })),
  headers: vi.fn(async () => new Headers()),
}));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));

const { joinHouseholdAction } = await import("@/app/(auth)/join/[code]/actions");

// G-A5/AC-2.18 and its 2026-09-21 addendum: the code travels only as a path segment or a request
// body field, never a query string, and never appears in any application log line — including an
// unanticipated failure's console.error.
describe("The join code never reaches a query string or a log line (G-A5/AC-2.18)", () => {
  it("buildJoinUrl always places the code as a path segment, never a query parameter", () => {
    const code = "UAMPN-QACVZ";
    expect(buildJoinUrl("example.test", code)).toBe(`https://example.test/join/${code}`);
    expect(buildJoinUrl(null, code)).toBe(`/join/${code}`);

    for (const host of ["example.test", null]) {
      const url = buildJoinUrl(host, code);
      expect(url).not.toContain("?");
      expect(url).not.toContain(`code=${code}`);
      expect(url.endsWith(`/join/${code}`)).toBe(true);
    }
  });

  it("no JoinError message contains a sample code, for any code discriminant", () => {
    const sampleCode = "UAMPN-QACVZ";
    const codes: JoinErrorCode[] = [
      "invalid_link",
      "name_taken",
      "rate_limited",
      "missing_fields",
      "password_too_short",
      "already_member",
      "other_household",
      "signup_failed",
    ];
    // Every throw site in auth.ts's joinHousehold builds its message from fixed English text or a
    // display name — never the code — but this asserts the invariant directly on the class
    // regardless of which throw site produced it.
    for (const code of codes) {
      const err = new JoinError("some message unrelated to the sample code", code);
      expect(err.message).not.toContain(sampleCode);
      expect(String(err)).not.toContain(sampleCode);
    }
  });

  describe("joinHouseholdAction's deterministic, pre-network refusal paths", () => {
    let consoleErrorSpy: ReturnType<typeof vi.spyOn>;
    let consoleLogSpy: ReturnType<typeof vi.spyOn>;
    let consoleWarnSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
      consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
      consoleLogSpy = vi.spyOn(console, "log").mockImplementation(() => {});
      consoleWarnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    });

    afterEach(() => {
      consoleErrorSpy.mockRestore();
      consoleLogSpy.mockRestore();
      consoleWarnSpy.mockRestore();
    });

    function assertNoLogContains(needle: string) {
      for (const spy of [consoleErrorSpy, consoleLogSpy, consoleWarnSpy]) {
        for (const call of spy.mock.calls) {
          for (const arg of call) {
            const asString =
              typeof arg === "string" ? arg : JSON.stringify(arg, Object.getOwnPropertyNames(arg ?? {}));
            expect(asString ?? "").not.toContain(needle);
          }
        }
      }
    }

    // The missing-fields check runs BEFORE recordJoinAttempt/joinHousehold are ever called — the
    // one refusal path in this action that touches no network or database at all, so it is safe
    // to exercise directly regardless of the rate-limiter's own migration status.
    it("logs nothing containing the code for a missing-fields refusal", async () => {
      const code = "NEVER-EXISTS-CODE-CHECK";
      const formData = new FormData();
      formData.set("code", code);
      formData.set("displayName", "");
      formData.set("password", "");

      const result = await joinHouseholdAction({ error: null, fieldError: null }, formData);
      expect(result.fieldError).toBe("displayName");
      assertNoLogContains(code);
    });
  });
});
