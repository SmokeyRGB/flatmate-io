import { createHmac, randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { and, eq, isNull, lt, ne, notInArray, sql } from "drizzle-orm";
import { isUuid, withSessionContext, type SessionContext } from "@/db/session-context";
import { recordActivityEvent } from "@/modules/audit/repository";
import type { CurrentSession } from "./session-cookie";
import {
  claimJoinCodeTx,
  isDisplayNameTaken,
  issueJoinCodeTx,
  readDatabaseClock,
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

// Best-effort, no retry loop: a failure deleting the Auth user must not mask the error that made
// the deletion necessary, or crash the request.
async function deleteAuthUserBestEffort(accountId: string): Promise<void> {
  try {
    await supabaseAdmin().auth.admin.deleteUser(accountId);
  } catch (err) {
    console.error(err);
  }
}

// The compensation for a claim or join whose transaction threw after createUser. A thrown commit
// does not prove a rollback: when the account row is there, the commit landed, and deleting the
// Auth user would leave an active profile nobody can sign in as (and a retry refused, since the
// profile or link is spent). So the rows are the authority: the Auth user is deleted only when
// its account row is absent — or when that read fails too, since a database that cannot answer
// most likely never committed, and a blocked address is the worse residual.
async function deleteAuthUserUnlessCommitted(householdId: string, accountId: string): Promise<void> {
  try {
    const rows = await withSessionContext({ accountId, householdId, profileId: null }, (tx) =>
      tx.select({ id: account.id }).from(account).where(eq(account.id, accountId)),
    );
    if (rows.length > 0) return;
  } catch (err) {
    console.error(err);
  }
  await deleteAuthUserBestEffort(accountId);
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
//
// No transaction spans Postgres and Supabase Auth (CLAUDE.md). The state each failure point
// leaves:
//   - createUser fails: nothing exists — signup_failed.
//   - the transaction fails, or its commit does: the Auth user exists and blocks the address (a
//     retry would fail at createUser as a duplicate). The catch below runs undoRegisterHousehold,
//     which deletes this household's rows (a no-op after a rollback; the reconciliation when a
//     commit landed but reported failure) and then the Auth user, and rethrows the original
//     error. If undo's own DB phase fails too, the Auth user is deleted anyway: a database that
//     cannot answer most likely never committed, and the only alternative residual is an address
//     blocked for good. Rows are left without their Auth user only when the commit landed AND
//     the database failed again straight after; that household is unreachable, and it is logged.
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

  try {
    return await withSessionContext(context, async (tx) => {
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
  } catch (err) {
    try {
      await undoRegisterHousehold(context, householdId, accountId);
    } catch (undoErr) {
      console.error(undoErr);
      await deleteAuthUserBestEffort(accountId);
    }
    throw err;
  }
}

// speckit-bug-fix register-action-not-atomic-with-signin: compensating cleanup for a registration
// whose subsequent signIn/session-setup step failed, and (registerHousehold's own catch) for one
// whose transaction failed after createUser — the deletes below are no-ops when nothing committed.
// registerHousehold's DB transaction cannot simply be deferred until after signIn: signIn requires
// the Auth user (and its password) to already exist. Undoes exactly what
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

  // Runs only once the rows are gone, so a failed DB phase above (which throws past this) never
  // leaves a household whose Auth user was deleted — for the signIn-failure caller those rows are
  // committed for certain.
  await deleteAuthUserBestEffort(accountId);
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
// its own equivalent work inline, inside the SAME transaction as the link claim, rather than
// calling this function — Decision 1's whole point is that joining never runs across two separate
// transactions). This function stays exported purely because a broad set of
// unrelated tests (round/quorum/permission tests that need a quick second resident, nothing to do
// with joining or claiming) still use it as a direct, no-HTTP fixture — verified by
// `grep -rn "claimResidentProfile" src/`: every remaining call site outside this file is under
// `tests/`, never under `src/app/`. If a future cleanup removes that reliance too, delete this
// function then rather than leaving it "just in case".
//
// No transaction spans Postgres and Supabase Auth (CLAUDE.md), so this has joinHousehold's shape:
// check, then createUser, then one transaction, with a catch that deletes the new Auth user. The
// state each failure point leaves:
//   - the pre-check refuses (not_found/not_prepared) or createUser fails (signup_failed): nothing.
//   - the transaction or its commit fails: the Auth user at the profile's derived address exists
//     and would block every retry for this profile as a duplicate. The catch rethrows after
//     deleteAuthUserUnlessCommitted: deleted when no account row exists (rolled back), kept when
//     one does (the commit landed, so the profile is claimed and signs in normally).
export async function claimResidentProfile(
  context: SessionContext,
  residentProfileId: string,
  password: string,
) {
  await withSessionContext(context, async (tx) => {
    const [profile] = await tx
      .select()
      .from(residentProfile)
      .where(eq(residentProfile.id, residentProfileId));
    if (!profile) throw new ClaimError(`ResidentProfile not found: ${residentProfileId}`, "not_found");
    if (profile.status !== "prepared") {
      throw new ClaimError(`ResidentProfile ${residentProfileId} is not prepared for claiming`, "not_prepared");
    }
  });

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

  try {
    return await withSessionContext(context, async (tx) => {
      // The pre-check above ran in its own transaction, so `prepared` is re-decided here, under
      // the row lock this conditional UPDATE takes — the predicate joinHousehold's bound branch
      // uses.
      const activated = await tx
        .update(residentProfile)
        .set({ status: "active", movedInOn: new Date().toISOString().slice(0, 10) })
        .where(
          and(eq(residentProfile.id, residentProfileId), eq(residentProfile.status, "prepared")),
        )
        .returning({ id: residentProfile.id });
      if (activated.length === 0) {
        throw new ClaimError(`ResidentProfile ${residentProfileId} is not prepared for claiming`, "not_prepared");
      }

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
  } catch (err) {
    await deleteAuthUserUnlessCommitted(context.householdId, accountId);
    throw err;
  }
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

  // Copilot review round 5 (PR #23), FIX 1: read the DATABASE clock ONCE, here, BEFORE
  // signInWithPassword ever runs — so the credentials-generation check below (after the
  // membership lock) compares against the instant this sign-in attempt STARTED verifying the
  // password, never a later one. Reading it after signInWithPassword would let a password
  // change/reset that commits during the Supabase Auth round-trip itself (network latency, not
  // just the time between this read and the membership lock) slip in on the "new" side of the
  // generation and be wrongly refused — reading it first means only a generation truly stamped
  // BEFORE this attempt even began can pass.
  const credentialsCheckedAt = await readDatabaseClock();

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
    // status UPDATE) → membership → account → session; signIn takes membership → account (FOR
    // SHARE, below) and then INSERTs, never touching resident_profile, so the two never wait on
    // each other in reverse.
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

    // Copilot review round 5 (PR #23), FIX 1: lock order membership -> account, same as
    // changeResidentEmail/changeResidentPassword/redeemPasswordReset. `FOR SHARE`, not `FOR
    // UPDATE` — signIn never writes this row, it only needs to serialize against a concurrent
    // writer's own `FOR UPDATE` (a plain read here would see the pre-commit snapshot and race
    // it), so the weaker read lock is enough and does not block two concurrent sign-ins against
    // each other.
    const [accountRow] = await tx.select().from(account).where(eq(account.id, accountId)).for("share");

    // The credentials-generation check: a password writer stamps `password_changed_at =
    // clock_timestamp()` (the DB clock, at the instant of that statement — never plain `now()`,
    // which is fixed at the writer's OWN transaction start and would understate the real write
    // instant whenever that transaction does other work, e.g. a provider round-trip, first; see
    // changeResidentPassword's own comment) inside the SAME transaction that holds this same
    // account row lock, so if that stamp is at or after the DB-clock read this call took BEFORE
    // its own signInWithPassword above, this authentication cannot be trusted — it may have
    // verified a password that was already superseded by the time (or during the time) it ran.
    // Same code as a wrong password: an intruder who authenticated with a password moments before
    // it was changed learns nothing beyond "invalid credentials".
    if (accountRow?.passwordChangedAt && accountRow.passwordChangedAt >= credentialsCheckedAt) {
      throw new SignInError("Invalid credentials", "invalid_credentials");
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
  // Copilot review round 2 (PR #23): redeemPasswordReset's phase 2 (the provider password write)
  // failed AFTER phase 1 already committed — the link is spent, every prior session is revoked,
  // and account.password_reset_by_admin is recorded, but the password itself never changed. The
  // safe direction (see redeemPasswordReset's own big comment): nobody's session survives and no
  // half-known password exists. The message tells the person to ask the administration for a new
  // link — issuePasswordResetLink's eligibility check is unaffected by this outcome (the account
  // still has no email), so a fresh link can be issued immediately.
  | "reset_incomplete"
  // Copilot review round 2 (PR #23): redeemPasswordReset's phase 3 sign-in (with the password
  // phase 2 already committed) failed — unlike reset_incomplete, THE PASSWORD IS SET. Phase 3's
  // own transaction rolls back (no session inserted, no "other sessions" revoked further), but
  // the new password from phase 2 stands. The action redirects to `/sign-in?note=password_reset`
  // (recreated exactly as in commit a95bbb9, before the Copilot PR #23 fix folded the sign-in into
  // one all-or-nothing transaction) rather than reporting the reset as failed, which would be a
  // lie: the reset already succeeded.
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
    // task 7.4: on ANY failure after the Auth user exists, delete it — unless the transaction's
    // commit landed despite reporting failure (deleteAuthUserUnlessCommitted), which would leave a
    // joined resident with no way to sign in and a link use already spent. No other compensating
    // undo is needed: everything else above is inside the transaction (design.md Decision 1),
    // which rolls itself back on any error without help from this catch.
    await deleteAuthUserUnlessCommitted(resolved.householdId, accountId);
    throw err;
  }
}

// resident-settings design.md Decisions 2/7: E1's own settings errors. One class, several codes —
// changeResidentEmail uses missing_email/invalid_email/email_taken/not_a_resident/session_ended/
// change_incomplete, changeResidentPassword uses missing_fields/password_too_short/
// wrong_current_password/not_a_resident/session_ended/change_incomplete. german-ui-vocabulary
// (design.md Decision 4): a `code` discriminant, never a message, same convention as
// JoinError/SignInError/ClaimError above.
export type AccountSettingsErrorCode =
  | "missing_email"
  | "invalid_email"
  | "email_taken"
  | "not_a_resident"
  | "missing_fields"
  | "password_too_short"
  | "wrong_current_password"
  // Copilot review round 4 (PR #23): the membership/account locks re-check that the SESSION'S
  // OWN ACCOUNT is still a live resident, but not that the SESSION ITSELF is still the one the
  // caller thinks it is. A password reset (redeemPasswordReset phase 1/3) or a removal ends every
  // OTHER session but leaves the membership live — so a request arriving on a session that a
  // reset just revoked (an intruder's session, say) would otherwise still pass the membership
  // check and be free to change the email or password out from under the person who just reset
  // it. Thrown when `session.id = current.sessionId AND session.account_id = context.accountId`
  // finds no row, a revoked row, or an expired row — before any write or provider call in either
  // function.
  | "session_ended"
  // Copilot review round 3 (PR #23): both changeResidentEmail and changeResidentPassword now call
  // the provider LAST, right before commit — a provider failure (email_taken, or any other) rolls
  // the whole DB write back with it, which is what makes the account row's own state trustworthy.
  // The one window that discipline cannot close is a failed COMMIT of that same transaction AFTER
  // the provider call already succeeded: Postgres rolls back (no DB write survives) while Supabase
  // keeps the change. Each function's own big comment states the compensating transaction that
  // reruns the DB side under the same locks; this code is thrown only when THAT compensation also
  // fails — both the original commit and the repair attempt are logged (console.error) and the
  // caller is told the change may have applied only partly.
  | "change_incomplete";

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

// design.md Decision 2, REORDERED (Copilot review round 3, PR #23): the previous shape called the
// provider (updateUserById) in the MIDDLE of the transaction and then still had DB work left to do
// (the account UPDATE, the audit insert) — CLAUDE.md's "no transaction spans Postgres and Supabase
// Auth": a failure of that LATER DB work, or of the commit itself, would leave Supabase already
// changed while Postgres rolled back, and account.email/the audit trail would then disagree with
// the provider silently. Fixed by making the provider call the LAST statement of the transaction,
// exactly redeemPasswordReset's own discipline (its phase 2):
//   1. validate (trim, lower-case; empty is refused whether or not an address exists already —
//      this is how "change but not remove", proposal Assumption 3, is enforced);
//   2. identity (fast path): context.profileId === null (a household session) is refused before
//      opening any transaction at all — cheap, and correct for the ordinary case;
//   3. Copilot review round 2 (PR #23), CLAUDE.md "A concurrent request" / "Every writer of the
//      same state, pairwise": `context.profileId` alone is a claim the SESSION made at sign-in
//      (ADR-013 — set once, never rewritten) and can go stale — a move-out or a removal that
//      commits AFTER this action read `CurrentSession` still carried a non-null profileId in the
//      cookie. So the AUTHORITATIVE check is a fresh `SELECT membership ... FOR UPDATE` by
//      `context.accountId`, taken FIRST, inside the transaction, before the account row: refuse
//      (same `not_a_resident` code) if there is no row, if `revokedAt IS NOT NULL`, or if
//      `isResident` is false. This is also what makes `SELECT account ... FOR UPDATE` below sound
//      against a concurrent removal — removal locks `membership` before `session`
//      (revokeMembershipForProfileTx), never `account`, so without this membership lock a removal
//      could commit between the stale check and the account update with nothing to serialize
//      against;
//   4. SELECT account ... FOR UPDATE (serializes against a concurrent change of the same account,
//      and against D5's redemption, which locks the same row);
//   5. Copilot review round 4 (PR #23), CLAUDE.md "Every writer of the same state, pairwise": the
//      membership/account locks above re-check that the ACCOUNT is still a live resident, but not
//      that THIS SESSION still is what it claims to be. A password reset (redeemPasswordReset
//      phases 1/3) or `changeResidentPassword` ends every OTHER session of the account but leaves
//      the membership itself untouched — so without this check a request arriving on a session
//      the reset just revoked (an intruder's, say — the whole point of a reset is that the old
//      sessions must die) would still pass step 3 above and be free to change the email, which
//      matters most here: the intruder would come to own the recovery address, and the very
//      reset link that was supposed to lock them out would then look unspent to nobody who can
//      still use it. `SELECT session ... FOR UPDATE` where `id = current.sessionId AND
//      account_id = context.accountId`; refuse (`session_ended`) if there is no row, if
//      `revokedAt IS NOT NULL`, or if `expiresAt <= now()` — before the unchanged-address early
//      return, so the check applies even to a no-write submission. Locked AFTER the account row
//      (not before), so it takes the lock in the same relative position redeemPasswordReset's own
//      phase 1/3 session UPDATE runs in — the reset's revoke and this check serialize on the same
//      row rather than racing;
//   6. unchanged address returns — no write, no audit, no provider call;
//   7. UPDATE account SET email, email_verified_at = null;
//   8. record account.email_changed;
//   9. LAST: auth.admin.updateUserById(email, email_confirm: true) — email_confirm is a technical
//      precondition for the provider's sign-in path (identity.md provider rule 2), never a claim
//      about delivery, which stays account.email_verified_at's alone. On email_exists, throw
//      email_taken — this now rolls the DB write (step 7/8) back WITH it, since it is thrown
//      before the transaction's own commit. Any other provider error rethrows the same way.
//
// The only window this discipline cannot close is a failed COMMIT after step 9's provider call
// already returned success: Postgres then rolls back everything (email/audit gone) while Supabase
// already carries the new address. Handled by a best-effort RECONCILIATION, outside the
// transaction: a local `providerUpdated` flag is set true immediately after step 9 succeeds; the
// `withSessionContext(...)` call is wrapped in try/catch; if it throws AND `providerUpdated` is
// true (meaning the throw can only be the commit itself failing, since every earlier throw path
// leaves the flag false), a second, best-effort transaction re-applies the DB side under the same
// locks (membership -> account). Copilot review round 4 (PR #23): this compensation used to
// re-write THIS REQUEST'S OWN address unconditionally — but a LATER change (a second
// changeResidentEmail call) could have committed for real in the gap between this request's
// provider write and its own failed commit, in which case blindly rewriting this request's address
// would overwrite that newer, already-committed value while Supabase (the authority for the
// sign-in address, design.md Decision 1) still holds the newer one. So the compensation instead
// RECONCILES to the provider: it reads `getUserById(context.accountId)` under the same locks, and
// writes account.email to THAT (normalised) address — never the address this request itself was
// trying to set — clearing `email_verified_at` and recording `account.email_changed` only if the
// row's value actually changes. Each path this leaves:
//   - provider lookup fails: falls through to the outer catch exactly as a DB failure would —
//     logged and reported as `change_incomplete` (Postgres and Supabase may still disagree, but
//     nothing here makes a blind guess about which address is right);
//   - provider lookup succeeds and the row is already at that address (this request's own commit
//     failure, uncontested by a later write): no-op, matching "unchanged address" above;
//   - provider lookup succeeds and the row differs (a later request won): the row is brought to
//     the PROVIDER'S value, which may be this request's address (nobody else wrote after it) or a
//     newer one (somebody did) — either way Postgres ends up agreeing with the system design.md
//     Decision 1 names as authoritative.
// If that compensating transaction succeeds, this function returns normally: the change did take
// effect, late (possibly to a different, newer address than this call's own argument — see above).
// If it also fails, both errors are logged (console.error) and this throws
// AccountSettingsError("change_incomplete") — the account may now be ahead of Postgres, and the
// caller is told the change may have applied only partly.
//
// This cannot be exercised by a real test without mocking Supabase or forcing a commit failure,
// which CLAUDE.md forbids here (no DB/auth mocking) — see the test file's own note. FIX 2's own
// reconciliation is the same: no new test, for the same reason (a real commit failure cannot be
// forced without mocking).
//
// Lock order: membership -> account -> session, then no further lock — every path in this file
// takes a prefix-compatible subsequence of resident_profile -> membership -> account -> session ->
// (nothing further after session), never the reverse (see changeResidentPassword's own comment for
// the full cross-path analysis). The new session lock (step 5) sits AFTER account, matching
// redeemPasswordReset's phase 1/3 (membership -> account, then session) and changeResidentPassword
// (membership -> account, then session) — so this reorder introduces no new lock-order pair and no
// new deadlock risk. Copilot review round 5 (PR #23), FIX 1: signIn now also takes membership ->
// account (FOR SHARE, not FOR UPDATE — it only reads) before its own session INSERT, the same
// relative order as every writer here, so it never waits on any of these in reverse either.
export async function changeResidentEmail(current: CurrentSession, rawEmail: string): Promise<void> {
  const email = normalizeEmail(rawEmail);
  if (!email) {
    throw new AccountSettingsError("Email address is required", "missing_email");
  }
  if (!isWellFormedEmail(email)) {
    throw new AccountSettingsError("That does not look like a well-formed email address", "invalid_email");
  }

  const { context, sessionId } = current;
  if (context.profileId === null) {
    throw new AccountSettingsError(
      "Only a resident may change their own email address (identity/account-settings)",
      "not_a_resident",
    );
  }

  // Flips to true only once the provider call (the LAST statement of the transaction below) has
  // actually succeeded — so the catch block below can tell "the provider never changed" (this
  // stays false: every throw before that point, including email_taken, leaves it false) apart from
  // "the provider changed but the commit that should have followed it failed" (this is true).
  let providerUpdated = false;

  try {
    await withSessionContext(context, async (tx) => {
      // The authoritative, non-stale check — see the comment above. Locked FIRST, before the
      // account row, so this serializes against a concurrent removal (which locks membership
      // before session, never account) the same way D5/D7's own membership-then-account order does.
      const [membershipRow] = await tx
        .select()
        .from(membership)
        .where(eq(membership.accountId, context.accountId))
        .for("update");
      if (!membershipRow || membershipRow.revokedAt || !membershipRow.isResident) {
        throw new AccountSettingsError(
          "Only a resident may change their own email address (identity/account-settings)",
          "not_a_resident",
        );
      }

      const [row] = await tx.select().from(account).where(eq(account.id, context.accountId)).for("update");

      // Copilot review round 4 (PR #23): FIX 1 — see the big comment above (step 5). Locked AFTER
      // the account row, so this serializes against redeemPasswordReset's own phase 1/3 session
      // revoke, which is what makes an intruder's session actually get caught here rather than
      // racing ahead of it.
      const [sessionRow] = await tx
        .select()
        .from(session)
        .where(and(eq(session.id, sessionId), eq(session.accountId, context.accountId)))
        .for("update");
      if (!sessionRow || sessionRow.revokedAt || sessionRow.expiresAt <= new Date()) {
        throw new AccountSettingsError("Your session has ended — please sign in again", "session_ended");
      }

      if (!row || row.email === email) return; // no account, or unchanged — no write, no audit

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

      // LAST statement before commit — see the big comment above.
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
      providerUpdated = true;
    });
  } catch (err) {
    if (!providerUpdated) throw err;

    // The provider call succeeded but the transaction's own commit failed — best-effort
    // reconciliation, re-applying the DB side under the same locks. Copilot review round 4 (PR
    // #23), FIX 2 — see the big comment above: RECONCILE TO THE PROVIDER rather than blindly
    // rewriting this request's own address, which could otherwise clobber a later, already-
    // committed change. `getUserById` is the read this reconciles against; a failure of that read
    // falls through to the outer catch below (`change_incomplete`), same as any other failure of
    // this compensating transaction.
    try {
      await withSessionContext(context, async (tx) => {
        await tx.select().from(membership).where(eq(membership.accountId, context.accountId)).for("update");
        const [row] = await tx.select().from(account).where(eq(account.id, context.accountId)).for("update");

        const { data: userData, error: userError } = await supabaseAdmin().auth.admin.getUserById(
          context.accountId,
        );
        if (userError || !userData.user?.email) {
          throw userError ?? new Error("getUserById returned no email during changeResidentEmail's compensation");
        }
        const providerEmail = normalizeEmail(userData.user.email);

        if (!row || row.email === providerEmail) return; // already reconciled — no write, no audit

        await tx
          .update(account)
          .set({ email: providerEmail, emailVerifiedAt: null })
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
      return; // compensation succeeded — the account row now agrees with the provider
    } catch (compensationErr) {
      console.error(err);
      console.error(compensationErr);
      throw new AccountSettingsError(
        "The email change may have applied only partly — please try again",
        "change_incomplete",
      );
    }
  }
}

// design.md Decision 7: resident-only, as changeResidentEmail above.
//
// review fix (Copilot finding, PR #23): the original shape checked the current password with
// signInWithPassword, THEN called updateUserById — with no lock held in between. A concurrent
// redeemPasswordReset could commit its own password change in that gap, and this function's later
// updateUserById would silently overwrite it, discarding the reset. The fix is the same
// row-lock-first shape D5/D2 already use: ONE withSessionContext transaction —
//   1. Copilot review round 2 (PR #23): `SELECT membership ... FOR UPDATE` FIRST, by
//      `context.accountId` — the same non-stale, authoritative check changeResidentEmail now does
//      and for the identical reason: `context.profileId` is a claim the session made at sign-in
//      and a move-out/removal that commits AFTER this action read `CurrentSession` must still be
//      caught. Refuse (not_a_resident) if there is no row, `revokedAt IS NOT NULL`, or
//      `isResident` is false;
//   2. `SELECT account ... FOR UPDATE`, so this serializes against redeemPasswordReset's own
//      `account ... FOR UPDATE` (D5) and against changeResidentEmail's (D2) — whichever of the
//      three gets there first finishes before the next one's lookup can start;
//   3. Copilot review round 4 (PR #23), FIX 1 — CLAUDE.md "Every writer of the same state,
//      pairwise": `SELECT session ... FOR UPDATE` where `id = current.sessionId AND account_id =
//      context.accountId`, same reasoning and same code (`session_ended`) as changeResidentEmail's
//      own new step — the membership lock re-checks the ACCOUNT is still a live resident but not
//      that THIS SESSION still is, and a reset or an earlier password change ends every OTHER
//      session while leaving membership untouched, so a request riding a session that reset just
//      ended must be refused before it can spend a current password it should no longer be able to
//      prove. Locked right after the account row, before any provider call — matching
//      redeemPasswordReset's own phase 1/3 lock position for its session write, so the two
//      serialize on the same row instead of racing;
//   4. WHILE HOLDING THAT LOCK: look up the provider's current address (getUserById, D1's lookup)
//      and verify the current password (signInWithPassword; the session it returns is discarded,
//      as signIn already does on refusal) — a failure is wrong_current_password. Neither of these
//      two provider calls changes any state, so putting them before the DB writes below is not the
//      hazard round 3 fixes — see the next paragraph;
//   5. Copilot review round 3 (PR #23), CLAUDE.md "No transaction spans Postgres and Supabase
//      Auth": revoke every OTHER session of the account (current.sessionId is kept) and record
//      account.password_changed — moved BEFORE the provider password write, so the MUTATING
//      provider call (step 6) is the LAST statement of the transaction, exactly
//      changeResidentEmail's own reorder and redeemPasswordReset's phase 2 discipline;
//   6. LAST: updateUserById(password). A failure here now rolls the session-revoke and the audit
//      insert back WITH it — no half-known state where sessions ended for a password that never
//      actually changed.
// Validation that touches no row (missing fields, the new password's length rule) stays OUTSIDE
// the lock, exactly as before.
//
// The only window this cannot close is a failed COMMIT after step 6's provider call already
// returned success: Postgres rolls back (the revoke and the audit entry are gone) while Supabase
// already has the new password — the OTHER sessions would then still be live for a password that
// did change. Handled the same way as changeResidentEmail: a local `providerUpdated` flag flips
// true right after the provider call succeeds; the `withSessionContext(...)` call is wrapped in
// try/catch; if it throws AND `providerUpdated` is true, a best-effort compensating transaction
// re-applies the DB side under the same locks (membership -> account, then session) — revoking the
// other sessions and recording the event again, nothing else. Copilot review round 4 (PR #23),
// FIX 2 — the "revoke every other session" repair used to unconditionally re-run against
// `isNull(session.revokedAt)`, which would also revoke a session legitimately created WITH THE NEW
// PASSWORD in the gap between this call's own provider write and its failed commit (someone
// signing in successfully right after the reset, before the repair runs). Closed by capturing
// `const startedAt = new Date()` at the very top of this function, before the main transaction
// even opens, and filtering the repair's revoke on `createdAt < startedAt` (in addition to
// excluding `current.sessionId`, unchanged) — a session created at or after the moment this call
// began cannot be one this call's own password write is responsible for un-knowing about, so the
// repair leaves it alone. Each path this leaves:
//   - the repair's own transaction fails too: both errors are logged (console.error) and this
//     throws `AccountSettingsError("change_incomplete")` — Supabase already has the new password,
//     but Postgres has neither the revoke nor the audit entry, and the caller is told so;
//   - the repair succeeds: this returns normally — the change did take effect, late, and every
//     session that existed before this call started (other than the caller's own) is now revoked,
//     while a session created during the gap survives, exactly as an ordinary successful call
//     would have left it.
//
// This cannot be exercised by a real test without mocking Supabase or forcing a commit failure,
// which CLAUDE.md forbids here (no DB/auth mocking) — see the test file's own note. FIX 2's own
// `startedAt` filter is the same: no new test, for the same reason.
//
// Lock order: membership -> account -> session, then no further lock — same as changeResidentEmail
// (now also membership -> account -> session), redeemPasswordReset (D5: membership -> account,
// then session) and removal (resident_profile -> membership -> session). Every path in this file
// takes a prefix-compatible subsequence of resident_profile -> membership -> account -> session,
// never the reverse, so there is no deadlock cycle across any pair of them. Step 3's new session
// lock does not change this: it sits in the same relative position (after account, before any
// provider call) the other functions already use. Copilot review round 5 (PR #23), FIX 1: signIn
// also takes membership -> account (FOR SHARE) before its session INSERT — same relative order,
// so it introduces no new cycle either.
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

  // Copilot review round 4 (PR #23), FIX 2: captured BEFORE the main transaction even opens, so
  // the compensating transaction's own session-revoke (below) can distinguish a session that
  // existed when this call started from one created legitimately, with the new password, in the
  // gap between this call's provider write and a later failed commit. See the big comment above.
  const startedAt = new Date();

  // See the big comment above: flips true only once the provider password write (the LAST
  // statement of the transaction below) has actually succeeded.
  let providerUpdated = false;

  try {
    await withSessionContext(context, async (tx) => {
      // The authoritative, non-stale check — see the comment above. Locked FIRST, before the
      // account row, matching changeResidentEmail's and redeemPasswordReset's own order.
      const [membershipRow] = await tx
        .select()
        .from(membership)
        .where(eq(membership.accountId, context.accountId))
        .for("update");
      if (!membershipRow || membershipRow.revokedAt || !membershipRow.isResident) {
        throw new AccountSettingsError(
          "Only a resident may change their own password (identity/account-settings)",
          "not_a_resident",
        );
      }

      // Locked next, before any provider call — this is what serializes against a concurrent
      // redeemPasswordReset/changeResidentEmail, not the provider call itself.
      const [row] = await tx.select().from(account).where(eq(account.id, context.accountId)).for("update");
      if (!row) {
        throw new AccountSettingsError("Current password is incorrect", "wrong_current_password");
      }

      // Copilot review round 4 (PR #23), FIX 1 — see the big comment above (step 3).
      const [sessionRow] = await tx
        .select()
        .from(session)
        .where(and(eq(session.id, sessionId), eq(session.accountId, context.accountId)))
        .for("update");
      if (!sessionRow || sessionRow.revokedAt || sessionRow.expiresAt <= new Date()) {
        throw new AccountSettingsError("Your session has ended — please sign in again", "session_ended");
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

      await tx
        .update(session)
        .set({ revokedAt: new Date() })
        .where(and(eq(session.accountId, context.accountId), ne(session.id, sessionId), isNull(session.revokedAt)));

      // Copilot review round 5 (PR #23), FIX 1: stamp the credentials generation in the DATABASE
      // clock, never a JS Date (CLAUDE.md: "compare in SQL or with the DB-returned values, never
      // mixing JS clock and DB clock"), inside this same transaction, holding the same account row
      // lock — alongside the session revoke and the audit entry, before the provider call. This is
      // what signIn's own credentials-generation check (auth.ts's signIn) compares against.
      //
      // `clock_timestamp()`, deliberately NOT plain `now()`: Postgres's `now()` returns the
      // TRANSACTION's start timestamp (fixed for the whole transaction), not the instant this
      // statement runs — and this transaction does two provider round-trips (getUserById,
      // signInWithPassword, above) before reaching this UPDATE, so `now()` would understate the
      // real write instant by however long those calls took. That gap is exactly the window a
      // concurrent signIn's own `readDatabaseClock()` read could land in, reopening the very race
      // this stamp exists to close (confirmed by running this fix's own break test against
      // `now()`: the race test failed — see sign-in-credential-generation.test.ts's own history).
      // `clock_timestamp()` returns the actual current instant at each call, matching the moment
      // this write takes effect.
      await tx
        .update(account)
        .set({ passwordChangedAt: sql`clock_timestamp()` })
        .where(eq(account.id, context.accountId));

      await recordActivityEvent(tx, {
        householdId: context.householdId,
        eventType: "account.password_changed",
        subjectType: "account",
        subjectId: context.accountId,
        actorAccountId: context.accountId,
        actorProfileId: context.profileId,
        payload: {},
      });

      // LAST statement before commit — see the big comment above.
      const { error: updateError } = await supabaseAdmin().auth.admin.updateUserById(context.accountId, {
        password: newPassword,
      });
      if (updateError) throw updateError;
      providerUpdated = true;
    });
  } catch (err) {
    if (!providerUpdated) throw err;

    // The provider call succeeded but the transaction's own commit failed — best-effort
    // reconciliation, re-applying the DB side under the same locks. Copilot review round 4 (PR
    // #23), FIX 2 — the revoke below is filtered on `createdAt < startedAt` (captured before the
    // main transaction opened), so a session created WITH THE NEW PASSWORD in the gap between this
    // call's own provider write and its failed commit survives this repair rather than being
    // un-known along with everything that existed before this call started. See the big comment
    // above.
    try {
      await withSessionContext(context, async (tx) => {
        await tx.select().from(membership).where(eq(membership.accountId, context.accountId)).for("update");
        await tx.select().from(account).where(eq(account.id, context.accountId)).for("update");

        await tx
          .update(session)
          .set({ revokedAt: new Date() })
          .where(
            and(
              eq(session.accountId, context.accountId),
              ne(session.id, sessionId),
              isNull(session.revokedAt),
              lt(session.createdAt, startedAt),
            ),
          );

        // Copilot review round 5 (PR #23), FIX 1: the compensation also sets the generation stamp
        // again — the main transaction's own write to this same row rolled back with the rest of
        // its failed commit, so this repair must re-apply it too, or signIn's check would compare
        // against a generation that never actually survived. `clock_timestamp()`, not `now()` —
        // see the main transaction's own comment above for why.
        await tx
          .update(account)
          .set({ passwordChangedAt: sql`clock_timestamp()` })
          .where(eq(account.id, context.accountId));

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
      return; // compensation succeeded — the change did take effect, late
    } catch (compensationErr) {
      console.error(err);
      console.error(compensationErr);
      throw new AccountSettingsError(
        "The password change may have applied only partly — please try again",
        "change_incomplete",
      );
    }
  }
}

// resident-settings design.md Decision 5, REDESIGNED (Copilot review round 2, PR #23): the
// previous shape's own comment claimed the whole redemption — claim, revoke, password write,
// sign-in, session insert — committed or rolled back together "atomically". That was never true:
// Postgres and Supabase Auth are two separate systems with NO transaction spanning both
// (CLAUDE.md's own point about a raw SQL/SECURITY DEFINER boundary applies here to a DIFFERENT
// boundary, the provider one). `updateUserById` ran INSIDE the Postgres transaction's try block,
// but a failure of the COMMIT itself (network, deadlock, anything after the provider call
// returned success) would leave Postgres rolled back while Supabase already has the new password
// — the old sessions stay live (the revoke never committed) and the link looks unspent, yet the
// password already changed underneath the resident who thinks the reset failed.
//
// Redesigned into three SEPARATE transactions, ordered so that whichever one a failure interrupts
// leaves the SAFE state (nobody's session survives unexpectedly; no half-known password sits
// unrevoked):
//
// PHASE 1 (one transaction, in the household's bootstrap context) — no provider call at all:
//   a. claimJoinCodeTx(tx, code, 'password_reset') — no row means invalid_link;
//   b. SELECT membership ... FOR UPDATE, re-check live + resident + the named profile active;
//      SELECT account ... FOR UPDATE, re-check it still has no email — anything else is
//      invalid_link. These locks serialize against changeResidentEmail's/changeResidentPassword's
//      own membership-then-account locks and against a concurrent removal (which locks membership
//      before session) — the re-check makes the SQL predicate's own snapshot irrelevant;
//   c. revoke EVERY session of the account (isNull(revokedAt) filter);
//   d. record account.password_reset_by_admin (actor account = the issuance's OWN
//      created_by_account_id — the reset is the administration's act; the redeemer only completes
//      it; actor profile null; payload {});
//   e. COMMIT. The link is now spent and every prior session is dead, unconditionally — REGARDLESS
//      of whether the provider call in phase 2 below ever succeeds.
//
// PHASE 2 (a second, separate transaction) — the ONE provider write:
//   a. Copilot review round 3 (PR #23): re-check the SAME conditions phase 1 already checked,
//      because between the two phases the OLD password is still valid — a resident could sign in
//      with it and add an email, or be removed, before phase 2 ever runs. A reset link must die
//      once an email exists (O-16) even in that gap. Consistent lock order, same as everywhere
//      else in this file: `SELECT membership ... FOR UPDATE` FIRST, re-check live + resident +
//      the named profile still active (plain SELECT, no lock, same as phase 1's own); THEN
//      `SELECT account ... FOR UPDATE`, re-check it STILL has no email. STATE LEFT if either
//      recheck fails: phase 1 already committed (link spent, every prior session dead, no
//      provider call made yet in this phase) — OUTCOME: `invalid_link`, unchanged from before;
//   b. the account lock is also what serializes against changeResidentPassword, which holds the
//      very same lock while it verifies the current password and writes a new one (its own big
//      comment states this explicitly now);
//   c. auth.admin.updateUserById(password) — a local `providerUpdated` flag is set to `true`
//      immediately after this call returns successfully (Copilot review round 4, PR #23, FIX 3).
//      STATE LEFT if the provider call itself fails (`updateError`): logged (console.error), then
//      thrown as `reset_incomplete` BEFORE `providerUpdated` is ever set — phase 1 already
//      committed (link spent, every session dead), the password never changed. This is the SAFE
//      direction: nobody's session survives, and no password sits half-known. OUTCOME: the action
//      tells the person to ask the administration for a new link; issuePasswordResetLink's own
//      eligibility check is unaffected (the account still has no email), so a fresh link can be
//      issued immediately;
//   d. COMMIT (releases the locks). STATE LEFT if the commit itself fails, AFTER step (c) already
//      returned success (`providerUpdated` is `true` when this transaction throws): Supabase has
//      the new password, but this phase's own re-check locks leave nothing else behind in Postgres
//      either way — Copilot review round 5 (PR #23), FIX 1: this phase now ALSO re-stamps
//      `account.password_changed_at` (step c.1, right after the provider write), which would roll
//      back with this same failed commit; no repair re-applies it here, unlike
//      changeResidentEmail's/changeResidentPassword's own compensations, because phase 1's OWN
//      stamp (committed earlier, in its own separate transaction, and therefore never affected by
//      THIS commit's failure) already covers the invariant that matters: any sign-in whose
//      credentials-check read predates phase 1's commit is refused regardless; one landing between
//      phase 1 and here falls in the documented "old password is still valid between the phases"
//      window either way (see phase 2's re-check comment above), which is unaffected by whether
//      this phase's own, slightly later stamp survived. Phase 1's commit already stands (link
//      spent, every prior session dead) regardless. OUTCOME:
//      logged (console.error) and treated as a SUCCESSFUL phase 2 — the caller falls through to
//      phase 3 exactly as if the commit had not failed, because the one fact that matters (the
//      password IS set) is true either way. Distinguishing "commit failed" from "callback threw
//      before setting the flag" is exactly what `providerUpdated` is for: only a throw from
//      withSessionContext AFTER the callback's own last statement set it to `true` can be this
//      case, since every earlier throw path (recheck failure, `updateError`) leaves it `false`.
//
// PHASE 3 (a third, separate transaction) — sign in and open the new session, UNDER THE SAME
// MEMBERSHIP LOCK phase 1 took, taken again here. The whole phase is wrapped in one more
// try/catch (Copilot review round 4, PR #23, FIX 3): an `invalid_link` `JoinError` (the membership
// or profile rechecks below) passes through UNCHANGED — phases 1 and 2 already committed, the link
// is spent, and refusing here changes nothing about that. ANY OTHER error — the provider calls
// below, `insertSessionTx`, the session UPDATE, a lock-acquisition error, or this transaction's own
// COMMIT failing — is logged (console.error) and rethrown as `JoinError("reset_done_sign_in_failed")`,
// because by the time execution reaches this phase the password IS already set (phase 2 committed,
// or its own commit failure was already treated as success above) and nothing here can make that
// untrue again; the only question left is whether THIS device gets signed in automatically, never
// whether the reset happened:
//   a. SELECT membership ... FOR UPDATE, re-check it is STILL live, resident, with the profile
//      still active — a removal that won this same lock between phase 1 and here (a real window,
//      now that they are separate transactions) refuses here as invalid_link, and nothing is
//      inserted. STATE LEFT: phases 1/2 stand; nothing new committed here. OUTCOME: `invalid_link`;
//   b. WHILE STILL HOLDING THAT LOCK: getUserById, then signInWithPassword with the password
//      phase 2 just wrote. STATE LEFT on a failure here: phases 1/2 stand (the password IS set);
//      this phase's own transaction rolls back (no session inserted). OUTCOME:
//      `reset_done_sign_in_failed` — a DIFFERENT code from `reset_incomplete` because the right
//      message is different ("your new password is set, sign in with it" rather than "ask for a
//      new link");
//   c. revoke every OTHER live session of the account (there is no "new" row yet to exempt by id,
//      so this is every session live at this instant — the insert below is what makes the
//      redeeming device's own session the sole survivor);
//   d. insertSessionTx(tx, ...) with actingProfileId = the reset profile and the caller's
//      rememberMe — STATE LEFT if this itself fails, or if the COMMIT that follows fails: phases
//      1/2 stand (the password IS set), this phase's transaction rolls back (no session survives
//      from this attempt). OUTCOME: `reset_done_sign_in_failed`, same as (b) — the person is told
//      their password is set even though this specific attempt to open a session for them failed;
//   e. COMMIT.
//   Doing the sign-in UNDER the membership lock, in its own phase-1-then-phase-3 pair of
//   acquisitions, is what makes two concurrent resets for the same profile (two different
//   single-use links) end with EXACTLY ONE live session: whichever reset's phase 2 writes the
//   password LAST is the only one whose later phase 3 sign-in can still succeed against the
//   CURRENT password (the other's phase 3 either already ran and gets revoked by the last
//   writer's own phase 3 revoke-step, or runs afterwards and fails with
//   `reset_done_sign_in_failed` against a password it no longer recognises) — and it revokes every
//   other live session as its own last act before inserting its own.
//
// After phase 3 (whether it ran to completion, or phase 2's own callback threw `reset_incomplete`
// before phase 3 was ever reached): the visitor's own PREVIOUS session (design.md Decision 8) is
// revoked if one was passed in — own session only (revokeSession enforces that), unconditionally
// on any successful phase 3, exactly as before. This still has nothing to do with the reset's own
// invariants and must never make an otherwise-valid redemption roll back — kept OUTSIDE every
// phase's transaction.
//
// Phase 1 itself: a non-`JoinError` thrown from its own callback (a lock-acquisition error, a
// DB-level failure) leaves nothing committed — Postgres rolls the whole phase 1 transaction back,
// no provider call was ever reached, and the generic (non-JoinError) error path this function
// already has for such cases is unchanged; the caller sees whatever the ordinary unhandled-error
// boundary shows for a non-JoinError throw, same as any other function in this file.
//
// Lock order (extends D2/D7's own analysis): membership -> account, then session — never
// resident_profile — across all three phases, same order as before the split. changeResidentPassword
// (D7) takes membership -> account, then session. changeResidentEmail (D2) takes membership ->
// account -> session (Copilot review round 4, PR #23). removal takes resident_profile ->
// membership -> session. No path here takes these in reverse, so no deadlock: every path's own
// order is a prefix-compatible subsequence of resident_profile -> membership -> account -> session,
// never the reverse. Splitting phase 1/2/3 into separate transactions does not change this
// analysis — it only means the membership lock is acquired and released TWICE (phase 1, then
// phase 3) instead of held continuously, which is what opens (and phase 3's own re-check is what
// closes) the removal-window named in phase 3(a) above. Copilot review round 5 (PR #23), FIX 1:
// signIn takes membership -> account (FOR SHARE) before its own session INSERT — same relative
// order as every phase here, so it introduces no new cycle either.
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

  // PHASE 1: claim + re-check + revoke-all + audit. No provider call. See the big comment above.
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
    if (!membershipRow || membershipRow.revokedAt || !membershipRow.isResident) {
      throw new JoinError("Join code is not valid", "invalid_link");
    }

    // review fix: created_by_account_id (below) is read HERE, in the same plain SELECT as the
    // profile's own active-status re-check, rather than as a separate statement after the claim —
    // this query carries no FOR UPDATE (unlike membershipRow/accountRow above), so joining
    // join_code_issuance onto it adds no new lock and changes nothing about the lock-order
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

    // Copilot review round 5 (PR #23), FIX 1: stamp the generation here too, in PHASE 1 — the old
    // password is still valid between phase 1 and phase 2 (the big comment above already notes
    // this for the email/removal re-checks), so without this a sign-in landing in exactly that
    // window would authenticate with a password this reset already committed to ending and could
    // still slip a session in ahead of phase 2's own provider write. Phase 3 additionally revokes
    // every live session before inserting its own, which already covers a sign-in that raced in
    // between — this stamp is what makes signIn refuse such a sign-in in the first place, rather
    // than relying solely on that later revoke. `clock_timestamp()`, not `now()` — see
    // changeResidentPassword's own comment for why plain `now()` (the transaction's START time,
    // not the statement's) would understate this write's real instant.
    await tx
      .update(account)
      .set({ passwordChangedAt: sql`clock_timestamp()` })
      .where(eq(account.id, accountRow.id));

    await recordActivityEvent(tx, {
      householdId: resolved.householdId,
      eventType: "account.password_reset_by_admin",
      subjectType: "resident_profile",
      subjectId: claimedProfileId,
      actorAccountId: profileRow.createdByAccountId ?? null,
      actorProfileId: null,
      payload: {},
    });

    return { accountId: accountRow.id, profileId: claimedProfileId };
  });

  // PHASE 2: re-check phase 1's own conditions (Copilot review round 3 — see the big comment
  // above for why: the old password is still valid between the phases, so the resident could add
  // an email or be removed in that gap), THEN the one provider write, under the account lock
  // (serializes with changeResidentPassword's own account lock). Nothing else is written here —
  // see the big comment above for why a failure of the provider call itself is `reset_incomplete`,
  // not `signup_failed`.
  //
  // Copilot review round 4 (PR #23), FIX 3: `providerUpdated` distinguishes "the callback threw
  // before the provider write ever succeeded" (recheck failure, or the provider call itself
  // failing) from "the provider write succeeded and only the COMMIT that should have followed it
  // failed" — see the big comment above for the full state/outcome analysis of each branch.
  let providerUpdated = false;
  try {
    await withSessionContext(bootstrapContext, async (tx) => {
      // Consistent lock order, same as phase 1 and everywhere else in this file: membership FIRST.
      const [membershipRow] = await tx
        .select()
        .from(membership)
        .where(eq(membership.residentProfileId, profileId))
        .for("update");
      if (!membershipRow || membershipRow.revokedAt || !membershipRow.isResident) {
        throw new JoinError("Join code is not valid", "invalid_link");
      }

      const [profileRow] = await tx
        .select({ status: residentProfile.status })
        .from(residentProfile)
        .where(eq(residentProfile.id, profileId));
      if (!profileRow || profileRow.status !== "active") {
        throw new JoinError("Join code is not valid", "invalid_link");
      }

      // THEN account, same order as phase 1's own re-check.
      const [accountRow] = await tx.select().from(account).where(eq(account.id, accountId)).for("update");
      if (!accountRow || accountRow.email !== null) {
        throw new JoinError("Join code is not valid", "invalid_link");
      }

      const { error: updateError } = await supabaseAdmin().auth.admin.updateUserById(accountId, { password });
      if (updateError) {
        console.error(updateError);
        throw new JoinError(
          "Password reset committed but the provider write failed",
          "reset_incomplete",
        );
      }
      providerUpdated = true;

      // Copilot review round 5 (PR #23), FIX 1: re-stamp the generation here too, AFTER the
      // successful provider write, before this transaction's own commit — phase 1's stamp already
      // covers the window between phase 1 and phase 2 (see that phase's own comment), but this
      // phase writes the ACTUAL new password, so the generation must also reflect the instant
      // THAT write took effect, not only phase 1's earlier one. `clock_timestamp()`, not `now()` —
      // see changeResidentPassword's own comment for why.
      await tx.update(account).set({ passwordChangedAt: sql`clock_timestamp()` }).where(eq(account.id, accountId));
    });
  } catch (err) {
    if (!providerUpdated) throw err;
    // The provider password write already succeeded; only this transaction's own COMMIT failed
    // afterwards, taking this phase's own `password_changed_at` re-stamp down with it — no repair
    // re-applies that here; phase 1's own, earlier-committed stamp already covers the invariant
    // that matters (see the big comment above, PHASE 2 step d). Log and fall through to phase 3
    // exactly as a normal phase 2 success would.
    console.error(err);
  }

  // PHASE 3: re-check under a FRESH membership lock, sign in, open the new session. See the big
  // comment above for why this is a separate acquisition from phase 1's, and how that is what
  // makes two concurrent resets converge on exactly one live session.
  //
  // Copilot review round 4 (PR #23), FIX 3: the whole phase is wrapped so that only an
  // `invalid_link` `JoinError` passes through unchanged — any other failure (a provider call here,
  // `insertSessionTx`, the session UPDATE, or this transaction's own commit) is logged and
  // rethrown as `reset_done_sign_in_failed`, never left to fall through to a generic error
  // boundary, because by this point the password IS already set (see the big comment above).
  let sessionRow: Awaited<ReturnType<typeof insertSessionTx>>;
  try {
    sessionRow = await withSessionContext(bootstrapContext, async (tx) => {
      const [membershipRow] = await tx
        .select()
        .from(membership)
        .where(eq(membership.residentProfileId, profileId))
        .for("update");
      if (!membershipRow || membershipRow.revokedAt || !membershipRow.isResident) {
        throw new JoinError("Join code is not valid", "invalid_link");
      }

      const [profileRow] = await tx
        .select({ status: residentProfile.status })
        .from(residentProfile)
        .where(eq(residentProfile.id, profileId));
      if (!profileRow || profileRow.status !== "active") {
        throw new JoinError("Join code is not valid", "invalid_link");
      }

      const { data: userData, error: userError } = await supabaseAdmin().auth.admin.getUserById(accountId);
      if (userError || !userData.user?.email) {
        throw userError ?? new Error("getUserById returned no email after password reset");
      }

      const { data: signInData, error: signInError } = await supabaseAdmin().auth.signInWithPassword({
        email: userData.user.email,
        password,
      });
      if (signInError || !signInData.session) {
        throw signInError ?? new Error("signInWithPassword returned no session after password reset");
      }

      // Every session live AT THIS INSTANT — there is no "new" row yet to exempt by id, so "every
      // OTHER" (design.md's own phrasing) is every one currently live. The insert right after this
      // is what makes the redeeming device's own session the sole survivor.
      await tx
        .update(session)
        .set({ revokedAt: new Date() })
        .where(and(eq(session.accountId, accountId), isNull(session.revokedAt)));

      return insertSessionTx(tx, {
        householdId: resolved.householdId,
        accountId,
        actingProfileId: profileId,
        accessToken: signInData.session.access_token,
        rememberMe: options.rememberMe ?? true,
      });
    });
  } catch (err) {
    if (err instanceof JoinError && err.code === "invalid_link") throw err;
    console.error(err);
    throw new JoinError("Password is set; signing in with it failed", "reset_done_sign_in_failed");
  }

  // design.md Decision 8 (pre-mortem fix, 2026-09-24): a visitor already signed in (the household
  // account opening the link to check it, say, or the resident's own stale session on the SAME
  // device that lost the password) has their PREVIOUS session revoked now, after phase 3 has
  // unconditionally committed (new session included) — own session only (revokeSession enforces
  // that). Otherwise the cookie the caller is about to overwrite would leave that old session row
  // valid and orphaned. Kept here, outside every phase's transaction: this has nothing to do with
  // the reset's own invariants and must never make an otherwise-valid redemption roll back.
  if (options.currentSession) {
    await revokeSession(options.currentSession.context, options.currentSession.sessionId);
  }

  const context: SessionContext = { accountId, householdId: resolved.householdId, profileId };
  return { session: sessionRow, context };
}
