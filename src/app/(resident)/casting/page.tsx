import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getStartOverview } from "@/modules/casting/repository";
import { getCurrentSession } from "@/modules/identity/session-cookie";
import { de } from "@/ui/strings";
import { landingPathFor } from "@/app/landing";
import { shouldOpenScreening } from "../dashboard/dashboard-view";

const t = de.casting;

// The Casting tab (spec `ui/resident-frame`): takes a resident with applications awaiting their
// vote straight to the screening step; otherwise shows the placeholder ("wird in F4 & F5 gebaut").
export default async function CastingPage() {
  const current = await getCurrentSession();
  if (!current) redirect("/sign-in");
  if (current.context.profileId === null) redirect(landingPathFor(current.context));

  const overview = await getStartOverview(current.context);
  if (shouldOpenScreening(overview)) redirect("/casting/screening");

  return (
    <div className="mx-auto max-w-md space-y-4 p-6">
      <Link href="/dashboard" className="back-link">
        <ArrowLeft className="size-4" /> {t.backToStart}
      </Link>
      <h1 className="font-serif text-2xl font-semibold">{t.placeholderHeading}</h1>
      <p className="text-sm text-muted-foreground">{t.placeholderBody}</p>
    </div>
  );
}
