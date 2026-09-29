import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { de } from "@/ui/strings";
import { matchArt9Term } from "../../../scripts/lint/data-inventory";

// Screen O3 (F3 change 2), rendered with the renderToStaticMarkup + mocks pattern of
// new-round-page-permission-guard.test.ts. Covers the page's guard order and the four states, the
// pre-selected collection source (AC-3.6), and AC-3.12: no input is a structured field for a
// special category, by name or by label.
vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({ cookies: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn(), notFound: vi.fn() }));

const ROUND_ID = "33333333-3333-3333-3333-333333333333";

const state = vi.hoisted(() => ({
  holdsCreateApplication: true,
  profileId: "44444444-4444-4444-4444-444444444444" as string | null,
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
}));

vi.mock("@/modules/identity/repository", async () => {
  const actual = await vi.importActual<typeof import("@/modules/identity/repository")>(
    "@/modules/identity/repository",
  );
  return {
    ...actual,
    getHousehold: vi.fn(async () => ({ name: "Testhaushalt" })),
    assertHasPermission: vi.fn(async (_ctx: unknown, _accountId: string, permission: string) => {
      if (permission !== "create_application" || !state.holdsCreateApplication) {
        throw new actual.PermissionDeniedError(permission);
      }
    }),
  };
});

// The server action is imported by the client form; it needs the repository's classes, which the
// mock above does not provide, so it is stubbed (this file renders, it does not submit).
vi.mock("@/app/(org)/rounds/[id]/applications/new/actions", () => ({
  captureApplicationAction: vi.fn(),
}));

const { default: CaptureApplicationPage } = await import("@/app/(org)/rounds/[id]/applications/new/page");

async function render() {
  const element = await CaptureApplicationPage({ params: Promise.resolve({ id: ROUND_ID }) });
  return renderToStaticMarkup(element);
}

interface FormControl {
  tag: string;
  name: string | null;
  id: string | null;
  type: string | null;
  label: string | null;
  attrs: string;
}

function attr(attrs: string, name: string): string | null {
  const m = attrs.match(new RegExp(`(?:^|\\s)${name}="([^"]*)"`));
  return m ? m[1] : null;
}

function stripTags(html: string): string {
  return html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}

function enumerateControls(html: string): FormControl[] {
  const labels = new Map<string, string>();
  for (const m of html.matchAll(/<label\b([^>]*)>([\s\S]*?)<\/label>/g)) {
    const forId = attr(m[1], "for");
    if (forId) labels.set(forId, stripTags(m[2]));
  }
  const controls: FormControl[] = [];
  for (const m of html.matchAll(/<(input|textarea|select)\b([^>]*)>/g)) {
    const id = attr(m[2], "id");
    controls.push({
      tag: m[1],
      name: attr(m[2], "name"),
      id,
      type: attr(m[2], "type"),
      label: id ? (labels.get(id) ?? null) : null,
      attrs: m[2],
    });
  }
  return controls;
}

// matchArt9Term treats a whole string as ONE word split only at `_` and camelCase, so a label like
// "Angaben zur Gesundheit" would never match on its own: split on anything that is not a letter or
// a digit first, then check every token (pre-mortem 4).
function tokens(text: string): string[] {
  return text.split(/[^\p{L}\p{N}]+/u).filter((t) => t.length > 0);
}

describe("O3 capture page: the four states and the guard order", () => {
  beforeEach(() => {
    state.holdsCreateApplication = true;
    state.profileId = "44444444-4444-4444-4444-444444444444";
    state.roundStatus = "open";
  });

  it("a resident without create_application: the permission state, and no form", async () => {
    state.holdsCreateApplication = false;
    const html = await render();
    expect(html).toContain(de.applications.states.permissionDenied);
    expect(html).not.toContain("<form");
  });

  it("the household account: the WG-Konto sentence of section 8.6, and no form", async () => {
    state.profileId = null;
    const html = await render();
    expect(html).toContain(de.applications.states.householdAccount);
    expect(html).not.toContain("<form");
  });

  it("a round that is not open: the no-open-round text, and no form", async () => {
    for (const status of ["draft", "closed", "paused", "archived"]) {
      state.roundStatus = status;
      const html = await render();
      expect(html).toContain(de.applications.states.noOpenRound);
      expect(html).not.toContain("<form");
    }
  });

  it("an open round for a permission holder: the form with the statement, an unticked checkbox and data_subject as the value (AC-3.6)", async () => {
    const html = await render();
    expect(html).toContain("<form");
    expect(html).toContain(de.applications.capture.collectedFromStatement);
    expect(html).toContain(de.applications.capture.collectedFromCheckbox);

    const controls = enumerateControls(html);
    const checkbox = controls.find((c) => c.type === "checkbox");
    expect(checkbox).toBeDefined();
    expect(checkbox!.attrs).not.toMatch(/\bchecked\b/);

    const hidden = controls.find((c) => c.name === "collectedFrom");
    expect(hidden).toBeDefined();
    expect(hidden!.type).toBe("hidden");
    expect(attr(hidden!.attrs, "value")).toBe("data_subject");

    // The Art. 14 notice is not shown while the box is unticked.
    expect(html).not.toContain(de.applications.notice.heading);
  });
});

describe("AC-3.12: no structured field for a special category (G-F3)", () => {
  it("every input, textarea and select is enumerated with its name and label, and none matches the blocklist", async () => {
    const html = await render();
    const controls = enumerateControls(html);

    // Not vacuous: the enumeration must actually have found the form's inputs.
    expect(controls.length).toBeGreaterThanOrEqual(8);

    for (const control of controls) {
      if (control.name !== null) {
        expect(matchArt9Term(control.name), `input name "${control.name}"`).toBeNull();
        for (const token of tokens(control.name)) {
          expect(matchArt9Term(token), `token "${token}" of name "${control.name}"`).toBeNull();
        }
      }
      if (control.label !== null) {
        expect(matchArt9Term(control.label), `label "${control.label}"`).toBeNull();
        for (const token of tokens(control.label)) {
          expect(matchArt9Term(token), `token "${token}" of label "${control.label}"`).toBeNull();
        }
      }
    }

    // Every visible (non-hidden) control has a label to check, so an unlabelled input cannot slip by.
    for (const control of controls.filter((c) => c.type !== "hidden")) {
      expect(control.label, `control ${control.id ?? control.name} has an associated label`).not.toBeNull();
    }
  });

  it("the matcher is not blind to a multi-word label: 'Angaben zur Gesundheit' is caught token by token", () => {
    const label = "Angaben zur Gesundheit";
    expect(tokens(label).some((t) => matchArt9Term(t) !== null)).toBe(true);
  });
});
