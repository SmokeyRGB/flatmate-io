import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithStrings } from "../../helpers/render-with-strings";
import { de } from "@/ui/strings";

// organisation-task-list D4 (tasks.md 5.3): O1's structure. Design D13 (application-capture) still
// holds: the household account runs no rounds (03-PRD.md §4.0.1, S-50/U-20), so "another round" is
// offered only to a session holding manage_rounds, and never as the primary element. Same mock
// shape as new-round-page-permission-guard.test.ts.
vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({ cookies: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));

const ROUND_ID = "33333333-3333-3333-3333-333333333333";

const state = vi.hoisted(() => ({
  holdsManageRounds: false,
  holdsCreateApplication: false,
  profileId: null as string | null,
  rounds: [] as { id: string; title: string; status: string }[],
  // What loadOrganisationTasks returns (already gated by its own reads).
  tasks: [] as { kind: string; [key: string]: unknown }[],
  // What getLiveFoundingLinkPath returns (null: no live founding link, or a caller who may not see it).
  foundingPath: null as string | null,
  standing: null as { roundId: string; stateCounts: Record<string, number> } | null,
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
  getStartOverview: vi.fn(async () => (state.standing ? { standing: state.standing } : null)),
}));

vi.mock("@/app/(org)/organisation-tasks", () => ({
  loadOrganisationTasks: vi.fn(async () => state.tasks),
}));

vi.mock("@/modules/identity/repository", async () => {
  const actual = await vi.importActual<typeof import("@/modules/identity/repository")>(
    "@/modules/identity/repository",
  );
  return {
    ...actual,
    getHousehold: vi.fn(async () => ({ name: "WG Gartenstraße" })),
    getLiveFoundingLinkPath: vi.fn(async () => state.foundingPath),
    // The household account is the session with no profile in these fixtures.
    isHouseholdAccount: vi.fn(async () => state.profileId === null),
    getNavigationAccess: vi.fn(async () => ({ organisation: true, membersList: true, rooms: true, settings: true })),
    assertHasPermission: vi.fn(async (_ctx: unknown, _accountId: string, permission: string) => {
      const held =
        (permission === "manage_rounds" && state.holdsManageRounds) ||
        (permission === "create_application" && state.holdsCreateApplication);
      if (!held) throw new actual.PermissionDeniedError(permission);
    }),
  };
});

const { default: OrganizationPage } = await import("@/app/(org)/organization/page");

async function render() {
  return renderWithStrings(await OrganizationPage({ searchParams: Promise.resolve({}) }));
}

const MODERATOR = "44444444-4444-4444-4444-444444444444";

// The class list of the first <a> pointing at `href` (a next/link renders class before href), or
// null when no such anchor exists.
function classOf(html: string, href: string): string | null {
  const escaped = href.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`<a class="([^"]*)" href="${escaped}"`).exec(html)?.[1] ?? null;
}

function reset() {
  state.holdsManageRounds = false;
  state.holdsCreateApplication = false;
  state.profileId = null;
  state.rounds = [];
  state.tasks = [];
  state.foundingPath = null;
  state.standing = null;
}

