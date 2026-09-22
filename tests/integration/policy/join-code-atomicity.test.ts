import { afterEach, describe, expect, it } from "vitest";
import { claimJoinCode, issueJoinCode, listJoinCodeIssuances } from "@/modules/identity/repository";
import { cleanupAll, registerTestHousehold, type TestHousehold } from "../../helpers/identity";

let hh: TestHousehold | undefined;

afterEach(async () => {
  await cleanupAll(hh?.cleanup());
  hh = undefined;
});

// EC-2.1: with a default cap of 1, every ordinary invitation is a race for the only redemption a
// link has — not a rare edge case. Modeled on the EC-1.9 test
// (tests/integration/policy/round-open-atomicity.test.ts:117): design.md Decision 1's single
// conditional UPDATE ... RETURNING is what makes this safe without holding a lock across a round
// trip.
describe("Join code claim atomicity (EC-2.1)", () => {
  it("lets exactly one of two concurrent claims on a single-use link succeed", async () => {
    hh = await registerTestHousehold();
    const link = await issueJoinCode(hh.context, hh.accountId, { validDays: 7, maxUses: 1 });

    const results = await Promise.allSettled([claimJoinCode(link.code), claimJoinCode(link.code)]);

    // Both promises resolve regardless of outcome (claimJoinCode's refusal is `null`, not a
    // rejection) — the race is in the VALUE, not in which promise settles which way.
    const resolvedValues = results.map((r) => (r.status === "fulfilled" ? r.value : null));
    const successes = resolvedValues.filter((v) => v !== null);
    expect(successes).toHaveLength(1);
    expect(successes[0]?.issuanceId).toBe(link.id);

    const issuances = await listJoinCodeIssuances(hh.context, hh.accountId);
    const row = issuances.find((i) => i.id === link.id);
    expect(row?.uses).toBe(1); // never 2 — the count never exceeds the maximum
  });

  it("never lets the count exceed the maximum under many concurrent attempts", async () => {
    hh = await registerTestHousehold();
    const link = await issueJoinCode(hh.context, hh.accountId, { validDays: 7, maxUses: 3 });

    const attempts = Array.from({ length: 10 }, () => claimJoinCode(link.code));
    const results = await Promise.allSettled(attempts);
    const successes = results.filter(
      (r): r is PromiseFulfilledResult<Awaited<ReturnType<typeof claimJoinCode>>> =>
        r.status === "fulfilled" && r.value !== null,
    );

    expect(successes).toHaveLength(3); // exactly maxUses, never more

    const issuances = await listJoinCodeIssuances(hh.context, hh.accountId);
    const row = issuances.find((i) => i.id === link.id);
    expect(row?.uses).toBe(3);
  });
});
