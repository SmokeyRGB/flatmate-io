import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { JOIN_PASSWORD_MIN_LENGTH, joinAttemptSourceHash } from "@/modules/identity/auth";
import { recordJoinAttempt, resolveJoinCode } from "@/modules/identity/repository";
import { getCurrentSession } from "@/modules/identity/session-cookie";
import { de } from "@/ui/strings";
import { JoinForm } from "./join-form";
import { getClientIp } from "./request-ip";

const t = de.join;

function Refusal({ message }: { message: string }) {
  return (
    <div className="mx-auto max-w-md space-y-4 p-6">
      <p className="field-error">{message}</p>
    </div>
  );
}

// The first public route in the application that is neither sign-in nor register (proposal.md).
// Functional and plain, deliberately NOT screen A3 yet — G-N6's four mandatory states, the manual
// code-entry screen and the invalid-link recovery wording are change 3's work (proposal
// Assumption 6). `params` is a Promise in this Next version (see
// src/app/(org)/rounds/[id]/page.tsx for the existing pattern).
//
// design.md Decision 9: session is read BEFORE anything that costs. Then, structurally (AC-2.25),
// the rate limit runs BEFORE any code lookup at all — a limited attempt never even reaches
// resolveJoinCode. Only after both does the (non-consuming) resolve happen, which is what FR-2.9
// needs anyway: the household's name before any field is requested.
export default async function JoinPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;

  const current = await getCurrentSession();

  const ip = getClientIp(await headers());
  const allowed = await recordJoinAttempt(joinAttemptSourceHash(ip));
  if (!allowed) {
    return <Refusal message={t.errors.rateLimited} />;
  }

  const resolved = await resolveJoinCode(code);
  if (!resolved) {
    return <Refusal message={t.errors.invalidLink} />;
  }

  // design.md Decision 9 (EC-2.4/EC-2.5): a visitor already signed in gets no second identity —
  // taken to Start (the temporary /dashboard landing target, proposal Assumption 4) with a note
  // for this household, refused with its own explanation for a different one. The household-account
  // case (profileId null) is not literally "a resident" (EC-2.4's own wording), but ADR-013 already
  // requires the same outcome: it never occupies a profile, so it is treated the same way here.
  if (current) {
    if (current.context.householdId === resolved.householdId) {
      redirect("/dashboard?note=already_member");
    }
    return <Refusal message={t.errors.otherHousehold} />;
  }

  // design.md Decision 13: a BOUND link greets the visitor by the prepared profile's own name
  // and asks only for a password — the name is not theirs to choose. A NEUTRAL link is
  // unchanged.
  const bound = resolved.boundResidentProfile;

  return (
    <div className="mx-auto max-w-md space-y-6 p-6">
      <h1 className="font-serif text-2xl font-semibold">
        {bound ? t.boundHeading(bound.displayName, resolved.householdName) : t.heading(resolved.householdName)}
      </h1>
      <JoinForm
        code={code}
        passwordMinLength={JOIN_PASSWORD_MIN_LENGTH}
        boundDisplayName={bound?.displayName ?? null}
      />
    </div>
  );
}
