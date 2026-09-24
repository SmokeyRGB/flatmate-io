import { de } from "@/ui/strings";

// start-screen design.md Decision 10, spec `ui/resident-frame`: the avatar menu's two rights-
// dependent rows — the household's people list (chosen by what the resident may see) and
// "Organisation" (only with rights). Pure: no I/O, so the rule is a unit test, not a rendering
// test. The header block, the divider, "Einstellungen" and "Abmelden" are fixed and rendered
// directly by avatar-menu.tsx — they do not vary by rights.
export interface MenuItem {
  key: "people" | "organisation";
  label: string;
  href: string;
  icon: "Users" | "Home";
}

export function menuItems(access: { organisation: boolean; membersList: boolean }): MenuItem[] {
  const items: MenuItem[] = [
    access.membersList
      ? { key: "people", label: de.nav.members, href: "/members", icon: "Users" }
      : { key: "people", label: de.nav.whoLivesHere, href: "/who-lives-here", icon: "Users" },
  ];
  if (access.organisation) {
    items.push({ key: "organisation", label: de.nav.toOrganisation, href: "/organization", icon: "Home" });
  }
  return items;
}
