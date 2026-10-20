import { eq } from "drizzle-orm";
import { afterEach, describe, expect, it } from "vitest";
import { withSessionContext } from "@/db/session-context";
import { applicationBaseline } from "@/modules/casting/application-changes";
import {
  ApplicationDeletionError,
  ApplicationTransitionError,
  ApplicationUpdateError,
  captureApplication,
  deleteApplication,
  ProfileRequiredError,
  transitionApplication,
  updateApplication,
} from "@/modules/casting/repository";
import { castingRound } from "@/modules/casting/schema";
import { castVote, VoteError } from "@/modules/deliberation/repository";
import { PermissionDeniedError } from "@/modules/identity/repository";
import { insertTestRound } from "../../helpers/applications";
import { cleanupAll, deleteTestAccount, type TestHousehold } from "../../helpers/identity";
import {
  claimPlainMember,
  eventsOf,
  holdTransaction,
  insertApplicationAt,
  readApplication,
  settlesWithin,
  setupPipeline,
  type PipelineSetup,
} from "../../helpers/pipeline";
import { rawVoteInsertSql, readVotes } from "../../helpers/votes";

// F3 `application-deletion` (change 4), FR-3.17-FR-3.20, AC-3.15-AC-3.18, G-D4, G-E5, design D3.
// Real households, a real moderator, claimed plain residents. Every refusal asserts the error CLASS
// and CODE and that nothing changed (CLAUDE.md, "Tests that can fail"). Teardown in afterEach.
//
// Not tested here, on purpose:
//   - Raw SQL as app_runtime. This change adds no policy, so no new raw-SQL file is written. The
//     household account's raw DELETE of an application (zero rows, 0018's RESTRICTIVE policy) is in
//     raw-sql/application-visibility-household-account.test.ts, and a raw UPDATE of a live event in
//     unit/audit/immutability.test.ts.
//   - Atomicity. Everything runs in ONE withSessionContext, so any failure rolls every step back.
//     Adding a failure seam to production code only for a test is not wanted (design D3).
const households: TestHousehold[] = [];
const accountIds: string[] = [];

afterEach(async () => {
  await cleanupAll(...accountIds.map(deleteTestAccount), ...households.map((h) => h.cleanup()));
  accountIds.length = 0;
  households.length = 0;
});

async function errorOf(promise: Promise<unknown>): Promise<unknown> {
  try {
    await promise;
  } catch (err) {
    return err;
  }
  return undefined;
}

async function expectNotFound(promise: Promise<unknown>) {
  const err = await errorOf(promise);
  expect(err).toBeInstanceOf(ApplicationDeletionError);
  expect((err as ApplicationDeletionError).code).toBe("not_found");
}

async function readRound(s: PipelineSetup, roundId: string) {
  const [row] = await withSessionContext(s.moderator.context, (tx) =>
    tx.select().from(castingRound).where(eq(castingRound.id, roundId)),
  );
  return row;
}

describe("deleteApplication: a real deletion that takes nothing else along (AC-3.15)", () => {
  it("deletes one of three applications and leaves the other two and the round unchanged in every column", async () => {
    const s = await setupPipeline(households);
    const first = await insertApplicationAt(s, "new");
    const doomed = await insertApplicationAt(s, "screened");
    const third = await insertApplicationAt(s, "invited");
    const roundBefore = await readRound(s, s.roundId);

    await deleteApplication(s.moderator.context, { roundId: s.roundId, applicationId: doomed.id });

    expect(await readApplication(s, doomed.id)).toBeUndefined();
    expect(await readApplication(s, first.id)).toEqual(first);
    expect(await readApplication(s, third.id)).toEqual(third);
    expect(await readRound(s, s.roundId)).toEqual(roundBefore);
    // Deliberate break: delete by round_id instead of id and the other two vanish.
  });

  it("deletes an application in any state and of a round in any status (A1)", async () => {
    const s = await setupPipeline(households);
    const invited = await insertApplicationAt(s, "invited");
    await deleteApplication(s.moderator.context, { roundId: s.roundId, applicationId: invited.id });
    expect(await readApplication(s, invited.id)).toBeUndefined();

    for (const status of ["paused", "closed", "archived"] as const) {
      const roundId = await withSessionContext(s.moderator.context, (tx) =>
        insertTestRound(tx, s.hh.householdId, status),
      );
      const moved = await insertApplicationAt(s, "withdrawn", {}, roundId);
      await deleteApplication(s.moderator.context, { roundId, applicationId: moved.id });
      expect(await readApplication(s, moved.id), status).toBeUndefined();
    }
  });
});

