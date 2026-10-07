import { describe, expect, it } from "vitest";
import { preferredLocale } from "@/ui/strings/accept-language";

describe("preferredLocale", () => {
  it("ranks by q-value", () => {
    expect(preferredLocale("de;q=0.5, en;q=0.9")).toBe("en");
    expect(preferredLocale("en;q=0.4, de;q=0.8")).toBe("de");
  });

  it("matches a regional subtag by its primary language", () => {
    expect(preferredLocale("en-GB")).toBe("en");
    expect(preferredLocale("de-AT,en;q=0.5")).toBe("de");
  });

  it("answers German for an absent header", () => {
    expect(preferredLocale(null)).toBe("de");
    expect(preferredLocale("")).toBe("de");
  });

  it("answers German when neither language is present", () => {
    expect(preferredLocale("fr, es;q=0.8")).toBe("de");
  });

  it("answers German for malformed input", () => {
    expect(preferredLocale(";;;,,q=")).toBe("de");
    expect(preferredLocale("en;q=abc")).toBe("en");
    expect(preferredLocale("*")).toBe("de");
  });

  it("takes the first of two equally ranked entries", () => {
    expect(preferredLocale("en, de")).toBe("en");
    expect(preferredLocale("de, en")).toBe("de");
  });
});
