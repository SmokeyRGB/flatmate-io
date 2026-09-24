import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { landingPathFor } from "@/app/landing";

describe("landingPathFor (start-screen design.md Decision 3)", () => {
  it("(a) gives /settings for profileId: null and /dashboard otherwise", () => {
    expect(
      landingPathFor({ accountId: "a", householdId: "h", profileId: null }),
    ).toBe("/settings");
    expect(
      landingPathFor({ accountId: "a", householdId: "h", profileId: "p" }),
    ).toBe("/dashboard");
  });
});

// (b): a source-level check over the six landing sites — same precedent as
// tests/unit/identity/join-code-never-in-query-or-log.test.ts, which reads sources rather than
// rendering them.
const ROOT = join(__dirname, "..", "..", "..");
const SITES = {
  page: join(ROOT, "src", "app", "page.tsx"),
  signIn: join(ROOT, "src", "app", "(auth)", "sign-in", "actions.ts"),
  register: join(ROOT, "src", "app", "(auth)", "register", "actions.ts"),
  joinActions: join(ROOT, "src", "app", "(auth)", "join", "[code]", "actions.ts"),
  joinPage: join(ROOT, "src", "app", "(auth)", "join", "[code]", "page.tsx"),
  residentLayout: join(ROOT, "src", "app", "(resident)", "layout.tsx"),
};

function read(path: string): string {
  return readFileSync(path, "utf8");
}

describe("the six landing sites (design.md Decision 3 table)", () => {
  it("no redirect(\"/dashboard?note=…\") literal remains anywhere in src/app", () => {
    for (const path of Object.values(SITES)) {
      expect(read(path)).not.toMatch(/redirect\(["'`]\/dashboard\?note=/);
    }
  });

  it("sign-in/actions.ts and page.tsx import landingPathFor", () => {
    expect(read(SITES.page)).toMatch(/landingPathFor/);
    expect(read(SITES.signIn)).toMatch(/landingPathFor/);
  });

  it("register/actions.ts no longer redirects to /dashboard", () => {
    expect(read(SITES.register)).not.toMatch(/redirect\(["'`]\/dashboard["'`]\)/);
  });
});
