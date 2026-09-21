import { ArrowLeft, TriangleAlert } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentHouseholdMembers } from "@/modules/identity/repository";
import { getCurrentSession } from "@/modules/identity/session-cookie";
import { de } from "@/ui/strings";

const t = de.whoLivesHere;

// Screen B5 (docs/screens/B-start.md), FR-1.31/U-30. Distinct from O16 (administration, full
// parity for admin+moderator) and from the round participant list (FR-1.19) — no actions, no
// contact detail, no join dates, current (`active`) members only. Purpose: lets a resident notice
// and report — outside the app — someone who joined via the code without actually living there.
export default async function WhoLivesHerePage() {
  const current = await getCurrentSession();
  if (!current) redirect("/sign-in");

  const backLink = (
    <Link href="/dashboard" className="back-link">
      <ArrowLeft className="size-4" /> {de.nav.organisation}
    </Link>
  );

  // FR-1.31: this view is for residents, not the household (administration) account — matches
  // FR-1.23's administration boundary rather than the O16 resident-list permission model.
  if (current.context.profileId === null) {
    return (
      <div className="mx-auto max-w-md space-y-4 p-6">
        {backLink}
        <h1 className="font-serif text-2xl font-semibold">{t.heading}</h1>
        <p className="text-sm text-muted-foreground">{t.householdAccountNotice}</p>
      </div>
    );
  }

  const members = await getCurrentHouseholdMembers(current.context);

  return (
    <div className="mx-auto max-w-md space-y-4 p-6">
      {backLink}
      <h1 className="font-serif text-2xl font-semibold">{t.heading}</h1>
      <div className="callout callout-info">
        <TriangleAlert className="size-4" />
        {t.strangerNotice}
      </div>
      <ul className="space-y-2">
        {members.map((m, i) => (
          <li key={i} className="card py-2">
            {m.displayName}
          </li>
        ))}
      </ul>
    </div>
  );
}
