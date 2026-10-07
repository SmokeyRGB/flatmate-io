import type { SessionContext } from "@/db/session-context";
import { getStrings } from "@/ui/strings/request";
import { AvatarMenu } from "./avatar-menu";
import type { Surface } from "./menu-items";
import { signOutAction } from "./sign-out-action";
import { householdFor, identityLabelFor, navigationAccessFor } from "./session-data";

// loading-feedback design.md D4: split out of the layouts so the identity, household and
// navigation-access reads sit inside a <Suspense> boundary instead of on the layout's own blocking
// path — the session check and its redirects stay in the layout (D4: "entering a route group
// still waits for that one call"). `context` is the layout's own already-resolved session, passed
// down rather than re-read here.
//
// unified-app-header D3: "Dashboard" is offered only to a session with a resident profile that may
// also act on organisation tasks. A session without a profile is sent from Start to the
// organisation surface, so the row would be a dead end; a plain resident has the navigation.
export async function AppHeaderRight({ context, surface }: { context: SessionContext; surface: Surface }) {
  const s = await getStrings();
  const [identity, household, access] = await Promise.all([
    identityLabelFor(context),
    householdFor(context),
    navigationAccessFor(context),
  ]);

  const householdName = household?.name ?? s.org.identityHouseholdFallback;
  const displayName =
    identity.kind === "household"
      ? s.org.identityHousehold(identity.householdName ?? householdName)
      : (identity.displayName ?? s.org.identityResidentFallback);

  return (
    <AvatarMenu
      displayName={displayName}
      householdName={householdName}
      access={{ ...access, dashboard: context.profileId !== null && access.organisation }}
      surface={surface}
      signOutAction={signOutAction}
    />
  );
}
