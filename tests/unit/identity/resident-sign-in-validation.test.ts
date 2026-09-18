import { describe, expect, it } from "vitest";
import { signIn, SignInError } from "@/modules/identity/auth";

// A blank householdId/displayName must fail as a SignInError (caught and shown inline by
// signInAction) before reaching withSessionContext's assertUuid, whose plain Error is not caught
// there and previously surfaced as an unhandled runtime crash.
describe("signIn resident-mode input validation", () => {
  it("rejects an empty householdId", async () => {
    await expect(
      signIn({ kind: "resident", householdId: "", displayName: "Jonas", password: "x" }),
    ).rejects.toThrow(SignInError);
  });

  it("rejects a whitespace-only householdId", async () => {
    await expect(
      signIn({ kind: "resident", householdId: "   ", displayName: "Jonas", password: "x" }),
    ).rejects.toThrow(SignInError);
  });

  it("rejects an empty displayName", async () => {
    await expect(
      signIn({ kind: "resident", householdId: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa", displayName: "", password: "x" }),
    ).rejects.toThrow(SignInError);
  });

  // A non-blank but non-UUID-shaped householdId (e.g. "not-a-uuid") must also fail as a
  // SignInError before reaching withSessionContext's assertUuid, whose plain Error is not caught
  // by signInAction and previously surfaced as an unhandled 500.
  it("rejects a non-blank, malformed householdId", async () => {
    await expect(
      signIn({ kind: "resident", householdId: "not-a-uuid", displayName: "Jonas", password: "x" }),
    ).rejects.toThrow(SignInError);
  });
});
