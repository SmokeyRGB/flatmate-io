import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { claimResidentProfile, registerHousehold, signIn } from "@/modules/identity/auth";
import * as castingRepo from "@/modules/casting/repository";
import * as deliberationRepo from "@/modules/deliberation/repository";
import { VoteError } from "@/modules/deliberation/repository";
import { insertTestRound } from "../../helpers/applications";
import { claimPlainMember, insertApplicationAt, setupPipeline } from "../../helpers/pipeline";
import * as identityRepo from "@/modules/identity/repository";
import { PermissionDeniedError } from "@/modules/identity/repository";
import { eq } from "drizzle-orm";
import { withSessionContext, type SessionContext } from "@/db/session-context";
import { application } from "@/modules/casting/schema";
import {
  cleanupAll,
  cleanupHousehold,
  createTestModerator,
  deleteTestAccount,
  testEmail,
  type TestHousehold,
} from "../../helpers/identity";

// PR #19 review (CI time): registerTestHousehold() tracks its promise in an in-flight set that
// tests/setup.ts's global afterEach sweeps (and destroys) after EVERY test whose household is
// still "in flight" — i.e. not yet deregistered by its own .cleanup() call. That is exactly right
// for a household registered and cleaned up within ONE test, but wrong for a household meant to
// survive across many `it`s (beforeAll/afterAll below): the sweep would delete it the moment the
// first test's afterEach ran. registerHousehold (the underlying auth.ts function) is not tracked
// by that set at all — cleanupHousehold + deleteTestAccount below do the same teardown
// registerTestHousehold's own cleanup() does, the way tests/helpers/identity.ts's own comment on
// cleanupHousehold documents for "a household registered directly via registerHousehold".
async function registerSharedHousehold(name = "WG"): Promise<TestHousehold> {
  const email = testEmail();
  const password = "test-password-not-real-1234";
  const { household: householdRow, context } = await registerHousehold(email, password, name);
  return {
    context,
    accountId: context.accountId,
    householdId: householdRow.id,
    email,
    cleanup: async () => {
      await cleanupHousehold(context, householdRow.id);
      await deleteTestAccount(context.accountId);
    },
  };
}

// M6 (P1 sibling paths, P7): generalises room-round-authorization.test.ts (80f2a0f) to EVERY
// exported casting/identity repository.ts function. A new exported mutator now fails THIS test
// until someone decides its authorization, instead of shipping silently (the gap
// decidable-mutator-authorization-fixes.test.ts's own commit just closed three instances of).
//
// A function is a plain exported function here (not a class, not a re-exported schema table) —
// class declarations are `typeof === "function"` in JS too, so they are excluded explicitly.
function isPlainFunction(value: unknown): value is (...args: unknown[]) => unknown {
  if (typeof value !== "function") return false;
  return !/^class[\s{]/.test(Function.prototype.toString.call(value));
}

function exportedFunctionNames(mod: Record<string, unknown>): string[] {
  return Object.keys(mod).filter((k) => isPlainFunction(mod[k]));
}

const ROOT = join(__dirname, "..", "..", "..");

// A plain textual grep over src/app, not a claim to track every possible call path. Used for the
// no-authorization Tx primitives, which no route may reference.
function srcAppReferencesName(name: string): boolean {
  const appDir = join(ROOT, "src", "app");
  const files: string[] = [];
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) walk(full);
      else if (/\.(ts|tsx)$/.test(entry)) files.push(full);
    }
  };
  walk(appDir);
  return files.some((f) => new RegExp(`\\b${name}\\b`).test(readFileSync(f, "utf8")));
}

// --- NOT_APPLICABLE: read-only, pre-session bootstrap, documented no-auth Tx primitives, pure helpers ---
//
// "read-only" means out of THIS matrix's scope, not "needs no authorization". This matrix proves
// that every mutator refuses a plain resident. Reads carry visibility rules instead, and those are
// tested per read: getRoundParticipants' and getRoundForSession's in the G-D15 suites, for
// example. A read listed here is exempt from the mutation check only; nothing here tests its
// visibility.

const NOT_APPLICABLE_CASTING: Record<string, string> = {
  getApplication: "read-only",
  listRooms: "read-only",
  getRoundForSession: "read-only",
  getRoundParticipants: "read-only",
  listRoundsForSession: "read-only",
  // start-screen design.md Decision 4: read-only; G-D15 visibility tested in
  // tests/integration/policy/start-overview.test.ts.
  getStartOverview: "read-only",
  // start-screen design.md Decision 4: read-only; carries no application-derived value (not a
  // G-D15 read), visibility tested in tests/integration/policy/organisation-tasks.test.ts.
  listOrganisationTasks: "read-only",
  // A pure predicate over a room status (shared by openRoundTx and the new-round form): no DB
  // access, no session, nothing to authorize.
  isRoomOpenableForRound: "pure predicate; no DB access, no session",
  // application-capture design D5: read-only; the visibility rule is tested in
  // tests/integration/policy/organisation-application-visibility.test.ts.
  getOrganisationApplication:
    "read-only; visibility tested in organisation-application-visibility.test.ts",
  // application-pipeline design D1: read-only; the sibling of getOrganisationApplication with the
  // same rule, tested per read in tests/integration/policy/application-pipeline-list.test.ts.
  listOrganisationApplications:
    "read; its visibility is tested per read in application-pipeline-list.test.ts (D1)",
  // application-capture design D4: the write half of captureApplication (INSERT + audit event),
  // exported only as the test seam for "no value leaves in an error". It performs NO
  // authorization itself: captureApplication checks the permission and the round first. No
  // src/app file may reference it (asserted below), so a route cannot bypass those checks.
  insertCapturedApplicationTx:
    "Tx primitive, no authorization by contract (captureApplication checks first); no route caller, asserted below",
  // F4 change 1 (screening-pass) design D2: the two query ports deliberation reads casting through.
  // Both are `...Tx` reads that trust the context they are given, refuse a profile-less one, and
  // re-apply the voter predicate themselves; deliberation's repository is the only caller (no
  // src/app file may reference them, asserted below).
  listVoterRoundsTx:
    "Tx read port; visibility tested in tests/integration/deliberation/screening-pass.test.ts (non-participant, moved-out); no route caller, asserted below",
  listVoteCandidatesTx:
    "Tx read port; card visibility tested in tests/integration/deliberation/screening-pass.test.ts (non-participant, moved-out, key set); no route caller, asserted below",
  // F5 change 1 (ranking) design D3: the counted voters and open rooms of one round. Same class as
  // the two ports above; it guards by its own result (null unless the viewer is a counted voter).
  getRoundTallyBasisTx:
    "Tx read port; visibility tested in tests/integration/deliberation/screening-pass.test.ts (participant, non-participant) and ranking.test.ts; no route caller, asserted below",
};

