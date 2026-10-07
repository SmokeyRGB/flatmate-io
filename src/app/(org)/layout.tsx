import { redirect } from "next/navigation";
import { AppHeader } from "@/app/_frame/app-header";
import { getCurrentSession } from "@/modules/identity/session-cookie";

// AC-1.6: every organisation-side screen states the signed-in identity (the shared header's
// profile menu); no control here changes it in place — signing out and back in (ADR-013) is the
// only way.
//
// unified-app-header D2: the header is the same component the resident frame renders, minus the
// bottom navigation, which stays resident-only. loading-feedback design.md D4: the session check
// and its redirect stay here (entering the route group still waits for this one call); the
// identity, household and access reads sit inside AppHeader's own <Suspense> boundary.
export default async function OrgLayout({ children }: { children: React.ReactNode }) {
  const current = await getCurrentSession();
  if (!current) redirect("/sign-in");

  return (
    <div className="flex min-h-full flex-col">
      <AppHeader context={current.context} />
      <main className="flex-1">{children}</main>
    </div>
  );
}
