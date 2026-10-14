import { createElement } from "react";
import { describe, expect, it, vi } from "vitest";
import { renderWithStrings } from "../../helpers/render-with-strings";
import { de } from "@/ui/strings";

// organisation-task-list D11 (tasks.md 10.2): "Abmelden" sits alone after its own divider, with the
// language row above it next to the account settings link. A misclick on the language row used to
// land one row away from sign-out.
vi.mock("next/navigation", () => ({ usePathname: () => "/organization" }));
vi.mock("@/app/_frame/language-actions", () => ({ switchLanguage: vi.fn() }));

const { AvatarMenu } = await import("@/app/_frame/avatar-menu");

function render(): string {
  return renderWithStrings(
    createElement(AvatarMenu, {
      displayName: "Mona",
      householdName: "WG Gartenstraße",
      access: { dashboard: true, organisation: true, membersList: true, hasProfile: true },
      surface: "organisation",
      signOutAction: vi.fn(),
    }),
  );
}

describe("the avatar menu", () => {
  it("ends with sign-out, directly preceded by a divider", () => {
    const html = render();
    const signOut = html.indexOf(`>${de.common.signOut}<`);
    expect(signOut).toBeGreaterThan(-1);
    // Nothing menu-like follows sign-out inside the panel.
    expect(html.slice(signOut)).not.toContain("avatar-menu-item");
    // The element before the sign-out form is a divider.
    const beforeForm = html.slice(0, html.lastIndexOf("<form", signOut));
    expect(beforeForm.endsWith('<div class="avatar-menu-divider"></div>')).toBe(true);
  });

  it("keeps the language row beside the account settings link, above that divider", () => {
    const html = render();
    const settings = html.indexOf(de.nav.accountSettings);
    const language = html.indexOf('name="locale"');
    const lastDivider = html.lastIndexOf('<div class="avatar-menu-divider"></div>');
    expect(settings).toBeGreaterThan(-1);
    expect(language).toBeGreaterThan(settings);
    expect(language).toBeLessThan(lastDivider);
  });
});