// F4 change 1: deliberation/repository.ts. The reads carry their visibility in screening-pass.test.ts
// and awaiting-vote-counts.test.ts; castVote is the one mutator and is decided below.
const NOT_APPLICABLE_DELIBERATION: Record<string, string> = {
  getAwaitingVoteCounts: "read; visibility tested in tests/integration/deliberation/awaiting-vote-counts.test.ts",
  getScreeningPass: "read; visibility tested in tests/integration/deliberation/screening-pass.test.ts",
  getRanking: "read; visibility tested in tests/integration/deliberation/ranking.test.ts",
};

const NOT_APPLICABLE_IDENTITY: Record<string, string> = {
  isDisplayNameTaken: "read-only",
  appointedPermissions: "pure helper — no DB, no session (the sorted union with the moderator set)",
  isFoundingLink: "read-only",
  isHouseholdAccount: "read-only (identifies the caller by its stored household-only permissions)",
  getLiveFoundingLinkPath:
    "read-only; returns null for a caller without manage_join_codes (the code is a secret)",
  resolveAccountHousehold:
    "pre-session bootstrap — the ONE deliberate RLS-bootstrap exception (drizzle/0005): sign-in " +
    "has no household_id yet, discovering it is this call's entire purpose.",
  resolveJoinCode:
    "pre-session bootstrap — a stranger presenting a join code has no session yet; STABLE and " +
    "non-consuming by design (FR-2.9).",
  claimJoinCode:
    "pre-session bootstrap, same no-auth-by-design class as claimJoinCodeTx below — kept only as " +
    "a standalone statement for join-code-atomicity.test.ts's concurrency races; no src/ caller.",
  claimJoinCodeTx:
    "Tx primitive with an explicit documented no-auth contract (own comment: 'PERFORMS NO " +
    "AUTHORIZATION, and that is correct' — a stranger presenting a code has no identity yet to " +
    "assert against; the control is recordJoinAttempt's rate limit, checked before this).",
  recordJoinAttempt:
    "pre-session bootstrap — the third deliberate RLS-bootstrap exception; a stranger presenting " +
    "a code has no session, and rate limiting must run before any code lookup (AC-2.25).",
  assertAccountCanVoteTx: "assertion helper, not itself a mutation (castVote's in-transaction check of the stored vote permission)",
  assertHasPermission: "assertion helper — the permission primitive other functions build on",
  membershipHoldsPermission: "pure helper — no SessionContext, no DB access",
  assertHasPermissionTx: "assertion helper — the in-transaction permission primitive",
  assertHoldsAnyPermissionTx: "assertion helper — the in-transaction permission primitive",
  assertHoldsAllPermissionsTx: "assertion helper — the in-transaction permission primitive, every permission of a list",
  getMembershipForAccount: "read-only",
  getIdentityLabel: "read-only",
  getHousehold: "read-only",
  getHouseholdSettings: "read-only",
  resolveSessionContext:
    "pre-session bootstrap — reconstructs a SessionContext from a cookie's session id, before any " +
    "session exists; also returns that session's own remember_me and its household's sign-in code " +
    "(tested in household-sign-in-code-visibility.test.ts)",
  getResidentList:
    "read; checks the member-administration permissions inline; visibility tested in resident-list-access.test.ts",
  getCurrentHouseholdMembers: "read-only",
  generateJoinCode: "pure helper — no SessionContext, no DB access",
  buildJoinUrl: "pure helper — no SessionContext, no DB access",
  normalizeJoinCode: "pure helper — no SessionContext, no DB access",
  isWellFormedJoinCode: "pure helper — no SessionContext, no DB access",
  // household-sign-in-code (D1/D4/D5/D7).
  normalizeHouseholdSignInCode: "pure helper — no SessionContext, no DB access",
  isWellFormedHouseholdSignInCode: "pure helper — no SessionContext, no DB access",
  resolveHouseholdSignInCode:
    "pre-session bootstrap — the fourth deliberate RLS-bootstrap exception (resolve_household_sign_in_code, " +
    "drizzle/0033); a visitor signing in has no session yet, and the caller never sees the result.",
  recordSignInAttempt:
    "pre-session bootstrap — the resident name sign-in's own bucket of record_join_attempt; a visitor " +
    "signing in has no session, and the limit must run before any lookup.",
  getHouseholdSignInCode:
    "read-only, own household only (RLS-scoped under the caller's context); visibility tested in " +
    "household-sign-in-code-visibility.test.ts",
  issueJoinCodeTx:
    "Tx primitive with an explicit documented no-auth contract (own comment: 'THIS FUNCTION " +
    "PERFORMS NO AUTHORIZATION' — the one legitimate caller, registerHousehold, mints the " +
    "founding link before any Membership row exists to authorize against).",
  listJoinCodeIssuances:
    "read; checks manage_join_codes inline; visibility tested in join-code-isolation.test.ts",
  assertHasResidentProfile: "pure sync assertion helper — no DB access",
  // start-screen design.md Decision 4: read-only; decides visibility only, never authorization —
  // tested in tests/integration/policy/navigation-access.test.ts.
  getNavigationAccess: "read-only",
  // resident-settings design.md Decision 8: self-service, own account only — the account read is
  // ALWAYS context.accountId, never a caller-supplied value; refused entirely for a household
  // session (profileId null). Read-only, tested in
  // tests/integration/policy/account-settings-email.test.ts.
  getOwnAccountEmail: "self-service read, own account only (identity/account-settings)",
  // Copilot review round 5 (PR #23), FIX 1: pre-session bootstrap, same class as
  // resolveAccountHousehold above — signIn calls this BEFORE it has authenticated anyone (before
  // its own signInWithPassword), to read a clock value with no tenant/row to authorize against.
  readDatabaseClock: "pre-session bootstrap — a bare clock read with no row or tenant to authorize against; called by signIn before its own signInWithPassword.",
};

