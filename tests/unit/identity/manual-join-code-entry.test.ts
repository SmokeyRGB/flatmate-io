import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { de } from "@/ui/strings";

// Same precedent as join-code-never-in-query-or-log.test.ts's own G-A5 mock: actions.ts pulls in
// next/navigation's `redirect`, which throws in a real Next runtime — mocked here to record its
// argument instead, so the malformed/well-formed branches can both be asserted without one.
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));

const { redirect } = await import("next/navigation");
const { enterJoinCodeAction } = await import("@/app/(auth)/join/actions");

function formDataWith(code: string): FormData {
  const fd = new FormData();
  fd.set("code", code);
  return fd;
}

// join-screen design.md Decision 1: `/join` normalises and redirects, resolving nothing. G-A5: the
// code arrives in the body and leaves only as a path segment built by buildJoinUrl from an
// ALREADY-validated string — never a raw echo of what was typed.
describe("enterJoinCodeAction", () => {
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;
  let consoleLogSpy: ReturnType<typeof vi.spyOn>;
  let consoleWarnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.mocked(redirect).mockClear();
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

  it("messy input redirects to exactly /join/UAMPN-QACVZ, with no ?", async () => {
    await enterJoinCodeAction({ error: null }, formDataWith("uampn qacvz"));
    expect(redirect).toHaveBeenCalledWith("/join/UAMPN-QACVZ");
    const target = vi.mocked(redirect).mock.calls[0]![0] as string;
    expect(target).not.toContain("?");
  });

  it("malformed input returns the refusal text, never the raw input, and does not redirect", async () => {
    const raw = "not-a-code-at-all";
    const state = await enterJoinCodeAction({ error: null }, formDataWith(raw));
    expect(state.error).toBe(de.join.joinByCode.codeInvalid);
    expect(JSON.stringify(state)).not.toContain(raw.toUpperCase().replace(/[\s-]/g, ""));
    expect(JSON.stringify(state)).not.toContain(raw);
    expect(redirect).not.toHaveBeenCalled();
  });

  it("logs nothing containing the code for a malformed submission", async () => {
    const raw = "ANOTHER-BAD-CODE-TRY";
    await enterJoinCodeAction({ error: null }, formDataWith(raw));
    assertNoLogContains(raw);
  });
});
