import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { ResidentListResult } from "@/modules/identity/repository";
import { de } from "@/ui/strings";

// role-permissions design D6, task 5.4: the members screen decides what to show from the five
// capability flags alone. MembersView is the pure component behind page.tsx, so each flag set
// renders without a session. The server actions are stubbed: this file renders, it does not submit.
vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({ cookies: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
vi.mock("@/app/(org)/members/actions", () => ({
  createResidentProfileAction: vi.fn(),
  extendJoinCodeAction: vi.fn(),
  issueJoinCodeAction: vi.fn(),
  issueJoinCodeForProfileAction: vi.fn(),
  issuePasswordResetLinkAction: vi.fn(),
  reactivateMemberAction: vi.fn(),
  setMemberRoleAction: vi.fn(),
  setMovedOutAction: vi.fn(),
  removeMemberAction: vi.fn(),
  removePreparedProfileAction: vi.fn(),
  deleteJoinCodeAction: vi.fn(),
}));

const { MembersView } = await import("@/app/(org)/members/members-view");

type Flags = Pick<
  ResidentListResult,
  "canManageMembers" | "canManageJoinCodes" | "canCreateProfile" | "canAppointModerator" | "canIssueResetLink"
>;
const NONE: Flags = {
  canManageMembers: false,
  canManageJoinCodes: false,
  canCreateProfile: false,
  canAppointModerator: false,
  canIssueResetLink: false,
};

const NOW = new Date("2026-10-02T12:00:00Z");

// One of each row the controls depend on: an active moderator and an active member (neither with an
// email), a moved-out member, and a prepared profile with no account.
const members: ResidentListResult["members"] = [
  { id: "p1", accountId: "a1", displayName: "Mona Moderation", joinDate: null, status: "active", contactDetail: null, role: "moderator", hasEmail: false },
  { id: "p2", accountId: "a2", displayName: "Max Mitglied", joinDate: null, status: "active", contactDetail: null, role: "member", hasEmail: false },
  { id: "p3", accountId: "a3", displayName: "Uli Ausgezogen", joinDate: null, status: "moved_out", contactDetail: null, role: "member", hasEmail: false },
  { id: "p4", accountId: null, displayName: "Vera Vorbereitet", joinDate: null, status: "prepared", contactDetail: null, role: null, hasEmail: false },
];

const liveIssuance = {
  id: "i1",
  householdId: "h1",
  code: "ABCDE-FGHJK",
  expiresAt: new Date("2026-10-09T12:00:00Z"),
  maxUses: 1,
  uses: 0,
  createdAt: NOW,
  createdByAccountId: "a1",
  deletedAt: null,
  residentProfileId: null,
  purpose: "join" as const,
  isFoundingLink: false,
  joinedResidentNames: [],
  hasRemovedJoiner: false,
};

function render(flags: Flags): string {
  const residentList: ResidentListResult = { members, ...flags, leadWithJoinCode: false };
  return renderToStaticMarkup(
    createElement(MembersView, {
      residentList,
      joinCodeIssuances: flags.canManageJoinCodes ? [liveIssuance] : [],
      host: "example.test",
      now: NOW,
      callerIsHouseholdAccount: true,
    }),
  );
}

// The marker text of each control, from src/ui/strings (never a German literal copied here).
const CONTROLS = {
  canCreateProfile: [de.members.addResidentSubmit],
  canAppointModerator: [de.members.makeModerator, de.members.makeMember],
  canManageMembers: [de.members.markMovedOut, de.common.reactivate, de.members.remove.buttonLabel, de.members.deletePrepared],
  canManageJoinCodes: [de.members.joinCode.heading, de.members.joinCode.create.submit, de.members.joinCode.issueForProfile, de.members.joinCode.extend],
  canIssueResetLink: [de.members.joinCode.issueResetLink],
} as const;
type FlagName = keyof typeof CONTROLS;

function expectOnlyControlsOf(html: string, set: readonly FlagName[]) {
  for (const flag of Object.keys(CONTROLS) as FlagName[]) {
    for (const marker of CONTROLS[flag]) {
      if (set.includes(flag)) expect(html, `${flag}: ${marker}`).toContain(marker);
      else expect(html, `${flag}: ${marker}`).not.toContain(marker);
    }
  }
}

describe("the members screen offers each control exactly when its flag is set", () => {
  it("household: all five flags, every control", () => {
    const flags: Flags = { canManageMembers: true, canManageJoinCodes: true, canCreateProfile: true, canAppointModerator: true, canIssueResetLink: true };
    expectOnlyControlsOf(render(flags), ["canCreateProfile", "canAppointModerator", "canManageMembers", "canManageJoinCodes", "canIssueResetLink"]);
  });

  it("moderator: every control but the reset link", () => {
    const flags: Flags = { canManageMembers: true, canManageJoinCodes: true, canCreateProfile: true, canAppointModerator: true, canIssueResetLink: false };
    expectOnlyControlsOf(render(flags), ["canCreateProfile", "canAppointModerator", "canManageMembers", "canManageJoinCodes"]);
  });

  it.each(Object.keys(CONTROLS) as FlagName[])("only %s: only its controls", (flag) => {
    expectOnlyControlsOf(render({ ...NONE, [flag]: true }), [flag]);
  });

  it("no flag: the list of names, and no control", () => {
    const html = render(NONE);
    expectOnlyControlsOf(html, []);
    expect(html).toContain("Max Mitglied");
  });

  it("the badge describes the listed member, whatever the caller may do", () => {
    expect(render(NONE)).toContain(de.members.moderationBadge);
  });

  it("a prepared profile (no account) can be deleted by whoever holds manage_members", () => {
    const html = render({ ...NONE, canManageMembers: true });
    expect(html).toContain(de.members.deletePrepared);
  });

  // Removal is terminal, so the button only opens a confirmation dialog (like deleting a link).
  it("deleting a prepared profile asks first, naming the profile", () => {
    const html = render({ ...NONE, canManageMembers: true });
    expect(html).toContain(de.members.deletePreparedDialog.heading);
    expect(html).toContain(de.members.deletePreparedDialog.consequence("Vera Vorbereitet"));
    expect(html).toContain(de.common.cancel);
  });
});

// Walkthrough 2026-10-05: an old, already deleted reset link was shown on the row as if usable.
describe("the reset link on a member row", () => {
  type Issuance = Parameters<typeof MembersView>[0]["joinCodeIssuances"][number];
  const resetIssuance = (over: Partial<Issuance>): Issuance => ({
    ...liveIssuance,
    id: "r1",
    code: "74R2S-988RD",
    residentProfileId: "p2",
    purpose: "password_reset" as const,
    ...over,
  });
  const renderWith = (issuances: Issuance[], list = members) =>
    renderToStaticMarkup(
      createElement(MembersView, {
        residentList: { members: list, ...NONE, canIssueResetLink: true, leadWithJoinCode: false },
        joinCodeIssuances: issuances,
        host: "example.test",
        now: NOW,
        callerIsHouseholdAccount: true,
      }),
    );

  it("shows a live reset link", () => {
    expect(renderWith([resetIssuance({})])).toContain("74R2S-988RD");
  });

  it.each([
    ["deleted", { deletedAt: new Date("2026-09-25T10:00:00Z") }],
    ["expired", { expiresAt: new Date("2026-10-01T10:00:00Z") }],
    ["used up", { uses: 1 }],
  ])("does not reveal a %s reset link", (_name, over) => {
    const html = renderWith([resetIssuance(over)]);
    expect(html).not.toContain("74R2S-988RD");
    expect(html).not.toContain(de.members.joinCode.resetLinkIssuedHeading);
  });

  it("a dead newer link does not hide an older live one", () => {
    const html = renderWith([
      resetIssuance({ id: "r2", code: "DEADD-DEADD", deletedAt: new Date("2026-10-02T10:00:00Z") }),
      resetIssuance({ id: "r1" }),
    ]);
    expect(html).toContain("74R2S-988RD");
    expect(html).not.toContain("DEADD-DEADD");
  });

  it("explains why a member with an email has no reset button", () => {
    const withEmail = members.map((m) => (m.id === "p2" ? { ...m, hasEmail: true } : m));
    const html = renderWith([], withEmail);
    expect(html).toContain(de.members.joinCode.resetLinkNotNeeded);
  });
});

// A native <dialog> has no accessible name of its own: each one must point at its heading with
// aria-labelledby, and that id must exist exactly once and carry text (PR #50 review).
describe("every confirmation dialog on the members screen has an accessible name", () => {
  const dialogs = (html: string) => [...html.matchAll(/<dialog\b([^>]*)>/g)].map((m) => m[1]);

  it("delete-prepared, remove-member and delete-join-code: aria-labelledby resolves to a non-empty, unique heading", () => {
    const html = render({ canManageMembers: true, canManageJoinCodes: true, canCreateProfile: true, canAppointModerator: true, canIssueResetLink: true });
    const found = dialogs(html);
    // one per prepared profile, per removable member and per live join code
    expect(found.length).toBeGreaterThanOrEqual(3);
    const names = new Set<string>();
    for (const attrs of found) {
      const labelledBy = /aria-labelledby="([^"]+)"/.exec(attrs)?.[1];
      expect(labelledBy, `<dialog${attrs}> has no aria-labelledby`).toBeTruthy();
      const heading = [...html.matchAll(new RegExp(`<h2[^>]* id="${labelledBy}"[^>]*>([^<]+)</h2>`, "g"))];
      expect(heading, `id ${labelledBy} must label exactly one heading`).toHaveLength(1);
      expect(heading[0][1].trim()).not.toBe("");
      names.add(heading[0][1].trim());
    }
    expect(names).toContain(de.members.deletePreparedDialog.heading);
    expect(names).toContain(de.members.joinCode.deleteDialog.heading);
    expect(names).toContain(de.members.remove.dialogHeading("Max Mitglied"));
  });
});

