import { Suspense } from "react";
import { redirect } from "next/navigation";
import { getCurrentSession } from "@/modules/identity/session-cookie";
import { de } from "@/ui/strings";
import { HeaderSkeleton } from "@/ui/skeletons";
import { SubmitButton } from "@/ui/submit-button";
import { OrgHeaderIdentity } from "./org-header";
import { signOutAction } from "./sign-out-action";

// AC-1.6: every organisation-side screen states the signed-in identity; no control here changes
// it in place — signing out and back in (ADR-013) is the only way.
//
// loading-feedback design.md D4: the session check and its redirect stay here (entering the
// route group still waits for this one call), but the identity-label read moves into
// OrgHeaderIdentity, inside its own <Suspense> boundary, off the layout's blocking path. The
// sign-out form stays outside the boundary, so it is usable at once.
export default async function OrgLayout({ children }: { children: React.ReactNode }) {
  const current = await getCurrentSession();
  if (!current) redirect("/sign-in");

  return (
    <div className="flex min-h-full flex-col">
      <header className="flex items-center justify-between border-b border-border bg-card px-4 py-3">
        <Suspense fallback={<HeaderSkeleton />}>
          <OrgHeaderIdentity context={current.context} />
        </Suspense>
        <form action={signOutAction}>
          <SubmitButton className="btn-link">{de.common.signOut}</SubmitButton>
        </form>
      </header>
      <main className="flex-1">{children}</main>
    </div>
  );
}
