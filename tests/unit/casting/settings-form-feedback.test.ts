import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { de } from "@/ui/strings";

// Walkthrough 2026-10-05: saving the household settings gave no visible feedback. The form now
// shows the shared success toast on a saved state and the error line on a failed one. The action
// state is stubbed through useActionState: this file renders, it does not submit.
let mockState: { error: string | null; saved: boolean } = { error: null, saved: false };
vi.mock("react", async (importOriginal) => ({
  ...(await importOriginal<typeof import("react")>()),
  useActionState: () => [mockState, vi.fn()],
}));
vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({ cookies: vi.fn() }));
vi.mock("@/app/(org)/settings/actions", () => ({ updateSettingsAction: vi.fn() }));

const { SettingsForm } = await import("@/app/(org)/settings/settings-form");

const render = () => renderToStaticMarkup(createElement(SettingsForm, { quorumShare: "0.5", openRoundTitle: null }));

describe("household settings form feedback", () => {
  it("shows the success notice after a save", () => {
    mockState = { error: null, saved: true };
    expect(render()).toContain(de.settings.saved);
  });

  it("shows no success notice before a save", () => {
    mockState = { error: null, saved: false };
    expect(render()).not.toContain(de.settings.saved);
  });

  it("shows the error, and no success notice, after a failed save", () => {
    mockState = { error: de.settings.errors.genericSaveFailure, saved: false };
    const html = render();
    expect(html).toContain(de.settings.errors.genericSaveFailure);
    expect(html).not.toContain(de.settings.saved);
  });
});
