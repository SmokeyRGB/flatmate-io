import { describe, expect, it } from "vitest";
import { joinHousehold } from "@/modules/identity/auth";

// join-by-link design.md Decision 13: `/claim` is deleted — its own action used to take a raw
// `householdId` typed by hand and reach `withSessionContext`'s `assertUuid`, whose plain Error
// (not a ClaimError) previously surfaced as an unhandled crash for a non-UUID value. G-G1: this
// file is REWRITTEN, not deleted — the behaviour it protected (untrusted stranger input reaching
// this app's public identity-creation surface must never crash the action, only ever refuse
// cleanly) still exists, just on a different field. The join route has no household-id field at
// all any more (the household is identified by the LINK, never typed); its one untrusted string
// is the `code` itself, so this file now exercises that input against `joinHousehold` directly —
// the same layer join-atomicity.test.ts/join-name-collision.test.ts already call, and one that
// (unlike the action) does not touch the rate limiter, so this stays a fast, no-write test.
describe("joinHousehold: a malformed/unknown code never crashes", () => {
  it("refuses a garbage, wrong-shaped code with invalid_link — never an unhandled crash", async () => {
    // normalizeJoinCode/resolveJoinCode never throw on a malformed input (design.md Decision 4):
    // it is normalised and simply matches nothing. This is the direct equivalent of the old
    // test's "a non-UUID householdId must fail as an error, not a crash".
    await expect(
      joinHousehold("definitely not a real join code!! %$#", {
        displayName: "Someone",
        password: "correct horse battery staple",
      }),
    ).rejects.toMatchObject({ code: "invalid_link" });
  });

  it("still requires a password, checked before any code lookup", async () => {
    await expect(
      joinHousehold("NEVER-EXISTS-CODE-CHECK", { displayName: "Someone", password: "" }),
    ).rejects.toMatchObject({ code: "missing_fields" });
  });

  it("does not require a display name field at all — a bound link's caller never sends one", async () => {
    // design.md Decision 13: join-form.tsx renders no name field for a BOUND link, so the caller
    // omits `displayName` entirely (`undefined`, never `""`). Against a code that cannot resolve,
    // the refusal is still invalid_link — the missing-name check (which only applies to a NEUTRAL
    // link) never even gets a chance to fire first.
    await expect(
      joinHousehold("NEVER-EXISTS-CODE-CHECK", { password: "correct horse battery staple" }),
    ).rejects.toMatchObject({ code: "invalid_link" });
  });
});
