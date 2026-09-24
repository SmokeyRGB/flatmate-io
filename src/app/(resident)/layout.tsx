import { redirect } from "next/navigation";
import { landingPathFor } from "@/app/landing";
import { getCurrentSession } from "@/modules/identity/session-cookie";
import { de } from "@/ui/strings";
import { signOutAction } from "../(org)/sign-out-action";
import { AvatarMenu } from "./avatar-menu";
import { BottomNav } from "./bottom-nav";
import { householdFor, identityLabelFor, navigationAccessFor } from "./session-data";

// start-screen design.md Decision 1: the resident frame — everything B1, `/casting`,
// `/casting/screening`, `/account` (E1) and `/who-lives-here` (B5) share. A session with no
// resident profile (the household account) is never shown Start; it is redirected to its own
// landing (O20) here, which is also this design's sixth "landing by identity" site (Decision 3).
// AC-1.6 ("the interface states which identity I am signed in as") is satisfied the same way
// `(org)/layout.tsx` satisfies it for the organisation side — the avatar menu's own header block.
export default async function ResidentLayout({ children }: { children: React.ReactNode }) {
  const current = await getCurrentSession();
  if (!current) redirect("/sign-in");
  if (current.context.profileId === null) redirect(landingPathFor(current.context));

  const [identity, household, access] = await Promise.all([
    identityLabelFor(current.context),
    householdFor(current.context),
    navigationAccessFor(current.context),
  ]);

  const displayName =
    identity.kind === "resident" ? (identity.displayName ?? de.org.identityResidentFallback) : de.org.identityResidentFallback;
  const householdName = household?.name ?? de.org.identityHouseholdFallback;

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
        <AvatarMenu
          displayName={displayName}
          householdName={householdName}
          access={access}
          signOutAction={signOutAction}
        />
      </header>
      <main className="flex-1 pb-20 md:pb-6">{children}</main>
    </div>
  );
}
