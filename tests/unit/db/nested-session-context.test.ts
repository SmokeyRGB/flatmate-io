import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { NestedSessionContextError, withSessionContext, type SessionContext } from "@/db/session-context";
import { uuid } from "../../helpers/uuid";

// src/db/session-context.ts refuses a withSessionContext opened from inside another one's
// callback: the nested call holds one pooled connection while waiting for a second, and enough
// concurrent callers doing that deadlock the Supavisor pool (createResidentProfile, until
// 2026-09-28). set_config does not check that the ids exist, so random ones suffice here — no
// household is created and nothing is written.
function anyContext(): SessionContext {
  return { accountId: uuid(), householdId: uuid(), profileId: null };
}

describe("withSessionContext refuses to nest", () => {
  it("rejects a withSessionContext opened inside another's callback without running it", async () => {
    let innerRan = false;
    const outcome = await withSessionContext(anyContext(), async () =>
      withSessionContext(anyContext(), async () => {
        innerRan = true;
      }).then(
        () => "resolved",
        (error: unknown) => error,
      ),
    );

    expect(outcome).toBeInstanceOf(NestedSessionContextError);
    expect(innerRan).toBe(false);
  });

  it("still allows sequential calls and concurrent siblings started outside any transaction", async () => {
    const context = anyContext();
    const read = () =>
      withSessionContext(context, (tx) =>
        tx.execute<{ household_id: string }>(sql`SELECT current_setting('app.household_id', true) AS household_id`),
      );

    const [first] = await read();
    const siblings = await Promise.all([read(), read()]);

    expect(first!.household_id).toBe(context.householdId);
    expect(siblings.map(([row]) => row!.household_id)).toEqual([context.householdId, context.householdId]);
  });

  // The shape the lock-race tests use (e.g. account-settings-password.test.ts): one transaction
  // held open on a gate while the test body, outside it, starts a second one. The second is a
  // sibling, not nested, so it must run.
  it("allows a second transaction started from the test body while another is held open", async () => {
    let release: () => void = () => {};
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    let markHeld: () => void = () => {};
    const held = new Promise<void>((resolve) => {
      markHeld = resolve;
    });

    const holder = withSessionContext(anyContext(), async () => {
      markHeld();
      await gate;
    });
    await held;

    const sibling = await withSessionContext(anyContext(), async () => "ran");
    release();
    await holder;

    expect(sibling).toBe("ran");
  });
});
