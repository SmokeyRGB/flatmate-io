import { describe, expect, it } from "vitest";
import { menuItems } from "@/app/_frame/menu-items";

describe("menuItems (start-screen design.md Decision 10, unified-app-header D3)", () => {
  it("household account (no profile, dashboard false): Mitglieder + Organisation, no Dashboard", () => {
    const items = menuItems({ dashboard: false, organisation: true, membersList: true });
    expect(items.map((i) => i.key)).toEqual(["people", "organisation"]);
    expect(items[0].href).toBe("/members");
  });

  it("moderator with a profile: Dashboard first, then Mitglieder + Organisation", () => {
    const items = menuItems({ dashboard: true, organisation: true, membersList: true });
    expect(items.map((i) => i.key)).toEqual(["dashboard", "people", "organisation"]);
    expect(items[0].href).toBe("/dashboard");
  });

  it("a member with any permission and a profile: Dashboard + Wer hier wohnt + Organisation, never both list links", () => {
    const items = menuItems({ dashboard: true, organisation: true, membersList: false });
    expect(items.map((i) => i.key)).toEqual(["dashboard", "people", "organisation"]);
    expect(items[1].href).toBe("/who-lives-here");
  });

  it("a plain member (dashboard false): only Wer hier wohnt, no Dashboard, no Organisation", () => {
    const items = menuItems({ dashboard: false, organisation: false, membersList: false });
    expect(items.map((i) => i.key)).toEqual(["people"]);
    expect(items[0].href).toBe("/who-lives-here");
  });
});
