import { describe, expect, it } from "vitest";
import { assertTrustedIpHeaderConfigured } from "@/app/(auth)/join/[code]/request-ip";

describe("assertTrustedIpHeaderConfigured", () => {
  it("throws in production when the header is unset", () => {
    expect(() => assertTrustedIpHeaderConfigured({ NODE_ENV: "production" })).toThrow(
      /JOIN_ATTEMPT_TRUSTED_IP_HEADER/,
    );
  });

  it("throws in production when the header is only whitespace", () => {
    expect(() =>
      assertTrustedIpHeaderConfigured({
        NODE_ENV: "production",
        JOIN_ATTEMPT_TRUSTED_IP_HEADER: "   ",
      }),
    ).toThrow(/JOIN_ATTEMPT_TRUSTED_IP_HEADER/);
  });

  it("accepts a named header in production", () => {
    expect(() =>
      assertTrustedIpHeaderConfigured({
        NODE_ENV: "production",
        JOIN_ATTEMPT_TRUSTED_IP_HEADER: "x-vercel-forwarded-for",
      }),
    ).not.toThrow();
  });

  it("accepts the shared-bucket acknowledgement when the header is unset", () => {
    expect(() =>
      assertTrustedIpHeaderConfigured({
        NODE_ENV: "production",
        JOIN_ATTEMPT_SHARED_BUCKET_OK: "1",
      }),
    ).not.toThrow();
  });

  it("allows an unset header outside production", () => {
    expect(() => assertTrustedIpHeaderConfigured({ NODE_ENV: "test" })).not.toThrow();
  });
});
