import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { applicationBaseline } from "@/modules/casting/application-changes";
import { formatDateDe, oneMonthAfter } from "@/modules/casting/application-notice";
import { getOrganisationApplication } from "@/modules/casting/repository";
import { assertHasPermission, getHousehold, PermissionDeniedError } from "@/modules/identity/repository";
import { getCurrentSession } from "@/modules/identity/session-cookie";
import { de } from "@/ui/strings";
import { LinkPendingHint } from "@/ui/link-pending-hint";
import { CaptureForm } from "../../new/capture-form";

const t = de.applications.edit;

// Screen O5's correction form (F3 change 3, design D5): O3's three-step form in edit mode,
// pre-filled and opening on „Angaben". Guard order: session, then the read of the application
// through the guarded organisation read (null: a household account, a malformed or unknown id,
// another round or household is "not found"; a refusal shows the detail's own text), then
// create_application, which alone may correct (FR-3.21). The repository checks again at save, in
// the write's own transaction: this page only decides what to SHOW.
export default async function EditApplicationPage({
  params,
}: {
  params: Promise<{ id: string; applicationId: string }>;
}) {
  const { id, applicationId } = await params;
  const current = await getCurrentSession();
  if (!current) redirect("/sign-in");

  const back = (
    <Link href={`/rounds/${id}/applications/${applicationId}`} className="back-link">
      <ArrowLeft className="size-4" /> {de.applications.detail.heading}
      <LinkPendingHint />
    </Link>
  );

  let application: Awaited<ReturnType<typeof getOrganisationApplication>>;
  try {
    application = await getOrganisationApplication(current.context, id, applicationId);
  } catch (err) {
    if (err instanceof PermissionDeniedError) {
      return (
        <div className="mx-auto max-w-md space-y-4 p-6">
          {back}
          <h1 className="font-serif text-2xl font-semibold">{t.heading}</h1>
          <p className="text-sm text-muted-foreground">{de.applications.states.detailPermissionDenied}</p>
        </div>
      );
    }
    throw err;
  }
  if (!application) notFound();

  try {
    await assertHasPermission(current.context, current.context.accountId, "create_application");
  } catch (err) {
    if (err instanceof PermissionDeniedError) {
      return (
        <div className="mx-auto max-w-md space-y-4 p-6">
          {back}
          <h1 className="font-serif text-2xl font-semibold">{t.heading}</h1>
          <p className="text-sm text-muted-foreground">{t.permissionDenied}</p>
        </div>
      );
    }
    throw err;
  }

  const householdRow = await getHousehold(current.context);
  const attributes = Array.isArray(application.attributes)
    ? (application.attributes as { label: string; value: string }[])
    : [];
  // The contacts, as the form shows them: the stored ones in a fixed order. Every stored value was
  // put in its column by the same rule (classifyContact), so an unchanged form re-sorts each one
  // into its own column and the diff is empty (design D4).
  const contacts = [application.contactEmail, application.contactPhone, application.contactOther].filter(
    (c): c is string => c !== null && c !== "",
  );

  return (
    <div className="mx-auto max-w-md space-y-6 p-6">
      {back}
      <h1 className="font-serif text-2xl font-semibold">{t.heading}</h1>
      <CaptureForm
        roundId={id}
        household={householdRow?.name ?? ""}
        dateLabel={formatDateDe(oneMonthAfter(application.createdAt))}
        mode={{
          kind: "edit",
          applicationId,
          baseline: applicationBaseline(application),
          capturedAt: application.createdAt.toISOString(),
          stored: {
            message: application.messageRaw ?? "",
            name: application.applicantName,
            age: application.age === null ? "" : String(application.age),
            contacts,
            attributes,
            thirdParty: application.collectedFrom === "third_party",
          },
        }}
      />
    </div>
  );
}
