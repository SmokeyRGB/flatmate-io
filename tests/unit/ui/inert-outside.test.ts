import { describe, expect, it } from "vitest";
import { inertOutside, type InertNode } from "@/ui/inert-outside";

// candidate-revise D6, against a fake tree: body -> [header(nav), main -> [board, slot -> [backdrop,
// panel]], memory, next-route-announcer].
class Fake implements InertNode {
  parentElement: Fake | null = null;
  children: Fake[] = [];
  attrs = new Set<string>();
  constructor(
    public tagName: string,
    kids: Fake[] = [],
    attrs: string[] = [],
  ) {
    for (const k of kids) {
      k.parentElement = this;
      this.children.push(k);
    }
    for (const a of attrs) this.attrs.add(a);
  }
  hasAttribute = (n: string) => this.attrs.has(n);
  setAttribute = (n: string) => void this.attrs.add(n);
  removeAttribute = (n: string) => void this.attrs.delete(n);
}

function tree(extra: { memoryInert?: boolean } = {}) {
  const nav = new Fake("NAV");
  const header = new Fake("HEADER", [nav]);
  const board = new Fake("DIV");
  const backdrop = new Fake("DIV");
  const panel = new Fake("DIV");
  const slot = new Fake("DIV", [backdrop, panel]);
  const main = new Fake("MAIN", [board, slot]);
  const memory = new Fake("DIV", [], extra.memoryInert ? ["inert"] : []);
  const announcer = new Fake("NEXT-ROUTE-ANNOUNCER");
  const live = new Fake("DIV", [], ["aria-live"]);
  const body = new Fake("BODY", [header, main, memory, announcer, live]);
  const html = new Fake("HTML", [new Fake("HEAD"), body]);
  return { header, nav, board, backdrop, panel, slot, main, memory, announcer, live, body, html };
}

describe("inertOutside", () => {
  it("marks the header, the board and the memory, and nothing on the way to the panel", () => {
    const t = tree();
    inertOutside(t.panel, [t.backdrop]);
    for (const el of [t.header, t.board, t.memory]) expect(el.hasAttribute("inert")).toBe(true);
    for (const el of [t.panel, t.slot, t.main, t.body, t.backdrop, t.announcer, t.live]) {
      expect(el.hasAttribute("inert")).toBe(false);
    }
    // Only the siblings of the chain, never above the body.
    expect(t.html.children[0].hasAttribute("inert")).toBe(false);
  });

  it("the restore removes exactly what was set: an element inert before stays inert", () => {
    const t = tree({ memoryInert: true });
    const restore = inertOutside(t.panel, [t.backdrop]);
    expect(t.header.hasAttribute("inert")).toBe(true);
    restore();
    for (const el of [t.header, t.board]) expect(el.hasAttribute("inert")).toBe(false);
    expect(t.memory.hasAttribute("inert")).toBe(true);
  });
});
