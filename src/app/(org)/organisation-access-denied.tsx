import Link from "next/link";
import { de } from "@/ui/strings";
import { LinkPendingHint } from "@/ui/link-pending-hint";

// The shared access message of the organisation area (design D9): shown by every (org) page when
// requireOrganisationAccess is false, with the way back to Start and no organisation content.
export function OrganisationAccessDenied() {
  const t = de.org.accessDenied;
  return (
    <div className="mx-auto max-w-md space-y-4 p-6">
      <h1 className="font-serif text-2xl font-semibold">{t.heading}</h1>
      <p className="text-sm text-muted-foreground">{t.body}</p>
      <Link href="/dashboard" className="btn-link">
        {de.nav.start}
        <LinkPendingHint />
      </Link>
    </div>
  );
}
