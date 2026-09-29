import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { de } from "@/ui/strings";

// F3 change 2: the round page offers "Bewerbung erfassen" only to a resident profile that holds
// create_application, for a round that is open (spec: "The way to capture is offered only to those
// who may capture"). The capture page and the repository refuse again on their own; this decides
// only what is SHOWN.
vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({ cookies: vi.fn() }));
vi.mock("next/navigation", () => ({
  redirect: vi.fn(),
  notFound: vi.fn(),
  // SavedToast strips ?saved=1 from the URL after showing it (code review).
  useRouter: () => ({ replace: vi.fn() }),
  usePathname: () => "/rounds/x",
}));

const ROUND_ID = "33333333-3333-3333-3333-333333333333";

const state = vi.hoisted(() => ({
  holdsCreateApplication: false,
  profileId: null as string | null,
  roundStatus: "open",
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
  getRoundForSession: vi.fn(async () => ({ id: ROUND_ID, title: "Herbstrunde", status: state.roundStatus })),
  getRoundParticipants: vi.fn(async () => []),
  hasProcedureChangedNotice: vi.fn(async () => false),
}));

vi.mock("@/modules/identity/repository", async () => {
  const actual = await vi.importActual<typeof import("@/modules/identity/repository")>(
    "@/modules/identity/repository",
  );
  return {
    ...actual,
    assertHasPermission: vi.fn(async (_ctx: unknown, _accountId: string, permission: string) => {
      if (permission !== "create_application" || !state.holdsCreateApplication) {
        throw new actual.PermissionDeniedError(permission);
      }
    }),
  };
});

const { default: RoundDetailPage } = await import("@/app/(org)/rounds/[id]/page");

async function render(searchParams: { saved?: string } = {}) {
  const element = await RoundDetailPage({
    params: Promise.resolve({ id: ROUND_ID }),
    searchParams: Promise.resolve(searchParams),
  });
  return renderToStaticMarkup(element);
}

const SAVED_ID = "55555555-5555-5555-5555-555555555555";
const CAPTURE_HREF = `href="/rounds/${ROUND_ID}/applications/new"`;

describe("round page: the way to the capture form", () => {
  beforeEach(() => {
    state.holdsCreateApplication = false;
    state.profileId = null;
    state.roundStatus = "open";
  });

  it("a moderator (holds create_application) on an open round sees the link", async () => {
    state.holdsCreateApplication = true;
    state.profileId = "44444444-4444-4444-4444-444444444444";
    const html = await render();
    expect(html).toContain(CAPTURE_HREF);
    expect(html).toContain(de.rounds.detail.captureApplication);
  });

  it("a plain member (no create_application) sees no link", async () => {
    state.holdsCreateApplication = false;
    state.profileId = "44444444-4444-4444-4444-444444444444";
    const html = await render();
    expect(html).not.toContain(CAPTURE_HREF);
    expect(html).not.toContain(de.rounds.detail.captureApplication);
  });

  it("a round that is not open shows no link, even to a permission holder", async () => {
    state.holdsCreateApplication = true;
    state.profileId = "44444444-4444-4444-4444-444444444444";
    for (const status of ["draft", "closed", "paused", "archived"]) {
      state.roundStatus = status;
      expect(await render()).not.toContain(CAPTURE_HREF);
    }
  });

  it("the household account (no resident profile) sees no link", async () => {
    state.holdsCreateApplication = true; // even if a permission lookup would have passed
    state.profileId = null;
    const html = await render();
    expect(html).not.toContain(CAPTURE_HREF);
  });

  it("?saved=<uuid> shows the success notice with a link to that application, and its absence does not", async () => {
    state.holdsCreateApplication = true;
    state.profileId = "44444444-4444-4444-4444-444444444444";
    const html = await render({ saved: SAVED_ID });
    expect(html).toContain(de.applications.saved);
    expect(html).toContain(`href="/rounds/${ROUND_ID}/applications/${SAVED_ID}"`);
    expect(html).toContain(de.applications.viewSaved);
    const plain = await render();
    expect(plain).not.toContain(de.applications.saved);
    expect(plain).not.toContain(de.applications.viewSaved);
  });

  // Break: drop the isUuid check in the page, and the garbage case shows a link to a made-up path.
  it("a saved value that is not a uuid shows no notice and no link", async () => {
    state.holdsCreateApplication = true;
    state.profileId = "44444444-4444-4444-4444-444444444444";
    for (const garbage of ["1", "../../evil", "not-a-uuid", ""]) {
      const html = await render({ saved: garbage });
      expect(html).not.toContain(de.applications.saved);
      expect(html).not.toContain(de.applications.viewSaved);
      expect(html).not.toContain("/applications/" + garbage + "\"");
    }
  });
});
