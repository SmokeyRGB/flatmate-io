import { afterEach, describe, expect, it } from "vitest";
import { signIn } from "@/modules/identity/auth";
import { cleanupAll, registerTestHousehold, type TestHousehold } from "../../helpers/identity";

const TWELVE_HOURS_MS = 12 * 60 * 60 * 1000;
const NINETY_DAYS_MS = 90 * 24 * 60 * 60 * 1000;
const TOLERANCE_MS = 60 * 1000; // one minute of slack for request latency

// FR-2.12/EC-2.10 (design.md Decision 5): the assertion is on the ROW's expiresAt, not on any
// cookie — EC-2.10's whole point is that the cleared case is a genuinely short SERVER-SIDE
// lifetime, not a cookie that merely disappears when the browser closes.
describe("signIn's rememberMe option controls the session row's server-side lifetime", () => {
  let hh: TestHousehold | undefined;

  afterEach(async () => {
    await cleanupAll(hh?.cleanup());
    hh = undefined;
  });

  it("cleared (rememberMe: false) gives a session row expiring in ~12h", async () => {
    hh = await registerTestHousehold();
    const before = Date.now();
    const result = await signIn(
      { kind: "household", email: hh.email, password: "test-password-not-real-1234" },
      { rememberMe: false },
    );

    expect(result.session.rememberMe).toBe(false);
    const lifetime = result.session.expiresAt.getTime() - before;
    expect(lifetime).toBeGreaterThan(TWELVE_HOURS_MS - TOLERANCE_MS);
    expect(lifetime).toBeLessThan(TWELVE_HOURS_MS + TOLERANCE_MS);
  });

  it("left selected (rememberMe: true) gives a session row expiring in ~90 days", async () => {
    hh = await registerTestHousehold();
    const before = Date.now();
    const result = await signIn(
      { kind: "household", email: hh.email, password: "test-password-not-real-1234" },
      { rememberMe: true },
    );

    expect(result.session.rememberMe).toBe(true);
    const lifetime = result.session.expiresAt.getTime() - before;
    expect(lifetime).toBeGreaterThan(NINETY_DAYS_MS - TOLERANCE_MS);
    expect(lifetime).toBeLessThan(NINETY_DAYS_MS + TOLERANCE_MS);
  });

  it("defaults to the long session when no options are passed — registration/claim are unchanged", async () => {
    hh = await registerTestHousehold();
    const before = Date.now();
    const result = await signIn({
      kind: "household",
      email: hh.email,
      password: "test-password-not-real-1234",
    });

    expect(result.session.rememberMe).toBe(true);
    const lifetime = result.session.expiresAt.getTime() - before;
    expect(lifetime).toBeGreaterThan(NINETY_DAYS_MS - TOLERANCE_MS);
    expect(lifetime).toBeLessThan(NINETY_DAYS_MS + TOLERANCE_MS);
  });
});
