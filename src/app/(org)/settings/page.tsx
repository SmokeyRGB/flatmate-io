import { redirect } from "next/navigation";
import { getHouseholdSettings } from "@/modules/identity/repository";
import { getCurrentSession } from "@/modules/identity/session-cookie";
import { SettingsForm } from "./settings-form";

// Screen O20. The four procedure-lock-governed fields (FR-1.21) plus the two FR-1.24 exceptions
// administration keeps (retention, export) — F1 only wires the settings half; retention/export UI
// is compliance-feature scope, out of this slice.
export default async function SettingsPage() {
  const current = await getCurrentSession();
  if (!current) redirect("/sign-in");

  const settings = await getHouseholdSettings(current.context);

  return (
    <div className="mx-auto max-w-md space-y-6 p-6">
      <h1 className="font-serif text-2xl font-semibold">Household settings</h1>
      <SettingsForm quorumShare={settings?.quorumShare ?? "0.5"} />
    </div>
  );
}
