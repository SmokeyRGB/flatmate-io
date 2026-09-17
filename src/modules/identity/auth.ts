import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { and, eq, ne } from "drizzle-orm";
import { withSessionContext, type SessionContext } from "@/db/session-context";
import { recordActivityEvent } from "@/modules/audit/repository";
import { resolveAccountHousehold } from "./repository";
import { account, household, householdSettings, membership, residentProfile, session } from "./schema";

// Admin-only client (research.md §2) — uses the service-role key, never the anon key. Server-only:
// this module must never be imported from a client component (the service-role key would end up
// in the browser bundle otherwise). Created lazily so a missing env var doesn't crash unrelated
// module imports (e.g. this file being imported transitively by a route that never calls it).
function supabaseAdmin() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

// research.md §2: a non-deliverable, internally-unique email for a resident account without a
// real one. Derived from the profile's own uuid, NEVER from display_name — display_name is only
// unique among non-moved_out profiles and is reused after a move-out, so a name-derived address
// would collide with the moved-out profile's. `.invalid` is the IANA-reserved TLD for exactly
// this purpose (RFC 2606) — guaranteed never to resolve, so nothing is ever actually delivered.
export function deriveResidentEmail(residentProfileId: string): string {
  return `resident-${residentProfileId}@accounts.flatmate.invalid`;
}

export class RegistrationError extends Error {}

// FR-1.1/FR-1.2: register a household from an email + password, both required. Creates the
// Supabase Auth user, then the Household/HouseholdSettings/Account/Membership rows in one DB
// transaction. IDs are generated here (not left to defaultRandom()) so the session context can be
// set to the new household's id BEFORE the first insert — every new row's household_id must equal
// current_setting('app.household_id') to satisfy each table's RLS WITH CHECK.
export async function registerHousehold(email: string, password: string) {
  if (!email) throw new RegistrationError("email is required");
  if (!password) throw new RegistrationError("password is required");

  const { data, error } = await supabaseAdmin().auth.admin.createUser({
    email,
    password,
    // identity.md: "Verifikation ist nachgelagert und blockiert die erste Abstimmung nicht" —
    // real-world verification is tracked separately via Account.email_verified_at (left null
    // here), NOT via Supabase Auth's own confirmation gate: `email_confirm: true` here only
    // bypasses THAT gate so sign-in isn't blocked by a Supabase-level check this domain model
    // explicitly says must never block anything. Setting it false would fail signInWithPassword
    // outright on any project with "Confirm email" enabled (Supabase's own default).
    email_confirm: true,
  });
  if (error || !data.user) {
    throw new RegistrationError(error?.message ?? "Supabase Auth did not return a user");
  }

  const householdId = randomUUID();
  const accountId = data.user.id; // Account.id == the Supabase Auth user id (1:1, standard pattern)
  const context: SessionContext = { accountId, householdId, profileId: null };

  return withSessionContext(context, async (tx) => {
    const [householdRow] = await tx
      .insert(household)
      .values({
        id: householdId,
        name: "WG",
        ownerAccountId: accountId,
        contactEmail: email,
        joinCode: randomUUID(),
      })
      .returning();

    await tx.insert(householdSettings).values({
      householdId,
      updatedByAccountId: accountId,
    });

    await tx.insert(account).values({
      id: accountId,
      householdId,
      email,
    });

    // FR-1.7: the household account has is_resident = false and never occupies a profile
    // (ADR-013). role = household_admin per identity.md's Membership entity.
    const [membershipRow] = await tx
      .insert(membership)
      .values({
        householdId,
        accountId,
        residentProfileId: null,
        isResident: false,
        role: "household_admin",
        permissions: [],
      })
      .returning();

    await recordActivityEvent(tx, {
      householdId,
      eventType: "resident_profile.created", // reuses the same audit shape — no dedicated
      // "household.registered" event type is registered (G-D7 allowlist) since no acceptance
      // criterion in F1's scope reads one back; the household row's own created_at is the record.
      subjectType: "household",
      subjectId: householdId,
      actorAccountId: accountId,
      actorProfileId: null,
      payload: {},
    });

    return { household: householdRow, membership: membershipRow, context };
  });
}

// FR-1.5: the household account creates a resident profile for the person operating it, including
// itself — but never occupies it (ADR-013). This function only creates the ResidentProfile row
// (identity/repository.ts's createResidentProfile); granting it its own Account/Membership happens
// via claimResidentProfile below, a separate, later step.
export class ClaimError extends Error {}

