import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SessionContext } from "@/db/session-context";

// holdsPermission wraps assertHasPermission for pages: a refusal is an answer (false), anything
// else is rethrown. The repository is mocked: this file tests the mapping, not the permission.
vi.mock("server-only", () => ({}));
const { assertHasPermission, PermissionDeniedError } = vi.hoisted(() => ({
  assertHasPermission: vi.fn(),
  PermissionDeniedError: class PermissionDeniedError extends Error {},
}));
vi.mock("@/modules/identity/repository", () => ({ assertHasPermission, PermissionDeniedError }));

const { holdsPermission } = await import("@/app/holds-permission");

const context = { accountId: "acc" } as unknown as SessionContext;

describe("holdsPermission", () => {
  // A block, not an expression: mockReset() returns the mock, and vitest calls a function returned
  // from beforeEach as a cleanup hook.
  beforeEach(() => {
    assertHasPermission.mockReset();
  });

  it("is true when the assertion passes, and asks for the caller's own account", async () => {
    assertHasPermission.mockResolvedValue(undefined);
    await expect(holdsPermission(context, "change_application_state")).resolves.toBe(true);
    expect(assertHasPermission).toHaveBeenCalledWith(context, "acc", "change_application_state");
  });

  it("is false on PermissionDeniedError", async () => {
    assertHasPermission.mockImplementation(async () => {
      throw new PermissionDeniedError();
    });
    await expect(holdsPermission(context, "change_application_state")).resolves.toBe(false);
  });

  it("rethrows anything else", async () => {
    const boom = new Error("db down");
    assertHasPermission.mockImplementation(async () => {
      throw boom;
    });
    await expect(holdsPermission(context, "change_application_state")).rejects.toBe(boom);
  });
});
