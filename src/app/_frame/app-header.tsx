import Link from "next/link";
import { Suspense } from "react";
import type { SessionContext } from "@/db/session-context";
import { LinkPendingHint } from "@/ui/link-pending-hint";
import { HeaderSkeleton } from "@/ui/skeletons";
import { de } from "@/ui/strings";
import { AppHeaderRight } from "./app-header-right";

// unified-app-header D2: the one header of every authenticated screen, resident and organisation.
// The mark leads to Start (a session without a profile is passed on by Start itself). `nav` is an
// optional slot: the resident layout puts its bottom navigation there, which sits in the header in
// the DOM — position: fixed at the bottom on mobile, static from `md:` (09-Design-System.md,
// Navigation). The identity/household/access reads stay inside their own <Suspense> boundary.
export function AppHeader({ context, nav }: { context: SessionContext; nav?: React.ReactNode }) {
  return (
    <header className="flex items-center justify-between border-b border-border bg-card px-4 py-3">
      <div className="flex items-center gap-6">
        <Link
          href="/dashboard"
          aria-label={de.nav.homeLink}
          className="font-serif text-lg font-semibold text-primary"
        >
          flatmate.io
          <LinkPendingHint />
        </Link>
        {nav}
      </div>
      <Suspense fallback={<HeaderSkeleton />}>
        <AppHeaderRight context={context} />
      </Suspense>
    </header>
  );
}
