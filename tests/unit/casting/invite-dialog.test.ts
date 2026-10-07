import { createElement } from "react";
import { renderWithStrings } from "../../helpers/render-with-strings";
import { describe, expect, it, vi } from "vitest";
import { inviteText } from "@/app/(org)/rounds/[id]/applications/invite-text";
import { de } from "@/ui/strings";

// F5 candidate-invite task 4.6: the invitation dialog's markup, rendered with createElement +
// renderWithStrings (the pattern of new-room-dialog.test.ts). The server action is stubbed: this
// file renders, it does not submit. Every string is read from `de`.
vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({ cookies: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
vi.mock("@/app/(org)/rounds/[id]/applications/invite-actions", () => ({ inviteApplicationAction: vi.fn() }));

const { InviteDialog } = await import("@/app/(org)/rounds/[id]/applications/invite-dialog");

const t = de.invite;
const n = de.applications.notice;

const BASE = {
  roundId: "11111111-1111-4111-8111-111111111111",
  applicationId: "22222222-2222-4222-8222-222222222222",
  applicantName: "Lea",
};

function render(over: Partial<Parameters<typeof InviteDialog>[0]> = {}) {
  return renderWithStrings(createElement(InviteDialog, { ...BASE, ...over }));
}

const escapeHtml = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const textOf = (html: string) => html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
const formOf = (html: string) => /<form\b[\s\S]*?<\/form>/.exec(html)?.[0] ?? "";
const textareaOf = (html: string) => /<textarea\b[^>]*>([\s\S]*?)<\/textarea>/.exec(html);

describe("InviteDialog, closed", () => {
  it("holds the trigger and no textarea, no form and no digit", () => {
    const html = render();
    expect(html).toContain(`>${t.open}</button>`);
    expect(html).toContain(`aria-label="${t.openLabel("Lea")}"`);
    expect(html).toContain('type="button"');
    expect(html).not.toContain("<textarea");
    expect(html).not.toContain("<form");
    expect(textOf(html)).not.toMatch(/\d/);
  });
});

describe("InviteDialog, open", () => {
  it("the textarea holds the seeded text, has no name, and is not inside the form", () => {
    const html = render({ defaultOpen: true });
    const area = textareaOf(html);
    expect(area).not.toBeNull();
    expect(area![0]).not.toMatch(/\sname=/);
    expect(area![1]).toBe(escapeHtml(inviteText("Lea")));
    expect(formOf(html)).not.toContain("<textarea");
  });

  it("the form's only named fields are roundId and applicationId", () => {
    const form = formOf(render({ defaultOpen: true }));
    const names = [...form.matchAll(/\sname="([^"]+)"/g)].map((m) => m[1]).sort();
    expect(names).toEqual(["applicationId", "roundId"]);
    expect(form).toContain(`value="${BASE.roundId}"`);
    expect(form).toContain(`value="${BASE.applicationId}"`);
  });

  it("offers no mailto, send or share control", () => {
    const html = render({ defaultOpen: true });
    expect(html).not.toContain("mailto:");
    expect(html).not.toMatch(/Senden|Teilen|Verschicken/);
    expect(html).toContain(n.copy);
  });

  it("shows no [Link] hint and no notice text or deadline line", () => {
    const html = render({ defaultOpen: true });
    expect(html).not.toContain(escapeHtml(n.linkHint));
    expect(html).not.toContain(escapeHtml(n.applicantText));
    expect(html).not.toContain(escapeHtml(n.deadlineLine("Lea", "10.10.2026")));
    expect(html).not.toContain(escapeHtml(n.deadlinePassed("10.10.2026")));
  });

  it("the confirm button is the shared SubmitButton, with the hint", () => {
    const html = render({ defaultOpen: true });
    const form = formOf(html);
    expect(form).toMatch(/<button[^>]*type="submit"[^>]*>/);
    expect(form).toContain("submit-stack");
    expect(form).toContain(t.confirm);
    expect(form).toContain(escapeHtml(t.confirmHint));
    expect(form).not.toContain("role=\"alert\"");
  });
});
