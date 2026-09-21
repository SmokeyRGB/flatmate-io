import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { de } from "@/ui/strings";

// page.tsx pulls in session-cookie.ts (server-only + next/headers) and next/navigation via its
// import chain; none of that runs before the permission guard fires, but it must resolve for the
// module to import at all under vitest (no Next server runtime present here).
vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({ cookies: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));

vi.mock("@/modules/identity/session-cookie", () => ({
  getCurrentSession: vi.fn(async () => ({
    context: { accountId: "11111111-1111-1111-1111-111111111111", profileId: null },
  })),
}));

const listRooms = vi.fn(async () => {
  throw new Error("listRooms must not run when close_round is denied");
});
vi.mock("@/modules/casting/repository", () => ({ listRooms }));

vi.mock("@/modules/identity/repository", async () => {
  const actual = await vi.importActual<typeof import("@/modules/identity/repository")>(
    "@/modules/identity/repository",
  );
  return {
    ...actual,
    assertHasPermission: vi.fn(async () => {
      throw new actual.PermissionDeniedError("close_round");
    }),
  };
});

const { default: NewRoundPage } = await import("@/app/(org)/rounds/new/page");

// rounds-new-page-missing-permission-guard: the page used to render the create/open form for any
// signed-in session, with no close_round check at all. It must now render a denial instead of
// loading rooms / rendering the form.
describe("NewRoundPage close_round permission guard", () => {
  it("renders a denial and never loads rooms when close_round is missing", async () => {
    const element = await NewRoundPage();
    const html = renderToStaticMarkup(element);

    // german-ui-vocabulary (design.md Decision 8): asserts through src/ui/strings, never a German
    // literal copied into the test — the table's value can change and this test still passes as
    // long as the key does, but it fails if the page stops rendering that key's text at all.
    expect(html).toContain(de.rounds.new.permissionDenied);
    expect(listRooms).not.toHaveBeenCalled();
  });
});
