import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithStrings } from "../../helpers/render-with-strings";
import { de } from "@/ui/strings";

// organisation-task-list D7 (tasks.md 7.1, spec casting/rooms): each room state change is its own
// named action, only the changes that room may make, and removal sits behind a confirmation.
vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({ cookies: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));

const state = vi.hoisted(() => ({ rooms: [] as { id: string; label: string; status: string }[] }));

vi.mock("@/modules/identity/session-cookie", () => ({
  getCurrentSession: vi.fn(async () => ({
    context: {
      accountId: "11111111-1111-1111-1111-111111111111",
      householdId: "22222222-2222-2222-2222-222222222222",
      profileId: null,
    },
  })),
}));
vi.mock("@/app/(org)/organisation-access", () => ({ requireOrganisationAccess: vi.fn(async () => true) }));
vi.mock("@/modules/casting/repository", () => ({ listRooms: vi.fn(async () => state.rooms) }));
vi.mock("@/app/(org)/rooms/actions", () => ({
  createRoomAction: vi.fn(),
  removeRoomAction: vi.fn(),
  renameRoomAction: vi.fn(),
  transitionRoomAction: vi.fn(),
}));

const { default: RoomsPage } = await import("@/app/(org)/rooms/page");

async function render(rooms: { status: string }[]) {
  state.rooms = rooms.map((r, i) => ({ id: `room-${i}`, label: `Zimmer ${i}`, ...r }));
  return renderWithStrings(await RoomsPage());
}

// The transition forms carry a hidden toStatus; collect the targets one room offers.
const targetsOf = (html: string) => [...html.matchAll(/name="toStatus" value="([a-z_]+)"/g)].map((m) => m[1]);

const T = de.rooms.transitions;

describe("rooms page: named state changes (FR-1.10)", () => {
  beforeEach(() => {
    state.rooms = [];
  });

  it("a planned room offers exactly 'mark as free'", async () => {
    const html = await render([{ status: "planned" }]);
    expect(targetsOf(html)).toEqual(["open"]);
    expect(html).toContain(T.markFree);
    for (const other of [T.pause, T.notAvailable, T.makeFreeAgain]) expect(html).not.toContain(other);
    expect(html).not.toContain("<select");
  });

  it("an open room offers exactly pause and not-available", async () => {
    const html = await render([{ status: "open" }]);
    expect(targetsOf(html)).toEqual(["on_hold", "not_available"]);
    expect(html).toContain(T.pause);
    expect(html).toContain(T.notAvailable);
    expect(html).not.toContain(T.markFree);
    expect(html).not.toContain(T.makeFreeAgain);
  });

  it("a paused room offers making it free again and not-available", async () => {
    const html = await render([{ status: "on_hold" }]);
    expect(targetsOf(html)).toEqual(["open", "not_available"]);
    expect(html).toContain(T.makeFreeAgain);
  });

  it("a room that is not available offers no state change", async () => {
    const html = await render([{ status: "not_available" }]);
    expect(targetsOf(html)).toEqual([]);
  });
});

describe("rooms page: removal asks first (FR-1.9)", () => {
  it("the remove form submits only from inside the confirmation dialog, which names the room", async () => {
    const html = await render([{ status: "open" }]);
    // The page also holds the new-room dialog; the remove one is the one naming the room.
    const dialog = [...html.matchAll(/<dialog[^>]*>([\s\S]*?)<\/dialog>/g)].find((m) =>
      m[1].includes(de.rooms.removeDialog.heading("Zimmer 0")),
    );
    expect(dialog).toBeDefined();
    expect(dialog![1]).toContain(`<button type="submit"`);

    // Outside the dialog, "Entfernen" is a plain button that submits nothing.
    const outside = html.replace(/<dialog[\s\S]*?<\/dialog>/g, "");
    expect(outside).toContain(`type="button"`);
    const removeSubmits = [...outside.matchAll(/<button[^>]*type="submit"[^>]*>[\s\S]*?<\/button>/g)].filter((m) =>
      m[0].includes(de.rooms.remove),
    );
    expect(removeSubmits).toEqual([]);
    expect(outside).not.toMatch(/<form[^>]*>(?:(?!<\/form>)[\s\S])*name="roomId"(?:(?!<\/form>)[\s\S])*Entfernen/);
  });
});
