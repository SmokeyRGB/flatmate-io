import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { formatDateDe, oneMonthAfter } from "@/modules/casting/application-notice";
import { getRoundForSession } from "@/modules/casting/repository";
import {
  assertHasPermission,
  getHousehold,
  PermissionDeniedError,
} from "@/modules/identity/repository";
import { getCurrentSession } from "@/modules/identity/session-cookie";
import { de } from "@/ui/strings";
import { LinkPendingHint } from "@/ui/link-pending-hint";
import { CaptureForm } from "./capture-form";

const t = de.applications.capture;
const s = de.applications.states;

// Screen O3, capture by hand. Guard order (design D6): session, then the round (an unknown or
// foreign id is "not found"), then WHO may (a profile-less session and a resident without
// create_application each get a state that says why, and no form), then whether the round is
// open, and only then the form. The same checks run again at save, in the repository, in the
// write's own transaction: this page only decides what to SHOW.
export default async function CaptureApplicationPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const current = await getCurrentSession();
  if (!current) redirect("/sign-in");

  const round = await getRoundForSession(current.context, id);
  if (!round) notFound();

  const back = (
    <Link href={`/rounds/${id}`} className="back-link">
      <ArrowLeft className="size-4" /> {t.backToRound}
      <LinkPendingHint />
    </Link>
  );

  if (current.context.profileId === null) {
    return (
      <div className="mx-auto max-w-md space-y-4 p-6">
        {back}
        <h1 className="font-serif text-2xl font-semibold">{t.heading}</h1>
        <p className="text-sm text-muted-foreground">{s.householdAccount}</p>
      </div>
    );
  }

  try {
    await assertHasPermission(current.context, current.context.accountId, "create_application");
  } catch (err) {
    if (err instanceof PermissionDeniedError) {
      return (
        <div className="mx-auto max-w-md space-y-4 p-6">
          {back}
          <h1 className="font-serif text-2xl font-semibold">{t.heading}</h1>
          <p className="text-sm text-muted-foreground">{s.permissionDenied}</p>
        </div>
      );
    }
    throw err;
  }

  if (round.status !== "open") {
    return (
      <div className="mx-auto max-w-md space-y-4 p-6">
        {back}
        <h1 className="font-serif text-2xl font-semibold">{t.heading}</h1>
        <p className="text-sm text-muted-foreground">{s.noOpenRound}</p>
      </div>
    );
  }

  const householdRow = await getHousehold(current.context);

  return (
    <div className="mx-auto max-w-md space-y-6 p-6">
      {back}
      <h1 className="font-serif text-2xl font-semibold">{t.heading}</h1>
      <CaptureForm
        roundId={id}
        household={householdRow?.name ?? ""}
        dateLabel={formatDateDe(oneMonthAfter(new Date()))}
      />
    </div>
  );
}
