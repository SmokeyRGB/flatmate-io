import { describe, expect, it, vi } from "vitest";

// actions.ts pulls in session-cookie.ts (server-only + next/headers) and next/navigation via its
// import chain; none of that runs before the UUID guard fires, but it must resolve for the module
// to import at all under vitest (no Next server runtime present here).
vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({ cookies: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));

const { claimResidentProfileAction } = await import("@/app/(auth)/claim/actions");
import type { ClaimFormState } from "@/app/(auth)/claim/actions";

// A non-empty but non-UUID householdId must fail as a ClaimFormState.error (returned, not thrown)
// before reaching findPreparedResidentProfile -> withSessionContext's assertUuid, whose plain
// Error is not a ClaimError/SignInError and previously surfaced as an unhandled runtime crash.
describe("claimResidentProfileAction householdId validation", () => {
  const prevState: ClaimFormState = { error: null };

  it("rejects a non-UUID householdId without throwing", async () => {
    const formData = new FormData();
    formData.set("householdId", "not-a-uuid");
    formData.set("displayName", "Jonas");
    formData.set("password", "correct horse battery staple");

    const result = await claimResidentProfileAction(prevState, formData);

    expect(result.error).toBeTruthy();
  });

  it("still requires the non-emptiness fields first", async () => {
    const formData = new FormData();
    formData.set("householdId", "");
    formData.set("displayName", "");
    formData.set("password", "");

    const result = await claimResidentProfileAction(prevState, formData);

    expect(result.error).toBe("Household, name, and password are all required.");
  });
});