describe("O1: the way to open a round is offered only to a session holding manage_rounds", () => {
  beforeEach(reset);

  it("the household account (no manage_rounds): no button, no link, and no promise of one", async () => {
    // review fix R-5: with no round ever, the setup bar stays; "no round running" needs a past round.
    state.rounds = [{ id: ROUND_ID, title: "Herbst", status: "closed" }];
    const html = await render();
    expect(html).not.toContain('href="/rounds/new"');
    expect(html).not.toContain(de.org.dashboard.openFirstRoundHeading);
    expect(html).toContain(de.org.dashboard.status.noRound);
  });

  it("the household account with a round already running: no 'another round' link either", async () => {
    state.rounds = [{ id: ROUND_ID, title: "Herbst", status: "open" }];
    const html = await render();
    expect(html).not.toContain('href="/rounds/new"');
    expect(html).not.toContain(de.org.dashboard.openAnotherRound);
    expect(html).toContain("Herbst läuft.");
  });

  it("a moderator without a round: the first-round task is the one primary button", async () => {
    state.holdsManageRounds = true;
    state.profileId = MODERATOR;
    state.tasks = [{ kind: "open_first_round" }];
    const html = await render();
    expect(classOf(html, "/rounds/new")).toContain("btn-primary");
    expect(html).toContain(de.org.dashboard.openFirstRoundHeading);
    expect(html).toContain(de.org.dashboard.openFirstRoundBody);
  });

  it("a moderator with a round running: 'another round' is a quiet link under Mehr, never the primary button", async () => {
    state.holdsManageRounds = true;
    state.holdsCreateApplication = true;
    state.profileId = MODERATOR;
    state.rounds = [{ id: ROUND_ID, title: "Herbst", status: "open" }];
    const html = await render();
    expect(html).toContain(de.org.dashboard.openAnotherRound);
    // A quiet link (44 px tap target since the visual QA of 2026-10-13), never a button.
    expect(classOf(html, "/rounds/new")).toMatch(/\bbtn-link\b/);
    expect(classOf(html, "/rounds/new")).not.toMatch(/\bbtn-primary\b/);
    // The "Mehr" disclosure is a native <details> and closed by default (no `open` attribute).
    expect(html).toContain(`<details class="card py-2.5">`);
    // Capture is the primary action while nothing else is open.
    expect(classOf(html, `/rounds/${ROUND_ID}/applications/new`)).toContain("btn-primary");
  });

  it("groups the round's items in the round panel and household management below it (human feedback 2026-10-13)", async () => {
    state.holdsManageRounds = true;
    state.holdsCreateApplication = true;
    state.profileId = MODERATOR;
    state.rounds = [{ id: ROUND_ID, title: "Herbst", status: "open" }];
    const html = await render();
    const panelStart = html.indexOf(`class="panel-round`);
    const panelEnd = html.indexOf("</section>", panelStart);
    expect(panelStart).toBeGreaterThan(-1);
    const panel = html.slice(panelStart, panelEnd);
    // The round's own actions, incl. "Alle Bewerbungen" as a button, sit inside the panel.
    expect(panel).toContain(`href="/rounds/${ROUND_ID}/applications/new"`);
    expect(panel).toContain(`href="/rounds/${ROUND_ID}"`);
    expect(classOf(html, `/rounds/${ROUND_ID}`)).toContain("btn-secondary");
    // Household management is outside the panel, under its own heading.
    expect(panel).not.toContain(de.org.dashboard.householdEyebrow);
    expect(html.indexOf(de.org.dashboard.householdEyebrow)).toBeGreaterThan(panelEnd);
  });

  it("a caller who lost manage_rounds: no 'another round' link", async () => {
    state.holdsCreateApplication = true;
    state.profileId = MODERATOR;
    state.rounds = [{ id: ROUND_ID, title: "Herbst", status: "open" }];
    const html = await render();
    expect(html).not.toContain(de.org.dashboard.openAnotherRound);
    expect(html).not.toContain('href="/rounds/new"');
  });

  it("a task other than capture is primary, and capture stays one secondary tap away", async () => {
    state.holdsManageRounds = true;
    state.holdsCreateApplication = true;
    state.profileId = MODERATOR;
    state.rounds = [{ id: ROUND_ID, title: "Herbst", status: "open" }];
    state.tasks = [{ kind: "invite_candidates", roundId: ROUND_ID, roundTitle: "Herbst" }];
    const html = await render();
    expect(classOf(html, `/casting?round=${ROUND_ID}`)).toContain("btn-primary");
    expect(classOf(html, `/rounds/${ROUND_ID}/applications/new`)).toContain("btn-secondary");
  });

  // fix round F2: voting under way and nothing to organise, so the vote is the next step.
  it("voting under way, no task: casting is primary and capture is secondary", async () => {
    state.holdsManageRounds = true;
    state.holdsCreateApplication = true;
    state.profileId = MODERATOR;
    state.rounds = [{ id: ROUND_ID, title: "Herbst", status: "open" }];
    state.standing = { roundId: ROUND_ID, stateCounts: { new: 3 } };
    const html = await render();
    expect(classOf(html, "/casting")).toContain("btn-primary");
    expect(html).toContain(de.org.dashboard.goToCasting);
    expect(classOf(html, `/rounds/${ROUND_ID}/applications/new`)).toContain("btn-secondary");
  });

  it("no permission to capture: no capture entry", async () => {
    state.holdsManageRounds = true;
    state.profileId = MODERATOR;
    state.rounds = [{ id: ROUND_ID, title: "Herbst", status: "open" }];
    const html = await render();
    expect(html).not.toContain("/applications/new");
    expect(html).not.toContain(de.org.dashboard.captureApplication);
  });
});

