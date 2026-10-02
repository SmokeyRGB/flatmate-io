import type { SessionContext } from "@/db/session-context";
import { getNavigationAccess } from "@/modules/identity/repository";

// role-permissions design D9: the organisation area checks the caller's STORED permissions on every
// request, so a demoted moderator loses the area on reload (human decision, 2026-10-01). It is a
// helper each page calls first, not a check in the (org) layout: a layout is not re-rendered on
// navigation between sibling pages (node_modules/next/dist/docs/01-app/03-api-reference/
// 03-file-conventions/layout.md: "Layouts do not re-render on navigation"; guides/authentication.md:
// "be cautious when doing checks in Layouts as these don't re-render on navigation"), so a layout
// check would not run on a soft navigation.
//
// Reads getNavigationAccess, no query of its own; session-data memoisation, where any, is per
// request — nothing here is cached across requests. `organisation` = any stored permission outside
// the resident set, the same flag that decides whether the navigation and Start offer the item, so
// a page and the link leading to it cannot disagree. A page's own narrower check stays.
export async function requireOrganisationAccess(current: { context: SessionContext }): Promise<boolean> {
  return (await getNavigationAccess(current.context)).organisation;
}
