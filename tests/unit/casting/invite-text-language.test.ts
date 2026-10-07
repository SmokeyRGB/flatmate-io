import { createElement } from "react";
import { describe, expect, it, vi } from "vitest";
import { inviteText } from "@/app/(org)/rounds/[id]/applications/invite-text";
import { ApplicantNotice, ThirdPartyNotice } from "@/app/(org)/rounds/[id]/applications/notice";
import { de } from "@/ui/strings/de";
import { en } from "@/ui/strings/en";
import { renderWithStrings } from "../../helpers/render-with-strings";

// language-switch D7 / vocabulary spec, "Text for people outside the app stays German": the text a
// household copies to an applicant is German whatever language the viewer reads the app in. The
// request is mocked to English here; the German text must still come out.
vi.mock("@/ui/strings/request", () => ({
  LOCALE_COOKIE: "flatmate_locale",
  getRequestLocale: async () => "en",
  getStrings: async () => en,
}));

const escapeHtml = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

describe("outbound text stays German under an English request", () => {
  it("the invite text is the German invitation", () => {
    expect(inviteText("Lea")).toBe(de.invite.text({ name: "Lea" }));
    expect(inviteText("Lea")).not.toBe(en.invite.text({ name: "Lea" }));
  });

  it("the suggested Art. 14 notice is German, while the buttons around it are English", () => {
    const html = renderWithStrings(
      createElement(ThirdPartyNotice, {
        applicantName: "Lea",
        household: "Testhaushalt",
        categories: ["name"],
        dateLabel: "15.10.2026",
        deadlinePassed: false,
        defaultOpen: true,
      }),
      "en",
    );
    const german = de.applications.notice.thirdPartyText({
      name: "Lea",
      household: "Testhaushalt",
      categories: de.applications.notice.categories.name,
    });
    expect(html).toContain(escapeHtml(german));
    expect(html).toContain(en.applications.notice.copy);
    expect(html).not.toContain(de.applications.notice.copy);
  });

  it("the suggested Art. 13 notice is German, while the buttons around it are English", () => {
    const html = renderWithStrings(createElement(ApplicantNotice, { defaultOpen: true }), "en");
    expect(html).toContain(escapeHtml(de.applications.notice.applicantText));
    expect(html).toContain(en.applications.notice.copy);
  });

  // Break: drop lang="de" from the <textarea> in NoticeTextPanel, and this fails.
  it("marks the German text as German for assistive technology, on every screen that shows it", () => {
    const thirdParty = renderWithStrings(
      createElement(ThirdPartyNotice, {
        applicantName: "Lea",
        household: "Testhaushalt",
        categories: ["name"],
        dateLabel: "15.10.2026",
        deadlinePassed: false,
        defaultOpen: true,
      }),
      "en",
    );
    const applicant = renderWithStrings(createElement(ApplicantNotice, { defaultOpen: true }), "en");
    for (const html of [thirdParty, applicant]) {
      expect(html).toMatch(/<textarea\b[^>]*\blang="de"/);
    }
    // The app's own English label is not marked German.
    expect(thirdParty).not.toMatch(/<label\b[^>]*\blang="de"/);
  });
});
