import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { hashSessionToken } from "@/modules/identity/auth";

// auth-tokenhash-not-hashed: Session.token_hash must be a one-way digest of the access token,
// never the token (or a substring of it) itself — docs/GUARDRAILS.md's "nur der Hash" rule.
describe("hashSessionToken", () => {
  const originalSecret = process.env.SESSION_TOKEN_HASH_SECRET;

  beforeEach(() => {
    process.env.SESSION_TOKEN_HASH_SECRET = "test-secret";
  });

  afterEach(() => {
    process.env.SESSION_TOKEN_HASH_SECRET = originalSecret;
  });

  it("is deterministic for the same token", () => {
    const token = "a.b.c-fake-jwt-access-token";
    expect(hashSessionToken(token)).toBe(hashSessionToken(token));
  });

  it("differs for different tokens", () => {
    expect(hashSessionToken("token-one")).not.toBe(hashSessionToken("token-two"));
  });

  it("never contains the source token as a substring", () => {
    const token = "super-secret-bearer-token-value";
    expect(hashSessionToken(token)).not.toContain(token);
    expect(hashSessionToken(token)).not.toContain(token.slice(-32));
  });

  it("produces a fixed-length hex digest (HMAC-SHA256), not a token slice", () => {
    expect(hashSessionToken("x")).toMatch(/^[0-9a-f]{64}$/);
  });

  it("throws if SESSION_TOKEN_HASH_SECRET is not configured", () => {
    delete process.env.SESSION_TOKEN_HASH_SECRET;
    expect(() => hashSessionToken("token")).toThrow(/SESSION_TOKEN_HASH_SECRET/);
  });
});
