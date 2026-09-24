import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getStartOverview } from "@/modules/casting/repository";
import { getCurrentSession } from "@/modules/identity/session-cookie";
import { de } from "@/ui/strings";
import { landingPathFor } from "@/app/landing";
import { pendingVoteCount } from "../../dashboard/dashboard-view";

const t = de.screening;

// The screening step itself — a placeholder until F4 builds it (design.md Decision 10/11): says so
// rather than appearing broken, and names the count of applications awaiting the viewer's vote.
export default async function ScreeningPage() {
  const current = await getCurrentSession();
  if (!current) redirect("/sign-in");
  if (current.context.profileId === null) redirect(landingPathFor(current.context));

  const overview = await getStartOverview(current.context);
  const count = pendingVoteCount(overview);

  return (
    <div className="mx-auto max-w-md space-y-4 p-6">
      <Link href="/dashboard" className="back-link">
        <ArrowLeft className="size-4" /> {t.backToStart}
      </Link>
      <h1 className="font-serif text-2xl font-semibold">{t.placeholderHeading}</h1>
      <p className="text-sm text-muted-foreground">{t.placeholderBody(count)}</p>
    </div>
  );
}
