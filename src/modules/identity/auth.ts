import { createHmac, randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { and, eq, isNull, ne, notInArray } from "drizzle-orm";
import { isUuid, withSessionContext, type SessionContext } from "@/db/session-context";
import { recordActivityEvent } from "@/modules/audit/repository";
import type { CurrentSession } from "./session-cookie";
import {
  claimJoinCodeTx,
  isDisplayNameTaken,
  issueJoinCodeTx,
  resolveAccountHousehold,
  resolveJoinCode,
  revokeSession,
} from "./repository";
import {
  account,
  household,
  householdSettings,
  joinCodeIssuance,
  membership,
  residentProfile,
  session,
} from "./schema";
import { NAME_RELEASING_STATUSES } from "./transitions";

// Mirrors identity/repository.ts's own `Tx` alias — kept in sync with withSessionContext's
// signature so insertSessionTx (task group 6) can be composed under a caller's already-open
// transaction (joinHousehold, task group 7) as well as signIn's own.
type Tx = Parameters<Parameters<typeof withSessionContext>[1]>[0];

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
// unique among profiles whose status is not in NAME_RELEASING_STATUSES (neither moved_out nor
// removed, FR-1.4 amended 2026-09-22) and is reused once a member moves out or is removed, so a
// name-derived address would collide with that profile's. `.invalid` is the IANA-reserved TLD for
// exactly this purpose (RFC 2606) — guaranteed never to resolve, so nothing is ever actually
// delivered.
export function deriveResidentEmail(residentProfileId: string): string {
  return `resident-${residentProfileId}@accounts.flatmate.invalid`;
}

// resident-settings design.md Decisions 2/3: Supabase Auth's own duplicate-address refusal —
// `email_exists` on recent Supabase Auth versions, a bare 422 on older/self-hosted ones ("any 422
// duplicate shape", design.md D2). Never distinguishes further: every duplicate collapses to the
// same `email_taken` code regardless of which account holds the address (proposal Assumption 2).
// A 422 counts only when the provider gives no more specific code: a 422 carrying another code
// (e.g. `email_address_invalid`, `weak_password`) is a different refusal and must not be reported
// as "taken".
function isEmailTakenError(
  error: { code?: string; status?: number; message?: string } | null,
  path: "create" | "update",
): boolean {
  if (!error) return false;
  if (error.code === "email_exists") return true;
  if (error.status === 422 && !error.code) return true;
  // Observed against flatmate-io-dev (probed 2026-09-24): `createUser`'s duplicate refusal is a
  // clean 422/email_exists, but `updateUserById`'s is a generic `AuthRetryableFetchError`, status
  // 500, message "Error updating user", with no machine-readable code at all — GoTrue's own update
  // path does not classify a unique-constraint violation the way its create path does. Matched on
  // the exact message this project's GoTrue version returns, and on the update path only. Known
  // cost: a genuine update failure with that same message is also reported as "taken"; the user
  // then sees a refusal instead of an error page, and nothing is written either way.
  return path === "update" && error.status === 500 && error.message === "Error updating user";
}

// german-ui-vocabulary (design.md Decision 4): a `code` discriminant, not `message`, is what an
// action switches on — `message` stays exactly as it was (English, developer-facing, log-only).
export type RegistrationErrorCode = "missing_email" | "missing_password" | "missing_name" | "signup_failed";

export class RegistrationError extends Error {
  constructor(message: string, readonly code: RegistrationErrorCode) {
    super(message);
  }
}

// FR-1.1/FR-1.2/FR-2.9/AC-2.1: register a household from an email + password + name, all three
// required. `name` is required rather than optional-with-a-default (design.md Decision 6) — a
// default is how the literal "WG" got there in the first place, and there is no screen anywhere in
// docs/screens/ where a household name can be edited afterwards. Trimmed before the emptiness
// check so a whitespace-only name is refused the same way a missing one is. Creates the Supabase
// Auth user, then the Household/HouseholdSettings/Account/Membership rows in one DB transaction.
// IDs are generated here (not left to defaultRandom()) so the session context can be set to the
// new household's id BEFORE the first insert — every new row's household_id must equal
// current_setting('app.household_id') to satisfy each table's RLS WITH CHECK.
export async function registerHousehold(email: string, password: string, name: string) {
  if (!email) throw new RegistrationError("email is required", "missing_email");
  if (!password) throw new RegistrationError("password is required", "missing_password");
  const trimmedName = name.trim();
  if (!trimmedName) throw new RegistrationError("household name is required", "missing_name");

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
    throw new RegistrationError(error?.message ?? "Supabase Auth did not return a user", "signup_failed");
  }

  const householdId = randomUUID();
  const accountId = data.user.id; // Account.id == the Supabase Auth user id (1:1, standard pattern)
  const context: SessionContext = { accountId, householdId, profileId: null };

  return withSessionContext(context, async (tx) => {
    const [householdRow] = await tx
      .insert(household)
      .values({
        id: householdId,
        name: trimmedName,
        ownerAccountId: accountId,
        contactEmail: email,
      })
      .returning();

    await tx.insert(householdSettings).values({
      householdId,
      updatedByAccountId: accountId,
    });

    // join-code-protections (O-18): the founding link, minted through the same generation/retry
    // path issueJoinCode uses (issueJoinCodeTx), not a separate randomUUID() on the Household row
    // itself — proposal.md's 2026-09-21 register decision: FR-2.4's founding-link usage-count
    // prefill ("expected resident count") is not built in v0.1 (nobody collects that number), so
    // the founding link takes the same default any other issued link would: 7 days, max 1 use.
    await issueJoinCodeTx(tx, householdId, accountId, { validDays: 7, maxUses: 1 });

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

// speckit-bug-fix register-action-not-atomic-with-signin: compensating cleanup for a registration
// whose subsequent signIn/session-setup step failed, mirroring undoClaimResidentProfile below —
// registerHousehold's DB transaction cannot simply be deferred until after signIn for the same
// reason: signIn requires the Auth user (and its password) to already exist. Undoes exactly what
// registerHousehold just committed for THIS householdId/accountId (never a broader lookup), so a
// retry with the same email doesn't hit Supabase Auth's "already registered" on createUser.
export async function undoRegisterHousehold(
  context: SessionContext,
  householdId: string,
  accountId: string,
): Promise<void> {
  await withSessionContext(context, async (tx) => {
    await tx.delete(membership).where(eq(membership.householdId, householdId));
    await tx.delete(account).where(eq(account.id, accountId));
    await tx.delete(householdSettings).where(eq(householdSettings.householdId, householdId));
    // join-code-protections (O-18): registerHousehold mints a founding join_code_issuance row, so
    // undoing a registration must remove it too. There are **no foreign keys** in this schema
    // (the two-Supabase-project split), so deleting the household does not cascade — the row would
    // simply survive its household. That is the same silent-orphan failure that let the production
    // project accumulate 1.9k rooms and 1.5k rounds before anyone noticed, and it was caught here
    // by two leftover rows after a suite run.
    await tx.delete(joinCodeIssuance).where(eq(joinCodeIssuance.householdId, householdId));
    await tx.delete(household).where(eq(household.id, householdId));
  });

  // Best-effort, same reasoning as undoClaimResidentProfile: the DB rollback above is what
  // actually gates a clean retry (registerHousehold's own createUser call is what would otherwise
  // fail as a duplicate), so a failure deleting the Auth user must not mask the original
  // session-setup error or crash the request.
  try {
    await supabaseAdmin().auth.admin.deleteUser(accountId);
  } catch {
    // ponytail: best-effort external cleanup, no retry loop — see comment above.
  }
}

// FR-1.5: the household account creates a resident profile for the person operating it, including
// itself — but never occupies it (ADR-013). This function only creates the ResidentProfile row
// (identity/repository.ts's createResidentProfile); granting it its own Account/Membership happens
// via claimResidentProfile below, a separate, later step.
// german-ui-vocabulary (design.md Decision 4).
export type ClaimErrorCode = "not_found" | "not_prepared" | "signup_failed";

export class ClaimError extends Error {
  constructor(message: string, readonly code: ClaimErrorCode) {
    super(message);
  }
}

// ⚠ THIS FUNCTION CLAIMS A PREPARED PROFILE WITH NO SECRET AND NO LINK. Do not call it from
// anything reachable by a request.
//
// It creates the Auth user with whatever password it is handed, so calling it is *becoming* that
// resident — no credential is checked, and the household id is explicitly not a security boundary
// (C-1.4). That is exactly the hole join-by-link design.md Decision 13 closed by deleting `/claim`
// and requiring a bound invitation link instead, and `tests/integration/policy/no-claim-without-
// link.test.ts` is the test that fails if this reappears on a route. Reaching it from a route or a
// server action would reopen that hole, and it will look like perfectly ordinary code.
//
// The "sign up against a prepared profile" step FR-1.5 implies but doesn't name as its own FR —
// needed for AC-1.3's independent test ("a sign-out/sign-in cycle is required to act as that
// resident") to be exercisable at all. Creates a new Supabase Auth user at the profile's derived
// email, a new Account, and a Membership with is_resident = true.
//
// join-by-link design.md Decision 13: NOT reachable from any route any more — `/claim` (the only
// caller) is deleted, and its logic is folded into joinHousehold's bound branch below (which does
// its own equivalent work inline, inside the SAME transaction as the claim itself, rather than
// calling this function — Decision 1's whole point is that nothing here runs across two separate
// transactions). This function stays exported and unmodified purely because a broad set of
// unrelated tests (round/quorum/permission tests that need a quick second resident, nothing to do
// with joining or claiming) still use it as a direct, no-HTTP fixture — verified by
// `grep -rn "claimResidentProfile" src/`: every remaining call site outside this file is under
// `tests/`, never under `src/app/`. If a future cleanup removes that reliance too, delete this
// function then rather than leaving it "just in case".
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
    if (!profile) throw new ClaimError(`ResidentProfile not found: ${residentProfileId}`, "not_found");
    if (profile.status !== "prepared") {
      throw new ClaimError(`ResidentProfile ${residentProfileId} is not prepared for claiming`, "not_prepared");
    }

    const derivedEmail = deriveResidentEmail(residentProfileId);
    const { data, error } = await supabaseAdmin().auth.admin.createUser({
      email: derivedEmail,
      password,
      email_confirm: true, // identity.md: "gilt beim Anbieter als bestätigt" — a technical
      // precondition for the sign-in path, not a claim about a real mailbox.
    });
    if (error || !data.user) {
      throw new ClaimError(error?.message ?? "Supabase Auth did not return a user", "signup_failed");
    }

    const accountId = data.user.id;

    await tx.insert(account).values({ id: accountId, householdId: context.householdId });

    // Human decision, 2026-09-22: no permission is inferred from being first, or from anything
    // else about how a membership came about (docs/domain/identity.md §2.1's close_round note).
    // close_round is now a role default (MODERATOR_DEFAULT_PERMISSIONS in this file) held by
    // every household_admin and moderator — a plain member membership starts with permissions: []
    // unconditionally, the same as any other newly created membership.
    const [membershipRow] = await tx
      .insert(membership)
      .values({
        householdId: context.householdId,
        accountId,
        residentProfileId,
        isResident: true,
        role: "member",
        permissions: [],
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

// docs/GUARDRAILS.md:108 / Session.token_hash's documented "nur der Hash" contract: this column
// must never hold token material, only a one-way digest of it. Keyed (HMAC) rather than plain
// SHA-256 so the same digest can later back a lookup-by-token (revocation, session listing)
// without a leaked digest alone being usable to search for a matching token — that requires the
// server-side secret too. Exported so future lookup/revocation code hashes with this exact
// function, keeping write and read consistent.
export function hashSessionToken(accessToken: string): string {
  const secret = process.env.SESSION_TOKEN_HASH_SECRET;
  if (!secret) throw new Error("SESSION_TOKEN_HASH_SECRET is not configured");
  return createHmac("sha256", secret).update(accessToken).digest("hex");
}

// design.md Decision 3: the join route's rate-limit key. Reuses SESSION_TOKEN_HASH_SECRET with a
// "join-attempt:" domain-separation prefix, rather than a second environment variable — the
// prefix already buys key separation from hashSessionToken's own digests (join-code-normalisation
// tests assert the two differ for the same input), and a second secret would be one more
// deployment step in every environment for no real gain. Where no IP can be determined, EVERY such
// request funnels into ONE shared bucket rather than being exempted — failing open on a missing
// header would make the limit optional for anyone who can omit it (design.md Decision 3).
export function joinAttemptSourceHash(ip: string | null): string {
  const secret = process.env.SESSION_TOKEN_HASH_SECRET;
  if (!secret) throw new Error("SESSION_TOKEN_HASH_SECRET is not configured");
  return createHmac("sha256", secret).update(`join-attempt:${ip ?? "unknown"}`).digest("hex");
}

// german-ui-vocabulary (design.md Decision 4). Six throw sites converge to five codes: Decision
// 5 / proposal.md Assumption 6 merges "No such resident in this household" and "Invalid
// credentials" into `invalid_credentials` — telling the two apart would let an unauthenticated
// visitor learn whether a display name exists in the household.
export type SignInErrorCode =
  | "missing_fields"
  | "invalid_household"
  | "invalid_credentials"
  | "no_household"
  | "no_membership";

export class SignInError extends Error {
  constructor(message: string, readonly code: SignInErrorCode) {
    super(message);
  }
}

export interface SignInResult {
  session: typeof session.$inferSelect;
  context: SessionContext;
}

// design.md Decision 5 (FR-2.12/EC-2.10): the long session is 90 days, gliding; the short one is a
// genuinely SHORT SERVER-SIDE lifetime of 12 hours — not a cookie that merely disappears when the
// browser closes (EC-2.10: "a session cookie has no server-side expiry, so closing the browser
// would discard the cookie while leaving the session row valid for anyone holding the token"). The
// row is the thing that expires; setSessionCookie's maxAge below only decides when the cookie
// itself stops being sent.
const REMEMBER_ME_SESSION_MS = 90 * 24 * 60 * 60 * 1000;
const SHORT_SESSION_MS = 12 * 60 * 60 * 1000;

// design.md Decision 5: one place decides what a session row looks like — signIn below and
// joinHousehold (task group 7) both call this instead of each inserting their own, which is what
// G-D14 depends on: acting_profile_id is set exactly ONCE, here, and never written again.
// File-private: nothing outside this module needs to build a session row directly.
async function insertSessionTx(
  tx: Tx,
  params: {
    householdId: string;
    accountId: string;
    actingProfileId: string | null;
    accessToken: string;
    rememberMe: boolean;
  },
): Promise<typeof session.$inferSelect> {
  const expiresAt = new Date(
    Date.now() + (params.rememberMe ? REMEMBER_ME_SESSION_MS : SHORT_SESSION_MS),
  );
  const [sessionRow] = await tx
    .insert(session)
    .values({
      householdId: params.householdId,
      tokenHash: hashSessionToken(params.accessToken), // HMAC digest, not the token itself —
      // Supabase's own JWT remains the bearer credential; this column exists so this app's own
      // Session row can be looked up/revoked per identity.md's Session entity.
      accountId: params.accountId,
      actingProfileId: params.actingProfileId,
      rememberMe: params.rememberMe,
      expiresAt,
    })
    .returning();
  return sessionRow;
}

// FR-1.6/ADR-013: the acting identity of a session is fixed at sign-in and never written again.
// Two entry modes:
//  - household: (email, password) — the household account's own credentials.
//  - resident:  (householdId, displayName, password) — resolved to the derived email (research.md
//    §2) before delegating to Supabase Auth. `householdId` is taken as already known by the
//    caller (typically remembered on the device, identity.md §2.1) — F1 does not build a
//    household-lookup-by-name screen; that is part of F2's join flow, which is what establishes
//    the remembered-device state this sign-in step assumes.
//
// join-by-link design.md Decision 5: `options.rememberMe` defaults to `true`, so registration and
// the resident-claim flow (neither of which pass it) behave exactly as before — only the join
// form's "stay signed in" checkbox (task group 8) actually threads a value through. Screen A2 (the
// ordinary sign-in form) gets no checkbox in this change (proposal Assumption 8).
export async function signIn(
  input:
    | { kind: "household"; email: string; password: string }
    | { kind: "resident"; householdId: string; displayName: string; password: string }
    // resident-settings (human decision 2026-09-24, walkthrough): the resident tab's own email
    // path. Same address lookup as "household", but the account it resolves to MUST be a resident
    // one. Choosing the tab is choosing the identity (ADR-013), so the household account's address
    // typed here is refused rather than silently opening a household session.
    | { kind: "resident_email"; email: string; password: string },
  options: { rememberMe?: boolean } = {},
): Promise<SignInResult> {
  let email: string;
  if (input.kind === "household" || input.kind === "resident_email") {
    email = input.email;
  } else {
    // Blank fields reach here unvalidated from the resident sign-in form (no `required`,
    // `noValidate`) — reject before householdId hits withSessionContext's assertUuid, whose plain
    // Error isn't a SignInError and would otherwise surface as an unhandled crash.
    if (!input.householdId.trim() || !input.displayName.trim()) {
      throw new SignInError("Household and name are required", "missing_fields");
    }
    // A non-blank but non-UUID-shaped householdId (e.g. "not-a-uuid") would otherwise still reach
    // withSessionContext's assertUuid below and throw a plain Error there instead — same isUuid
    // shape check the claim action and cookie parser already use for this exact input.
    if (!isUuid(input.householdId)) {
      throw new SignInError("Invalid household", "invalid_household");
    }

    // Resolve display_name -> ResidentProfile.id -> Membership.account_id within the already-known
    // household. This read is legitimately RLS-scoped (household_id is a real input here, not
    // something being discovered), unlike the account_id -> household_id bootstrap below.
    //
    // resident-settings design.md Decision 1: the provider is the authority for its own sign-in
    // identifier — this no longer rebuilds the derived address from the profile id. A resident who
    // has since added a real address (at join or in E1) had it REPLACE the derived one at the
    // provider (identity/account-settings), so rebuilding the derived address here would sign in
    // against an address the provider no longer recognises for that account. Asking the provider
    // for its CURRENT email instead has no invariant to keep — it costs one extra Auth call per
    // name sign-in, and is immune to `account.email` and the Auth address ever diverging (a
    // resident who joined with an email before this change, or a commit that failed after the Auth
    // update but before `account.email` was written).
    const bootstrapContext: SessionContext = {
      accountId: randomUUID(), // no account is acting yet; only householdId matters for this scan
      householdId: input.householdId,
      profileId: null,
    };
    const [resolvedAccount] = await withSessionContext(bootstrapContext, (tx) =>
      tx
        .select({ accountId: membership.accountId })
        .from(residentProfile)
        .innerJoin(membership, eq(membership.residentProfileId, residentProfile.id))
        .where(
          and(
            eq(residentProfile.householdId, input.householdId),
            eq(residentProfile.displayName, input.displayName),
            notInArray(residentProfile.status, [...NAME_RELEASING_STATUSES]),
          ),
        ),
    );
    // design.md Decision 5 / proposal.md Assumption 6: converges with the "Invalid credentials"
    // throw below on the single code `invalid_credentials` — this is the change's one
    // user-visible behaviour change (tasks.md 2.2). A profile with no membership yet (still
    // `prepared`, never claimed) has no account to resolve either, and fails the same way.
    if (!resolvedAccount) throw new SignInError("No such resident in this household", "invalid_credentials");

    // Every failure past this point stays invalid_credentials too — a missing Auth user is exactly
    // as uninformative to the caller as a wrong password would be.
    const { data: userData, error: userError } = await supabaseAdmin().auth.admin.getUserById(
      resolvedAccount.accountId,
    );
    if (userError || !userData.user?.email) {
      throw new SignInError("Invalid credentials", "invalid_credentials");
    }
    email = userData.user.email;
  }

  const { data, error } = await supabaseAdmin().auth.signInWithPassword({
    email,
    password: input.password,
  });
  if (error || !data.user || !data.session) {
    throw new SignInError("Invalid credentials", "invalid_credentials");
  }

  const accountId = data.user.id;

  // The ONE deliberate RLS bootstrap hole (drizzle/0005_*.sql): account_id is already verified by
  // Supabase Auth above; this resolves it to the household_id RLS needs for everything after.
  const householdId = await resolveAccountHousehold(accountId);
  if (!householdId) throw new SignInError("Account has no household", "no_household");

  const context: SessionContext = { accountId, householdId, profileId: null };

  return withSessionContext(context, async (tx) => {
    // PR #18 review: without a lock this check races a removal. Sign-in reads revokedAt = null,
    // the removal then revokes the membership and revokes every session it can SEE — which does
    // not yet include the one this transaction is about to insert — and that new session survives
    // the removal. `.for("update")` serializes the two on the membership row:
    //  - removal locked it first: this SELECT blocks until the removal commits, then reads the
    //    revoked row and refuses below;
    //  - sign-in locked it first: the removal's membership UPDATE waits until this commits, and
    //    its later session UPDATE (a fresh READ COMMITTED snapshot) then sees and revokes the
    //    session inserted here.
    //
    // No deadlock: removeMember/setMovedOut take row locks in the order resident_profile (the
    // status UPDATE) → membership → session; signIn takes only the membership lock and then
    // INSERTs, never touching resident_profile, so the two never wait on each other in reverse.
    const [membershipRow] = await tx
      .select()
      .from(membership)
      .where(eq(membership.accountId, accountId))
      .for("update");
    if (!membershipRow) throw new SignInError("Account has no membership", "no_membership");

    // design.md Decision 6 (V-3 "sofortiger Zugriffsentzug"): a revoked membership must not be
    // able to open a NEW session either — Supabase Auth has already issued its own session by
    // this point (signInWithPassword above), but it is discarded unstored here, exactly like
    // every other refusal after that call. Same code as a wrong password (proposal Assumption 4)
    // — a moved-out or removed person learns nothing about why. household_admin's own membership
    // is never revoked (C-1.4), so this can never lock out administration.
    if (membershipRow.revokedAt) {
      throw new SignInError("Membership revoked", "invalid_credentials");
    }

    // resident_email: the same refusal as a wrong password, so the resident tab says nothing about
    // whether the address belongs to a household account.
    if (input.kind === "resident_email" && !membershipRow.isResident) {
      throw new SignInError("Not a resident account", "invalid_credentials");
    }

    // ADR-013/G-D14: acting_profile_id is set here, once, and never written again. `null` for a
    // household account (is_resident = false); the profile id for a resident account.
    const actingProfileId = membershipRow.isResident ? membershipRow.residentProfileId : null;

    const sessionRow = await insertSessionTx(tx, {
      householdId,
      accountId,
      actingProfileId,
      accessToken: data.session!.access_token,
      rememberMe: options.rememberMe ?? true,
    });

    return {
      session: sessionRow,
      context: { accountId, householdId, profileId: actingProfileId },
    };
  });
}

// german-ui-vocabulary (design.md Decision 4, this change's own Decision 4): a `code`
// discriminant, never a message, is what the join action switches on.
export type JoinErrorCode =
  | "invalid_link"
  | "name_taken"
  | "rate_limited"
  | "missing_fields"
  | "password_too_short"
  | "already_member"
  | "other_household"
  | "signup_failed"
  // resident-settings design.md Decision 3: the provider's duplicate-email refusal, thrown before
  // anything is committed — the link's use rolls back with the rest (spent only by a join that
  // completes).
  | "email_taken"
  // review fix: a malformed (but non-empty) email at join — thrown BEFORE any Auth user is
  // created or any link is claimed (joinHousehold below), same "keeps what was typed" convention
  // as name_taken/email_taken.
  | "invalid_email"
  // review fix: redeemPasswordReset's OWN outcome for a sign-in failure reached AFTER its
  // transaction has already committed — the password is changed and the link is spent, so this
  // must never be shown as a failed reset (signup_failed). Thrown only after commit.
  | "reset_done_sign_in_failed";

export class JoinError extends Error {
  constructor(message: string, readonly code: JoinErrorCode) {
    super(message);
  }
}

// design.md's Open Question, resolved at implementation time: flatmate-io-dev's configured
// Supabase Auth minimum was read directly against the project (createUser probe) rather than
// assumed — 6 characters, Supabase's own default. No stricter rule is invented here, because no
// requirement asks for one (design.md Decision 11). Exported so the join form's field text states
// the exact number this validates against.
export const JOIN_PASSWORD_MIN_LENGTH = 6;

// review fix: the missing/too-short check was written out three times (joinHousehold,
// changeResidentPassword, redeemPasswordReset below) with identical rules — one helper computes
// which rule (if any) a password value fails; each caller still throws its OWN error class and
// code (JoinError vs AccountSettingsError), so behaviour and codes stay exactly as they were.
type PasswordRuleFailure = "missing_password" | "password_too_short";

function checkPasswordRule(password: string): PasswordRuleFailure | null {
  if (!password) return "missing_password";
  if (password.length < JOIN_PASSWORD_MIN_LENGTH) return "password_too_short";
  return null;
}

export interface JoinHouseholdInput {
  // join-by-link design.md Decision 13: optional — a BOUND link's display name comes from the
  // profile it names, never from the form (task 12.7's form renders no name field for one at
  // all). A NEUTRAL link still requires it, checked below once the link is resolved and its kind
  // is known.
  displayName?: string;
  password: string;
  email?: string | null;
}

export interface JoinHouseholdResult {
  session: typeof session.$inferSelect;
  context: SessionContext;
}

// FR-2.18/FR-2.6/FR-2.19/EC-2.1 (design.md Decision 1): redeem a join link. Order matters and
// mirrors design.md's numbered steps exactly (steps 1–2, the rate limit and normalisation, happen
// in the caller — the route — BEFORE this is ever called, per AC-2.25's "refused without being
// checked against any link"; normalisation itself happens a second time for free, inside
// resolveJoinCode/claimJoinCodeTx below):
//   3 resolve (non-consuming) -> 4 validate -> 5 collision check -> 6 create Auth user ->
//   7 sign in -> 8 ONE transaction (claim + resident_profile + account + membership +
//   activity_event + session) -> caller sets the cookie (step 9).
//
// claimResidentProfile (above) does not fit this job: it requires a pre-existing `prepared`
// profile, and self-service join has none — this creates the ResidentProfile itself, active from
// the start.
export async function joinHousehold(
  code: string,
  input: JoinHouseholdInput,
  options: { rememberMe?: boolean; currentSession?: SessionContext | null } = {},
): Promise<JoinHouseholdResult> {
  const displayNameInput = input.displayName?.trim() ?? "";
  const password = input.password;

  const passwordFailure = checkPasswordRule(password);
  if (passwordFailure === "missing_password") {
    throw new JoinError("Password is required", "missing_fields");
  }
  if (passwordFailure === "password_too_short") {
    throw new JoinError(
      `Password must be at least ${JOIN_PASSWORD_MIN_LENGTH} characters`,
      "password_too_short",
    );
  }

  // review fix: the optional email is normalised (trim + lower-case, normalizeEmail below) and
  // validated (isWellFormedEmail) exactly like E1's own changeResidentEmail — previously this was
  // sent to Supabase Auth unvalidated and un-normalised, so a malformed address failed the WHOLE
  // join as an opaque signup_failed, and mixed case reached the provider/account.email un-lowered
  // while E1 always lower-cases. Empty stays allowed (FR-2.11); a malformed value is refused here,
  // BEFORE any Auth user is created (createUser below) or any link is claimed (claimJoinCodeTx
  // inside the transaction below).
  const trimmedEmail = input.email?.trim() ?? "";
  const email = trimmedEmail ? normalizeEmail(trimmedEmail) : null;
  if (email && !isWellFormedEmail(email)) {
    throw new JoinError("Email address is not well-formed", "invalid_email");
  }

  // Step 3: non-consuming resolve — tells this function which household's display-name space to
  // check and which household the new rows belong to, before anything is created. FR-2.9's
  // household name (shown on the page before any field is requested) already came from an earlier
  // call to this same function at page-load time; this one is what makes the ordering in the
  // proposal's step list ("validate again at submission, not only when it is opened", EC-2.9)
  // real rather than aspirational — a SECOND, CONSUMING check happens inside the transaction below
  // (claimJoinCodeTx), which is what actually enforces it.
  const resolved = await resolveJoinCode(code);
  if (!resolved) throw new JoinError("Join code is not valid", "invalid_link");

  // resident-settings design.md Decision 3 (pre-mortem fix, 2026-09-24): a reset link also resolves
  // with a bound profile (identity/password-reset), so without this check the join path would treat
  // it as an invitation and fail at createUser — the derived address of an existing, active profile
  // is already registered there. That failure would be signup_failed, not invalid_link (FR-2.8),
  // which is why this runs FIRST, immediately after resolving, before the bound/neutral split below
  // ever looks at `resolved.boundResidentProfile`.
  if (resolved.purpose !== "join") {
    throw new JoinError("Join code is not valid", "invalid_link");
  }

  // design.md Decision 9 (EC-2.4/EC-2.5): a visitor already signed in gets no second identity.
  // The route's own GET render already refuses to show the form in either case (page.tsx), so
  // this is a defence-in-depth re-check for the submit path itself (e.g. a session established in
  // another tab between page load and submit) — not the primary enforcement point.
  if (options.currentSession) {
    if (options.currentSession.householdId === resolved.householdId) {
      throw new JoinError("Visitor already belongs to this household", "already_member");
    }
    throw new JoinError("Visitor is signed in to a different household", "other_household");
  }

  // design.md Decision 13: only NOW that the link is resolved do we know whether it is bound.
  // A bound link's display name comes from the NAMED PROFILE, never from the form — the visitor
  // is greeted by it and never types one (task 12.7's form has no name field for this case). A
  // neutral link requires one, exactly as before this change.
  const bound = resolved.boundResidentProfile;
  if (!bound && !displayNameInput) {
    throw new JoinError("Display name is required", "missing_fields");
  }
  const displayName = bound ? bound.displayName : displayNameInput;

  // Bootstrap context: no account exists yet, but the household is already known (the resolved
  // link named it) — the same shape as resolveAccountHousehold's own pre-session lookup elsewhere
  // in this file.
  const bootstrapContext: SessionContext = {
    accountId: randomUUID(),
    householdId: resolved.householdId,
    profileId: null,
  };
  // design.md Decision 13: skipped entirely for a bound link — the name is already legitimately
  // held by the very profile being claimed (isDisplayNameTaken would otherwise always refuse the
  // profile's own name). The collision check only protects a NEW name a visitor is choosing.
  if (!bound && (await isDisplayNameTaken(bootstrapContext, displayName))) {
    throw new JoinError(`Display name "${displayName}" is already taken in this household`, "name_taken");
  }

  // The resident profile's id is generated up front, exactly as registerHousehold generates
  // householdId up front — deriveResidentEmail needs it before the Auth user can be created. A
  // bound link already has an id (the profile it names, from the resolve above) — reused rather
  // than generating a second one, since the claim below activates that SAME row.
  const residentProfileId = bound ? bound.id : randomUUID();
  const derivedEmail = deriveResidentEmail(residentProfileId);
  // resident-settings design.md Decision 3: the SUPPLIED address (if any) goes to the provider too
  // now, exactly as an address added later in E1 does (identity/join: "the address also becomes the
  // resident's sign-in address at the provider") — never the derived one when a real address is
  // given. `account.email` keeps storing the supplied address either way (unchanged below).
  const authEmail = email ?? derivedEmail;

  const { data, error } = await supabaseAdmin().auth.admin.createUser({
    email: authEmail,
    password,
    email_confirm: true, // identity.md: a technical precondition for the sign-in path, not a
    // claim about a real mailbox — same reasoning as registerHousehold/claimResidentProfile.
  });
  if (error || !data.user) {
    if (isEmailTakenError(error, "create")) {
      throw new JoinError("Email address is already in use", "email_taken");
    }
    throw new JoinError(error?.message ?? "Supabase Auth did not return a user", "signup_failed");
  }

  const accountId = data.user.id;

  try {
    const { data: signInData, error: signInError } = await supabaseAdmin().auth.signInWithPassword({
      email: authEmail,
      password,
    });
    if (signInError || !signInData.user || !signInData.session) {
      throw new JoinError("Sign-in immediately after join's own createUser failed", "signup_failed");
    }

    const context: SessionContext = {
      accountId,
      householdId: resolved.householdId,
      profileId: residentProfileId,
    };

    return await withSessionContext(context, async (tx) => {
      // design.md Decision 2: the claim runs INSIDE this transaction, not before it. There is no
      // half-spent state to arbitrate — a failure anywhere else in this transaction rolls the
      // increment back with everything else, and the count is still never decremented on any
      // other path (a failed attempt simply never incremented it in the first place).
      const claimed = await claimJoinCodeTx(tx, code, "join");
      if (!claimed) throw new JoinError("Join code is not valid", "invalid_link");

      // design.md Decision 13: branch exactly once on the CONSUMING claim's own answer (not the
      // earlier non-consuming `resolved`/`bound` above) — this is the authoritative check the
      // whole transaction hinges on. Bound: activate the prepared profile the link named
      // (claimResidentProfile's old logic, folded in here per task 12.10) instead of inserting a
      // second one. Neutral: unchanged, insert a brand-new active profile.
      if (claimed.boundResidentProfile) {
        // The `prepared` predicate is the invariant, not a belt-and-braces check (third review of
        // PR #17). Issuing a SECOND link for a still-prepared profile is legitimate — a moderator
        // re-sending an invitation — so the rule cannot live at issue time; it has to be decided
        // here, where the profile is actually taken over. Conditional UPDATE rather than
        // read-then-write, for the same reason claim_join_code is one statement: the row lock this
        // takes serializes two concurrent bound claims, and the loser matches zero rows.
        //
        // Until this predicate existed the outcome was prevented only by accident:
        // deriveResidentEmail is derived from the PROFILE id, so a second redemption produced the
        // same Auth address and Supabase refused it — which meant the visitor met a generic
        // `signup_failed` instead of a refusal, and the guarantee rested on an address scheme
        // nothing declares as its guardian.
        //
        // Refused as `invalid_link`, FR-2.8's single message: from the visitor's side a link whose
        // profile is already claimed is simply a link that does not work, and they have not earned
        // the reason.
        const activated = await tx
          .update(residentProfile)
          .set({ status: "active", movedInOn: new Date().toISOString().slice(0, 10) })
          .where(
            and(
              eq(residentProfile.id, claimed.boundResidentProfile.id),
              eq(residentProfile.status, "prepared"),
            ),
          )
          .returning({ id: residentProfile.id });
        if (activated.length === 0) {
          throw new JoinError("Bound profile is no longer claimable", "invalid_link");
        }
      } else {
        await tx.insert(residentProfile).values({
          id: residentProfileId,
          householdId: resolved.householdId,
          displayName,
          status: "active",
          movedInOn: new Date().toISOString().slice(0, 10),
        });
      }

      await tx.insert(account).values({
        id: accountId,
        householdId: resolved.householdId,
        email, // the optional supplied email, or null — this DB column, unlike the provider
        // address above, has always stored exactly this and is unaffected by design.md Decision 3
      });

      // design.md Decision 7 (identity/permissions capability's "no permission is inferred from
      // how a membership came about"): role: "member", permissions: [] — nothing is inferred from
      // being first, from the link used, or from anything else about the arrival. The
      // household_admin/moderator close_round default (task group 1) is unaffected — a
      // link-joiner is neither.
      await tx.insert(membership).values({
        householdId: resolved.householdId,
        accountId,
        residentProfileId,
        isResident: true,
        role: "member",
        permissions: [],
        joinedViaIssuanceId: claimed.issuanceId,
      });

      // design.md Decision 8 (FR-2.19/AC-2.19): empty payload — the issuance is the
      // joinedViaIssuanceId COLUMN, never a second copy here (G-D8), and the code never enters a
      // payload at all (G-A5). subject is the new resident profile; actor is the joiner's own.
      await recordActivityEvent(tx, {
        householdId: resolved.householdId,
        eventType: "membership.joined",
        subjectType: "resident_profile",
        subjectId: residentProfileId,
        actorAccountId: accountId,
        actorProfileId: residentProfileId,
        payload: {},
      });

      const sessionRow = await insertSessionTx(tx, {
        householdId: resolved.householdId,
        accountId,
        actingProfileId: residentProfileId,
        accessToken: signInData.session!.access_token,
        rememberMe: options.rememberMe ?? true,
      });

      return {
        session: sessionRow,
        context: { accountId, householdId: resolved.householdId, profileId: residentProfileId },
      };
    });
  } catch (err) {
    // task 7.4: on ANY failure after the Auth user exists, delete it best-effort — matching
    // undoClaimResidentProfile/undoRegisterHousehold's comment and reasoning exactly. No other
    // compensating undo is needed: everything else above is inside the transaction (design.md
    // Decision 1), which rolls itself back on any error without help from this catch.
    try {
      await supabaseAdmin().auth.admin.deleteUser(accountId);
    } catch {
      // ponytail: best-effort external cleanup, no retry loop — see comment above.
    }
    throw err;
  }
}

// resident-settings design.md Decisions 2/7: E1's own settings errors. One class, several codes —
// changeResidentEmail uses missing_email/invalid_email/email_taken/not_a_resident,
// changeResidentPassword uses missing_fields/password_too_short/wrong_current_password/
// not_a_resident. german-ui-vocabulary (design.md Decision 4): a `code` discriminant, never a
// message, same convention as JoinError/SignInError/ClaimError above.
export type AccountSettingsErrorCode =
  | "missing_email"
  | "invalid_email"
  | "email_taken"
  | "not_a_resident"
  | "missing_fields"
  | "password_too_short"
  | "wrong_current_password";

export class AccountSettingsError extends Error {
  constructor(message: string, readonly code: AccountSettingsErrorCode) {
    super(message);
  }
}

// design.md Decision 2: one plain shape check (x@y.z, no whitespace), no library — matches
// identity/account-settings' "well-formed address" without inventing a stricter rule than any
// requirement asks for (same reasoning as JOIN_PASSWORD_MIN_LENGTH above). Exported, like
// repository.ts's normalizeJoinCode/isWellFormedJoinCode, so it is directly unit-testable without
// a database or Supabase Auth round trip.
const EMAIL_SHAPE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// design.md Decision 2 step 1: trim, then lower-case — the stored/provider address is always
// lower-case, so two submissions differing only by case are the same "unchanged address" (D2's
// no-write, no-audit branch) rather than a spurious change.
export function normalizeEmail(raw: string): string {
  return raw.trim().toLowerCase();
}

export function isWellFormedEmail(normalized: string): boolean {
  return EMAIL_SHAPE.test(normalized);
}

// design.md Decision 2: DB row locked first, Auth updated inside the transaction.
//   1. validate (trim, lower-case; empty is refused whether or not an address exists already —
//      this is how "change but not remove", proposal Assumption 3, is enforced);
//   2. identity: resident-only, account is ALWAYS current.context.accountId, never a form value;
//   3. SELECT account ... FOR UPDATE (serializes against a concurrent change of the same account,
//      and against D5's redemption, which locks the same row); unchanged address writes nothing;
//      auth.admin.updateUserById(email, email_confirm: true) — email_confirm is a technical
//      precondition for the provider's sign-in path (identity.md provider rule 2), never a claim
//      about delivery, which stays account.email_verified_at's alone; on email_exists, throw
//      email_taken; then UPDATE account SET email, email_verified_at = null, and record
//      account.email_changed.
// A failed commit after a successful provider update leaves Auth ahead of account.email — D1
// makes sign-in immune to that (it always asks the provider), and saving again repairs the DB row.
// Accepted and documented rather than compensated (design.md Decision 2).
export async function changeResidentEmail(current: CurrentSession, rawEmail: string): Promise<void> {
  const email = normalizeEmail(rawEmail);
  if (!email) {
    throw new AccountSettingsError("Email address is required", "missing_email");
  }
  if (!isWellFormedEmail(email)) {
    throw new AccountSettingsError("That does not look like a well-formed email address", "invalid_email");
  }

  const { context } = current;
  if (context.profileId === null) {
    throw new AccountSettingsError(
      "Only a resident may change their own email address (identity/account-settings)",
      "not_a_resident",
    );
  }

  await withSessionContext(context, async (tx) => {
    const [row] = await tx.select().from(account).where(eq(account.id, context.accountId)).for("update");
    if (!row || row.email === email) return; // no account, or unchanged — no write, no audit

    const { error } = await supabaseAdmin().auth.admin.updateUserById(context.accountId, {
      email,
      email_confirm: true,
    });
    if (error) {
      if (isEmailTakenError(error, "update")) {
        throw new AccountSettingsError("Email address is already in use", "email_taken");
      }
      throw error;
    }

    await tx
      .update(account)
      .set({ email, emailVerifiedAt: null })
      .where(eq(account.id, context.accountId));

    await recordActivityEvent(tx, {
      householdId: context.householdId,
      eventType: "account.email_changed",
      subjectType: "account",
      subjectId: context.accountId,
      actorAccountId: context.accountId,
      actorProfileId: context.profileId,
      payload: {},
    });
  });
}

// design.md Decision 7: resident-only, as changeResidentEmail above.
//   1. validate the new password with the join rule (JOIN_PASSWORD_MIN_LENGTH);
//   2. check the current password by calling signInWithPassword with the provider's CURRENT
//      address (D1's own lookup, auth.admin.getUserById) — the session it returns is discarded, as
//      signIn already does on refusal. A failure is wrong_current_password;
//   3. updateUserById(password);
//   4. in a transaction, revoke every OTHER session of the account (current.sessionId is kept) and
//      record account.password_changed.
// Order matters (provider first, sessions second): if the revoke fails after the provider change,
// the password is changed and other devices stay signed in until the resident retries — the benign
// direction. The reverse order could end sessions for a password that never actually changed.
export async function changeResidentPassword(
  current: CurrentSession,
  currentPassword: string,
  newPassword: string,
): Promise<void> {
  const { context, sessionId } = current;
  if (context.profileId === null) {
    throw new AccountSettingsError(
      "Only a resident may change their own password (identity/account-settings)",
      "not_a_resident",
    );
  }
  // review fix (checkPasswordRule): the shared helper covers newPassword's own rule; currentPassword
  // has no length rule of its own here, only "present" — checked first so the combined
  // missing_fields message ("current AND new are required") still fires when either is empty,
  // exactly as the original `!currentPassword || !newPassword` did.
  if (!currentPassword) {
    throw new AccountSettingsError("Current and new password are required", "missing_fields");
  }
  const passwordFailure = checkPasswordRule(newPassword);
  if (passwordFailure === "missing_password") {
    throw new AccountSettingsError("Current and new password are required", "missing_fields");
  }
  if (passwordFailure === "password_too_short") {
    throw new AccountSettingsError(
      `Password must be at least ${JOIN_PASSWORD_MIN_LENGTH} characters`,
      "password_too_short",
    );
  }

  const { data: userData, error: userError } = await supabaseAdmin().auth.admin.getUserById(context.accountId);
  if (userError || !userData.user?.email) {
    throw new AccountSettingsError("Current password is incorrect", "wrong_current_password");
  }

  const { error: signInError } = await supabaseAdmin().auth.signInWithPassword({
    email: userData.user.email,
    password: currentPassword,
  });
  if (signInError) {
    throw new AccountSettingsError("Current password is incorrect", "wrong_current_password");
  }

  const { error: updateError } = await supabaseAdmin().auth.admin.updateUserById(context.accountId, {
    password: newPassword,
  });
  if (updateError) throw updateError;

  await withSessionContext(context, async (tx) => {
    await tx
      .update(session)
      .set({ revokedAt: new Date() })
      .where(and(eq(session.accountId, context.accountId), ne(session.id, sessionId), isNull(session.revokedAt)));

    await recordActivityEvent(tx, {
      householdId: context.householdId,
      eventType: "account.password_changed",
      subjectType: "account",
      subjectId: context.accountId,
      actorAccountId: context.accountId,
      actorProfileId: context.profileId,
      payload: {},
    });
  });
}

// resident-settings design.md Decision 5: redeeming an administration-issued reset link
// (identity/password-reset) — mirrors joinHousehold's bound branch, reusing JoinError/JoinErrorCode
// (the same "one invalid-link message" convention, FR-2.8) rather than a new error class, since
// nothing about a reset's refusals differs from a join's from the caller's point of view.
//
//   1. validate the password (same rule as join: missing_fields, password_too_short);
//   2. resolveJoinCode(code) (the route already recorded the attempt) — must return
//      purpose = 'password_reset', else invalid_link;
//   3. one transaction, in the household's own bootstrap context:
//      a. claimJoinCodeTx(tx, code, 'password_reset') — no row means invalid_link;
//      b. SELECT membership ... FOR UPDATE, then SELECT account ... FOR UPDATE — re-check that the
//         membership is live, the profile is active, and the account still has no email; anything
//         else is invalid_link. The locks serialize against changeResidentEmail's own account lock
//         and against a concurrent removal (which locks membership) — the re-check makes the SQL
//         predicate's own snapshot irrelevant;
//      c. revoke EVERY session of the account;
//      d. record account.password_reset_by_admin: subject is the resident profile, actor account
//         is the issuance's OWN created_by_account_id (the reset is the administration's act; the
//         redeemer only completes it), actor profile null, payload {};
//      e. auth.admin.updateUserById(password) — a failure throws and the whole transaction rolls
//         back, including the claim, so the link is not spent;
//   4. after commit: signInWithPassword with the account's current Auth email (D1's lookup), then
//      insertSessionTx with rememberMe, acting as the reset profile.
//
// Lock order: membership -> account, then session (an UPDATE, no lock needed on it) — never
// resident_profile. No path here takes these in reverse, so no deadlock with joinHousehold's bound
// branch (resident_profile only), signIn (membership only) or changeResidentEmail (account only).
export async function redeemPasswordReset(
  code: string,
  input: { password: string },
  options: { rememberMe?: boolean; currentSession?: CurrentSession | null } = {},
): Promise<JoinHouseholdResult> {
  const password = input.password;
  const passwordFailure = checkPasswordRule(password);
  if (passwordFailure === "missing_password") {
    throw new JoinError("Password is required", "missing_fields");
  }
  if (passwordFailure === "password_too_short") {
    throw new JoinError(
      `Password must be at least ${JOIN_PASSWORD_MIN_LENGTH} characters`,
      "password_too_short",
    );
  }

  const resolved = await resolveJoinCode(code);
  if (!resolved || resolved.purpose !== "password_reset") {
    throw new JoinError("Join code is not valid", "invalid_link");
  }

  const bootstrapContext: SessionContext = {
    accountId: randomUUID(),
    householdId: resolved.householdId,
    profileId: null,
  };

  const { accountId, profileId } = await withSessionContext(bootstrapContext, async (tx) => {
    const claimed = await claimJoinCodeTx(tx, code, "password_reset");
    const claimedProfileId = claimed?.boundResidentProfile?.id;
    if (!claimed || !claimedProfileId) {
      throw new JoinError("Join code is not valid", "invalid_link");
    }

    const [membershipRow] = await tx
      .select()
      .from(membership)
      .where(eq(membership.residentProfileId, claimedProfileId))
      .for("update");
    if (!membershipRow || membershipRow.revokedAt) {
      throw new JoinError("Join code is not valid", "invalid_link");
    }

    // review fix: created_by_account_id (below) is read HERE, in the same plain SELECT as the
    // profile's own active-status re-check, rather than as a separate statement after the claim —
    // this query carries no FOR UPDATE (unlike membershipRow/accountRow above), so joining
    // join_code_issuance onto it adds no new lock and changes nothing about D5's lock-order
    // analysis (membership -> account, then session; never resident_profile or join_code_issuance).
    const [profileRow] = await tx
      .select({
        status: residentProfile.status,
        createdByAccountId: joinCodeIssuance.createdByAccountId,
      })
      .from(residentProfile)
      .leftJoin(joinCodeIssuance, eq(joinCodeIssuance.id, claimed.issuanceId))
      .where(eq(residentProfile.id, claimedProfileId));
    if (!profileRow || profileRow.status !== "active") {
      throw new JoinError("Join code is not valid", "invalid_link");
    }

    const [accountRow] = await tx
      .select()
      .from(account)
      .where(eq(account.id, membershipRow.accountId))
      .for("update");
    if (!accountRow || accountRow.email !== null) {
      throw new JoinError("Join code is not valid", "invalid_link");
    }

    await tx
      .update(session)
      .set({ revokedAt: new Date() })
      .where(and(eq(session.accountId, accountRow.id), isNull(session.revokedAt)));

    await recordActivityEvent(tx, {
      householdId: resolved.householdId,
      eventType: "account.password_reset_by_admin",
      subjectType: "resident_profile",
      subjectId: claimedProfileId,
      actorAccountId: profileRow.createdByAccountId ?? null,
      actorProfileId: null,
      payload: {},
    });

    const { error: updateError } = await supabaseAdmin().auth.admin.updateUserById(accountRow.id, { password });
    if (updateError) throw updateError;

    return { accountId: accountRow.id, profileId: claimedProfileId };
  });

  // design.md Decision 8 (pre-mortem fix, 2026-09-24): a visitor already signed in (the household
  // account opening the link to check it, say, or the resident's own stale session on the SAME
  // device that lost the password) has their PREVIOUS session revoked now, before the new one is
  // created below — own session only (revokeSession enforces that). Otherwise the cookie the
  // caller is about to overwrite would leave that old session row valid and orphaned. Placed here,
  // once the redemption itself has unconditionally succeeded, not inside the transaction above:
  // this has nothing to do with the reset's own invariants and must never make an otherwise-valid
  // redemption roll back.
  if (options.currentSession) {
    await revokeSession(options.currentSession.context, options.currentSession.sessionId);
  }

  // review fix: past this point the reset transaction has ALREADY COMMITTED — the password is
  // changed, every prior session is revoked, and the link is spent. A failure from here on must
  // not look like a failed reset (the old "signup_failed" code, which the action shows as a
  // generic failure implying nothing happened): reset_done_sign_in_failed is a distinct outcome,
  // thrown only after commit, so the action can send the person to sign in with their new
  // password instead of telling them the reset itself failed.
  const { data: userData, error: userError } = await supabaseAdmin().auth.admin.getUserById(accountId);
  if (userError || !userData.user?.email) {
    throw new JoinError("Reset succeeded but sign-in afterwards failed", "reset_done_sign_in_failed");
  }

  const { data: signInData, error: signInError } = await supabaseAdmin().auth.signInWithPassword({
    email: userData.user.email,
    password,
  });
  if (signInError || !signInData.session) {
    throw new JoinError("Reset succeeded but sign-in afterwards failed", "reset_done_sign_in_failed");
  }

  const context: SessionContext = { accountId, householdId: resolved.householdId, profileId };

  const sessionRow = await withSessionContext(context, (tx) =>
    insertSessionTx(tx, {
      householdId: resolved.householdId,
      accountId,
      actingProfileId: profileId,
      accessToken: signInData.session!.access_token,
      rememberMe: options.rememberMe ?? true,
    }),
  );

  return { session: sessionRow, context };
}
