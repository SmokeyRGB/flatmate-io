import { describe, expect, it, vi } from "vitest";
import { renderWithStrings } from "../../helpers/render-with-strings";
import { createElement } from "react";
import { de } from "@/ui/strings";

// The form only imports the action's type and the action itself; stub the action so the server-only
// import chain stays out of a unit test.
vi.mock("@/app/(org)/rounds/new/actions", () => ({ createAndOpenRoundAction: vi.fn() }));

const { RoundForm } = await import("@/app/(org)/rounds/new/round-form");
const { isRoomOpenableForRound } = await import("@/modules/casting/repository");
const { roomStatusEnum } = await import("@/modules/casting/schema");

function render(rooms: { id: string; label: string; castable: boolean }[]) {
  return renderWithStrings(createElement(RoundForm, { rooms }));
}

const isLocked = (html: string) => /<button[^>]*disabled/.test(html);

describe("new-round form: the submit lock follows whether any room can be cast for", () => {
  it("no rooms: locked, with the notice", () => {
    const html = render([]);
    expect(isLocked(html)).toBe(true);
    expect(html).toContain(de.rounds.new.noRoomsYetLink);
  });

  it("rooms exist but none castable: locked, without the zero-rooms notice", () => {
    const html = render([{ id: "a", label: "Room A", castable: false }]);
    expect(isLocked(html)).toBe(true);
    expect(html).toContain("Room A");
    expect(html).not.toContain(de.rounds.new.noRoomsYetLink);
  });

  it("at least one castable room: not locked", () => {
    const html = render([
      { id: "a", label: "Room A", castable: false },
      { id: "b", label: "Room B", castable: true },
    ]);
    expect(isLocked(html)).toBe(false);
  });
});

describe("isRoomOpenableForRound", () => {
  // Every RoomStatus is listed, so adding a status to the locked set (or a new status at all)
  // fails here until the expectation is stated.
  const expected: Record<(typeof roomStatusEnum.enumValues)[number], boolean> = {
    planned: true,
    open: true,
    promised: true,
    on_hold: true,
    occupied: false,
    not_available: false,
  };

  it("covers every RoomStatus value", () => {
    expect(Object.keys(expected).sort()).toEqual([...roomStatusEnum.enumValues].sort());
  });

  it.each(roomStatusEnum.enumValues)("%s: openable iff not occupied or not_available", (status) => {
    expect(isRoomOpenableForRound(status)).toBe(expected[status]);
  });
});
