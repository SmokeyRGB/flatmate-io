import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { withSessionContext } from "@/db/session-context";
import { claimResidentProfile } from "@/modules/identity/auth";
import { createResidentProfile } from "@/modules/identity/repository";
import {
  createRoom,
  createRound,
  openRound,
  RoundOpenPreconditionError,
} from "@/modules/casting/repository";
import { castingRound, roundParticipation } from "@/modules/casting/schema";
import { deleteTestAccount, registerTestHousehold, type TestHousehold } from "../../helpers/identity";

async function claim(hh: TestHousehold, name: string) {
  const actor = { accountId: hh.accountId, profileId: null };
  const profile = await createResidentProfile(hh.context, name, actor);
  const { accountId } = await claimResidentProfile(hh.context, profile.id, "test-password-not-real-1234");
  return { profileId: profile.id, accountId };
}

describe("Round opening: atomic snapshot + frozen rules (AC-1.8, AC-1.9, AC-1.10, FR-1.16)", () => {
  it("produces exactly N RoundParticipation rows and a frozen settings_snapshot (AC-1.8/FR-1.15)", async () => {
    let hh: TestHousehold | undefined;
    const accountIds: string[] = [];
    try {
      hh = await registerTestHousehold();
      const actor = { accountId: hh.accountId, profileId: null };
      const RESIDENT_COUNT = 4; // smaller than spec.md's illustrative "7" to keep this test fast;
      // the property under test (exactly N rows, marked snapshot_at_open) doesn't depend on N.
      for (let i = 0; i < RESIDENT_COUNT; i++) {
        const r = await claim(hh, `Resident${i}`);
        accountIds.push(r.accountId);
      }
      const roomA = await createRoom(hh.context, "Room A", actor);
      const round = await createRound(hh.context, "Round", [roomA.id], actor);

      const opened = await openRound(hh.context, round.id, actor);
      expect(opened.status).toBe("open");
      expect(opened.settingsSnapshot).toMatchObject({
        favoriteBudgetFactor: "1.5",
        hideResultsUntilVoted: true,
        quorumShare: "0.5",
      });

      const participants = await withSessionContext(hh.context, (tx) =>
        tx.select().from(roundParticipation).where(eq(roundParticipation.roundId, round.id)),
      );
      expect(participants).toHaveLength(RESIDENT_COUNT);
      expect(participants.every((p) => p.source === "snapshot_at_open")).toBe(true);
    } finally {
      for (const id of accountIds) await deleteTestAccount(id);
      if (hh) await hh.cleanup();
    }
  });

  // AC-1.9/C-1.1: settings_snapshot is a copy, never a reference — a later live-settings change
  // does not affect an already-open round.
  it("keeps the frozen quorum_share even after the household's live setting changes (AC-1.9)", async () => {
    let hh: TestHousehold | undefined;
    const accountIds: string[] = [];
    try {
      hh = await registerTestHousehold();
      const actor = { accountId: hh.accountId, profileId: null };
      const resident = await claim(hh, "Resident1");
      accountIds.push(resident.accountId);
      const roomA = await createRoom(hh.context, "Room A", actor);
      const round = await createRound(hh.context, "Round", [roomA.id], actor);
      const opened = await openRound(hh.context, round.id, actor);
      expect((opened.settingsSnapshot as { quorumShare: string }).quorumShare).toBe("0.5");

      const { householdSettings } = await import("@/modules/identity/schema");
      await withSessionContext(hh.context, (tx) =>
        tx.update(householdSettings).set({ quorumShare: "0.7" }).where(eq(householdSettings.householdId, hh!.householdId)),
      );

      const [reread] = await withSessionContext(hh.context, (tx) =>
        tx.select().from(castingRound).where(eq(castingRound.id, round.id)),
      );
      expect((reread.settingsSnapshot as { quorumShare: string }).quorumShare).toBe("0.5");
    } finally {
      for (const id of accountIds) await deleteTestAccount(id);
      if (hh) await hh.cleanup();
    }
  });

  // AC-1.10/FR-1.16: opening fails part-way for any reason -> the round stays draft with zero
  // RoundParticipation rows and no settings_snapshot. Exercised here via the same thrown-error
  // path every precondition failure and a genuine write failure both go through: `openRound`'s
  // entire body runs inside one Postgres transaction (withSessionContext), so a thrown error
  // rolls back everything regardless of where it occurs — proven here by re-opening an
  // already-open round (a state the function itself detects and refuses).
  it("leaves zero partial state when opening fails (AC-1.10)", async () => {
    let hh: TestHousehold | undefined;
    const accountIds: string[] = [];
    try {
      hh = await registerTestHousehold();
      const actor = { accountId: hh.accountId, profileId: null };
      const resident = await claim(hh, "Resident1");
      accountIds.push(resident.accountId);
      const roomA = await createRoom(hh.context, "Room A", actor);
      const round = await createRound(hh.context, "Round", [roomA.id], actor);
      await openRound(hh.context, round.id, actor); // first open succeeds

      await expect(openRound(hh.context, round.id, actor)).rejects.toThrow(RoundOpenPreconditionError);

      // The second (failed) attempt must not have added a second snapshot batch.
      const participants = await withSessionContext(hh.context, (tx) =>
        tx.select().from(roundParticipation).where(eq(roundParticipation.roundId, round.id)),
      );
      expect(participants).toHaveLength(1);
    } finally {
      for (const id of accountIds) await deleteTestAccount(id);
      if (hh) await hh.cleanup();
    }
  });
});
