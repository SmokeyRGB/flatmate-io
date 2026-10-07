import { createElement } from "react";
import { renderWithStrings } from "../../helpers/render-with-strings";
import { describe, expect, it, vi } from "vitest";
import { de } from "@/ui/strings";

// F5 candidate-detail D7: the „Stimmen-Urheberschaft zeigen" checkbox renders checked or unchecked
// from the stored value, with its label and the anchoring hint.
vi.mock("react", async (importOriginal) => ({
  ...(await importOriginal<typeof import("react")>()),
  useActionState: () => [{ error: null, saved: false }, vi.fn()],
}));
vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({ cookies: vi.fn() }));
vi.mock("@/app/(org)/settings/actions", () => ({ updateSettingsAction: vi.fn() }));

const { SettingsForm } = await import("@/app/(org)/settings/settings-form");

const render = (revealVoteAuthorship: boolean) =>
  renderWithStrings(
    createElement(SettingsForm, { quorumShare: "0.5", revealVoteAuthorship, openRoundTitle: null }),
  );

function checkboxTag(html: string): string {
  const tag = /<input[^>]*name="revealVoteAuthorship"[^>]*>/.exec(html);
  expect(tag).not.toBeNull();
  return tag![0];
}

describe("household settings: vote authorship toggle", () => {
  it("renders checked when the stored value is on", () => {
    expect(checkboxTag(render(true))).toContain("checked");
  });

  it("renders unchecked when the stored value is off", () => {
    expect(checkboxTag(render(false))).not.toContain("checked");
  });

  it("carries the label and the anchoring hint", () => {
    const html = render(false);
    expect(html).toContain(de.settings.revealVoteAuthorshipLabel);
    expect(html).toContain(de.settings.revealVoteAuthorshipHint.slice(0, 20));
  });
});
