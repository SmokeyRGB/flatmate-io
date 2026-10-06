import { describe, expect, it } from "vitest";
import { INVITABLE_STATES, INVITE_PERMISSION, inviteText, showInvite } from "@/app/(org)/rounds/[id]/applications/invite-text";
import { de } from "@/ui/strings";

// F5 candidate-invite: the pure example text and the O5 visibility rule. Every string is read from
// `de`, never typed here. The text carries no privacy notice (human decision 2026-10-06).
const n = de.applications.notice;
const count = (haystack: string, needle: string) => haystack.split(needle).length - 1;

describe("inviteText", () => {
  it("greets by name with exactly one greeting, and is the whole invitation text", () => {
    const text = inviteText("Lea");
    expect(text).toBe(de.invite.text({ name: "Lea" }));
    expect(count(text, "Hey")).toBe(1);
  });

  it("carries neither the Art. 13 notice, nor the Art. 14 notice, nor the deadline sentence", () => {
    const text = inviteText("Lea");
    expect(text).not.toContain(n.applicantText);
    // A distinctive opening slice of the Art. 14 text, with its placeholders filled by anything.
    const third = n.thirdPartyText({ name: "Lea", household: "WG", categories: n.categories.name });
    expect(text).not.toContain(third.slice(0, 30));
    expect(text).not.toContain(n.deadlineLine("Lea", "01.01.2026").slice(0, 20));
    expect(text).not.toContain(n.deadlinePassed("01.01.2026").slice(0, 20));
  });

  it("a blank name falls back to the placeholder", () => {
    expect(inviteText("  ")).toBe(de.invite.text({ name: n.nameFallback }));
    expect(inviteText("")).toContain(`Hey ${n.nameFallback}`);
  });
});

describe("showInvite (O5)", () => {
  it("is true for new and screened with the permission", () => {
    expect(showInvite(true, "new")).toBe(true);
    expect(showInvite(true, "screened")).toBe(true);
  });

  it("is false for invited and rejected_by_household", () => {
    expect(showInvite(true, "invited")).toBe(false);
    expect(showInvite(true, "rejected_by_household")).toBe(false);
  });

  it("is false without the permission", () => {
    expect(showInvite(false, "new")).toBe(false);
    expect(showInvite(false, "screened")).toBe(false);
  });
});

// Review (code-review high): which permission decides the button is wiring in two server pages,
// which render tests cannot reach. Pin the constant to the declared rule, and both pages to the
// constant, so a wrong permission or a swapped flag fails here instead of offering „Einladen" to
// someone the repository would refuse.
describe("the permission behind „Einladen“", () => {
  it("is what the declared rows into invited require", async () => {
    const { TRANSITION_RULES } = await import("@/modules/casting/transitions");
    for (const key of ["new->screened", "screened->invited"] as const) {
      const rule = TRANSITION_RULES.get(key);
      expect(rule?.kind).toBe("state_only");
      expect(rule && "requires" in rule ? rule.requires : []).toContain(INVITE_PERMISSION);
    }
    expect([...INVITABLE_STATES]).toEqual(["new", "screened"]);
  });

  it("is the one both pages ask for, and O5 feeds it (not the edit right) to showInvite", async () => {
    const { readFileSync } = await import("node:fs");
    const { join } = await import("node:path");
    const root = join(__dirname, "..", "..", "..", "src", "app");
    const board = readFileSync(join(root, "(resident)", "casting", "page.tsx"), "utf8");
    const o5 = readFileSync(
      join(root, "(org)", "rounds", "[id]", "applications", "[applicationId]", "page.tsx"),
      "utf8",
    );
    expect(board).toMatch(/holdsPermission\(current\.context, INVITE_PERMISSION\)/);
    expect(o5).toMatch(/holdsPermission\(context, INVITE_PERMISSION\)/);
    expect(o5).toMatch(/const \[householdRow, canEdit, canChangeState\]/);
    expect(o5).toMatch(/showInvite\(canChangeState, application\.state\)/);
  });
});
