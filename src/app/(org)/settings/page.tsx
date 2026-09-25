import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { listRoundsForSession } from "@/modules/casting/repository";
import { assertIsAdministration, getHouseholdSettings, ResidentListActionDeniedError } from "@/modules/identity/repository";
import { getCurrentSession } from "@/modules/identity/session-cookie";
import { de } from "@/ui/strings";
import { LinkPendingHint } from "@/ui/link-pending-hint";
import { SettingsForm } from "./settings-form";

const t = de.settings;

// Screen O20. The four procedure-lock-governed fields (FR-1.21) plus the two FR-1.24 exceptions
// administration keeps (retention, export) — F1 only wires the settings half; retention/export UI
// is compliance-feature scope, out of this slice.
//
// start-screen design.md Decision 3/8: O20 is the household account's landing (`profileId ===
// null` goes here, never to Start) — so it now also renders the `already_member` note (EC-2.4)
// that used to live on O1, for the case where the household account itself follows its own join
// link. `searchParams` is a Promise in this Next version (see `(org)/rounds/[id]/page.tsx`).
export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ note?: string }>;
}) {
  const { note } = await searchParams;
  const current = await getCurrentSession();
  if (!current) redirect("/sign-in");

  // O20's access rule (docs/screens/O-organisation.md) is `household_admin` only, "unabhängig von
  // acting_profile_id" — unlike the mutation action's broader `manage_settings` permission. This
  // read path had no check at all (Convergence finding), letting any signed-in resident see the
  // quorum share. Mirrors the members page's own guard-and-render-message pattern below.
  try {
    await assertIsAdministration(current.context, current.context.accountId);
  } catch (err) {
    if (err instanceof ResidentListActionDeniedError) {
      return (
        <div className="mx-auto max-w-md space-y-4 p-6">
          <Link href="/organization" className="back-link">
            <ArrowLeft className="size-4" /> {de.nav.organisation}
            <LinkPendingHint />
          </Link>
          <h1 className="font-serif text-2xl font-semibold">{t.heading}</h1>
          <p className="text-sm text-muted-foreground">{t.accessDeniedBody}</p>
        </div>
      );
    }
    throw err;
  }

  const [settings, rounds] = await Promise.all([
    getHouseholdSettings(current.context),
    listRoundsForSession(current.context),
  ]);
  const openRound = (rounds as { status: string; title: string }[]).find((r) => r.status === "open");

  return (
    <div className="mx-auto max-w-md space-y-6 p-6">
      <Link href="/organization" className="back-link">
        <ArrowLeft className="size-4" /> {de.nav.organisation}
        <LinkPendingHint />
      </Link>
      {note === "already_member" && (
        <div role="note" className="callout callout-info">
          {de.join.alreadyMemberNote}
        </div>
      )}
      <h1 className="font-serif text-2xl font-semibold">{t.heading}</h1>
      <SettingsForm quorumShare={settings?.quorumShare ?? "0.5"} openRoundTitle={openRound?.title ?? null} />
    </div>
  );
}
