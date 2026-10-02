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
    }),
  );
}

// The marker text of each control, from src/ui/strings (never a German literal copied here).
const CONTROLS = {
  canCreateProfile: [de.members.addResidentSubmit],
  canAppointModerator: [de.members.makeModerator, de.members.makeMember],
  canManageMembers: [de.members.markMovedOut, de.common.reactivate, de.members.remove.buttonLabel],
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
});