// The "sign up against a prepared profile" step FR-1.5 implies but doesn't name as its own FR —
// needed for AC-1.3's independent test ("a sign-out/sign-in cycle is required to act as that
// resident") to be exercisable at all. Creates a new Supabase Auth user at the profile's derived
// email, a new Account, and a Membership with is_resident = true.
export async function claimResidentProfile(
  context: SessionContext,
  residentProfileId: string,
  password: string,
) {
  return withSessionContext(context, async (tx) => {
    const [profile] = await tx
      .select()
      .from(residentProfile)
      .where(eq(residentProfile.id, residentProfileId));
    if (!profile) throw new ClaimError(`ResidentProfile not found: ${residentProfileId}`);
    if (profile.status !== "prepared") {
      throw new ClaimError(`ResidentProfile ${residentProfileId} is not prepared for claiming`);
    }

    const derivedEmail = deriveResidentEmail(residentProfileId);
    const { data, error } = await supabaseAdmin().auth.admin.createUser({
      email: derivedEmail,
      password,
      email_confirm: true, // identity.md: "gilt beim Anbieter als bestätigt" — a technical
      // precondition for the sign-in path, not a claim about a real mailbox.
    });
    if (error || !data.user) {
      throw new ClaimError(error?.message ?? "Supabase Auth did not return a user");
    }

    const accountId = data.user.id;

    await tx.insert(account).values({ id: accountId, householdId: context.householdId });

    // spec.md Assumptions (F1-requirements.md §8's own recommendation): the household account's
    // own resident profile holds the round-opening permission initially, and it is grantable from
    // there. Not stored as a flag — inferred from being the FIRST resident membership this
    // household ever gets, matching A-1.2 ("the person registering almost always also lives
    // there"), so no schema field is needed for a fact that's already derivable from history.
    const [existingResidentMembership] = await tx
      .select({ id: membership.id })
      .from(membership)
      .where(and(eq(membership.householdId, context.householdId), eq(membership.isResident, true)));
    const isFoundingResident = !existingResidentMembership;

    const [membershipRow] = await tx
      .insert(membership)
      .values({
        householdId: context.householdId,
        accountId,
        residentProfileId,
        isResident: true,
        role: "member",
        permissions: isFoundingResident ? ["close_round"] : [],
      })
      .returning();

    await tx
      .update(residentProfile)
      .set({ status: "active", movedInOn: new Date().toISOString().slice(0, 10) })
      .where(eq(residentProfile.id, residentProfileId));

    await recordActivityEvent(tx, {
      householdId: context.householdId,
      eventType: "resident_profile.status_changed",
      subjectType: "resident_profile",
      subjectId: residentProfileId,
      actorAccountId: accountId,
      actorProfileId: residentProfileId,
      payload: { fromStatus: "prepared", toStatus: "active" },
    });

    return { accountId, membership: membershipRow };
  });
}

export class SignInError extends Error {}

export interface SignInResult {
  session: typeof session.$inferSelect;
  context: SessionContext;
}

// FR-1.6/ADR-013: the acting identity of a session is fixed at sign-in and never written again.
// Two entry modes:
//  - household: (email, password) — the household account's own credentials.
//  - resident:  (householdId, displayName, password) — resolved to the derived email (research.md
//    §2) before delegating to Supabase Auth. `householdId` is taken as already known by the
//    caller (typically remembered on the device, identity.md §2.1) — F1 does not build a
//    household-lookup-by-name screen; that is part of F2's join flow, which is what establishes
//    the remembered-device state this sign-in step assumes.
export async function signIn(
  input:
    | { kind: "household"; email: string; password: string }
    | { kind: "resident"; householdId: string; displayName: string; password: string },
): Promise<SignInResult> {
  let email: string;
  if (input.kind === "household") {
    email = input.email;
  } else {
    // Resolve display_name -> ResidentProfile.id within the already-known household. This read
    // is legitimately RLS-scoped (household_id is a real input here, not something being
    // discovered), unlike the account_id -> household_id bootstrap below.
    const bootstrapContext: SessionContext = {
      accountId: randomUUID(), // no account is acting yet; only householdId matters for this scan
      householdId: input.householdId,
      profileId: null,
    };
    const [profile] = await withSessionContext(bootstrapContext, (tx) =>
      tx
        .select()
        .from(residentProfile)
        .where(
          and(
            eq(residentProfile.householdId, input.householdId),
            eq(residentProfile.displayName, input.displayName),
            ne(residentProfile.status, "moved_out"),
          ),
        ),
    );
    if (!profile) throw new SignInError("No such resident in this household");
    email = deriveResidentEmail(profile.id);
  }

  const { data, error } = await supabaseAdmin().auth.signInWithPassword({
    email,
    password: input.password,
  });
  if (error || !data.user || !data.session) {
    throw new SignInError("Invalid credentials");
  }

  const accountId = data.user.id;

  // The ONE deliberate RLS bootstrap hole (drizzle/0005_*.sql): account_id is already verified by
  // Supabase Auth above; this resolves it to the household_id RLS needs for everything after.
  const householdId = await resolveAccountHousehold(accountId);
  if (!householdId) throw new SignInError("Account has no household");

  const context: SessionContext = { accountId, householdId, profileId: null };

  return withSessionContext(context, async (tx) => {
    const [membershipRow] = await tx.select().from(membership).where(eq(membership.accountId, accountId));
    if (!membershipRow) throw new SignInError("Account has no membership");

    // ADR-013/G-D14: acting_profile_id is set here, once, and never written again. `null` for a
    // household account (is_resident = false); the profile id for a resident account.
    const actingProfileId = membershipRow.isResident ? membershipRow.residentProfileId : null;

    const [sessionRow] = await tx
      .insert(session)
      .values({
        householdId,
        tokenHash: data.session!.access_token.slice(-32), // a fixed-length reference to the
        // Supabase Auth session, not itself a secret store — Supabase's own JWT remains the bearer
        // credential; this column exists so this app's own Session row can be looked up/revoked
        // per identity.md's Session entity, matching Session.token_hash's documented "hash only"
        // shape (a real HMAC of the token would be the production version; out of F1's acceptance
        // scope, which only requires the row and its immutability guarantee to exist, T016/T017).
        accountId,
        actingProfileId,
        rememberMe: true,
        expiresAt: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000),
      })
      .returning();

    return {
      session: sessionRow,
      context: { accountId, householdId, profileId: actingProfileId },
    };
  });
}
