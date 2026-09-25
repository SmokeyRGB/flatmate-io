import type { SessionContext } from "@/db/session-context";
import { de } from "@/ui/strings";
import { signOutAction } from "../(org)/sign-out-action";
import { AvatarMenu } from "./avatar-menu";
import { householdFor, identityLabelFor, navigationAccessFor } from "./session-data";

// loading-feedback design.md D4: split out of (resident)/layout.tsx so the identity, household and
// navigation-access reads sit inside a <Suspense> boundary instead of on the layout's own blocking
// path — the session check and its redirects stay in the layout (D4: "entering a route group
// still waits for that one call"). `context` is the layout's own already-resolved session, passed
// down rather than re-read here. `BottomNav` needs no data and stays outside this boundary
// (design.md D4).
export async function ResidentHeaderRight({ context }: { context: SessionContext }) {
  const [identity, household, access] = await Promise.all([
    identityLabelFor(context),
    householdFor(context),
    navigationAccessFor(context),
  ]);

  const displayName =
    identity.kind === "resident"
      ? (identity.displayName ?? de.org.identityResidentFallback)
      : de.org.identityResidentFallback;
  const householdName = household?.name ?? de.org.identityHouseholdFallback;

  return (
    <AvatarMenu
      displayName={displayName}
      householdName={householdName}
      access={access}
      signOutAction={signOutAction}
    />
  );
}
