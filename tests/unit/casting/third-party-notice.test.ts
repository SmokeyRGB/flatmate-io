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

// The textarea's content is HTML-escaped by React; compare against the escaped form.
function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

describe("the Art. 14 notice (AC-3.8, AC-3.10)", () => {
  it("with name + phone the textarea holds the section 4.5 text with exactly those categories", () => {
    const html = render();
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

  it("has a copy button, and no button or link whose text or target is a send, share or mailto action", () => {
    const html = render();
    expect(html).toContain(de.applications.notice.copy);

    const buttons = [...html.matchAll(/<button\b[^>]*>([\s\S]*?)<\/button>/g)].map((m) => m[1].replace(/<[^>]*>/g, " "));
    expect(buttons.length).toBeGreaterThan(0);
    const anchors = [...html.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/g)];
    const hrefs = [...html.matchAll(/href="([^"]*)"/g)].map((m) => m[1]);
    const forbidden = /senden|send|mailto:|teilen|share/i;
    // The regex runs over the controls' text and targets, NOT over the whole markup: the notice
    // text itself may legitimately contain such words.
    for (const text of buttons) expect(text).not.toMatch(forbidden);
    for (const a of anchors) expect(a[2].replace(/<[^>]*>/g, " ")).not.toMatch(forbidden);
    for (const href of hrefs) expect(href).not.toMatch(forbidden);
  });

  it("the textarea has no name and is not inside a form (its edited text is never posted)", () => {
    const html = render();
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
    // And the button that submits sits outside the form too, tied to it by the form attribute.
    expect(source.indexOf("<SubmitButton")).toBeGreaterThan(closeForm);
  });

  it("shows both deadlines and the date; a passed date says so plainly (EC-3.5)", () => {
    const html = render();
    expect(html).toContain(escapeHtml(de.applications.notice.dutyLine));
    expect(html).toContain("15.10.2026");
    expect(html).toContain(escapeHtml(de.applications.notice.deadlineLine("Testbewerbung Lea", "15.10.2026")));

    const passed = render({ deadlinePassed: true, dateLabel: "01.09.2026" });
    expect(passed).toContain(escapeHtml(de.applications.notice.deadlinePassed("01.09.2026")));
    expect(passed).not.toContain(escapeHtml(de.applications.notice.deadlineLine("Testbewerbung Lea", "01.09.2026")));
  });

  it("says plainly that there is no privacy page to link to yet (A1)", () => {
    expect(render()).toContain(escapeHtml(de.applications.notice.linkHint));
  });
});