describe("deleteApplication: the votes go with it (AC-3.16)", () => {
  it("removes every vote on the application, as each voter sees it, and leaves the votes on another one", async () => {
    const s = await setupPipeline(households);
    const voters = [];
    for (const name of ["V1", "V2", "V3", "V4"]) voters.push(await claimPlainMember(s.hh, name, accountIds));
    const a = await insertApplicationAt(s, "new");
    const b = await insertApplicationAt(s, "new");
    const values = ["good", "rather_not", "definitely", "no"] as const;
    for (const [i, v] of voters.entries()) {
      await castVote(v.context, { roundId: s.roundId, applicationId: a.id, value: values[i] });
    }
    for (const v of voters.slice(0, 2)) {
      await castVote(v.context, { roundId: s.roundId, applicationId: b.id, value: "good" });
    }
    const bBefore = await Promise.all(voters.map((v) => readVotes(v.context, b.id)));
    for (const v of voters) expect(await readVotes(v.context, a.id)).toHaveLength(4);
    expect(bBefore.map((rows) => rows.length)).toEqual([2, 2, 2, 2]);

    await deleteApplication(s.moderator.context, { roundId: s.roundId, applicationId: a.id });

    // Under each voter's OWN session: a future SELECT policy that hid other residents' votes would
    // make the delete skip them silently, and only this read per voter notices (design Risks).
    for (const [i, v] of voters.entries()) {
      expect(await readVotes(v.context, a.id), `voter ${i}`).toEqual([]);
      expect(await readVotes(v.context, b.id), `voter ${i}`).toEqual(bBefore[i]);
    }
    // Deliberate break: empty the APPLICATION_DEPENDENT_TABLES loop and four votes remain.
  }, 60_000);
});

describe("deleteApplication: the audit trail (AC-3.18, FR-3.20)", () => {
  it("records one empty tombstone, nulls the creation entry's personal keys and leaves every other entry alone", async () => {
    const s = await setupPipeline(households);
    const ctx = s.moderator.context;
    const { id } = await captureApplication(ctx, {
      roundId: s.roundId,
      applicantName: "Testbewerbung Löschung",
      collectedFrom: "third_party",
    });
    const other = await captureApplication(ctx, {
      roundId: s.roundId,
      applicantName: "Testbewerbung Nachbar",
      collectedFrom: "data_subject",
    });
    const row = (await readApplication(s, id))!;
    const contacts = [row.contactEmail, row.contactPhone, row.contactOther].filter((c): c is string => c !== null);
    await updateApplication(ctx, {
      roundId: s.roundId,
      applicationId: id,
      baseline: applicationBaseline(row),
      applicantName: "Testbewerbung Löschung 2",
      age: "",
      contacts,
      messageRaw: "",
      attributes: [],
      collectedFrom: "third_party",
    });
    await transitionApplication(ctx, id, "screened");

    const before = await eventsOf(s, id);
    const otherBefore = await eventsOf(s, other.id);
    const byType = (rows: typeof before, type: string) => rows.filter((e) => e.eventType === type);
    expect(byType(before, "application.created")[0].payload).toEqual({
      source: "manual_form",
      collectedFrom: "third_party",
    });
    expect(before.map((e) => e.eventType).sort()).toEqual([
      "application.created",
      "application.state_changed",
      "application.updated",
    ]);

    await deleteApplication(ctx, { roundId: s.roundId, applicationId: id });

    const after = await eventsOf(s, id);
    const tombstones = byType(after, "application.deleted");
    expect(tombstones).toHaveLength(1);
    expect(tombstones[0]).toMatchObject({
      payload: {},
      subjectType: "application",
      subjectId: id,
      actorAccountId: s.moderator.accountId,
      actorProfileId: s.moderator.profileId,
      roundId: null,
    });
    // The creation entry keeps its structure, time and actor; only the two personal keys are null.
    const createdBefore = byType(before, "application.created")[0];
    const createdAfter = byType(after, "application.created")[0];
    expect(createdAfter.payload).toEqual({ source: null, collectedFrom: null });
    expect(createdAfter).toEqual({ ...createdBefore, payload: { source: null, collectedFrom: null } });
    // Field names and state names are not personal data: byte-identical.
    for (const type of ["application.updated", "application.state_changed"]) {
      expect(byType(after, type), type).toEqual(byType(before, type));
    }
    expect(after).toHaveLength(before.length + 1);
    // Another application's entries are untouched.
    expect(await eventsOf(s, other.id)).toEqual(otherBefore);
    // Deliberate breaks: skip the redaction call and the creation entry keeps its keys; put
    // applicantName in the tombstone payload and recordActivityEvent throws PayloadValidationError.
  }, 60_000);
});

