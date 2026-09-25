import { Suspense } from "react";
import { redirect } from "next/navigation";
import { landingPathFor } from "@/app/landing";
import { getCurrentSession } from "@/modules/identity/session-cookie";
import { HeaderSkeleton } from "@/ui/skeletons";
import { BottomNav } from "./bottom-nav";
import { ResidentHeaderRight } from "./resident-header";

// start-screen design.md Decision 1: the resident frame — everything B1, `/casting`,
// `/casting/screening`, `/account` (E1) and `/who-lives-here` (B5) share. A session with no
// resident profile (the household account) is never shown Start; it is redirected to its own
// landing (O20) here, which is also this design's sixth "landing by identity" site (Decision 3).
// AC-1.6 ("the interface states which identity I am signed in as") is satisfied the same way
// `(org)/layout.tsx` satisfies it for the organisation side — the avatar menu's own header block.
//
// loading-feedback design.md D4: the session check and both redirects stay here — entering the
// route group still waits for this one call. The identity/household/navigation-access reads plus
// AvatarMenu moved into ResidentHeaderRight, inside its own <Suspense> boundary, off the layout's
// blocking path. BottomNav needs no data and stays outside that boundary.
export default async function ResidentLayout({ children }: { children: React.ReactNode }) {
  const current = await getCurrentSession();
  if (!current) redirect("/sign-in");
  if (current.context.profileId === null) redirect(landingPathFor(current.context));

  return (
    <div className="flex min-h-full flex-col">
      <header className="flex items-center justify-between border-b border-border bg-card px-4 py-3">
        {/* The nav sits in the header in the DOM: position: fixed at the bottom on mobile, and from
            `md:` static, so it becomes the header's text links (09-Design-System.md, Navigation).
            Rendered after <main> it was static at the page's foot on desktop (walkthrough
            finding, 2026-09-24). */}
        <div className="flex items-center gap-6">
          <span className="font-serif text-lg font-semibold text-primary">flatmate.io</span>
          <BottomNav />
        </div>
        <Suspense fallback={<HeaderSkeleton />}>
          <ResidentHeaderRight context={current.context} />
        </Suspense>
      </header>
      <main className="flex-1 pb-20 md:pb-6">{children}</main>
    </div>
  );
}
