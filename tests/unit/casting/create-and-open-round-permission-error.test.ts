import { describe, expect, it, vi } from "vitest";

// actions.ts pulls in session-cookie.ts (server-only + next/headers) and next/navigation via its
// import chain, plus @/modules/identity/repository and @/modules/casting/repository for the DB
// calls this test wants to stub out entirely (no live DB in a unit test).
vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({ cookies: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));

vi.mock("@/modules/identity/session-cookie", () => ({
  getCurrentSession: vi.fn(async () => ({
    context: { accountId: "11111111-1111-1111-1111-111111111111", profileId: null },
  })),
}));

const { PermissionDeniedError } = await import("@/modules/identity/repository");
vi.mock("@/modules/identity/repository", async () => {
  const actual = await vi.importActual<typeof import("@/modules/identity/repository")>(
    "@/modules/identity/repository",
  );
  return {
    ...actual,
    assertHasPermission: vi.fn(async () => {
      throw new actual.PermissionDeniedError("close_round");
    }),
  };
});

vi.mock("@/modules/casting/repository", () => ({
  createAndOpenRound: vi.fn(),
  RoundOpenPreconditionError: class RoundOpenPreconditionError extends Error {},
}));

const { createAndOpenRoundAction } = await import("@/app/(org)/rounds/new/actions");
import type { CreateRoundFormState } from "@/app/(org)/rounds/new/actions";

// rounds-new-permission-check-outside-try: a signed-in user without close_round used to hit an
// unhandled thrown PermissionDeniedError (assertHasPermission ran above the try block), instead
// of the inline state.error every other refusal on this form returns.
describe("createAndOpenRoundAction close_round permission handling", () => {
  it("returns an inline error instead of throwing when close_round is missing", async () => {
    const prevState: CreateRoundFormState = { error: null };
    const formData = new FormData();
    formData.set("title", "New round");

    const result = await createAndOpenRoundAction(prevState, formData);

    expect(result.error).toBeTruthy();
    expect(result.error).toBe(new PermissionDeniedError("close_round").message);
  });
});
