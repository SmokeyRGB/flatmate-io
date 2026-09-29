import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { ApplicationListRow } from "@/app/(org)/rounds/[id]/applications-section";
import { de } from "@/ui/strings";

vi.mock("server-only", () => ({}));

const { ApplicationsSection } = await import("@/app/(org)/rounds/[id]/applications-section");

// F3 change 3, design D2, tasks 5.3: the „Bewerbungen" section of the round page, rendered from
// props (createElement + renderToStaticMarkup). All names, numbers and contacts are synthetic (G-B1).
const ROUND_ID = "33333333-3333-3333-3333-333333333333";
const CAPTURE_HREF = `href="/rounds/${ROUND_ID}/applications/new"`;

function row(id: string, overrides: Partial<ApplicationListRow> = {}): ApplicationListRow {
  return {
    id,
    applicantName: "Testbewerbung Anna",
    state: "new",
    collectedFrom: "data_subject",
    age: null,
    contactEmail: null,
    contactPhone: null,
    contactOther: null,
    ...overrides,
  };
}

const ID_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const ID_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const ID_C = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";

function render(props: Parameters<typeof ApplicationsSection>[0]) {
  return renderToStaticMarkup(createElement(ApplicationsSection, props));
}

describe("ApplicationsSection: the grouped list", () => {
  const rows = [
    row(ID_A, { applicantName: "Testbewerbung Anna", state: "new" }),
    row(ID_B, { applicantName: "Testbewerbung Ben", state: "screened", collectedFrom: "third_party" }),
    row(ID_C, { applicantName: "Testbewerbung Cem", state: "new" }),
  ];

  it("shows each group with its §8.6 word and count, main path first, and no empty group", () => {
    const html = render({ roundId: ROUND_ID, canCapture: true, view: "list", rows });
    expect(html).toContain(de.applications.list.heading);
    expect(html).toContain(">Neu · 2<");
    expect(html).toContain(">Gesichtet · 1<");
    expect(html.indexOf(">Neu · 2<")).toBeLessThan(html.indexOf(">Gesichtet · 1<"));
    // Groups with no application are left out.
    expect(html).not.toContain("Eingeladen ·");
    expect(html).not.toContain("Archiviert ·");
  });

  it("marks exactly the third-party row with „Über jemand anderen“", () => {
    const html = render({ roundId: ROUND_ID, canCapture: true, view: "list", rows });
    expect(html.split(de.applications.detail.viaSomeoneElse)).toHaveLength(2);
    const benCard = html.slice(html.indexOf(`/applications/${ID_B}`));
    expect(benCard).toContain(de.applications.detail.viaSomeoneElse);
    const annaCard = html.slice(html.indexOf(`/applications/${ID_A}`), html.indexOf(`/applications/${ID_C}`));
    expect(annaCard).not.toContain(de.applications.detail.viaSomeoneElse);
  });

  it("links each row to its detail, and shows the state as a word on the row", () => {
    const html = render({ roundId: ROUND_ID, canCapture: true, view: "list", rows });
    for (const id of [ID_A, ID_B, ID_C]) expect(html).toContain(`href="/rounds/${ROUND_ID}/applications/${id}"`);
    expect(html).toContain('<span class="badge">Gesichtet</span>');
  });

  it("shows the age and the stored contacts on one muted line, and none when nothing is stored", () => {
    const html = render({
      roundId: ROUND_ID,
      canCapture: false,
      view: "list",
      rows: [
        row(ID_A, { age: 27, contactEmail: "anna@example.test", contactPhone: "+49 30 23125 0100" }),
        row(ID_B, { applicantName: "Testbewerbung Ohne" }),
      ],
    });
    expect(html).toContain("27 Jahre · anna@example.test · +49 30 23125 0100");
    const without = html.slice(html.indexOf("Testbewerbung Ohne"));
    expect(without).not.toContain("text-muted-foreground");
  });

  it("offers the capture link in the header when the list is not empty and canCapture, and never twice", () => {
    const withCapture = render({ roundId: ROUND_ID, canCapture: true, view: "list", rows });
    expect(withCapture.split(CAPTURE_HREF)).toHaveLength(2);
    expect(withCapture).not.toContain("btn btn-primary");
    const without = render({ roundId: ROUND_ID, canCapture: false, view: "list", rows });
    expect(without).not.toContain(CAPTURE_HREF);
  });

  it("renders a name as text, never as markup", () => {
    const html = render({
      roundId: ROUND_ID,
      canCapture: false,
      view: "list",
      rows: [row(ID_A, { applicantName: "<img src=x onerror=alert(1)>" })],
    });
    expect(html).not.toContain("<img");
    expect(html).toContain("&lt;img");
  });
});

describe("ApplicationsSection: empty", () => {
  it("says so and offers „Bewerbung erfassen“ as the primary action when canCapture", () => {
    const html = render({ roundId: ROUND_ID, canCapture: true, view: "list", rows: [] });
    expect(html).toContain(de.applications.list.empty);
    expect(html).toContain(CAPTURE_HREF);
    expect(html).toContain("btn btn-primary");
    expect(html.split(CAPTURE_HREF)).toHaveLength(2);
  });

  it("says so and offers no capture when not canCapture", () => {
    const html = render({ roundId: ROUND_ID, canCapture: false, view: "list", rows: [] });
    expect(html).toContain(de.applications.list.empty);
    expect(html).not.toContain(CAPTURE_HREF);
  });
});

describe("ApplicationsSection: the household account", () => {
  it("shows the §8.6 sentence and no list, no name and no count", () => {
    const html = render({ roundId: ROUND_ID, canCapture: false, view: "household_account" });
    expect(html).toContain(de.applications.states.householdAccount);
    expect(html).not.toContain(de.applications.list.empty);
    expect(html).not.toContain(CAPTURE_HREF);
    // No digit anywhere in the section: a count of applications would be one.
    expect(html.replace(/<[^>]*>/g, "")).not.toMatch(/[0-9]/);
  });
});

describe("ApplicationsSection: the load error", () => {
  it("shows the error sentence and keeps the capture link while canCapture", () => {
    const html = render({ roundId: ROUND_ID, canCapture: true, view: "load_error" });
    expect(html).toContain(de.applications.list.loadError);
    expect(html).toContain(CAPTURE_HREF);
    expect(html).not.toContain(de.applications.list.empty);
    const without = render({ roundId: ROUND_ID, canCapture: false, view: "load_error" });
    expect(without).toContain(de.applications.list.loadError);
    expect(without).not.toContain(CAPTURE_HREF);
  });
});
