import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { de } from "@/ui/strings";

// Design D13 (application-capture): the household account runs no rounds (03-PRD.md §4.0.1,
// S-50/U-20), so O1 offers "Runde eröffnen" only to a session that holds manage_rounds. Same mock
// shape as new-round-page-permission-guard.test.ts.
vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({ cookies: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));

const state = vi.hoisted(() => ({
  holdsManageRounds: false,
  profileId: null as string | null,
  rounds: [] as { id: string; title: string; status: string }[],
  // What listOrganisationTasks returns; the real one needs manage_rounds and no round at all.
  firstRoundTask: false,
  // What getLiveFoundingLinkPath returns (null: no live founding link, or a caller who may not see it).
  foundingPath: null as string | null,
}));

vi.mock("@/modules/identity/session-cookie", () => ({
  getCurrentSession: vi.fn(async () => ({
    context: {
      accountId: "11111111-1111-1111-1111-111111111111",
      householdId: "22222222-2222-2222-2222-222222222222",
      profileId: state.profileId,
    },
  })),
}));

vi.mock("@/modules/casting/repository", () => ({
  listRoundsForSession: vi.fn(async () => state.rounds),
  listOrganisationTasks: vi.fn(async () => (state.firstRoundTask ? [{ kind: "open_first_round" }] : [])),
}));

vi.mock("@/modules/identity/repository", async () => {
  const actual = await vi.importActual<typeof import("@/modules/identity/repository")>(
    "@/modules/identity/repository",
  );
  return {
    ...actual,
    getLiveFoundingLinkPath: vi.fn(async () => state.foundingPath),
    getNavigationAccess: vi.fn(async () => ({ organisation: true, membersList: true, rooms: true, settings: true })),
    assertHasPermission: vi.fn(async (_ctx: unknown, _accountId: string, permission: string) => {
      if (permission !== "manage_rounds" || !state.holdsManageRounds) {
        throw new actual.PermissionDeniedError(permission);
      }
    }),
  };
});

const { default: OrganizationPage } = await import("@/app/(org)/organization/page");

async function render() {
  return renderToStaticMarkup(await OrganizationPage({ searchParams: Promise.resolve({}) }));
}

describe("O1: the way to open a round is offered only to a session holding manage_rounds", () => {
  beforeEach(() => {
    state.holdsManageRounds = false;
    state.profileId = null;
    state.rounds = [];
    state.firstRoundTask = false;
    state.foundingPath = null;
  });

  it("the household account (no manage_rounds): no button, no link, and no promise of one", async () => {
    const html = await render();
    expect(html).not.toContain('href="/rounds/new"');
    expect(html).not.toContain(de.org.dashboard.openNewRound);
    expect(html).not.toContain(de.org.dashboard.openFirstRoundHeading);
    expect(html).toContain(de.org.dashboard.noRoundYetHeading);
  });

  it("the household account with a round already running: no 'another round' link either", async () => {
    state.rounds = [{ id: "33333333-3333-3333-3333-333333333333", title: "Herbst", status: "open" }];
    const html = await render();
    expect(html).not.toContain('href="/rounds/new"');
    expect(html).not.toContain(de.org.dashboard.openAnotherRound);
  });

  it("a moderator (manage_rounds): the button is there", async () => {
    state.holdsManageRounds = true;
    state.firstRoundTask = true;
    state.profileId = "44444444-4444-4444-4444-444444444444";
    const html = await render();
    expect(html).toContain('href="/rounds/new"');
    expect(html).toContain(de.org.dashboard.openNewRound);
  });

  it("the first-round task shows the featured card; without it a round-less caller sees noRoundYet", async () => {
    state.holdsManageRounds = true;
    state.firstRoundTask = true;
    let html = await render();
    expect(html).toContain(de.org.dashboard.openFirstRoundHeading);
    expect(html).not.toContain(de.org.dashboard.noRoundYetHeading);

    state.firstRoundTask = false;
    html = await render();
    expect(html).not.toContain(de.org.dashboard.openFirstRoundHeading);
    expect(html).toContain(de.org.dashboard.noRoundYetHeading);
  });

  it("a round exists: the first-round card is hidden and the active round shows", async () => {
    state.holdsManageRounds = true;
    state.rounds = [{ id: "33333333-3333-3333-3333-333333333333", title: "Herbst", status: "open" }];
    const html = await render();
    expect(html).not.toContain(de.org.dashboard.openFirstRoundHeading);
    expect(html).toContain("Herbst");
  });

  it("a moderator with a round already running: the 'another round' link is there", async () => {
    state.holdsManageRounds = true;
    state.profileId = "44444444-4444-4444-4444-444444444444";
    state.rounds = [{ id: "33333333-3333-3333-3333-333333333333", title: "Herbst", status: "open" }];
    const html = await render();
    expect(html).toContain(de.org.dashboard.openAnotherRound);
  });
});

// founding-link-moderator D4: the household account is offered to join its own household through
// the founding link while it is live, with a plain anchor (a join GET records a rate-limit attempt,
// so it must not be prefetched).
describe("O1: the founding-link card", () => {
  beforeEach(() => {
    state.holdsManageRounds = false;
    state.profileId = null;
    state.rounds = [];
    state.firstRoundTask = false;
    state.foundingPath = null;
  });

  it("shows for the household account when the founding link is live, in place of noRoundYet", async () => {
    state.foundingPath = "/join/ABCDE-FGHJK";
    const html = await render();
    expect(html).toContain(de.org.dashboard.foundingJoinHeading);
    expect(html).toContain(de.org.dashboard.foundingJoinBody);
    expect(html).toContain('<a href="/join/ABCDE-FGHJK"');
    expect(html).toContain(de.org.dashboard.foundingJoinButton);
    expect(html).not.toContain(de.org.dashboard.noRoundYetHeading);
  });

  it("is hidden without a live founding link", async () => {
    const html = await render();
    expect(html).not.toContain(de.org.dashboard.foundingJoinHeading);
    expect(html).toContain(de.org.dashboard.noRoundYetHeading);
  });

  it("is hidden once a round exists", async () => {
    state.foundingPath = "/join/ABCDE-FGHJK";
    state.rounds = [{ id: "33333333-3333-3333-3333-333333333333", title: "Herbst", status: "open" }];
    const html = await render();
    expect(html).not.toContain(de.org.dashboard.foundingJoinHeading);
  });

  it("is hidden for a session that may run rounds", async () => {
    state.foundingPath = "/join/ABCDE-FGHJK";
    state.holdsManageRounds = true;
    state.profileId = "44444444-4444-4444-4444-444444444444";
    const html = await render();
    expect(html).not.toContain(de.org.dashboard.foundingJoinHeading);
  });

  it("is not even read for a resident session (only the household account asks)", async () => {
    state.foundingPath = "/join/ABCDE-FGHJK";
    state.profileId = "44444444-4444-4444-4444-444444444444";
    const html = await render();
    expect(html).not.toContain(de.org.dashboard.foundingJoinHeading);
  });
});
