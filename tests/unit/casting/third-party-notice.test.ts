import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createElement } from "react";
import { renderWithStrings } from "../../helpers/render-with-strings";
import { describe, expect, it } from "vitest";
import { ApplicantNotice, ThirdPartyNotice } from "@/app/(org)/rounds/[id]/applications/notice";
import { de } from "@/ui/strings";

function render(overrides: Partial<Parameters<typeof ThirdPartyNotice>[0]> = {}) {
  return renderWithStrings(
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
  // Break: start with useState(true) in notice.tsx (open by default), and this fails.
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

  it("is a short title and two lines: the person must learn of it, and the Compliance line with the date", () => {
    const html = render();
    expect(html).toContain(escapeHtml(de.applications.notice.informLine));
    expect(html).toContain(escapeHtml(de.applications.notice.deadlineLine("Testbewerbung Lea", "15.10.2026")));
    expect(html).toContain("15.10.2026");
    // The verbatim Compliance §4.5 line.
    expect(de.applications.notice.deadlineLine("Lea", "15.10.2026")).toBe(
      "Am besten gleich mit deiner ersten Nachricht an Lea schicken – spätestens bis 15.10.2026.",
    );
    // A title (human decision 2026-10-05), two paragraphs, nothing else in the notice body: exactly
    // one heading, an h2 (both pages put the notice under their h1), and no bold.
    expect([...html.matchAll(/<h[1-6]\b/g)]).toHaveLength(1);
    expect(html).toMatch(/<h2\b[^>]*>Die Person informieren<\/h2>/);
    expect(de.applications.notice.thirdPartyNoticeTitle).toBe("Die Person informieren");
    expect([...html.matchAll(/<p\b/g)]).toHaveLength(2);
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

// F3 change 3, task 6.4 (FR-3.23, AC-3.20): the optional notice on EVERY application's detail.
describe("the notice on every application (FR-3.23, AC-3.20)", () => {
  const renderApplicant = (defaultOpen = false) => renderWithStrings(createElement(ApplicantNotice, { defaultOpen }));

  // Break: seed ApplicantNotice with the third-party text, and this fails.
  it("ApplicantNotice is collapsed first and, opened, holds the Stufe 1 text and not the third-party sentence", () => {
    const closed = renderApplicant();
    expect(closed).not.toContain("<textarea");
    expect(closed).toContain(de.applications.notice.showApplicantNotice);
    expect(closed).toContain('aria-expanded="false"');
    expect(closed).not.toContain("callout");

    const open = renderApplicant(true);
    const start = open.indexOf("<textarea");
    expect(start).toBeGreaterThan(-1);
    const body = open.slice(open.indexOf(">", start) + 1, open.indexOf("</textarea>"));
    expect(body).toBe(escapeHtml(de.applications.notice.applicantText));
    expect(body).toContain("Kurz zum Datenschutz");
    expect(body).toContain("Name, Kontakt, deine Nachricht");
    expect(body).toContain("Spätestens 180 Tage nach Abschluss löschen wir alles wieder.");
    expect(body).not.toContain("über eine andere Person");
    expect(open).toContain('aria-expanded="true"');
    expect(open).toContain(de.applications.notice.hideApplicantNotice);
  });

  it("ThirdPartyNotice, opened, carries the third-party sentence and the stored categories", () => {
    const body = renderOpen();
    expect(body).toContain("über eine andere Person");
    expect(body).toContain("Name, Telefonnummer");
  });

  it("ThirdPartyNotice offers the why toggle only when asked (the detail asks, O3 does not)", () => {
    expect(render()).not.toContain(de.applications.notice.whyToggle);
    expect(render({ why: true })).toContain(de.applications.notice.whyToggle);
  });

  it("no variant renders an element with a name attribute, a form, a mailto link or a send or share button", () => {
    const forbidden = /senden|send|mailto:|teilen|share/i;
    const pieces = [
      renderApplicant(),
      renderApplicant(true),
      render({ why: true }),
      renderOpen({ why: true }),
      renderWithStrings(createElement(ApplicantNotice, { why: true, defaultWhyOpen: true })),
      render({ why: true, defaultWhyOpen: true }),
    ];
    for (const html of pieces) {
      expect(html).not.toContain("<form");
      expect(html).not.toContain("mailto:");
      // Only the textarea is an input here, and it has no name.
      expect(html.includes(" name=")).toBe(false);
      const buttons = [...html.matchAll(/<button\b[^>]*>([^]*?)<\/button>/g)].map((m) => m[1].replace(/<[^>]*>/g, " "));
      for (const text of buttons) expect(text).not.toMatch(forbidden);
    }
  });

  // Human walkthrough, 2026-09-29: a round (?) with the question on hover, in the notice's own
  // button row. Break: render the question as the button's text again, and this fails.
  const whyButton = (html: string) => {
    const label = `aria-label="${escapeHtml(de.applications.notice.whyToggle)}"`;
    return [...html.matchAll(/<button\s([^>]*)>([^]*?)<\/button>/g)].find((m) => m[1].includes(label));
  };

  it("the why toggle is a round (?) icon in each notice's button row: the question is its name and hover text, not visible text", () => {
    for (const html of [
      renderWithStrings(createElement(ApplicantNotice, { why: true })),
      render({ why: true }),
    ]) {
      const button = whyButton(html);
      expect(button).toBeDefined();
      const [, attrs, inner] = button!;
      expect(attrs).toContain(`title="${escapeHtml(de.applications.notice.whyToggle)}"`);
      expect(attrs).toContain("rounded-full");
      expect(inner).toContain("<svg");
      expect(inner.replace(/<[^>]*>/g, "").trim()).toBe("");
    }
    // The applicant notice without `why` has no (?).
    expect(whyButton(renderWithStrings(createElement(ApplicantNotice)))).toBeUndefined();
  });

  it("the explanation opens in place: closed shows only the (?), open shows the sentences and no link", () => {
    for (const [closed, open] of [
      [
        renderWithStrings(createElement(ApplicantNotice, { why: true })),
        renderWithStrings(createElement(ApplicantNotice, { why: true, defaultWhyOpen: true })),
      ],
      [render({ why: true }), render({ why: true, defaultWhyOpen: true })],
    ]) {
      expect(closed).not.toContain(escapeHtml(de.applications.notice.why));
      expect(whyButton(closed)![1]).toContain('aria-expanded="false"');
      expect(open).toContain(escapeHtml(de.applications.notice.why));
      expect(whyButton(open)![1]).toContain('aria-expanded="true"');
      expect(open).not.toContain("<a ");
      expect(open).not.toContain("href=");
    }
  });
});
