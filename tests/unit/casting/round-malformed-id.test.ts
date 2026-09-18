import { describe, expect, it } from "vitest";
import type { SessionContext } from "@/db/session-context";
import { getRoundForSession } from "@/modules/casting/repository";

// rounds-page-malformed-id-500: a route param like `/rounds/not-a-uuid` was passed straight into
// getRoundForSession, whose profile-less branch builds `... WHERE id = ${roundId}::uuid` — an
// invalid UUID string raised a Postgres cast error (500) instead of the route's `notFound()`
// path. getRoundForSession now fails closed (returns null) before either query branch runs, for
// both a profile-less and a resident session — no DB call should even happen, so this needs no
// real household fixture.
describe("getRoundForSession malformed id handling", () => {
  const malformedId = "not-a-uuid";

  it("returns null for a malformed id on a profile-less session", async () => {
    const context: SessionContext = {
      accountId: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
      householdId: "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb",
      profileId: null,
    };

    await expect(getRoundForSession(context, malformedId)).resolves.toBeNull();
  });

  it("returns null for a malformed id on a resident session", async () => {
    const context: SessionContext = {
      accountId: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
      householdId: "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb",
      profileId: "cccccccc-cccc-cccc-cccc-cccccccccccc",
    };

    await expect(getRoundForSession(context, malformedId)).resolves.toBeNull();
  });
});
