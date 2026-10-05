import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { joinAttemptSourceHash, signInAttemptSourceHash } from "@/modules/identity/auth";

// household-sign-in-code D5: the resident name sign-in's rate-limit key, its own bucket of
// record_join_attempt. The normalised code is in the key so that with no trusted IP header (one
// shared `null` source) the bucket is still per household.
describe("signInAttemptSourceHash", () => {
  const originalSecret = process.env.SESSION_TOKEN_HASH_SECRET;

  beforeEach(() => {
    process.env.SESSION_TOKEN_HASH_SECRET = "test-secret";
  });

  afterEach(() => {
    if (originalSecret === undefined) delete process.env.SESSION_TOKEN_HASH_SECRET;
    else process.env.SESSION_TOKEN_HASH_SECRET = originalSecret;
  });

  it("differs from the join route's key for the same IP", () => {
    expect(signInAttemptSourceHash("203.0.113.1", "ABCD-EFGH-JKLM")).not.toBe(
      joinAttemptSourceHash("203.0.113.1"),
    );
  });

  it("differs per household code, so one household's flood is not another's", () => {
    expect(signInAttemptSourceHash("203.0.113.1", "ABCD-EFGH-JKLM")).not.toBe(
      signInAttemptSourceHash("203.0.113.1", "ABCD-EFGH-JKLN"),
    );
    expect(signInAttemptSourceHash(null, "ABCD-EFGH-JKLM")).not.toBe(
      signInAttemptSourceHash(null, "ABCD-EFGH-JKLN"),
    );
  });

  it("is stable for the same (ip, code), including with ip = null", () => {
    expect(signInAttemptSourceHash(null, "ABCD-EFGH-JKLM")).toMatch(/^[0-9a-f]{64}$/);
    expect(signInAttemptSourceHash(null, "ABCD-EFGH-JKLM")).toBe(signInAttemptSourceHash(null, "ABCD-EFGH-JKLM"));
    expect(signInAttemptSourceHash("203.0.113.1", "ABCD-EFGH-JKLM")).toBe(
      signInAttemptSourceHash("203.0.113.1", "ABCD-EFGH-JKLM"),
    );
  });

  it("differs per source for the same code", () => {
    expect(signInAttemptSourceHash("203.0.113.1", "ABCD-EFGH-JKLM")).not.toBe(
      signInAttemptSourceHash("203.0.113.2", "ABCD-EFGH-JKLM"),
    );
  });
});
