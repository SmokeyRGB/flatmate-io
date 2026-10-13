// Makes everything outside a panel inert (candidate-revise D6): the app header and its bottom nav, the
// board, whatever a later layout adds. From the panel up to <body>, every sibling of the chain is
// marked `inert`, except the elements in `keep` (the backdrop, whose click closes the panel).
//
// Never inert: Next's route announcer and an element with `aria-live`. The announcer sits at body level
// and is what reads out a card swap. Elements added to the body after the call, a toast for example,
// stay reachable: they are transient and outside the panel's focus order.
//
// The returned function removes `inert` ONLY from the elements this call set, so a sibling that was
// already inert stays inert. Pure over a minimal structural type, so it is a unit test against a fake
// tree (node has no DOM here); a real Element satisfies it.
export interface InertNode {
  tagName: string;
  parentElement: InertNode | null;
  children: ArrayLike<InertNode>;
  hasAttribute(name: string): boolean;
  setAttribute(name: string, value: string): void;
  removeAttribute(name: string): void;
}

const isLive = (node: InertNode) =>
  node.tagName.toLowerCase() === "next-route-announcer" || node.hasAttribute("aria-live");

export function inertOutside(panel: InertNode, keep: InertNode[]): () => void {
  const marked: InertNode[] = [];
  let node = panel;
  while (node.parentElement) {
    const parent = node.parentElement;
    for (const sibling of Array.from(parent.children)) {
      if (sibling === node || keep.includes(sibling) || isLive(sibling) || sibling.hasAttribute("inert")) continue;
      sibling.setAttribute("inert", "");
      marked.push(sibling);
    }
    if (parent.tagName === "BODY") break;
    node = parent;
  }
  return () => {
    for (const sibling of marked) sibling.removeAttribute("inert");
  };
}
