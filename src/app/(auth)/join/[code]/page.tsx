import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { JOIN_PASSWORD_MIN_LENGTH, joinAttemptSourceHash } from "@/modules/identity/auth";
import { recordJoinAttempt, resolveJoinCode } from "@/modules/identity/repository";
import { getCurrentSession } from "@/modules/identity/session-cookie";
import { de } from "@/ui/strings";
import { JoinForm } from "./join-form";
import { HandEntryWayBack, SignOutAndReturnForm } from "./join-ways-forward";
import { decideJoinScreen } from "./join-screen-state";
import { getClientIp } from "./request-ip";

const t = de.join;

// Screen A3 (`docs/screens/A-zugang.md`), with `rahmenwerk.md` §6's four mandatory states (G-N6).
// `params` is a Promise in this Next version (see src/app/(org)/rounds/[id]/page.tsx for the
// existing pattern).
//
// design.md Decision 2/9: session is read BEFORE anything that costs. Then, structurally
// (AC-2.25), the rate limit runs BEFORE any code lookup at all — a limited attempt never even
// reaches resolveJoinCode. Only after both does the (non-consuming) resolve happen, which is what
// FR-2.9 needs anyway: the household's name before any field is requested. The three results are
// then handed to decideJoinScreen (join-screen-state.ts), the one pure function that decides which
// state this render shows — this component only renders what that function returns.
export default async function JoinPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;

  const current = await getCurrentSession();

  const ip = getClientIp(await headers());
  const allowed = await recordJoinAttempt(joinAttemptSourceHash(ip));
  const resolved = allowed ? await resolveJoinCode(code) : null;

  const screen = decideJoinScreen({
    allowed,
    resolved,
    sessionHouseholdId: current?.context.householdId ?? null,
  });

  switch (screen.kind) {
    // Review fix (§12): the three refusal states have no visible heading of their own — each carries
    // a visually hidden one, so a screen-reader user landing here is not on a headingless page.
    case "rate_limited":
      // design.md Decision 8: no retry button here — a retry would itself be an attempt.
      return (
        <div className="space-y-4">
          <h1 className="sr-only">{t.refusalHeading}</h1>
          <div role="alert" className="callout callout-caution">
            {t.errors.rateLimited}
          </div>
        </div>
      );

    case "invalid_link":
      return (
        <div className="space-y-4">
          <h1 className="sr-only">{t.refusalHeading}</h1>
          <div role="alert" className="callout callout-caution">
            {t.errors.invalidLink}
          </div>
          <HandEntryWayBack />
        </div>
      );

    case "already_member":
      // design.md Decision 9 (EC-2.4): a visitor already signed in as a member of THIS household
      // gets no second identity — taken to Start with a note (proposal.md Assumption 4).
      redirect("/dashboard?note=already_member");

    case "other_household":
      return (
        <div className="space-y-4">
          <h1 className="sr-only">{t.refusalHeading}</h1>
          <div role="alert" className="callout callout-caution">
            {t.errors.otherHousehold}
          </div>
          <SignOutAndReturnForm code={code} />
        </div>
      );

    case "neutral":
      return (
        <div className="space-y-6">
          <h1 className="font-serif text-2xl font-semibold">{t.heading()}</h1>
          <span className="context-chip">{t.householdChip(screen.householdName)}</span>
          <JoinForm code={code} passwordMinLength={JOIN_PASSWORD_MIN_LENGTH} boundDisplayName={null} />
        </div>
      );

    case "bound":
      return (
        <div className="space-y-6">
          <h1 className="font-serif text-2xl font-semibold">{t.boundHeading(screen.displayName)}</h1>
          <span className="context-chip">{t.householdChip(screen.householdName)}</span>
          <JoinForm
            code={code}
            passwordMinLength={JOIN_PASSWORD_MIN_LENGTH}
            boundDisplayName={screen.displayName}
          />
        </div>
      );

    default: {
      const _exhaustive: never = screen;
      return _exhaustive;
    }
  }
}
