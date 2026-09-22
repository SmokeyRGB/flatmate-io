import { afterEach, describe, expect, it } from "vitest";
import { getClientIp } from "@/app/(auth)/join/[code]/request-ip";

// Second review of PR #17: the first version read x-forwarded-for's LEFTMOST entry, which the
// caller supplies. Rotating it gave a fresh rate-limit bucket per request and bypassed FR-2.28
// entirely — the control C-2.12 says makes the shortened code defensible. Trust is now an explicit
// deployment statement, and these are the two halves of that claim.
const VAR = "JOIN_ATTEMPT_TRUSTED_IP_HEADER";

afterEach(() => {
  delete process.env[VAR];
});

describe("Join route client-address trust (FR-2.28)", () => {
  it("believes no header at all when none is configured", () => {
    delete process.env[VAR];
    const headers = new Headers({
      "x-forwarded-for": "203.0.113.9",
      "x-real-ip": "203.0.113.9",
    });

    // null funnels into joinAttemptSourceHash's single shared bucket: the limit becomes global
    // rather than per-source, which is the conservative failure. Never the caller's own claim.
    expect(getClientIp(headers)).toBeNull();
  });

  it("takes the LAST hop of the configured header, not the caller's claim", () => {
    process.env[VAR] = "x-forwarded-for";
    // A caller prepending a forged hop: the trusted proxy appends its view of the peer on the
    // right, so the rightmost entry is the only one it vouches for.
    const headers = new Headers({ "x-forwarded-for": "1.1.1.1, 2.2.2.2, 198.51.100.7" });

    expect(getClientIp(headers)).toBe("198.51.100.7");
  });

  it("handles a single-valued trusted header", () => {
    process.env[VAR] = "x-real-ip";
    expect(getClientIp(new Headers({ "x-real-ip": "198.51.100.7" }))).toBe("198.51.100.7");
  });

  it("returns null when the configured header is absent", () => {
    process.env[VAR] = "x-vercel-forwarded-for";
    expect(getClientIp(new Headers({ "x-forwarded-for": "203.0.113.9" }))).toBeNull();
  });
});
