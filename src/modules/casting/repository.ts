import { eq } from "drizzle-orm";
import { withSessionContext, type SessionContext } from "@/db/session-context";
import { recordActivityEvent } from "@/modules/audit/repository";
import { application } from "./schema";
import { assertTransitionAllowed, type ApplicationState } from "./transitions";

export interface Actor {
  accountId: string | null;
  profileId: string | null;
}

// FR-0.1: the only sanctioned entry point for reading/writing Application — every call opens its
// transaction through the session-context helper (FR-0.3), never queries the raw client directly.
export async function getApplication(context: SessionContext, id: string) {
  return withSessionContext(context, async (tx) => {
    const [row] = await tx.select().from(application).where(eq(application.id, id));
    return row ?? null;
  });
}

// FR-0.10/FR-0.11/FR-0.12: validates against the declared transition table, throws on anything
// undeclared, and writes exactly one ActivityEvent alongside the state change — `state` is the
// only field this touches; no derived boolean is read or written for lifecycle status.
export async function transitionApplication(
  context: SessionContext,
  applicationId: string,
  toState: ApplicationState,
  actor: Actor,
) {
  return withSessionContext(context, async (tx) => {
    const [current] = await tx
      .select()
      .from(application)
      .where(eq(application.id, applicationId));

    if (!current) {
      throw new Error(`Application not found: ${applicationId}`);
    }

    const fromState = current.state as ApplicationState;
    assertTransitionAllowed(fromState, toState);

    const [updated] = await tx
      .update(application)
      .set({ state: toState, stateChangedAt: new Date() })
      .where(eq(application.id, applicationId))
      .returning();

    await recordActivityEvent(tx, {
      householdId: current.householdId,
      eventType: "application.state_changed",
      subjectType: "application",
      subjectId: applicationId,
      actorAccountId: actor.accountId,
      actorProfileId: actor.profileId,
      payload: { fromState, toState },
    });

    return updated;
  });
}