const KNOWN_OPEN_IDENTITY: Record<string, string> = {};

async function claim(hh: TestHousehold, name: string, accountIds: string[]) {
  const actor = { accountId: hh.accountId, profileId: null };
  const profile = await identityRepo.createResidentProfile(hh.context, name, actor);
  const { accountId } = await claimResidentProfile(hh.context, profile.id, "test-password-not-real-1234");
  accountIds.push(accountId);
  return { profileId: profile.id, accountId, displayName: name };
}

// PR #19 review: authorization derives from the authenticated session (context.accountId), not
// from an actor/actingAccountId a caller happens to pass — so a REFUSAL case must present the
// resident's OWN SessionContext, not the household admin's hh.context paired with the resident's
// accountId (that combination is now refused for being a mismatched session, not for lacking the
// permission this test means to exercise).
function residentContext(
  hh: TestHousehold,
  resident: { accountId: string; profileId: string },
): SessionContext {
  return { accountId: resident.accountId, householdId: hh.householdId, profileId: resident.profileId };
}

// F3 change 2b: every refusal is one PermissionDeniedError naming the missing permission. A refusal
// reached by the wrong path would look identical otherwise, so a case asserts WHICH permission.
async function expectDenied(promise: Promise<unknown>, permission: string) {
  const err = await promise.then(
    () => undefined,
    (e: unknown) => e,
  );
  expect(err).toBeInstanceOf(PermissionDeniedError);
  expect((err as PermissionDeniedError).message).toContain(permission);
}

