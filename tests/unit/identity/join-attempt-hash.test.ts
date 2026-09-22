import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { hashSessionToken, joinAttemptSourceHash } from "@/modules/identity/auth";

// design.md Decision 3 (FR-2.28): joinAttemptSourceHash is the join route's rate-limit key — an
// HMAC of the client IP, domain-separated from hashSessionToken's digests by a "join-attempt:"
// prefix on the message, reusing SESSION_TOKEN_HASH_SECRET rather than a second secret.
describe("joinAttemptSourceHash", () => {
  const originalSecret = process.env.SESSION_TOKEN_HASH_SECRET;

  beforeEach(() => {
    process.env.SESSION_TOKEN_HASH_SECRET = "test-secret";
  });

  afterEach(() => {
    if (originalSecret === undefined) {
      delete process.env.SESSION_TOKEN_HASH_SECRET;
    } else {
      process.env.SESSION_TOKEN_HASH_SECRET = originalSecret;
    }
  });

  it("is deterministic for the same IP", () => {
    expect(joinAttemptSourceHash("203.0.113.1")).toBe(joinAttemptSourceHash("203.0.113.1"));
  });

  it("differs for different IPs", () => {
    expect(joinAttemptSourceHash("203.0.113.1")).not.toBe(joinAttemptSourceHash("203.0.113.2"));
  });

  it("yields a stable, non-empty key when no IP is available — never a bypass", () => {
    const missing = joinAttemptSourceHash(null);
    expect(missing).toMatch(/^[0-9a-f]{64}$/);
    expect(missing).toBe(joinAttemptSourceHash(null)); // same shared bucket every time
  });

  it("differs from hashSessionToken's digest of the same input string", () => {
    const input = "203.0.113.1";
    expect(joinAttemptSourceHash(input)).not.toBe(hashSessionToken(input));
  });

  it("throws if SESSION_TOKEN_HASH_SECRET is not configured", () => {
    delete process.env.SESSION_TOKEN_HASH_SECRET;
    expect(() => joinAttemptSourceHash("203.0.113.1")).toThrow(/SESSION_TOKEN_HASH_SECRET/);
  });
});
