import { describe, expect, it } from "vitest";
import { withSessionContext } from "@/db/session-context";
import { signIn } from "@/modules/identity/auth";
import { session } from "@/modules/identity/schema";
import { registerTestHousehold, type TestHousehold } from "../../helpers/identity";

// G-C7, via the policy layer: household A must see none of household B's Session rows.
describe("session isolation — policy layer", () => {
  it("household A sees only its own Session rows", async () => {
    let hhA: TestHousehold | undefined;
    let hhB: TestHousehold | undefined;
    try {
      hhA = await registerTestHousehold();
      hhB = await registerTestHousehold();
      const a = hhA;
      const b = hhB;

      const { session: sessionA } = await signIn({
        kind: "household",
        email: a.email,
        password: "test-password-not-real-1234",
      });
      const { session: sessionB } = await signIn({
        kind: "household",
        email: b.email,
        password: "test-password-not-real-1234",
      });

      const sessionsSeenByA = await withSessionContext(a.context, (tx) => tx.select().from(session));

      expect(sessionsSeenByA.map((s) => s.id)).toContain(sessionA.id);
      expect(sessionsSeenByA.map((s) => s.id)).not.toContain(sessionB.id);
      expect(sessionsSeenByA.every((s) => s.householdId === a.householdId)).toBe(true);
    } finally {
      if (hhA) await hhA.cleanup();
      if (hhB) await hhB.cleanup();
    }
  });
});
