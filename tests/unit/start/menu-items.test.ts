import { describe, expect, it } from "vitest";
import { menuItems } from "@/app/(resident)/menu-items";

describe("menuItems (start-screen design.md Decision 10)", () => {
  it("household_admin (both true): Mitglieder + Organisation", () => {
    const items = menuItems({ organisation: true, membersList: true });
    expect(items.map((i) => i.key)).toEqual(["people", "organisation"]);
    expect(items[0].href).toBe("/members");
  });

  it("moderator (both true): Mitglieder + Organisation", () => {
    const items = menuItems({ organisation: true, membersList: true });
    expect(items.map((i) => i.key)).toEqual(["people", "organisation"]);
  });

  it("a member with any permission: Wer hier wohnt + Organisation, never both list links", () => {
    const items = menuItems({ organisation: true, membersList: false });
    expect(items.map((i) => i.key)).toEqual(["people", "organisation"]);
    expect(items[0].href).toBe("/who-lives-here");
  });

  it("a plain member: only Wer hier wohnt, no Organisation", () => {
    const items = menuItems({ organisation: false, membersList: false });
    expect(items.map((i) => i.key)).toEqual(["people"]);
    expect(items[0].href).toBe("/who-lives-here");
  });
});