describe("authorization matrix (M6): every exported casting/identity mutator decides its authorization", () => {
  describe("set coverage — every export is classified exactly once", () => {
    it("insertCapturedApplicationTx (a no-authorization test seam) has no caller outside its own module", () => {
      expect(srcAppReferencesName("insertCapturedApplicationTx")).toBe(false);
      // Code review: a route is not the only way around captureApplication's checks. Any other
      // module or script calling the seam would bypass them too, so all of src/ and scripts/ is
      // searched, except the one file that defines and uses it.
      const own = join(ROOT, "src", "modules", "casting", "repository.ts");
      const files: string[] = [];
      const walk = (dir: string) => {
        for (const entry of readdirSync(dir)) {
          const full = join(dir, entry);
          if (statSync(full).isDirectory()) walk(full);
          else if (/\.(ts|tsx)$/.test(entry) && full !== own) files.push(full);
        }
      };
      walk(join(ROOT, "src"));
      walk(join(ROOT, "scripts"));
      const callers = files.filter((f) => /\binsertCapturedApplicationTx\b/.test(readFileSync(f, "utf8")));
      expect(callers).toEqual([]);
    });

    it("the three casting query ports have no caller outside casting and deliberation's repository", () => {
      for (const name of ["listVoterRoundsTx", "listVoteCandidatesTx", "getRoundTallyBasisTx"]) {
        expect(srcAppReferencesName(name), `${name} is referenced under src/app`).toBe(false);
        const allowed = [
          join(ROOT, "src", "modules", "casting", "repository.ts"),
          join(ROOT, "src", "modules", "deliberation", "repository.ts"),
        ];
        const files: string[] = [];
        const walk = (dir: string) => {
          for (const entry of readdirSync(dir)) {
            const full = join(dir, entry);
            if (statSync(full).isDirectory()) walk(full);
            else if (/\.(ts|tsx)$/.test(entry) && !allowed.includes(full)) files.push(full);
          }
        };
        walk(join(ROOT, "src"));
        walk(join(ROOT, "scripts"));
        const callers = files.filter((f) => new RegExp(`\\b${name}\\b`).test(readFileSync(f, "utf8")));
        expect(callers, `${name} callers`).toEqual([]);
      }
    });

    it("deliberation/repository.ts: NOT_APPLICABLE + cases below == every exported function", () => {
      const all = new Set(exportedFunctionNames(deliberationRepo as unknown as Record<string, unknown>));
      const classified = new Set([...Object.keys(NOT_APPLICABLE_DELIBERATION), ...DELIBERATION_CASE_NAMES]);
      const unclassified = [...all].filter((n) => !classified.has(n)).sort();
      const stale = [...classified].filter((n) => !all.has(n)).sort();
      expect(unclassified, `Unclassified deliberation export(s): ${unclassified.join(", ")}`).toEqual([]);
      expect(stale, `Stale classification entries (no longer exported): ${stale.join(", ")}`).toEqual([]);
    });

    it("casting/repository.ts: NOT_APPLICABLE + cases below == every exported function", () => {
      const all = new Set(exportedFunctionNames(castingRepo as unknown as Record<string, unknown>));
      const classified = new Set([
        ...Object.keys(NOT_APPLICABLE_CASTING),
        ...CASTING_CASE_NAMES,
      ]);
      const unclassified = [...all].filter((n) => !classified.has(n)).sort();
      const stale = [...classified].filter((n) => !all.has(n)).sort();
      expect(unclassified, `Unclassified casting export(s): ${unclassified.join(", ")}`).toEqual([]);
      expect(stale, `Stale classification entries (no longer exported): ${stale.join(", ")}`).toEqual([]);
    });

    it("identity/repository.ts: NOT_APPLICABLE + KNOWN_OPEN + cases below == every exported function", () => {
      const all = new Set(exportedFunctionNames(identityRepo as unknown as Record<string, unknown>));
      const classified = new Set([
        ...Object.keys(NOT_APPLICABLE_IDENTITY),
        ...Object.keys(KNOWN_OPEN_IDENTITY),
        ...IDENTITY_CASE_NAMES,
      ]);
      const unclassified = [...all].filter((n) => !classified.has(n)).sort();
      const stale = [...classified].filter((n) => !all.has(n)).sort();
      expect(unclassified, `Unclassified identity export(s): ${unclassified.join(", ")}`).toEqual([]);
      expect(stale, `Stale classification entries (no longer exported): ${stale.join(", ")}`).toEqual([]);
    });
  });

  // PR #19 review (CI time): this matrix's ~24 cases each used to register a fresh household and
  // claim a resident of their own — every one a real Supabase Auth round trip to eu-west-1, which
  // made this the slowest file in CI (228s). Refusal cases mutate nothing (that's the whole
  // point of a refusal), so sharing ONE household and ONE claimed plain resident per describe
  // block (registered/claimed once in beforeAll, torn down once in afterAll) is sound — no case
  // depends on another's outcome, only on the fixture existing. A case needing more than that
  // (a room, a round, a second member, a join code) creates it fresh via the ADMIN's OWN context
  // inside the test; the shared household's afterAll cleanup removes it regardless, since
  // cleanupHousehold deletes every HOUSEHOLD_SCOPED_TABLES row for the household, not just what a
  // single test created.
  describe("casting/repository.ts mutators refuse a plain resident", () => {
    let hh: TestHousehold;
    let adminActor: { accountId: string; profileId: null };
    let resident: { profileId: string; accountId: string; displayName: string };
    let residentActor: { accountId: string; profileId: string };
    let residentCtx: SessionContext;
    let moderator: { context: SessionContext; accountId: string; profileId: string };
    let moderatorActor: { accountId: string; profileId: string };

    beforeAll(async () => {
      hh = await registerSharedHousehold();
      adminActor = { accountId: hh.accountId, profileId: null };
      resident = await claim(hh, "Resident1", []);
      residentActor = { accountId: resident.accountId, profileId: resident.profileId };
      residentCtx = residentContext(hh, resident);
      // Design D13: the household account no longer creates or opens rounds, so the setup of the
      // cases below that need a round is done by a moderator. Its cleanup rides on hh.cleanup().
      moderator = await createTestModerator(hh);
      moderatorActor = { accountId: moderator.accountId, profileId: moderator.profileId };
    });

    // Guarded: if beforeAll failed partway, hh or resident is still unset, and dereferencing it
    // would throw before hh.cleanup() ran, orphaning whatever beforeAll did create.
    afterAll(async () => {
      await cleanupAll(resident ? deleteTestAccount(resident.accountId) : undefined, hh?.cleanup());
    });

    it("createRoom", async () => {
      await expect(
        castingRepo.createRoom(residentCtx, "Room B", residentActor),
      ).rejects.toThrow(PermissionDeniedError);
    });

    it("createRoom refuses a resident's own session spoofed with the admin's accountId", async () => {
      const spoofedActor = { accountId: hh.accountId, profileId: null };
      await expect(
        castingRepo.createRoom(residentCtx, "Room B", spoofedActor),
      ).rejects.toThrow(PermissionDeniedError);
    });

    it("renameRoom", async () => {
      const room = await castingRepo.createRoom(hh.context, "Room A", adminActor);
      await expect(
        castingRepo.renameRoom(residentCtx, room.id, "Renamed", residentActor),
      ).rejects.toThrow(PermissionDeniedError);
    });

    it("transitionRoomStatus", async () => {
      const room = await castingRepo.createRoom(hh.context, "Room A", adminActor);
      await expect(
        castingRepo.transitionRoomStatus(residentCtx, room.id, "open", residentActor),
      ).rejects.toThrow(PermissionDeniedError);
    });

    it("removeRoom", async () => {
      const room = await castingRepo.createRoom(hh.context, "Room A", adminActor);
      await expect(
        castingRepo.removeRoom(residentCtx, room.id, residentActor),
      ).rejects.toThrow(PermissionDeniedError);
    });

    it("createRound", async () => {
      const room = await castingRepo.createRoom(hh.context, "Room A", adminActor);
      await expect(
        castingRepo.createRound(residentCtx, "Round", [room.id], residentActor),
      ).rejects.toThrow(PermissionDeniedError);
    });

    it("openRound", async () => {
      const room = await castingRepo.createRoom(hh.context, "Room A", adminActor);
      const round = await castingRepo.createRound(moderator.context, "Round", [room.id], moderatorActor);
      await expect(
        castingRepo.openRound(residentCtx, round.id, residentActor),
      ).rejects.toThrow(PermissionDeniedError);
    });

    it("createAndOpenRound", async () => {
      const room = await castingRepo.createRoom(hh.context, "Room A", adminActor);
      await expect(
        castingRepo.createAndOpenRound(residentCtx, "Round", [room.id], residentActor),
      ).rejects.toThrow(PermissionDeniedError);
    });

    it("addResidentToRound", async () => {
      const room = await castingRepo.createRoom(hh.context, "Room A", adminActor);
      const round = await castingRepo.createRound(moderator.context, "Round", [room.id], moderatorActor);
      await expect(
        castingRepo.addResidentToRound(residentCtx, round.id, resident.profileId, residentActor),
      ).rejects.toThrow(PermissionDeniedError);
    });

    it("captureApplication", async () => {
      // A plain resident's own context: refused for the missing permission, and no row is written.
      const room = await castingRepo.createRoom(hh.context, "Room A", adminActor);
      const round = await castingRepo.createAndOpenRound(moderator.context, "Round", [room.id], moderatorActor);
      await expect(
        castingRepo.captureApplication(residentCtx, {
          roundId: round.id,
          applicantName: "Testbewerbung Matrix",
          collectedFrom: "data_subject",
        }),
      ).rejects.toThrow(PermissionDeniedError);
      const rows = await withSessionContext(residentCtx, (tx) =>
        tx.select().from(application).where(eq(application.roundId, round.id)),
      );
      expect(rows).toHaveLength(0);
    });

    // FR-3.24, AC-3.21 (application-pipeline): the guard on every state change and on a correction.
    // A plain resident holds neither permission, so both are refused on the permission before the
    // row is read, and nothing changes. The finer cases (backward, pending step, stale) are in
    // application-transition-guard.test.ts and application-correction.test.ts.
    it("transitionApplication", async () => {
      const room = await castingRepo.createRoom(hh.context, "Room A", adminActor);
      const round = await castingRepo.createAndOpenRound(moderator.context, "Round", [room.id], moderatorActor);
      const { id } = await castingRepo.captureApplication(moderator.context, {
        roundId: round.id,
        applicantName: "Testbewerbung Matrix",
        collectedFrom: "data_subject",
      });
      await expect(castingRepo.transitionApplication(residentCtx, id, "screened")).rejects.toThrow(
        PermissionDeniedError,
      );
      const [row] = await withSessionContext(moderator.context, (tx) =>
        tx.select().from(application).where(eq(application.id, id)),
      );
      expect(row.state).toBe("new");
    });

    it("updateApplication", async () => {
      const room = await castingRepo.createRoom(hh.context, "Room A", adminActor);
      const round = await castingRepo.createAndOpenRound(moderator.context, "Round", [room.id], moderatorActor);
      const { id } = await castingRepo.captureApplication(moderator.context, {
        roundId: round.id,
        applicantName: "Testbewerbung Matrix",
        collectedFrom: "data_subject",
      });
      await expect(
        castingRepo.updateApplication(residentCtx, {
          roundId: round.id,
          applicationId: id,
          baseline: "not-a-real-baseline",
          applicantName: "Geändert",
          collectedFrom: "data_subject",
        }),
      ).rejects.toThrow(PermissionDeniedError);
      const [row] = await withSessionContext(moderator.context, (tx) =>
        tx.select().from(application).where(eq(application.id, id)),
      );
      expect(row.applicantName).toBe("Testbewerbung Matrix");
    });

    it("updateHouseholdSettings", async () => {
      await expect(
        castingRepo.updateHouseholdSettings(residentCtx, { quorumShare: "0.6" }, residentActor),
      ).rejects.toThrow(PermissionDeniedError);
    });

  });


  // F3 change 2b (design D1, task 7.1): the other two callers of the casting mutators. The household
  // account runs no rounds and captures no application (03-PRD.md §4.0.1, S-50/U-20), but manages
  // rooms and the voting procedure; a moderator runs rounds, participants and applications and
  // manages rooms, but holds no `manage_voting_procedure` (matrix ⬜, never granted here).
  describe("casting/repository.ts mutators: the household column and the moderator column", () => {
    let hh: TestHousehold;
    let adminActor: { accountId: string; profileId: null };
    let resident: { profileId: string; accountId: string; displayName: string };
    let moderator: { context: SessionContext; accountId: string; profileId: string };
    let moderatorActor: { accountId: string; profileId: string };

    beforeAll(async () => {
      hh = await registerSharedHousehold();
      adminActor = { accountId: hh.accountId, profileId: null };
      resident = await claim(hh, "Resident1", []);
      moderator = await createTestModerator(hh);
      moderatorActor = { accountId: moderator.accountId, profileId: moderator.profileId };
    });

    afterAll(async () => {
      await cleanupAll(resident ? deleteTestAccount(resident.accountId) : undefined, hh?.cleanup());
    });

    // Household column: rooms and settings allowed ...
    it("the household account may manage rooms and the voting procedure", async () => {
      const renamed = await castingRepo.createRoom(hh.context, "Room H", adminActor);
      await castingRepo.renameRoom(hh.context, renamed.id, "Room H2", adminActor);
      const moved = await castingRepo.createRoom(hh.context, "Room H5", adminActor);
      await castingRepo.transitionRoomStatus(hh.context, moved.id, "open", adminActor);
      const removed = await castingRepo.createRoom(hh.context, "Room H6", adminActor);
      await castingRepo.removeRoom(hh.context, removed.id, adminActor);
      await castingRepo.updateHouseholdSettings(hh.context, { quorumShare: "0.6" }, adminActor);
    });

    // ... and every round and application mutator refused.
    it("the household account is refused every round and application mutator", async () => {
      const room = await castingRepo.createRoom(hh.context, "Room H3", adminActor);
      const round = await castingRepo.createAndOpenRound(moderator.context, "Round", [room.id], moderatorActor);
      const { id } = await castingRepo.captureApplication(moderator.context, {
        roundId: round.id,
        applicantName: "Testbewerbung Matrix",
        collectedFrom: "data_subject",
      });
      const draftRoom = await castingRepo.createRoom(hh.context, "Room H4", adminActor);
      await expectDenied(castingRepo.createRound(hh.context, "Round", [draftRoom.id], adminActor), "manage_rounds");
      await expectDenied(castingRepo.createAndOpenRound(hh.context, "Round", [draftRoom.id], adminActor), "manage_rounds");
      await expectDenied(castingRepo.openRound(hh.context, round.id, adminActor), "manage_rounds");
      await expectDenied(
        castingRepo.addResidentToRound(hh.context, round.id, resident.profileId, adminActor),
        "manage_round_participation",
      );
      // The application mutators refuse a profile-less session before any permission check or query
      // (S-50, ProfileRequiredError), which is the household account's refusal here.
      await expect(
        castingRepo.captureApplication(hh.context, { roundId: round.id, applicantName: "X", collectedFrom: "data_subject" }),
      ).rejects.toThrow(castingRepo.ProfileRequiredError);
      await expect(castingRepo.transitionApplication(hh.context, id, "screened")).rejects.toThrow(
        castingRepo.ProfileRequiredError,
      );
      await expect(
        castingRepo.updateApplication(hh.context, {
          roundId: round.id,
          applicationId: id,
          baseline: "not-a-real-baseline",
          applicantName: "Geändert",
          collectedFrom: "data_subject",
        }),
      ).rejects.toThrow(castingRepo.ProfileRequiredError);
    });

    // Moderator column: rooms, rounds, participants and applications allowed ...
    it("a moderator may manage rooms, run a round, add a participant and move an application", async () => {
      const room = await castingRepo.createRoom(moderator.context, "Room M", moderatorActor);
      await castingRepo.renameRoom(moderator.context, room.id, "Room M2", moderatorActor);
      const moved = await castingRepo.createRoom(moderator.context, "Room M5", moderatorActor);
      await castingRepo.transitionRoomStatus(moderator.context, moved.id, "open", moderatorActor);
      const draft = await castingRepo.createRound(moderator.context, "Draft", [room.id], moderatorActor);
      await castingRepo.openRound(moderator.context, draft.id, moderatorActor);
      const room2 = await castingRepo.createRoom(moderator.context, "Room M3", moderatorActor);
      const round = await castingRepo.createAndOpenRound(moderator.context, "Round", [room2.id], moderatorActor);
      await castingRepo.addResidentToRound(moderator.context, round.id, resident.profileId, moderatorActor);
      const { id } = await castingRepo.captureApplication(moderator.context, {
        roundId: round.id,
        applicantName: "Testbewerbung Matrix",
        collectedFrom: "data_subject",
      });
      await castingRepo.transitionApplication(moderator.context, id, "screened");
      const removable = await castingRepo.createRoom(moderator.context, "Room M6", moderatorActor);
      await castingRepo.removeRoom(moderator.context, removable.id, moderatorActor);
    });

    // ... but not the voting procedure (no individual grant exists here).
    it("a moderator is refused the voting-procedure mutator (matrix ⬜, not granted)", async () => {
      await expectDenied(
        castingRepo.updateHouseholdSettings(moderator.context, { quorumShare: "0.6" }, moderatorActor),
        "manage_voting_procedure",
      );
    });
  });

  describe("identity/repository.ts mutators refuse a plain resident", () => {
    let hh: TestHousehold;
    let resident: { profileId: string; accountId: string; displayName: string };
    let residentActor: { accountId: string; profileId: string };
    let residentCtx: SessionContext;
    const extraAccountIds: string[] = [];

    beforeAll(async () => {
      hh = await registerSharedHousehold();
      resident = await claim(hh, "Resident1", []);
      residentActor = { accountId: resident.accountId, profileId: resident.profileId };
      residentCtx = residentContext(hh, resident);
    });

    // Guarded like the casting block's afterAll: a partial beforeAll must not orphan the household.
    afterAll(async () => {
      await cleanupAll(
        resident ? deleteTestAccount(resident.accountId) : undefined,
        ...extraAccountIds.map(deleteTestAccount),
        hh?.cleanup(),
      );
    });

    // F3 change 2b: one denial class, naming the missing permission. A refusal reached by the wrong
    // path would look identical otherwise, so each case asserts WHICH permission was missing.
    it("createResidentProfile", async () => {
      await expectDenied(identityRepo.createResidentProfile(residentCtx, "Nobody", residentActor), "create_resident_profile");
    });

    it("createResidentProfile refuses a resident's own session spoofed with the admin's accountId", async () => {
      const spoofedActor = { accountId: hh.accountId, profileId: null };
      await expectDenied(identityRepo.createResidentProfile(residentCtx, "Nobody", spoofedActor), "create_resident_profile");
    });

    it("transitionResidentProfileStatus", async () => {
      const adminActor = { accountId: hh.accountId, profileId: null };
      const target = await identityRepo.createResidentProfile(hh.context, "Target", adminActor);
      await expectDenied(
        identityRepo.transitionResidentProfileStatus(residentCtx, target.id, "moved_out", residentActor),
        "manage_members",
      );
    });

    it("removeMember", async () => {
      const target = await claim(hh, "Resident2", extraAccountIds);
      await expectDenied(
        identityRepo.removeMember(residentCtx, resident.accountId, target.accountId, target.displayName),
        "manage_members",
      );
    });

    it("removePreparedProfile", async () => {
      const prepared = await identityRepo.createResidentProfile(hh.context, "PreparedForResident", {
        accountId: hh.accountId,
        profileId: null,
      });
      await expectDenied(identityRepo.removePreparedProfile(residentCtx, resident.accountId, prepared.id), "manage_members");
    });

    it("setMovedOut", async () => {
      const target = await claim(hh, "Resident3", extraAccountIds);
      await expectDenied(identityRepo.setMovedOut(residentCtx, resident.accountId, target.accountId), "manage_members");
    });

    it("reactivateMember", async () => {
      const target = await claim(hh, "Resident4", extraAccountIds);
      await expectDenied(identityRepo.reactivateMember(residentCtx, resident.accountId, target.accountId), "manage_members");
    });

    it("issueJoinCode", async () => {
      await expectDenied(
        identityRepo.issueJoinCode(residentCtx, resident.accountId, { validDays: 7, maxUses: 1 }),
        "manage_join_codes",
      );
    });

    it("extendJoinCode", async () => {
      const issuance = await identityRepo.issueJoinCode(hh.context, hh.accountId, { validDays: 7, maxUses: 1 });
      await expectDenied(identityRepo.extendJoinCode(residentCtx, resident.accountId, issuance.id), "manage_join_codes");
    });

    it("deleteJoinCode", async () => {
      const issuance = await identityRepo.issueJoinCode(hh.context, hh.accountId, { validDays: 7, maxUses: 1 });
      await expectDenied(identityRepo.deleteJoinCode(residentCtx, resident.accountId, issuance.id), "manage_join_codes");
    });

    it("setMemberRole", async () => {
      const target = await claim(hh, "Resident5", extraAccountIds);
      await expectDenied(
        identityRepo.setMemberRole(residentCtx, resident.accountId, target.accountId, "moderator"),
        "appoint_moderator",
      );
    });

    it("setMemberRole refuses a resident's own session spoofed with the admin's accountId", async () => {
      const target = await claim(hh, "Resident6", extraAccountIds);
      await expectDenied(
        identityRepo.setMemberRole(residentCtx, hh.accountId, target.accountId, "moderator"),
        "appoint_moderator",
      );
    });

    it("triggerSubjectAccessExport", async () => {
      await expectDenied(
        identityRepo.triggerSubjectAccessExport(residentCtx, resident.accountId, "some-application-id"),
        "export_subject_access",
      );
    });

    it("revokeSession", async () => {
      const adminSignIn = await signIn({ kind: "household", email: hh.email, password: "test-password-not-real-1234" });
      await expect(
        identityRepo.revokeSession(residentCtx, adminSignIn.session.id),
      ).rejects.toThrow(PermissionDeniedError);
    });

    // resident-settings design.md Decision 6 (O-16, proposal Assumption 5): the household account
    // ONLY may issue a reset link. A plain resident is refused here; the moderator's refusal is in
    // the moderator column below.
    it("issuePasswordResetLink refuses a plain resident", async () => {
      const target = await claim(hh, "ResidentResetTarget1", extraAccountIds);
      await expectDenied(
        identityRepo.issuePasswordResetLink(residentCtx, resident.accountId, target.profileId),
        "issue_password_reset_link",
      );
    });
  });

  // F3 change 2b (design D1, task 7.1): the matrix's other two callers. A moderator may do every
  // member-administration action the household account may, including creating a profile and
  // appointing or demoting moderators (human decision, 2026-10-01), but not issue a reset link; the
  // household account may do all of it. Each "allowed" case calls the real function and asserts the
  // outcome that proves it ran (a returned row, or the stored state afterwards).
  describe("identity/repository.ts mutators: the moderator column and the household column", () => {
    let hh: TestHousehold;
    let moderator: { context: SessionContext; accountId: string; profileId: string };
    let moderatorActor: { accountId: string; profileId: string };
    const extraAccountIds: string[] = [];

    beforeAll(async () => {
      hh = await registerSharedHousehold();
      moderator = await createTestModerator(hh);
      moderatorActor = { accountId: moderator.accountId, profileId: moderator.profileId };
    });

    afterAll(async () => {
      await cleanupAll(...extraAccountIds.map(deleteTestAccount), hh?.cleanup());
    });

    it("a moderator may createResidentProfile (a prepared profile for a personal join link)", async () => {
      const profile = await identityRepo.createResidentProfile(moderator.context, "ByModerator", moderatorActor);
      expect(profile.status).toBe("prepared");
    });

    it("a moderator may transitionResidentProfileStatus on a prepared profile (not refused for permission)", async () => {
      const adminActor = { accountId: hh.accountId, profileId: null };
      const target = await identityRepo.createResidentProfile(hh.context, "PreparedTarget", adminActor);
      const updated = await identityRepo.transitionResidentProfileStatus(moderator.context, target.id, "moved_out", moderatorActor);
      expect(updated.status).toBe("moved_out");
    });

    it("a moderator may removeMember", async () => {
      const target = await claim(hh, "RemoveTarget", extraAccountIds);
      await identityRepo.removeMember(moderator.context, moderator.accountId, target.accountId, target.displayName);
      const list = await identityRepo.getResidentList(hh.context, hh.accountId);
      expect(list.members.map((m) => m.id)).not.toContain(target.profileId);
    });

    it("a moderator may removePreparedProfile (an unclaimed profile goes; a claimed one is refused)", async () => {
      const adminActor = { accountId: hh.accountId, profileId: null };
      const prepared = await identityRepo.createResidentProfile(hh.context, "PreparedToDelete", adminActor);
      await identityRepo.removePreparedProfile(moderator.context, moderator.accountId, prepared.id);
      const list = await identityRepo.getResidentList(hh.context, hh.accountId);
      expect(list.members.map((m) => m.id)).not.toContain(prepared.id);
      // the name is free again
      await identityRepo.createResidentProfile(hh.context, "PreparedToDelete", adminActor);

      const claimed = await claim(hh, "ClaimedNotDeletable", extraAccountIds);
      await expect(
        identityRepo.removePreparedProfile(moderator.context, moderator.accountId, claimed.profileId),
      ).rejects.toThrow(identityRepo.ResidentProfileNotPreparedError);
    });

    it("a moderator may setMovedOut and reactivateMember", async () => {
      const target = await claim(hh, "MoveOutTarget", extraAccountIds);
      await identityRepo.setMovedOut(moderator.context, moderator.accountId, target.accountId);
      const movedOut = (await identityRepo.getResidentList(hh.context, hh.accountId)).members.find((m) => m.id === target.profileId);
      expect(movedOut?.status).toBe("moved_out");
      await identityRepo.reactivateMember(moderator.context, moderator.accountId, target.accountId);
      const back = (await identityRepo.getResidentList(hh.context, hh.accountId)).members.find((m) => m.id === target.profileId);
      expect(back?.status).toBe("active");
    });

    it("a moderator may issueJoinCode, extendJoinCode and deleteJoinCode", async () => {
      const issuance = await identityRepo.issueJoinCode(moderator.context, moderator.accountId, { validDays: 7, maxUses: 1 });
      const extended = await identityRepo.extendJoinCode(moderator.context, moderator.accountId, issuance.id);
      expect(extended.expiresAt.getTime()).toBeGreaterThan(issuance.expiresAt.getTime());
      await identityRepo.deleteJoinCode(moderator.context, moderator.accountId, issuance.id);
    });

    it("a moderator may appoint a member, demote another moderator and demote itself", async () => {
      const member = await claim(hh, "AppointTarget", extraAccountIds);
      await identityRepo.setMemberRole(moderator.context, moderator.accountId, member.accountId, "moderator");
      // another moderator is demoted by this moderator ...
      await identityRepo.setMemberRole(moderator.context, moderator.accountId, member.accountId, "member");
      // ... and a moderator demotes itself (a separate one, so the shared moderator stays)
      const selfDemoting = await createTestModerator(hh, "SelfDemoting");
      await identityRepo.setMemberRole(selfDemoting.context, selfDemoting.accountId, selfDemoting.accountId, "member");
      await expectDenied(
        identityRepo.setMovedOut(selfDemoting.context, selfDemoting.accountId, member.accountId),
        "manage_members",
      );
    });

    it("a moderator may triggerSubjectAccessExport", async () => {
      const result = await identityRepo.triggerSubjectAccessExport(moderator.context, moderator.accountId, "some-application-id");
      expect(result.exportId).toContain("export-");
    });

    it("a moderator is refused issuePasswordResetLink (household only)", async () => {
      const target = await claim(hh, "ModResetTarget", extraAccountIds);
      await expectDenied(
        identityRepo.issuePasswordResetLink(moderator.context, moderator.accountId, target.profileId),
        "issue_password_reset_link",
      );
    });

    it("neither the household account nor a moderator may change the administering membership's role", async () => {
      await expect(
        identityRepo.setMemberRole(hh.context, hh.accountId, hh.accountId, "moderator"),
      ).rejects.toThrow(identityRepo.CannotChangeAdminRoleError);
      await expect(
        identityRepo.setMemberRole(moderator.context, moderator.accountId, hh.accountId, "member"),
      ).rejects.toThrow(identityRepo.CannotChangeAdminRoleError);
    });

    it("the household account may do all of it, including issuePasswordResetLink", async () => {
      const adminActor = { accountId: hh.accountId, profileId: null };
      const created = await identityRepo.createResidentProfile(hh.context, "ByHousehold", adminActor);
      expect(created.status).toBe("prepared");
      const target = await claim(hh, "HhResetTarget", extraAccountIds);
      const link = await identityRepo.issuePasswordResetLink(hh.context, hh.accountId, target.profileId);
      expect(link.purpose).toBe("password_reset");
      const issuance = await identityRepo.issueJoinCode(hh.context, hh.accountId, { validDays: 7, maxUses: 1 });
      expect(issuance.code).toBeTruthy();
      const exported = await identityRepo.triggerSubjectAccessExport(hh.context, hh.accountId, "some-application-id");
      expect(exported.exportId).toContain("export-");
    });
  });
});

