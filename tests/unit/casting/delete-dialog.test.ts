import { createElement } from "react";
import { describe, expect, it, vi } from "vitest";
import { de } from "@/ui/strings";
import { renderWithStrings } from "../../helpers/render-with-strings";

// F3 application-deletion task 6.5 (FR-3.19, AC-3.17): the confirmation's markup, rendered with
// createElement + renderWithStrings (the pattern of invite-dialog.test.ts). The server action is
// stubbed: this file renders, it does not submit. Every string is read from `de`.
// Break: drop the name from the heading and the first case fails.
vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({ cookies: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
vi.mock("@/app/(org)/rounds/[id]/applications/[applicationId]/delete-actions", () => ({
  deleteApplicationAction: vi.fn(),
}));

const { DeleteDialog } = await import("@/app/(org)/rounds/[id]/applications/[applicationId]/delete-dialog");

const t = de.applications.delete;

const BASE = {
  roundId: "11111111-1111-4111-8111-111111111111",
  applicationId: "22222222-2222-4222-8222-222222222222",
  applicantName: "Lea Beispiel",
};

const escapeHtml = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const formOf = (html: string) => /<form\b[\s\S]*?<\/form>/.exec(html)?.[0] ?? "";
const headingOf = (html: string) => /<h2\b[^>]*>([\s\S]*?)<\/h2>/.exec(html)?.[1] ?? "";

function render() {
  return renderWithStrings(createElement(DeleteDialog, BASE));
}

describe("DeleteDialog", () => {
  it("names the applicant in the heading and says the deletion is final", () => {
    const html = render();
    expect(headingOf(html)).toBe(escapeHtml(t.heading("Lea Beispiel")));
    expect(headingOf(html)).toContain("Lea Beispiel");
    expect(html).toContain(escapeHtml(t.body));
  });

  it("offers the trigger, a destructive confirm and a cancel that does not submit", () => {
    const html = render();
    expect(html).toContain(`>${t.trigger}</button>`);
    expect(html).toContain("btn-link text-destructive");
    const form = formOf(html);
    expect(form).toMatch(/<button[^>]*type="submit"[^>]*class="[^"]*btn-destructive[^"]*"|<button[^>]*class="[^"]*btn-destructive[^"]*"[^>]*type="submit"/);
    expect(form).toContain("submit-stack");
    expect(form).toContain(t.confirm);
    expect(form).toContain(t.confirmPending);
    // the cancel button, inside the form, is type="button" so it can never submit
    expect(form).toMatch(new RegExp(`<button[^>]*type="button"[^>]*>${de.common.cancel}</button>`));
    expect(form).not.toContain('role="alert"');
  });

  it("the form posts only roundId and applicationId", () => {
    const form = formOf(render());
    const names = [...form.matchAll(/\sname="([^"]+)"/g)].map((m) => m[1]).sort();
    expect(names).toEqual(["applicationId", "roundId"]);
    expect(form).toContain(`value="${BASE.roundId}"`);
    expect(form).toContain(`value="${BASE.applicationId}"`);
  });
});
