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
import { OrganisationAccessDenied } from "@/app/(org)/organisation-access-denied";
import { requireOrganisationAccess } from "@/app/(org)/organisation-access";
import { holdsPermission } from "@/app/holds-permission";
import { getStrings } from "@/ui/strings/request";
import { LinkPendingHint } from "@/ui/link-pending-hint";
import { SavedToast } from "../../saved-toast";
import { InviteDialog } from "../invite-dialog";
import { INVITABLE_STATES, INVITE_PERMISSION, showInvite } from "../invite-text";
import { ApplicantNotice, ThirdPartyNotice } from "../notice";

// The organisation's detail of one application (design D5): O5's first cut, which change 3
// extends. Facts are shown as TEXT only: React escapes them and there is no
// dangerouslySetInnerHTML (PRD §6.5). For a third-party collection the Art. 14 duty and text
// appear here, with the date counted from created_at (EC-3.5: a passed date says so). Every other
// application gets the optional Art. 13 notice, collapsed (FR-3.23). „Bearbeiten" leads to the
// correction form and is offered only to a holder of create_application.
export default async function ApplicationDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string; applicationId: string }>;
  searchParams?: Promise<{ updated?: string }>;
}) {
  const s = await getStrings();
  const t = s.applications.detail;
  const { id, applicationId } = await params;
  // ?updated=1 after a correction that changed something, ?updated=0 after one that changed nothing.
  // Any other value shows no notice.
  const updatedParam = (await searchParams)?.updated;
  const updatedMessage =
    updatedParam === "1" ? s.applications.edit.updated : updatedParam === "0" ? s.applications.edit.unchanged : null;
  const current = await getCurrentSession();
  if (!current) redirect("/sign-in");

  // role-permissions design D9: every page of the organisation area first checks the caller's
  // stored permissions on this request (a demoted moderator loses the area on reload); the page's
  // own narrower check below stays.
  if (!(await requireOrganisationAccess(current))) return <OrganisationAccessDenied strings={await getStrings()} />;

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
          <p className="text-sm text-muted-foreground">{s.applications.states.detailPermissionDenied}</p>
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
  const deadline = oneMonthAfter(application.createdAt);

  // The way to the correction form: only a resident profile holding create_application. The edit
  // page and the repository refuse again on their own. Run together with the household read, which
  // is independent of it (code review).
  const context = current.context;
  // The same for „Einladen" (F5 candidate-invite): only a holder of change_application_state, and
  // only while the application can still be invited.
  const [householdRow, canEdit, canChangeState] = await Promise.all([
    thirdParty ? getHousehold(context) : Promise.resolve(null),
    holdsPermission(context, "create_application"),
    // Read only when the state could be invited at all.
    INVITABLE_STATES.includes(application.state) ? holdsPermission(context, INVITE_PERMISSION) : false,
  ]);

  const invitable = showInvite(canChangeState, application.state);

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

      {updatedMessage && <SavedToast param="updated" message={updatedMessage} />}

      {/* The two actions on the application sit together at the top (human walkthrough 2026-10-06):
          „Bearbeiten" for create_application, „Einladen" for change_application_state while the
          application can still be invited. */}
      {(canEdit || invitable) && (
        <div className="flex flex-wrap items-center gap-2">
          {canEdit && (
            <Link href={`/rounds/${id}/applications/${applicationId}/edit`} className="btn btn-secondary">
              {s.applications.edit.editLink}
              <LinkPendingHint />
            </Link>
          )}
          {invitable && (
            <InviteDialog roundId={id} applicationId={application.id} applicantName={application.applicantName} />
          )}
        </div>
      )}

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

      {thirdParty ? (
        <ThirdPartyNotice
          why
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
      ) : (
        <ApplicantNotice why />
      )}
    </div>
  );
}