describe("deliberation/repository.ts castVote refuses who may not vote (M6)", () => {
  const households: TestHousehold[] = [];
  const accountIds: string[] = [];

  afterAll(async () => {
    await cleanupAll(...accountIds.map(deleteTestAccount), ...households.map((h) => h.cleanup()));
  });

  it("castVote: the household account is refused with ProfileRequiredError", async () => {
    const s = await setupPipeline(households);
    const app = await insertApplicationAt(s, "new");
    await expect(
      deliberationRepo.castVote(s.hh.context, { roundId: s.roundId, applicationId: app.id, value: "good" }),
    ).rejects.toThrow(castingRepo.ProfileRequiredError);
  });

  it("castVote: a claimed plain resident with no participation in the round gets not_eligible", async () => {
    const s = await setupPipeline(households);
    const resident = await claimPlainMember(s.hh, "Plain", accountIds);
    // A claimed resident participates in every open round, so the round is built without them.
    const round = await withSessionContext(s.moderator.context, (tx) => insertTestRound(tx, s.hh.householdId, "open"));
    const app = await insertApplicationAt(s, "new", {}, round);
    const err = await deliberationRepo
      .castVote(resident.context, { roundId: round, applicationId: app.id, value: "good" })
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(VoteError);
    expect((err as VoteError).code).toBe("not_eligible");
  });
});

// Case name lists, declared after the `it` blocks above for readability but referenced (via
// function hoisting semantics of the surrounding describe callbacks, which only run when Vitest
// collects the file, by which point this module-level const is already initialized) by the set-
// coverage tests above. Kept as the single source of truth for "which functions does this file
// exercise" so the set-equality checks can never silently drift from the actual test bodies.
const CASTING_CASE_NAMES = [
  "createRoom",
  "renameRoom",
  "transitionRoomStatus",
  "removeRoom",
  "createRound",
  "openRound",
  "createAndOpenRound",
  "addResidentToRound",
  "captureApplication",
  "transitionApplication",
  "updateApplication",
  "updateHouseholdSettings",
];

const DELIBERATION_CASE_NAMES = ["castVote"];

const IDENTITY_CASE_NAMES = [
  "createResidentProfile",
  "transitionResidentProfileStatus",
  "removeMember",
  "removePreparedProfile",
  "setMovedOut",
  "reactivateMember",
  "issueJoinCode",
  "extendJoinCode",
  "deleteJoinCode",
  "setMemberRole",
  "triggerSubjectAccessExport",
  "revokeSession",
  "issuePasswordResetLink",
];
