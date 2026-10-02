import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { isUuid } from "@/db/session-context";
import { getScreeningPass } from "@/modules/deliberation/repository";
import { getCurrentSession } from "@/modules/identity/session-cookie";
import { de } from "@/ui/strings";
import { landingPathFor } from "@/app/landing";
import { LinkPendingHint } from "@/ui/link-pending-hint";
import { ScreeningDeck } from "./screening-deck";

const t = de.screening;

// Screen C1, the screening pass. A server page decides the state (deck, empty, or a calm refusal)
// and hands the deck to one client component, which holds it for the rest of the pass (FR-4.4:
// a reload is a new pass). `?round=` names the round a Start task leads to; an array or a
// non-UUID counts as absent, and the pass then picks the newest open round that awaits the viewer.
export default async function ScreeningPage({
  searchParams,
}: {
  searchParams: Promise<{ round?: string | string[] }>;
}) {
  const current = await getCurrentSession();
  if (!current) redirect("/sign-in");
  if (current.context.profileId === null) redirect(landingPathFor(current.context));

  const { round } = await searchParams;
  const roundId = typeof round === "string" && isUuid(round) ? round : null;
  const pass = await getScreeningPass(current.context, roundId);

  if (pass.kind === "deck") {
    return (
      <ScreeningDeck roundId={pass.round.id} roundTitle={pass.round.title} weights={pass.weights} cards={pass.cards} />
    );
  }

  let message: string;
  let heading: string | null = null;
  if (pass.kind === "empty") {
    heading = t.empty;
    message = t.emptyBody;
  } else if (pass.reason === "round_not_open") {
    message = t.refusal.roundNotOpen(de.status.round[pass.status]);
  } else if (pass.reason === "rules_invalid") {
    message = t.refusal.rulesInvalid;
  } else {
    message = t.refusal.notEligible;
  }

  return (
    <div className="mx-auto max-w-md space-y-4 p-6">
      <Link href="/dashboard" className="back-link">
        <ArrowLeft className="size-4" /> {t.backToStart}
        <LinkPendingHint />
      </Link>
      {heading && <h1 className="font-serif text-2xl font-semibold">{heading}</h1>}
      <p className="text-sm text-muted-foreground">{message}</p>
    </div>
  );
}