// fix round F7: the people entry lives in the profile menu; O1's tiles carry the administration.
describe("O1: section tiles", () => {
  beforeEach(reset);

  it("a session with a profile gets no 'Wer hier wohnt' tile, and the members tile is the administration", async () => {
    state.profileId = MODERATOR;
    const html = await render();
    expect(html).not.toContain('href="/who-lives-here"');
    expect(classOf(html, "/members")).toContain("org-tile");
    expect(html).toContain(">Mitgliederverwaltung<");
  });
});

// founding-link-moderator D4: the household account is offered to join its own household through
// the founding link while it is live, with a plain anchor (a join GET records a rate-limit attempt,
// so it must not be prefetched).
describe("O1: the founding link", () => {
  beforeEach(reset);

  it("is the household account's one-click way inside 'who runs the search', as a plain anchor", async () => {
    state.tasks = [{ kind: "appoint_search_lead", foundingJoinPath: "/join/ABCDE-FGHJK", canAppointMember: true }];
    const html = await render();
    expect(html).toContain(de.org.dashboard.tasks.appointSearchLeadHeading);
    expect(html).toContain('<a href="/join/ABCDE-FGHJK" class="btn btn-primary');
    expect(html).toContain(de.org.dashboard.tasks.takeOver);
    expect(html).toContain(de.org.dashboard.tasks.appointSomeone);
  });

  it("without a live link the task leads to the members screen only", async () => {
    state.tasks = [{ kind: "appoint_search_lead", foundingJoinPath: null, canAppointMember: true }];
    const html = await render();
    expect(html).not.toContain(de.org.dashboard.tasks.takeOver);
    expect(classOf(html, "/members")).toContain("btn-primary");
  });

  // fix round F4: "Jemanden bestimmen" only where someone can be appointed.
  it("hides 'Jemanden bestimmen' when nobody can be appointed yet", async () => {
    state.tasks = [{ kind: "appoint_search_lead", foundingJoinPath: "/join/ABCDE-FGHJK", canAppointMember: false }];
    const html = await render();
    expect(html).toContain(de.org.dashboard.tasks.takeOver);
    expect(html).not.toContain(de.org.dashboard.tasks.appointSomeone);
  });

  // fix round F3: an invitation already out turns the task into "share the links".
  it("invite_flatmates with an invitation out asks to share the links", async () => {
    state.tasks = [{ kind: "invite_flatmates", invitationsOutstanding: true }];
    const html = await render();
    expect(html).toContain(de.org.dashboard.tasks.shareLinksHeading);
    expect(html).toContain(de.org.dashboard.tasks.shareLinksReason);
    expect(html).not.toContain(de.org.dashboard.tasks.inviteFlatmatesHeading);
  });

  it("is a standalone offer outside any <details> while live and 'who runs the search' is not open (review fix R-4)", async () => {
    state.foundingPath = "/join/ABCDE-FGHJK";
    const html = await render();
    expect(html.replace(/<details[\s\S]*?<\/details>/g, "")).toContain('<a href="/join/ABCDE-FGHJK"');
    expect(html).toContain(de.org.dashboard.foundingJoinHeading);
    expect(html).toContain(de.org.dashboard.foundingJoinBody);
    expect(html).toContain('<a href="/join/ABCDE-FGHJK"');
    expect(html).toContain(de.org.dashboard.foundingJoinButton);
  });

  it("is hidden without a live founding link", async () => {
    const html = await render();
    expect(html).not.toContain(de.org.dashboard.foundingJoinHeading);
  });

  it("is not even read for a resident session (only the household account asks)", async () => {
    state.foundingPath = "/join/ABCDE-FGHJK";
    state.profileId = MODERATOR;
    const html = await render();
    expect(html).not.toContain(de.org.dashboard.foundingJoinHeading);
  });
});
