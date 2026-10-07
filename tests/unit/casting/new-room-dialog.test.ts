import { createElement } from "react";
import { renderWithStrings } from "../../helpers/render-with-strings";
import { describe, expect, it, vi } from "vitest";
import { de } from "@/ui/strings";

vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({ cookies: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
vi.mock("@/app/(org)/rooms/actions", () => ({ createRoomAction: vi.fn() }));

const { NewRoomDialog } = await import("@/app/(org)/rooms/new-room-dialog");

describe("NewRoomDialog", () => {
  it("the <dialog> is named by its heading", () => {
    const html = renderWithStrings(createElement(NewRoomDialog));
    const labelledBy = /<dialog\b[^>]*aria-labelledby="([^"]+)"/.exec(html)?.[1];
    expect(labelledBy).toBeTruthy();
    const heading = new RegExp(`<h2[^>]* id="${labelledBy!}"[^>]*>([^<]+)</h2>`).exec(html);
    expect(heading?.[1].trim()).toBe(de.rooms.create.heading);
  });
});
