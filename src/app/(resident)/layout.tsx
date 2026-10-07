import { redirect } from "next/navigation";
import { AppHeader } from "@/app/_frame/app-header";
import { landingPathFor } from "@/app/landing";
import { getRenderSession } from "@/modules/identity/session-cookie";
import { BottomNav } from "./bottom-nav";
import { HouseholdCodeMemory } from "./household-code-memory";

// start-screen design.md Decision 1: the resident frame — everything B1, `/casting`,
// `/casting/screening`, `/account` (E1) and `/who-lives-here` (B5) share. A session with no
// resident profile (the household account) is never shown Start; it is redirected to its own
// landing (O20) here, which is also this design's sixth "landing by identity" site (Decision 3).
// AC-1.6 ("the interface states which identity I am signed in as") is satisfied by the shared
// header's profile menu, the same one `(org)/layout.tsx` renders.
//
// loading-feedback design.md D4: the session check and both redirects stay here — entering the
// route group still waits for this one call. The identity/household/navigation-access reads sit in
// AppHeader's own <Suspense> boundary, off the layout's blocking path. BottomNav needs no data.
export default async function ResidentLayout({ children }: { children: React.ReactNode }) {
  const current = await getRenderSession();
  if (!current) redirect("/sign-in");
  if (current.context.profileId === null) redirect(landingPathFor(current.context));

  return (
    <div className="flex min-h-full flex-col">
      {/* The nav sits in the header in the DOM: position: fixed at the bottom on mobile, and from
          `md:` static, so it becomes the header's text links (09-Design-System.md, Navigation).
          Rendered after <main> it was static at the page's foot on desktop (walkthrough
          finding, 2026-09-24). */}
      <AppHeader context={current.context} surface="resident" nav={<BottomNav />} />
      <main className="flex-1 pb-20 md:pb-6">{children}</main>
      {/* household-sign-in-code D6: the device-memory writer; both values came with the session
          read above, so it renders nothing and waits for nothing. */}
      <HouseholdCodeMemory code={current.householdSignInCode} rememberMe={current.rememberMe} />
    </div>
  );
}
