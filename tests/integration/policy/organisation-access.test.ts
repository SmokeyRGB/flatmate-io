import { afterEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { SessionContext } from "@/db/session-context";
import { claimResidentProfile } from "@/modules/identity/auth";
import { createResidentProfile, setMemberRole } from "@/modules/identity/repository";
import { de } from "@/ui/strings";
import {
  cleanupAll,
  deleteTestAccount,
  registerTestHousehold,
  type TestHousehold,
} from "../../helpers/identity";

// F3 change 2b (identity/member-administration, "The organisation area is reached only with an
// organisation permission"; design D9), tasks 7.7a. Every page of the organisation area checks the
// caller's STORED permissions on each request. Each page is rendered as a server component with a
// session whose context the test chooses; the identity repository is the real one, against the
// database. next/headers and next/navigation do not exist outside a Next server, so they are stubbed.
vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({ cookies: vi.fn(), headers: vi.fn(async () => new Headers({ host: "example.test" })) }));
vi.mock("next/navigation", () => ({
  redirect: vi.fn(),
  notFound: vi.fn(),
}));

const session = vi.hoisted(() => ({ context: null as null | SessionContext }));
vi.mock("@/modules/identity/session-cookie", () => ({
  getCurrentSession: vi.fn(async () => (session.context ? { sessionId: "test", context: session.context } : null)),
}));

// The server actions are imported by the pages' client forms; they need the Next runtime, so they
// are stubbed (this file renders, it does not submit).
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
vi.mock("@/app/(org)/rooms/actions", () => ({
  createRoomAction: vi.fn(),
  removeRoomAction: vi.fn(),
  renameRoomAction: vi.fn(),
  transitionRoomAction: vi.fn(),
}));
vi.mock("@/app/(org)/settings/actions", () => ({ updateSettingsAction: vi.fn() }));
vi.mock("@/app/(org)/rounds/new/actions", () => ({ createAndOpenRoundAction: vi.fn() }));
vi.mock("@/app/(org)/rounds/[id]/applications/new/actions", () => ({ captureApplicationAction: vi.fn() }));
vi.mock("@/app/(org)/rounds/[id]/applications/[applicationId]/edit/actions", () => ({ updateApplicationAction: vi.fn() }));
vi.mock("@/app/(org)/rounds/[id]/applications/invite-actions", () => ({ inviteApplicationAction: vi.fn() }));

const { requireOrganisationAccess } = await import("@/app/(org)/organisation-access");
const { default: OrganizationPage } = await import("@/app/(org)/organization/page");
const { default: MembersPage } = await import("@/app/(org)/members/page");
const { default: RoomsPage } = await import("@/app/(org)/rooms/page");
const { default: SettingsPage } = await import("@/app/(org)/settings/page");
const { default: NewRoundPage } = await import("@/app/(org)/rounds/new/page");
const { default: CaptureApplicationPage } = await import("@/app/(org)/rounds/[id]/applications/new/page");
const { default: ApplicationDetailPage } = await import("@/app/(org)/rounds/[id]/applications/[applicationId]/page");
const { default: EditApplicationPage } = await import("@/app/(org)/rounds/[id]/applications/[applicationId]/edit/page");

let hh: TestHousehold | undefined;
const accountIds: string[] = [];

afterEach(async () => {
  session.context = null;
  await cleanupAll(...accountIds.map(deleteTestAccount), hh?.cleanup());
  accountIds.length = 0;
  hh = undefined;
});

async function claim(household: TestHousehold, name: string) {
  const actor = { accountId: household.accountId, profileId: null };
  const profile = await createResidentProfile(household.context, name, actor);
  const { accountId } = await claimResidentProfile(household.context, profile.id, "test-password-not-real-1234");
  accountIds.push(accountId);
  return {
    accountId,
    profileId: profile.id,
    context: { accountId, householdId: household.householdId, profileId: profile.id } as SessionContext,
  };
}

const ID = "33333333-3333-3333-3333-333333333333";
const APPLICATION_ID = "44444444-4444-4444-4444-444444444444";

