import type { Strings } from "@/ui/strings";

// start-screen design.md Decision 10, spec `ui/resident-frame`: the avatar menu's rights-
// dependent rows — the household's people list (chosen by what the user may see) and ONE switch
// between the two surfaces: "Zur Organisation" on a resident screen (only with rights), "Zum
// Dashboard" on an organisation screen (only for a session with a profile). Pure: no I/O, so the rule is a unit test, not a rendering
// test. The header block, the divider, "Einstellungen" and "Abmelden" are fixed and rendered
// directly by avatar-menu.tsx — they do not vary by rights.
export interface MenuItem {
  key: "dashboard" | "people" | "organisation";
  label: string;
  href: string;
  icon: "Users" | "Home";
}

export type Surface = "resident" | "organisation";

export function menuItems(
  access: { dashboard: boolean; organisation: boolean; membersList: boolean },
  surface: Surface,
  s: Strings,
): MenuItem[] {
  const items: MenuItem[] = [
    access.membersList
      ? { key: "people", label: s.nav.members, href: "/members", icon: "Users" }
      : { key: "people", label: s.nav.whoLivesHere, href: "/who-lives-here", icon: "Users" },
  ];
  // The switch is always the row after the people list, so it sits in the same place on both
  // surfaces (human decision 2026-10-07).
  if (surface === "organisation" && access.dashboard) {
    items.push({ key: "dashboard", label: s.nav.toDashboard, href: "/dashboard", icon: "Home" });
  }
  if (surface === "resident" && access.organisation) {
    items.push({ key: "organisation", label: s.nav.toOrganisation, href: "/organization", icon: "Home" });
  }
  return items;
}
