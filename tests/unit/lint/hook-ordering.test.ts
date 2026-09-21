import { afterEach, describe, expect, it } from "vitest";

// Pins the assumption tests/setup.ts's sweep depends on (design.md D5): Vitest resolves
// sequence.hooks to "stack" by default
// (node_modules/vitest/dist/chunks/index.DzobfTyw.js:14599), which runs afterEach hooks in
// reverse registration order — the one registered second runs first. A pure in-memory check, no
// database, no household: if this ever fails, a Vitest upgrade has changed the default and the
// global sweep in tests/setup.ts would silently move above per-file teardown instead of below it.
describe("afterEach hook ordering (design.md D5)", () => {
  const order: string[] = [];

  afterEach(() => {
    order.push("first-registered");
  });

  afterEach(() => {
    order.push("second-registered");
  });

  it("records nothing on its own turn", () => {
    expect(order).toEqual([]);
  });

  it("ran the second-registered afterEach before the first-registered one", () => {
    expect(order).toEqual(["second-registered", "first-registered"]);
  });
});