// Every page of the area, rendered with the current session. rounds/[id] is deliberately absent: it
// is exempt (FR-1.19 promises its participant list to every participating resident, pre-mortem H3).
const PAGES: Record<string, () => Promise<unknown>> = {
  organization: () => OrganizationPage({ searchParams: Promise.resolve({}) }),
  members: () => MembersPage(),
  rooms: () => RoomsPage(),
  settings: () => SettingsPage({ searchParams: Promise.resolve({}) }),
  "rounds/new": () => NewRoundPage(),
  "rounds/[id]/applications/new": () => CaptureApplicationPage({ params: Promise.resolve({ id: ID }) }),
  "rounds/[id]/applications/[applicationId]": () =>
    ApplicationDetailPage({ params: Promise.resolve({ id: ID, applicationId: APPLICATION_ID }) }),
  "rounds/[id]/applications/[applicationId]/edit": () =>
    EditApplicationPage({ params: Promise.resolve({ id: ID, applicationId: APPLICATION_ID }) }),
};

async function html(page: () => Promise<unknown>): Promise<string> {
  return renderToStaticMarkup((await page()) as Parameters<typeof renderToStaticMarkup>[0]);
}

// Every page shows the organisation area's access message, except the members page, which keeps
// its own refusal with the pointer to /who-lives-here for a resident (FR-1.31; code review
// 2026-10-02). Both render no organisation content.
function expectRefused(name: string, markup: string) {
  if (name === "members") {
    expect(markup, name).toContain(de.members.accessDeniedBody);
    expect(markup, name).toContain('href="/who-lives-here"');
  } else {
    expect(markup, name).toContain(de.org.accessDenied.body);
    expect(markup, name).toContain('href="/dashboard"');
  }
}

describe("the organisation area is reached only with an organisation permission", () => {
  it("(a) a plain resident: the helper is false, and every page shows the access message and nothing else", async () => {
    hh = await registerTestHousehold();
    const resident = await claim(hh, "PlainResident");
    session.context = resident.context;

    expect(await requireOrganisationAccess({ context: resident.context })).toBe(false);
    for (const [name, page] of Object.entries(PAGES)) {
      expectRefused(name, await html(page));
    }
  });

  it("(b) a moderator has access; after a demotion the next request (a fresh context read) has none, with no sign-in in between", async () => {
    hh = await registerTestHousehold();
    const moderator = await claim(hh, "Moderator");
    await setMemberRole(hh.context, hh.accountId, moderator.accountId, "moderator");
    session.context = moderator.context;

    expect(await requireOrganisationAccess({ context: moderator.context })).toBe(true);
    expect(await html(PAGES.organization)).not.toContain(de.org.accessDenied.body);

    await setMemberRole(hh.context, hh.accountId, moderator.accountId, "member");

    // The same session cookie, a new request: the page reads the stored permissions again.
    expect(await requireOrganisationAccess({ context: moderator.context })).toBe(false);
    for (const [name, page] of Object.entries(PAGES)) {
      expectRefused(name, await html(page));
    }
  });

  it("(c) the household account is offered rooms, members and settings, not opening a round; a moderator rooms, members and opening a round, not settings", async () => {
    hh = await registerTestHousehold();
    const moderator = await claim(hh, "Moderator");
    await setMemberRole(hh.context, hh.accountId, moderator.accountId, "moderator");

    session.context = hh.context;
    expect(await requireOrganisationAccess({ context: hh.context })).toBe(true);
    const asHousehold = await html(PAGES.organization);
    expect(asHousehold).toContain('href="/rooms"');
    expect(asHousehold).toContain('href="/members"');
    expect(asHousehold).toContain('href="/settings"');
    expect(asHousehold).not.toContain('href="/rounds/new"');

    session.context = moderator.context;
    const asModerator = await html(PAGES.organization);
    expect(asModerator).toContain('href="/rooms"');
    expect(asModerator).toContain('href="/members"');
    expect(asModerator).toContain('href="/rounds/new"');
    expect(asModerator).not.toContain('href="/settings"');
  });

  // Deliberate break (task 7.7a, to run after 0029 reaches dev): cache getNavigationAccess at module
  // level (not per request) and (b) fails: the demoted moderator's second read returns the cached true.
});