describe("deleteApplication: refusals", () => {
  it("not_found for a second delete, the wrong round, an unknown id, a malformed id, a missing input and another household's application", async () => {
    const s = await setupPipeline(households);
    const other = await setupPipeline(households);
    const keep = await insertApplicationAt(s, "new");
    const gone = await insertApplicationAt(s, "new");
    const otherRound = await withSessionContext(s.moderator.context, (tx) => insertTestRound(tx, s.hh.householdId));
    const foreign = await insertApplicationAt(other, "new");
    await deleteApplication(s.moderator.context, { roundId: s.roundId, applicationId: gone.id });

    const ctx = s.moderator.context;
    await expectNotFound(deleteApplication(ctx, { roundId: s.roundId, applicationId: gone.id })); // second delete
    await expectNotFound(deleteApplication(ctx, { roundId: otherRound, applicationId: keep.id })); // wrong round
    await expectNotFound(
      deleteApplication(ctx, { roundId: s.roundId, applicationId: "5f3c2a10-8f6e-4d2b-9a41-2c7e3b9d1f00" }),
    ); // unknown id
    await expectNotFound(deleteApplication(ctx, { roundId: s.roundId, applicationId: "not-a-uuid" }));
    await expectNotFound(deleteApplication(ctx, { roundId: "not-a-uuid", applicationId: keep.id }));
    await expectNotFound(deleteApplication(ctx, undefined as unknown as { roundId: string; applicationId: string }));
    await expectNotFound(deleteApplication(ctx, { roundId: s.roundId, applicationId: foreign.id })); // other household
    await expectNotFound(deleteApplication(ctx, { roundId: other.roundId, applicationId: foreign.id }));

    expect(await readApplication(s, keep.id)).toEqual(keep);
    expect(await readApplication(other, foreign.id)).toEqual(foreign);
  }, 60_000);

  it("after a delete, a transition, a correction and a vote on it are refused as not found", async () => {
    const s = await setupPipeline(households);
    const voter = await claimPlainMember(s.hh, "Voter", accountIds);
    const { id } = await captureApplication(s.moderator.context, {
      roundId: s.roundId,
      applicantName: "Testbewerbung Danach",
      collectedFrom: "data_subject",
    });
    const row = (await readApplication(s, id))!;
    await deleteApplication(s.moderator.context, { roundId: s.roundId, applicationId: id });

    const transition = await errorOf(transitionApplication(s.moderator.context, id, "screened"));
    expect(transition).toBeInstanceOf(ApplicationTransitionError);
    expect((transition as ApplicationTransitionError).code).toBe("not_found");

    const update = await errorOf(
      updateApplication(s.moderator.context, {
        roundId: s.roundId,
        applicationId: id,
        baseline: applicationBaseline(row),
        applicantName: "Neu",
        collectedFrom: "data_subject",
      }),
    );
    expect(update).toBeInstanceOf(ApplicationUpdateError);
    expect((update as ApplicationUpdateError).code).toBe("not_found");

    const vote = await errorOf(castVote(voter.context, { roundId: s.roundId, applicationId: id, value: "good" }));
    expect(vote).toBeInstanceOf(VoteError);
    expect((vote as VoteError).code).toBe("not_found");
    expect(await readVotes(voter.context, id)).toEqual([]);
    expect(await readApplication(s, id)).toBeUndefined();
  }, 60_000);

  it("the household account is refused with ProfileRequiredError and a plain resident with PermissionDeniedError; the row stays", async () => {
    const s = await setupPipeline(households);
    const resident = await claimPlainMember(s.hh, "Plain", accountIds);
    const row = await insertApplicationAt(s, "new");
    const input = { roundId: s.roundId, applicationId: row.id };

    expect(await errorOf(deleteApplication(s.hh.context, input))).toBeInstanceOf(ProfileRequiredError);
    expect(await readApplication(s, row.id)).toEqual(row);

    const denied = await errorOf(deleteApplication(resident.context, input));
    expect(denied).toBeInstanceOf(PermissionDeniedError);
    expect((denied as PermissionDeniedError).message).toContain("delete_application");
    expect(await readApplication(s, row.id)).toEqual(row);
    expect(await eventsOf(s, row.id, "application.deleted")).toHaveLength(0);
  }, 60_000);
});

