import { de } from "@/ui/strings";

// start-screen design.md Decision 10, spec `ui/resident-frame`: the avatar menu's rights-
// dependent rows — "Dashboard" (the way back to Start, for a session with a profile that may act
// on organisation tasks), the household's people list (chosen by what the user may see) and
// "Organisation" (only with rights). Pure: no I/O, so the rule is a unit test, not a rendering
// test. The header block, the divider, "Einstellungen" and "Abmelden" are fixed and rendered
// directly by avatar-menu.tsx — they do not vary by rights.
export interface MenuItem {
  key: "dashboard" | "people" | "organisation";
  label: string;
  href: string;
  icon: "Users" | "Home";
}

export function menuItems(access: { dashboard: boolean; organisation: boolean; membersList: boolean }): MenuItem[] {
  const items: MenuItem[] = [];
  if (access.dashboard) {
    items.push({ key: "dashboard", label: de.nav.dashboard, href: "/dashboard", icon: "Home" });
  }
  items.push(
    access.membersList
      ? { key: "people", label: de.nav.members, href: "/members", icon: "Users" }
      : { key: "people", label: de.nav.whoLivesHere, href: "/who-lives-here", icon: "Users" },
  );
  if (access.organisation) {
    items.push({ key: "organisation", label: de.nav.toOrganisation, href: "/organization", icon: "Home" });
  }
  return items;
}
