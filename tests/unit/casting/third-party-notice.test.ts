import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ThirdPartyNotice } from "@/app/(org)/rounds/[id]/applications/third-party-notice";
import { de } from "@/ui/strings";

function render(overrides: Partial<Parameters<typeof ThirdPartyNotice>[0]> = {}) {
  return renderToStaticMarkup(
    createElement(ThirdPartyNotice, {
      applicantName: "Testbewerbung Lea",
      household: "Testhaushalt",
      categories: ["name", "phone"],
      dateLabel: "15.10.2026",
      deadlinePassed: false,
      ...overrides,
    }),
  );
}

// The example text sits behind a toggle; these renders start with it open.
const renderOpen = (overrides: Partial<Parameters<typeof ThirdPartyNotice>[0]> = {}) =>
  render({ defaultOpen: true, ...overrides });

// The textarea's content is HTML-escaped by React; compare against the escaped form.
function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

describe("the quiet Art. 14 notice (AC-3.8, AC-3.10)", () => {
  // Break: start with useState(true) in third-party-notice.tsx (open by default), and this fails.
  it("the example text is absent until the toggle is pressed", () => {
    const html = render();
    expect(html).not.toContain("<textarea");
    expect(html).not.toContain("[Link]");
    expect(html).toContain(de.applications.notice.showExample);
    expect(html).not.toContain(de.applications.notice.hideExample);
    expect(html).toContain('aria-expanded="false"');

    const open = renderOpen();
    expect(open).toContain("<textarea");
    expect(open).toContain(de.applications.notice.hideExample);
    expect(open).toContain('aria-expanded="true"');
  });

  // Break: put callout-caution back in the class list, and this fails.
  it("uses the neutral info style, never the caution style", () => {
    const html = render();
    expect(html).toContain("callout-info");
    expect(html).not.toContain("callout-caution");
    expect(renderOpen()).not.toContain("callout-caution");
  });

  it("is exactly two lines: the person must learn of it, and the Compliance line with the date", () => {
    const html = render();
    expect(html).toContain(escapeHtml(de.applications.notice.informLine));
    expect(html).toContain(escapeHtml(de.applications.notice.deadlineLine("Testbewerbung Lea", "15.10.2026")));
    expect(html).toContain("15.10.2026");
    // The verbatim Compliance §4.5 line.
    expect(de.applications.notice.deadlineLine("Lea", "15.10.2026")).toBe(
      "Am besten gleich mit deiner ersten Nachricht an Lea schicken – spätestens bis 15.10.2026.",
    );
    // Two paragraphs, nothing else in the notice body: no heading, no bold.
    expect([...html.matchAll(/<p\b/g)]).toHaveLength(2);
    expect(html).not.toMatch(/<h[1-6]\b/);
    expect(html).not.toMatch(/font-medium|<strong|<b>/);
  });

  it("a passed date says so in the same neutral line (EC-3.5)", () => {
    const passed = render({ deadlinePassed: true, dateLabel: "01.09.2026" });
    expect(passed).toContain(escapeHtml(de.applications.notice.deadlinePassed("01.09.2026")));
    expect(passed).not.toContain(escapeHtml(de.applications.notice.deadlineLine("Testbewerbung Lea", "01.09.2026")));
    expect(passed).toContain("callout-info");
    expect(passed).not.toContain("callout-caution");
  });

  // Break: render the Verstanden button unconditionally, and the first assertion fails.
  it("Verstanden renders only when the caller passes the understood prop, tied to the caller's form", () => {
    expect(render()).not.toContain(de.applications.notice.understood);
    const html = render({ understood: { formId: "capture-application-form", pending: false } });
    expect(html).toContain(de.applications.notice.understood);
    const button = html.match(/<button\b[^>]*>(?:(?!<\/button>)[\s\S])*Verstanden/);
    expect(button).not.toBeNull();
    expect(button![0]).toContain('form="capture-application-form"');
    expect(button![0]).toContain('type="submit"');
  });

  it("with name + phone the opened textarea holds the section 4.5 text with exactly those categories", () => {
    const html = renderOpen();
    const textarea = html.match(/<textarea\b[^>]*>([\s\S]*?)<\/textarea>/);
    expect(textarea).not.toBeNull();
    const body = textarea![1];
    expect(body).toContain("Name, Telefonnummer");
    expect(body).not.toContain("E-Mail-Adresse");
    expect(body).not.toContain("deine Nachricht");
    expect(body).toContain("Testbewerbung Lea");
    expect(body).toContain("Testhaushalt");
    expect(body).toContain("[Link]");
    // The full verbatim template, placeholders filled.
    const expected = de.applications.notice.thirdPartyText({
      name: "Testbewerbung Lea",
      household: "Testhaushalt",
      categories: "Name, Telefonnummer",
    });
    expect(body).toBe(escapeHtml(expected));
  });

  it("the opened panel has a copy button, and one line saying there is no privacy page to link to (A1)", () => {
    const html = renderOpen();
    expect(html).toContain(de.applications.notice.copy);
    expect(html).toContain(escapeHtml(de.applications.notice.linkHint));
  });

  it("has no button or link whose text or target is a send, share or mailto action", () => {
    for (const html of [render(), renderOpen(), renderOpen({ understood: { formId: "f", pending: false } })]) {
      const buttons = [...html.matchAll(/<button\b[^>]*>([\s\S]*?)<\/button>/g)].map((m) =>
        m[1].replace(/<[^>]*>/g, " "),
      );
      expect(buttons.length).toBeGreaterThan(0);
      const anchors = [...html.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/g)];
      const hrefs = [...html.matchAll(/href="([^"]*)"/g)].map((m) => m[1]);
      const forbidden = /senden|send|mailto:|teilen|share/i;
      // The regex runs over the controls' text and targets, NOT over the whole markup: the notice
      // text itself may legitimately contain such words.
      for (const text of buttons) expect(text).not.toMatch(forbidden);
      for (const a of anchors) expect(a[2].replace(/<[^>]*>/g, " ")).not.toMatch(forbidden);
      for (const href of hrefs) expect(href).not.toMatch(forbidden);
    }
  });

  it("the textarea has no name and is not inside a form (its edited text is never posted)", () => {
    const html = renderOpen();
    const textareaTag = html.match(/<textarea\b([^>]*)>/);
    expect(textareaTag).not.toBeNull();
    expect(textareaTag![1]).not.toMatch(/\bname=/);
    expect(html).not.toContain("<form");
  });

  it("in the capture form, the notice is rendered after the form has closed", () => {
    const source = readFileSync(
      join(__dirname, "..", "..", "..", "src", "app", "(org)", "rounds", "[id]", "applications", "new", "capture-form.tsx"),
      "utf8",
    );
    const closeForm = source.indexOf("</form>");
    const notice = source.indexOf("<ThirdPartyNotice");
    expect(closeForm).toBeGreaterThan(-1);
    expect(notice).toBeGreaterThan(closeForm);
  });
});