describe("the members screen with no resident yet", () => {
  it("leads with the add-resident form, before the join-link section", () => {
    const html = renderToStaticMarkup(
      createElement(MembersView, {
        residentList: {
          members: [],
          canManageMembers: true,
          canManageJoinCodes: true,
          canCreateProfile: true,
          canAppointModerator: true,
          canIssueResetLink: true,
          leadWithJoinCode: true,
        },
        joinCodeIssuances: [],
        host: "example.test",
        now: NOW,
        callerIsHouseholdAccount: true,
      }),
    );
    const form = html.indexOf(de.members.addResidentSubmit);
    const links = html.indexOf(de.members.joinCode.heading);
    expect(form).toBeGreaterThan(-1);
    expect(links).toBeGreaterThan(-1);
    expect(form).toBeLessThan(links);
  });
});

// founding-link-moderator D4: the founder's own link is named while it can still be used.
describe("the founding link on the members screen", () => {
  type Issuance = Parameters<typeof MembersView>[0]["joinCodeIssuances"][number];
  const founding = (over: Partial<Issuance>): Issuance => ({
    ...liveIssuance,
    id: "f1",
    code: "FOUND-1NGCD",
    isFoundingLink: true,
    ...over,
  });
  const renderWith = (issuances: Issuance[], callerIsHouseholdAccount = true) =>
    renderToStaticMarkup(
      createElement(MembersView, {
        residentList: { members, ...NONE, canManageJoinCodes: true, leadWithJoinCode: false },
        joinCodeIssuances: issuances,
        host: "example.test",
        now: NOW,
        callerIsHouseholdAccount,
      }),
    );

  it("labels a live founding link, hints that it is only for the founder, and links it with a plain anchor", () => {
    const html = renderWith([founding({})]);
    expect(html).toContain(de.members.joinCode.foundingLinkLabel);
    expect(html).toContain(de.members.joinCode.foundingLinkHint);
    expect(html).toContain('<a href="/join/FOUND-1NGCD"');
  });

  it.each([
    ["used", { uses: 1 }],
    ["deleted", { deletedAt: new Date("2026-10-01T10:00:00Z") }],
    ["expired", { expiresAt: new Date("2026-10-01T10:00:00Z") }],
  ])("does not label a %s founding link", (_name, over) => {
    const html = renderWith([founding(over)]);
    expect(html).not.toContain(de.members.joinCode.foundingLinkLabel);
    expect(html).not.toContain(de.members.joinCode.foundingLinkHint);
    expect(html).not.toContain('<a href="/join/FOUND-1NGCD"');
  });

  it("the household account sees the founder copy", () => {
    const html = renderWith([founding({})], true);
    expect(html).toContain(de.members.joinCode.foundingLinkLabel);
    expect(html).toContain(de.members.joinCode.foundingLinkHint);
    expect(html).not.toContain(de.members.joinCode.foundingLinkHintNeutral);
  });

  it("a moderator sees caller-neutral copy, never the founder's own", () => {
    const html = renderWith([founding({})], false);
    expect(html).toContain(de.members.joinCode.foundingLinkLabelNeutral);
    expect(html).toContain(de.members.joinCode.foundingLinkHintNeutral);
    expect(html).not.toContain(de.members.joinCode.foundingLinkLabel);
    expect(html).not.toContain(de.members.joinCode.foundingLinkHint);
  });

  it("a household with only a live founding link shows no generic warning", () => {
    const html = renderWith([founding({})]);
    expect(html).not.toContain(de.members.joinCode.warning);
    expect(html).toContain(de.members.joinCode.foundingLinkHint);
  });

  it("keeps the generic warning when an ordinary live link is listed too, and the founding hint still shows", () => {
    const html = renderWith([founding({}), liveIssuance]);
    expect(html).toContain(de.members.joinCode.warning);
    expect(html).toContain(de.members.joinCode.foundingLinkHint);
  });

  it("shows the generic warning when no link is live, even if a dead founding link is listed", () => {
    const html = renderWith([founding({ uses: 1 })]);
    expect(html).toContain(de.members.joinCode.warning);
  });

  it("does not label an ordinary link", () => {
    const html = renderWith([liveIssuance]);
    expect(html).not.toContain(de.members.joinCode.foundingLinkLabel);
    expect(html).not.toContain(de.members.joinCode.foundingLinkHint);
  });
});
