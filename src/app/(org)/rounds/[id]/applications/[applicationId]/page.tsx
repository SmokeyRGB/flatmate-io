import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import {
  formatDateDe,
  isDeadlinePassed,
  noticeCategories,
  oneMonthAfter,
} from "@/modules/casting/application-notice";
import { getOrganisationApplication } from "@/modules/casting/repository";
import { getHousehold, PermissionDeniedError } from "@/modules/identity/repository";
import { getCurrentSession } from "@/modules/identity/session-cookie";
import { de } from "@/ui/strings";
import { LinkPendingHint } from "@/ui/link-pending-hint";
import { ThirdPartyNotice } from "../third-party-notice";

const t = de.applications.detail;

// The organisation's detail of one application (design D5): O5's first cut, which change 3
// extends. Facts are shown as TEXT only: React escapes them and there is no
// dangerouslySetInnerHTML (PRD §6.5). For a third-party collection the Art. 14 duty and text
// appear here, with the date counted from created_at (EC-3.5: a passed date says so).
export default async function ApplicationDetailPage({
  params,
}: {
  params: Promise<{ id: string; applicationId: string }>;
}) {
  const { id, applicationId } = await params;
  const current = await getCurrentSession();
  if (!current) redirect("/sign-in");

  const back = (
    <Link href={`/rounds/${id}`} className="back-link">
      <ArrowLeft className="size-4" /> {t.backToRound}
      <LinkPendingHint />
    </Link>
  );

  let application: Awaited<ReturnType<typeof getOrganisationApplication>>;
  try {
    application = await getOrganisationApplication(current.context, id, applicationId);
  } catch (err) {
    if (err instanceof PermissionDeniedError) {
      return (
        <div className="mx-auto max-w-2xl space-y-4 p-6">
          {back}
          <h1 className="font-serif text-2xl font-semibold">{t.heading}</h1>
          <p className="text-sm text-muted-foreground">{de.applications.states.detailPermissionDenied}</p>
        </div>
      );
    }
    throw err;
  }
  // null: a household account, a malformed or unknown id, another round, another household.
  if (!application) notFound();

  const attributes = Array.isArray(application.attributes)
    ? (application.attributes as { label: string; value: string }[])
    : [];
  const thirdParty = application.collectedFrom === "third_party";
  const householdRow = thirdParty ? await getHousehold(current.context) : null;
  const deadline = oneMonthAfter(application.createdAt);

  const fact = (label: string, value: string | number | null) => (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="text-sm whitespace-pre-wrap">{value === null || value === "" ? t.empty : value}</dd>
    </div>
  );

  return (
    <div className="mx-auto max-w-2xl space-y-6 p-6">
      {back}
      <div>
        <h1 className="font-serif text-2xl font-semibold">{application.applicantName}</h1>
        <span className="badge mt-1">{thirdParty ? t.viaSomeoneElse : t.fromApplicant}</span>
      </div>

      <dl className="card space-y-3">
        {fact(t.ageLabel, application.age)}
        {fact(t.emailLabel, application.contactEmail)}
        {fact(t.phoneLabel, application.contactPhone)}
        {fact(t.otherContactLabel, application.contactOther)}
        {fact(t.messageLabel, application.messageRaw)}
        {attributes.length > 0 && (
          <div>
            <dt className="text-xs text-muted-foreground">{t.attributesLabel}</dt>
            <dd>
              <ul className="space-y-1 text-sm">
                {attributes.map((a, i) => (
                  <li key={i}>
                    {a.label}: {a.value}
                  </li>
                ))}
              </ul>
            </dd>
          </div>
        )}
      </dl>

      {thirdParty && (
        <ThirdPartyNotice
          applicantName={application.applicantName}
          household={householdRow?.name ?? ""}
          categories={noticeCategories({
            applicantName: application.applicantName,
            age: application.age,
            contactEmail: application.contactEmail,
            contactPhone: application.contactPhone,
            contactOther: application.contactOther,
            messageRaw: application.messageRaw,
            attributes,
          })}
          dateLabel={formatDateDe(deadline)}
          deadlinePassed={isDeadlinePassed(deadline, new Date())}
        />
      )}
    </div>
  );
}