// Concurrency (drizzle/0028's obligation: lock the application FOR UPDATE first, then its votes).
// A real second writer holds an open transaction while the deletion is started.
describe("deleteApplication: concurrency", () => {
  // REGRESSION TEST (design pre-mortem 1). A voter's uncommitted vote insert holds the application
  // FOR SHARE (through vote_guard). The deletion must wait for it at the row lock, and afterwards no
  // vote on the application may remain. Without the FOR UPDATE the votes DELETE would not see the
  // uncommitted vote, the later UPDATE would wait, and the vote would commit as an orphan.
  // Break: remove `.for("update")` from withLockedApplication and an orphaned vote remains.
  it("waits for a vote in flight and leaves no vote behind", async () => {
    const s = await setupPipeline(households);
    const voter = await claimPlainMember(s.hh, "Voter", accountIds);
    const app = await insertApplicationAt(s, "new");

    const held = holdTransaction(voter.context, async (tx) => {
      await tx.execute(
        rawVoteInsertSql({
          householdId: s.hh.householdId,
          roundId: s.roundId,
          applicationId: app.id,
          residentProfileId: voter.profileId,
        }),
      );
    });
    await held.started;

    const deletion = deleteApplication(s.moderator.context, { roundId: s.roundId, applicationId: app.id }).then(
      () => null as null | unknown,
      (e: unknown) => e,
    );
    const settledWhileHeld = await settlesWithin(deletion, 2000);
    // Release first and assert after, so a failed assertion cannot leave the uncommitted lock
    // blocking afterEach cleanup.
    held.release();
    await held.done;
    const outcome = await deletion;

    expect(settledWhileHeld).toBe(false);
    expect(outcome).toBeNull();
    expect(await readApplication(s, app.id)).toBeUndefined();
    expect(await readVotes(voter.context, app.id)).toEqual([]);
  }, 30_000);

  // INVARIANT GUARD, not a regression test: the DELETE of the application row would wait on a held
  // FOR UPDATE by itself, so removing the explicit lock cannot make this fail. It pins that a state
  // change in flight is waited for and the application is then deleted as it was left.
  it("waits for a state change in flight, then deletes the application", async () => {
    const s = await setupPipeline(households);
    const app = await insertApplicationAt(s, "new");

    const held = holdTransaction(s.moderator.context, async (tx) => {
      await tx.execute(`SELECT id FROM application WHERE id = '${app.id}'::uuid FOR UPDATE`);
      await tx.execute(`UPDATE application SET state = 'screened' WHERE id = '${app.id}'::uuid`);
    });
    await held.started;

    const deletion = deleteApplication(s.moderator.context, { roundId: s.roundId, applicationId: app.id }).then(
      () => null as null | unknown,
      (e: unknown) => e,
    );
    const settledWhileHeld = await settlesWithin(deletion, 2000);
    held.release();
    await held.done;
    const outcome = await deletion;

    expect(settledWhileHeld).toBe(false);
    expect(outcome).toBeNull();
    expect(await readApplication(s, app.id)).toBeUndefined();
    expect(await eventsOf(s, app.id, "application.deleted")).toHaveLength(1);
  }, 30_000);
});
