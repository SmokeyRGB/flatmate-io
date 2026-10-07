import { describe, expect, it } from "vitest";
import { menuItems } from "@/app/_frame/menu-items";

describe("menuItems (start-screen design.md Decision 10, unified-app-header D3)", () => {
  it("household account on an organisation screen (no profile): only Mitglieder, no switch row", () => {
    const items = menuItems({ dashboard: false, organisation: true, membersList: true }, "organisation");
    expect(items.map((i) => i.key)).toEqual(["people"]);
    expect(items[0].href).toBe("/members");
  });

  it("moderator on a resident screen: Mitglieder + Zur Organisation, no Dashboard", () => {
    const items = menuItems({ dashboard: true, organisation: true, membersList: true }, "resident");
    expect(items.map((i) => i.key)).toEqual(["people", "organisation"]);
  });

  it("moderator on an organisation screen: Zum Dashboard first, no Zur Organisation", () => {
    const items = menuItems({ dashboard: true, organisation: true, membersList: true }, "organisation");
    expect(items.map((i) => i.key)).toEqual(["dashboard", "people"]);
    expect(items[0].href).toBe("/dashboard");
  });

  it("a member with any permission on a resident screen: Wer hier wohnt + Zur Organisation, never both list links", () => {
    const items = menuItems({ dashboard: true, organisation: true, membersList: false }, "resident");
    expect(items.map((i) => i.key)).toEqual(["people", "organisation"]);
    expect(items[0].href).toBe("/who-lives-here");
  });

  it("a plain member (dashboard false): only Wer hier wohnt, on either surface", () => {
    for (const surface of ["resident", "organisation"] as const) {
      const items = menuItems({ dashboard: false, organisation: false, membersList: false }, surface);
      expect(items.map((i) => i.key)).toEqual(["people"]);
      expect(items[0].href).toBe("/who-lives-here");
    }
  });
});
