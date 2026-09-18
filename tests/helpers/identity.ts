import { createClient } from "@supabase/supabase-js";
import { eq } from "drizzle-orm";
import { withSessionContext, type SessionContext } from "@/db/session-context";
import { registerHousehold } from "@/modules/identity/auth";
import {
  account,
  household,
  householdSettings,
  membership,
  residentProfile,
  session,
} from "@/modules/identity/schema";
import { application, castingRound, room, roundParticipation } from "@/modules/casting/schema";
import { uuid } from "./uuid";

function adminClient() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

// G-B1: synthetic-only test data — @example.test is this project's fixed test-email convention.
export function testEmail(): string {
  return `f1-test-${uuid()}@example.test`;
}

export interface TestHousehold {
  context: SessionContext;
  accountId: string;
  householdId: string;
  email: string;
  cleanup: () => Promise<void>;
}

// Registers a real household (real Supabase Auth user + real rows) so integration tests exercise
// the actual code path, then hands back a cleanup function that removes all of it — auth user
// included, so repeated test runs don't accumulate rows in Supabase Auth's own user table.
export async function registerTestHousehold(): Promise<TestHousehold> {
  const email = testEmail();
  const password = "test-password-not-real-1234";
  const { household: householdRow, context } = await registerHousehold(email, password);

  const cleanup = async () => {
    await withSessionContext(context, async (tx) => {
      // Casting-owned rows first. These carry household_id as a bare uuid with **no foreign key**
      // to household (casting/schema.ts), so deleting the household below succeeds silently and
      // orphans them — which is how the production project accumulated 1.9k rooms and 1.5k rounds
      // before this was noticed. round_participation goes before casting_round only for
      // readability; there is no FK to order them either.
      await tx.delete(roundParticipation).where(eq(roundParticipation.householdId, context.householdId));
      await tx.delete(castingRound).where(eq(castingRound.householdId, context.householdId));
      await tx.delete(room).where(eq(room.householdId, context.householdId));
      await tx.delete(application).where(eq(application.householdId, context.householdId));

      await tx.delete(residentProfile).where(eq(residentProfile.householdId, context.householdId));
      await tx.delete(membership).where(eq(membership.householdId, context.householdId));
      await tx.delete(session).where(eq(session.householdId, context.householdId));
      await tx.delete(account).where(eq(account.householdId, context.householdId));
      await tx.delete(householdSettings).where(eq(householdSettings.householdId, context.householdId));
      await tx.delete(household).where(eq(household.id, context.householdId));

      // activity_event is deliberately NOT deleted: FR-0.13 makes it append-only, enforced by
      // RESTRICTIVE policies plus FORCE ROW LEVEL SECURITY, so even this transaction cannot remove
      // it. Audit rows accumulating in the dev project is the intended trade-off.
    });
    await adminClient().auth.admin.deleteUser(context.accountId);
  };

  return { context, accountId: context.accountId, householdId: householdRow.id, email, cleanup };
}

// Cleans up a resident account created via claimResidentProfile (a separate Auth user from the
// household's own).
export async function deleteTestAccount(accountId: string): Promise<void> {
  await adminClient().auth.admin.deleteUser(accountId);
}
