import { ArrowLeft, TriangleAlert } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentHouseholdMembers } from "@/modules/identity/repository";
import { getCurrentSession } from "@/modules/identity/session-cookie";
import { de } from "@/ui/strings";
import { LinkPendingHint } from "@/ui/link-pending-hint";

const t = de.whoLivesHere;

// Screen B5 (docs/screens/B-start.md), FR-1.31/U-30. Distinct from O16 (administration, full
// parity for admin+moderator) and from the round participant list (FR-1.19) — no actions, no
// contact detail, no join dates, current (`active`) members only. Purpose: lets a resident notice
// and report — outside the app — someone who joined via the code without actually living there.
//
// start-screen change: moved into the `(resident)` route group, same URL. Its
// `profileId === null` branch is gone — the `(resident)` layout now redirects such a session to
// its own landing before this page ever runs, so getCurrentHouseholdMembers' own resident-only
// refusal (FR-1.31) is unreachable here and does not need a second check.
export default async function WhoLivesHerePage() {
  const current = await getCurrentSession();
  if (!current) redirect("/sign-in");

  const backLink = (
    <Link href="/dashboard" className="back-link">
      <ArrowLeft className="size-4" /> {de.nav.start}
      <LinkPendingHint />
    </Link>
  );

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
