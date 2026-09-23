import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { claimResidentProfile, signIn } from "@/modules/identity/auth";
import * as castingRepo from "@/modules/casting/repository";
import * as identityRepo from "@/modules/identity/repository";
import { PermissionDeniedError, ResidentListActionDeniedError } from "@/modules/identity/repository";
import {
  cleanupAll,
  deleteTestAccount,
  registerTestHousehold,
  type TestHousehold,
} from "../../helpers/identity";

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

  describe("casting/repository.ts mutators refuse a plain resident", () => {
    let hh: TestHousehold | undefined;
    const accountIds: string[] = [];

    afterEach(async () => {
      await cleanupAll(...accountIds.map(deleteTestAccount), hh?.cleanup());
      accountIds.length = 0;
      hh = undefined;
    });

    it("createRoom", async () => {
      hh = await registerTestHousehold();
      const resident = await claim(hh, "Resident1", accountIds);
      const residentActor = { accountId: resident.accountId, profileId: resident.profileId };
      await expect(castingRepo.createRoom(hh.context, "Room B", residentActor)).rejects.toThrow(
        PermissionDeniedError,
      );
    });

    it("renameRoom", async () => {
      hh = await registerTestHousehold();
      const adminActor = { accountId: hh.accountId, profileId: null };
      const room = await castingRepo.createRoom(hh.context, "Room A", adminActor);
      const resident = await claim(hh, "Resident1", accountIds);
      const residentActor = { accountId: resident.accountId, profileId: resident.profileId };
      await expect(
        castingRepo.renameRoom(hh.context, room.id, "Renamed", residentActor),
      ).rejects.toThrow(PermissionDeniedError);
    });

    it("transitionRoomStatus", async () => {
      hh = await registerTestHousehold();
      const adminActor = { accountId: hh.accountId, profileId: null };
      const room = await castingRepo.createRoom(hh.context, "Room A", adminActor);
      const resident = await claim(hh, "Resident1", accountIds);
      const residentActor = { accountId: resident.accountId, profileId: resident.profileId };
      await expect(
        castingRepo.transitionRoomStatus(hh.context, room.id, "open", residentActor),
      ).rejects.toThrow(PermissionDeniedError);
    });

    it("removeRoom", async () => {
      hh = await registerTestHousehold();
      const adminActor = { accountId: hh.accountId, profileId: null };
      const room = await castingRepo.createRoom(hh.context, "Room A", adminActor);
      const resident = await claim(hh, "Resident1", accountIds);
      const residentActor = { accountId: resident.accountId, profileId: resident.profileId };
      await expect(castingRepo.removeRoom(hh.context, room.id, residentActor)).rejects.toThrow(
        PermissionDeniedError,
      );
    });

    it("createRound", async () => {
      hh = await registerTestHousehold();
      const adminActor = { accountId: hh.accountId, profileId: null };
      const room = await castingRepo.createRoom(hh.context, "Room A", adminActor);
      const resident = await claim(hh, "Resident1", accountIds);
      const residentActor = { accountId: resident.accountId, profileId: resident.profileId };
      await expect(
        castingRepo.createRound(hh.context, "Round", [room.id], residentActor),
      ).rejects.toThrow(PermissionDeniedError);
    });

    it("openRound", async () => {
      hh = await registerTestHousehold();
      const adminActor = { accountId: hh.accountId, profileId: null };
      const room = await castingRepo.createRoom(hh.context, "Room A", adminActor);
      const round = await castingRepo.createRound(hh.context, "Round", [room.id], adminActor);
      const resident = await claim(hh, "Resident1", accountIds);
      const residentActor = { accountId: resident.accountId, profileId: resident.profileId };
      await expect(castingRepo.openRound(hh.context, round.id, residentActor)).rejects.toThrow(
        PermissionDeniedError,
      );
    });

    it("createAndOpenRound", async () => {
      hh = await registerTestHousehold();
      const adminActor = { accountId: hh.accountId, profileId: null };
      const room = await castingRepo.createRoom(hh.context, "Room A", adminActor);
      const resident = await claim(hh, "Resident1", accountIds);
      const residentActor = { accountId: resident.accountId, profileId: resident.profileId };
      await expect(
        castingRepo.createAndOpenRound(hh.context, "Round", [room.id], residentActor),
      ).rejects.toThrow(PermissionDeniedError);
    });

    it("addResidentToRound", async () => {
      hh = await registerTestHousehold();
      const adminActor = { accountId: hh.accountId, profileId: null };
      const room = await castingRepo.createRoom(hh.context, "Room A", adminActor);
      const round = await castingRepo.createRound(hh.context, "Round", [room.id], adminActor);
      const resident = await claim(hh, "Resident1", accountIds);
      const residentActor = { accountId: resident.accountId, profileId: resident.profileId };
      await expect(
        castingRepo.addResidentToRound(hh.context, round.id, resident.profileId, residentActor),
      ).rejects.toThrow(PermissionDeniedError);
    });

    it("updateHouseholdSettingsWithProcedureLock", async () => {
      hh = await registerTestHousehold();
      const resident = await claim(hh, "Resident1", accountIds);
      const residentActor = { accountId: resident.accountId, profileId: resident.profileId };
      await expect(
        castingRepo.updateHouseholdSettingsWithProcedureLock(hh.context, { quorumShare: "0.6" }, residentActor),
      ).rejects.toThrow(PermissionDeniedError);
    });

    it("forceChangeSettingWhileRoundOpen", async () => {
      hh = await registerTestHousehold();
      const adminActor = { accountId: hh.accountId, profileId: null };
      // openRoundTx (via createAndOpenRound) refuses to open with zero eligible residents
      // (EC-1.3) — the resident must be claimed BEFORE the round is opened.
      const resident = await claim(hh, "Resident1", accountIds);
      const residentActor = { accountId: resident.accountId, profileId: resident.profileId };
      const room = await castingRepo.createRoom(hh.context, "Room A", adminActor);
      const round = await castingRepo.createAndOpenRound(hh.context, "Round", [room.id], adminActor);
      await expect(
        castingRepo.forceChangeSettingWhileRoundOpen(hh.context, "quorumShare", "0.6", round.id, residentActor),
      ).rejects.toThrow(PermissionDeniedError);
    });
  });

  describe("identity/repository.ts mutators refuse a plain resident", () => {
    let hh: TestHousehold | undefined;
    const accountIds: string[] = [];

    afterEach(async () => {
      await cleanupAll(...accountIds.map(deleteTestAccount), hh?.cleanup());
      accountIds.length = 0;
      hh = undefined;
    });

    it("createResidentProfile", async () => {
      hh = await registerTestHousehold();
      const resident = await claim(hh, "Resident1", accountIds);
      const residentActor = { accountId: resident.accountId, profileId: resident.profileId };
      await expect(
        identityRepo.createResidentProfile(hh.context, "Nobody", residentActor),
      ).rejects.toThrow(ResidentListActionDeniedError);
    });

    it("transitionResidentProfileStatus", async () => {
      hh = await registerTestHousehold();
      const adminActor = { accountId: hh.accountId, profileId: null };
      const target = await identityRepo.createResidentProfile(hh.context, "Target", adminActor);
      const resident = await claim(hh, "Resident1", accountIds);
      const residentActor = { accountId: resident.accountId, profileId: resident.profileId };
      await expect(
        identityRepo.transitionResidentProfileStatus(hh.context, target.id, "moved_out", residentActor),
      ).rejects.toThrow(ResidentListActionDeniedError);
    });

    it("removeMember", async () => {
      hh = await registerTestHousehold();
      const resident = await claim(hh, "Resident1", accountIds);
      const target = await claim(hh, "Resident2", accountIds);
      await expect(
        identityRepo.removeMember(hh.context, resident.accountId, target.accountId, target.displayName),
      ).rejects.toThrow(ResidentListActionDeniedError);
    });

    it("setMovedOut", async () => {
      hh = await registerTestHousehold();
      const resident = await claim(hh, "Resident1", accountIds);
      const target = await claim(hh, "Resident2", accountIds);
      await expect(
        identityRepo.setMovedOut(hh.context, resident.accountId, target.accountId),
      ).rejects.toThrow(ResidentListActionDeniedError);
    });

    it("reactivateMember", async () => {
      hh = await registerTestHousehold();
      const resident = await claim(hh, "Resident1", accountIds);
      const target = await claim(hh, "Resident2", accountIds);
      await expect(
        identityRepo.reactivateMember(hh.context, resident.accountId, target.accountId),
      ).rejects.toThrow(ResidentListActionDeniedError);
    });

    it("issueJoinCode", async () => {
      hh = await registerTestHousehold();
      const resident = await claim(hh, "Resident1", accountIds);
      await expect(
        identityRepo.issueJoinCode(hh.context, resident.accountId, { validDays: 7, maxUses: 1 }),
      ).rejects.toThrow(ResidentListActionDeniedError);
    });

    it("extendJoinCode", async () => {
      hh = await registerTestHousehold();
      const issuance = await identityRepo.issueJoinCode(hh.context, hh.accountId, { validDays: 7, maxUses: 1 });
      const resident = await claim(hh, "Resident1", accountIds);
      await expect(
        identityRepo.extendJoinCode(hh.context, resident.accountId, issuance.id),
      ).rejects.toThrow(ResidentListActionDeniedError);
    });

    it("deleteJoinCode", async () => {
      hh = await registerTestHousehold();
      const issuance = await identityRepo.issueJoinCode(hh.context, hh.accountId, { validDays: 7, maxUses: 1 });
      const resident = await claim(hh, "Resident1", accountIds);
      await expect(
        identityRepo.deleteJoinCode(hh.context, resident.accountId, issuance.id),
      ).rejects.toThrow(ResidentListActionDeniedError);
    });

    it("setMemberRole", async () => {
      hh = await registerTestHousehold();
      const resident = await claim(hh, "Resident1", accountIds);
      const target = await claim(hh, "Resident2", accountIds);
      await expect(
        identityRepo.setMemberRole(hh.context, resident.accountId, target.accountId, "moderator"),
      ).rejects.toThrow(ResidentListActionDeniedError);
    });

    it("triggerSubjectAccessExport", async () => {
      hh = await registerTestHousehold();
      const resident = await claim(hh, "Resident1", accountIds);
      await expect(
        identityRepo.triggerSubjectAccessExport(hh.context, resident.accountId, "some-application-id"),
      ).rejects.toThrow(ResidentListActionDeniedError);
    });

    it("revokeSession", async () => {
      hh = await registerTestHousehold();
      const adminSignIn = await signIn({ kind: "household", email: hh.email, password: "test-password-not-real-1234" });
      const resident = await claim(hh, "Resident1", accountIds);
      const residentContext = { accountId: resident.accountId, householdId: hh.householdId, profileId: resident.profileId };
      await expect(identityRepo.revokeSession(residentContext, adminSignIn.session.id)).rejects.toThrow(
        PermissionDeniedError,
      );
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
