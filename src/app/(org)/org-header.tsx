import type { SessionContext } from "@/db/session-context";
import { getIdentityLabel } from "@/modules/identity/repository";
import { de } from "@/ui/strings";

// loading-feedback design.md D4: split out of (org)/layout.tsx so the identity-label read (one
// withSessionContext round trip) sits inside a <Suspense> boundary instead of on the layout's own
// blocking path — the session check and its redirect stay in the layout itself (D4: "entering a
// route group still waits for that one call"). `context` is the layout's own already-resolved
// session, passed down rather than re-read here — re-reading would add a round trip instead of
// moving one off the blocking path.
export async function OrgHeaderIdentity({ context }: { context: SessionContext }) {
  const identity = await getIdentityLabel(context);
  const identityLabel =
    identity.kind === "household"
      ? de.org.identityHousehold(identity.householdName ?? de.org.identityHouseholdFallback)
      : (identity.displayName ?? de.org.identityResidentFallback);

  return (
    <span className="text-sm">
      {de.org.signedInAsPrefix} <strong>{identityLabel}</strong>
    </span>
  );
}
