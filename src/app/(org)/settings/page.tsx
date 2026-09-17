import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { listRoundsForSession } from "@/modules/casting/repository";
import { getHouseholdSettings } from "@/modules/identity/repository";
import { getCurrentSession } from "@/modules/identity/session-cookie";
import { SettingsForm } from "./settings-form";

// Screen O20. The four procedure-lock-governed fields (FR-1.21) plus the two FR-1.24 exceptions
// administration keeps (retention, export) — F1 only wires the settings half; retention/export UI
// is compliance-feature scope, out of this slice.
export default async function SettingsPage() {
  const current = await getCurrentSession();
  if (!current) redirect("/sign-in");

  const [settings, rounds] = await Promise.all([
    getHouseholdSettings(current.context),
    listRoundsForSession(current.context),
  ]);
  const openRound = (rounds as { status: string; title: string }[]).find((r) => r.status === "open");

  return (
    <div className="mx-auto max-w-md space-y-6 p-6">
      <Link href="/dashboard" className="back-link">
        <ArrowLeft className="size-4" /> Dashboard
      </Link>
      <h1 className="font-serif text-2xl font-semibold">Household settings</h1>
      <SettingsForm quorumShare={settings?.quorumShare ?? "0.5"} openRoundTitle={openRound?.title ?? null} />
    </div>
  );
}
