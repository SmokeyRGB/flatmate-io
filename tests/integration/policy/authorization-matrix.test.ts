import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { claimResidentProfile, registerHousehold, signIn } from "@/modules/identity/auth";
import * as castingRepo from "@/modules/casting/repository";
import * as identityRepo from "@/modules/identity/repository";
import { PermissionDeniedError, ResidentListActionDeniedError } from "@/modules/identity/repository";
import type { SessionContext } from "@/db/session-context";
import {
  cleanupAll,
  cleanupHousehold,
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

// The KNOWN_OPEN exception (below) expires the moment a route reaches it — a plain textual grep
// over src/app, not a claim to track every possible call path.
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
  hasProcedureChangedNotice: "read-only",
};

const KNOWN_OPEN_CASTING: Record<string, string> = {
  transitionApplication:
    "No authorization rule exists yet: who may move an Application is F3's decision. Recorded in " +
    "docs/review-log.md, Implementierungspflichten ('F3: transitionApplication'). Must be guarded " +
    "before any route calls it.",
};

const NOT_APPLICABLE_IDENTITY: Record<string, string> = {
  isDisplayNameTaken: "read-only",
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
  assertAccountCanVote: "assertion helper, not itself a mutation",
  assertHasPermission: "assertion helper — the permission primitive other functions build on",
  getMembershipForAccount: "read-only",
  getIdentityLabel: "read-only",
  getHousehold: "read-only",
  getHouseholdSettings: "read-only",
  resolveSessionContext: "pre-session bootstrap — reconstructs a SessionContext from a cookie's session id, before any session exists",
  getResidentList: "read-only (already enforces its own admin/moderator gate inline)",
  assertIsAdministration: "assertion helper",
  getCurrentHouseholdMembers: "read-only",
  generateJoinCode: "pure helper — no SessionContext, no DB access",
  buildJoinUrl: "pure helper — no SessionContext, no DB access",
  normalizeJoinCode: "pure helper — no SessionContext, no DB access",
  issueJoinCodeTx:
    "Tx primitive with an explicit documented no-auth contract (own comment: 'THIS FUNCTION " +
    "PERFORMS NO AUTHORIZATION' — the one legitimate caller, registerHousehold, mints the " +
    "founding link before any Membership row exists to authorize against).",
  listJoinCodeIssuances: "read-only (already enforces its own admin/moderator gate inline)",
  assertHasResidentProfile: "pure sync assertion helper — no DB access",
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

describe("authorization matrix (M6): every exported casting/identity mutator decides its authorization", () => {
  describe("set coverage — every export is classified exactly once", () => {
    it("casting/repository.ts: NOT_APPLICABLE + KNOWN_OPEN + cases below == every exported function", () => {
      const all = new Set(exportedFunctionNames(castingRepo as unknown as Record<string, unknown>));
      const classified = new Set([
        ...Object.keys(NOT_APPLICABLE_CASTING),
        ...Object.keys(KNOWN_OPEN_CASTING),
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

    it("KNOWN_OPEN's one entry (transitionApplication) has no route caller yet", () => {
      for (const name of Object.keys(KNOWN_OPEN_CASTING)) {
        expect(srcAppReferencesName(name), `${name} is now called from src/app — it must be guarded, not left KNOWN_OPEN`).toBe(false);
      }
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

    beforeAll(async () => {
      hh = await registerSharedHousehold();
      adminActor = { accountId: hh.accountId, profileId: null };
      resident = await claim(hh, "Resident1", []);
      residentActor = { accountId: resident.accountId, profileId: resident.profileId };
      residentCtx = residentContext(hh, resident);
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
      const round = await castingRepo.createRound(hh.context, "Round", [room.id], adminActor);
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
      const round = await castingRepo.createRound(hh.context, "Round", [room.id], adminActor);
      await expect(
        castingRepo.addResidentToRound(residentCtx, round.id, resident.profileId, residentActor),
      ).rejects.toThrow(PermissionDeniedError);
    });

    it("updateHouseholdSettingsWithProcedureLock", async () => {
      await expect(
        castingRepo.updateHouseholdSettingsWithProcedureLock(residentCtx, { quorumShare: "0.6" }, residentActor),
      ).rejects.toThrow(PermissionDeniedError);
    });

    it("forceChangeSettingWhileRoundOpen", async () => {
      // openRoundTx (via createAndOpenRound) refuses to open with zero eligible residents
      // (EC-1.3) — the shared resident (claimed in beforeAll) already satisfies that.
      const room = await castingRepo.createRoom(hh.context, "Room A", adminActor);
      const round = await castingRepo.createAndOpenRound(hh.context, "Round", [room.id], adminActor);
      await expect(
        castingRepo.forceChangeSettingWhileRoundOpen(residentCtx, "quorumShare", "0.6", round.id, residentActor),
      ).rejects.toThrow(PermissionDeniedError);
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

    it("createResidentProfile", async () => {
      await expect(
        identityRepo.createResidentProfile(residentCtx, "Nobody", residentActor),
      ).rejects.toThrow(ResidentListActionDeniedError);
    });

    it("createResidentProfile refuses a resident's own session spoofed with the admin's accountId", async () => {
      const spoofedActor = { accountId: hh.accountId, profileId: null };
      await expect(
        identityRepo.createResidentProfile(residentCtx, "Nobody", spoofedActor),
      ).rejects.toThrow(ResidentListActionDeniedError);
    });

    it("transitionResidentProfileStatus", async () => {
      const adminActor = { accountId: hh.accountId, profileId: null };
      const target = await identityRepo.createResidentProfile(hh.context, "Target", adminActor);
      await expect(
        identityRepo.transitionResidentProfileStatus(residentCtx, target.id, "moved_out", residentActor),
      ).rejects.toThrow(ResidentListActionDeniedError);
    });

    it("removeMember", async () => {
      const target = await claim(hh, "Resident2", extraAccountIds);
      await expect(
        identityRepo.removeMember(residentCtx, resident.accountId, target.accountId, target.displayName),
      ).rejects.toThrow(ResidentListActionDeniedError);
    });

    it("setMovedOut", async () => {
      const target = await claim(hh, "Resident3", extraAccountIds);
      await expect(
        identityRepo.setMovedOut(residentCtx, resident.accountId, target.accountId),
      ).rejects.toThrow(ResidentListActionDeniedError);
    });

    it("reactivateMember", async () => {
      const target = await claim(hh, "Resident4", extraAccountIds);
      await expect(
        identityRepo.reactivateMember(residentCtx, resident.accountId, target.accountId),
      ).rejects.toThrow(ResidentListActionDeniedError);
    });

    it("issueJoinCode", async () => {
      await expect(
        identityRepo.issueJoinCode(residentCtx, resident.accountId, { validDays: 7, maxUses: 1 }),
      ).rejects.toThrow(ResidentListActionDeniedError);
    });

    it("extendJoinCode", async () => {
      const issuance = await identityRepo.issueJoinCode(hh.context, hh.accountId, { validDays: 7, maxUses: 1 });
      await expect(
        identityRepo.extendJoinCode(residentCtx, resident.accountId, issuance.id),
      ).rejects.toThrow(ResidentListActionDeniedError);
    });

    it("deleteJoinCode", async () => {
      const issuance = await identityRepo.issueJoinCode(hh.context, hh.accountId, { validDays: 7, maxUses: 1 });
      await expect(
        identityRepo.deleteJoinCode(residentCtx, resident.accountId, issuance.id),
      ).rejects.toThrow(ResidentListActionDeniedError);
    });

    it("setMemberRole", async () => {
      const target = await claim(hh, "Resident5", extraAccountIds);
      await expect(
        identityRepo.setMemberRole(residentCtx, resident.accountId, target.accountId, "moderator"),
      ).rejects.toThrow(ResidentListActionDeniedError);
    });

    it("setMemberRole refuses a resident's own session spoofed with the admin's accountId", async () => {
      const target = await claim(hh, "Resident6", extraAccountIds);
      await expect(
        identityRepo.setMemberRole(residentCtx, hh.accountId, target.accountId, "moderator"),
      ).rejects.toThrow(ResidentListActionDeniedError);
    });

    it("triggerSubjectAccessExport", async () => {
      await expect(
        identityRepo.triggerSubjectAccessExport(residentCtx, resident.accountId, "some-application-id"),
      ).rejects.toThrow(ResidentListActionDeniedError);
    });

    it("revokeSession", async () => {
      const adminSignIn = await signIn({ kind: "household", email: hh.email, password: "test-password-not-real-1234" });
      await expect(
        identityRepo.revokeSession(residentCtx, adminSignIn.session.id),
      ).rejects.toThrow(PermissionDeniedError);
    });
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
  "updateHouseholdSettingsWithProcedureLock",
  "forceChangeSettingWhileRoundOpen",
];

const IDENTITY_CASE_NAMES = [
  "createResidentProfile",
  "transitionResidentProfileStatus",
  "removeMember",
  "setMovedOut",
  "reactivateMember",
  "issueJoinCode",
  "extendJoinCode",
  "deleteJoinCode",
  "setMemberRole",
  "triggerSubjectAccessExport",
  "revokeSession",
];
