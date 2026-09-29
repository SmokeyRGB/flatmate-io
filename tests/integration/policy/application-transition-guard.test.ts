import { eq } from "drizzle-orm";
import { afterEach, describe, expect, it } from "vitest";
import { withSessionContext } from "@/db/session-context";
import {
  ApplicationTransitionError,
  ProfileRequiredError,
  transitionApplication,
} from "@/modules/casting/repository";
import { application } from "@/modules/casting/schema";
import { InvalidTransitionError } from "@/modules/casting/transitions";
import { PermissionDeniedError } from "@/modules/identity/repository";
import { cleanupAll, deleteTestAccount, type TestHousehold } from "../../helpers/identity";
import {
  claimPlainMember,
  eventsOf,
  grantPermissions,
  insertApplicationAt,
  readApplication,
  settlesWithin,
  setupPipeline,
  type PipelineSetup,
} from "../../helpers/pipeline";
import { uuid } from "../../helpers/uuid";

// F3 change 3 (application-pipeline), FR-3.24, AC-3.21, design D6/D6a/D7: transitionApplication
// checks its permissions in the repository, for every caller. Real households, a real moderator, a
// claimed plain resident. Every refusal asserts the error CLASS and CODE, and that state,
// state_changed_at and the event count are unchanged (CLAUDE.md, "Tests that can fail").
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

// Asserts that a refused call left the application row and its audit trail as they were.
async function expectUntouched(s: PipelineSetup, id: string, before: Awaited<ReturnType<typeof readApplication>>) {
  const after = await readApplication(s, id);
  expect(after.state).toBe(before.state);
  expect(after.stateChangedAt).toEqual(before.stateChangedAt);
  expect(after.becameResidentId).toBe(before.becameResidentId);
  expect(await eventsOf(s, id)).toHaveLength(0);
}

describe("transitionApplication: who may change a state (FR-3.24, AC-3.21)", () => {
  it("(a) a plain resident is refused going forward, and nothing changes", async () => {
    const s = await setupPipeline(households);
    const member = await claimPlainMember(s.hh, "PlainMember", accountIds);
    const row = await insertApplicationAt(s, "new");

    const err = await errorOf(transitionApplication(member.context, row.id, "screened"));
    expect(err).toBeInstanceOf(PermissionDeniedError);
    await expectUntouched(s, row.id, row);
  });

  it("(b) a resident granted only change_application_state moves an application forward", async () => {
    const s = await setupPipeline(households);
    const member = await claimPlainMember(s.hh, "GrantedMember", accountIds);
    await grantPermissions(s.hh, member.accountId, ["change_application_state"]);
    const row = await insertApplicationAt(s, "new");

    const result = await transitionApplication(member.context, row.id, "screened");
    expect(result.state).toBe("screened");
    expect((await readApplication(s, row.id)).state).toBe("screened");
    const events = await eventsOf(s, row.id, "application.state_changed");
    expect(events).toHaveLength(1);
    expect(events[0].actorAccountId).toBe(member.accountId);
    expect(events[0].actorProfileId).toBe(member.profileId);
  });

  it("(c) the same resident is refused going backward, screened -> new", async () => {
    const s = await setupPipeline(households);
    const member = await claimPlainMember(s.hh, "GrantedMember", accountIds);
    await grantPermissions(s.hh, member.accountId, ["change_application_state"]);
    const row = await insertApplicationAt(s, "screened");

    const err = await errorOf(transitionApplication(member.context, row.id, "new"));
    expect(err).toBeInstanceOf(PermissionDeniedError);
    expect((err as PermissionDeniedError).message).toContain("reverse_application_state");
    await expectUntouched(s, row.id, row);
  });

  it("(d) a moderator moves backward, one event names the moderator, and the result carries no personal column", async () => {
    const s = await setupPipeline(households);
    const row = await insertApplicationAt(s, "screened", { applicantName: "Testbewerbung Privat", messageRaw: "Vertraulich" });
    const before = Date.now();

    const result = await transitionApplication(s.moderator.context, row.id, "new");

    const after = await readApplication(s, row.id);
    expect(after.state).toBe("new");
    expect(after.stateChangedAt.getTime()).toBeGreaterThanOrEqual(before - 5000);
    expect(after.stateChangedAt.getTime()).toBeGreaterThan(row.stateChangedAt.getTime());
    const events = await eventsOf(s, row.id);
    expect(events).toHaveLength(1);
    expect(events[0].eventType).toBe("application.state_changed");
    expect(events[0].actorAccountId).toBe(s.moderator.accountId);
    expect(events[0].actorProfileId).toBe(s.moderator.profileId);
    expect(events[0].payload).toEqual({ fromState: "screened", toState: "new" });

    // The result is the lifecycle shape only (pre-mortem M10).
    expect(result.state).toBe("new");
    for (const personal of ["applicantName", "contactEmail", "contactPhone", "contactOther", "messageRaw", "attributes", "age", "source", "collectedFrom"]) {
      expect(result, personal).not.toHaveProperty(personal);
    }
  });

  it("(e) the household account is refused with ProfileRequiredError (no-query half: the no-query file)", async () => {
    const s = await setupPipeline(households);
    const row = await insertApplicationAt(s, "new");

    const err = await errorOf(transitionApplication(s.hh.context, row.id, "screened"));
    expect(err).toBeInstanceOf(ProfileRequiredError);
    expect((err as ProfileRequiredError).code).toBe("profile_required");
    await expectUntouched(s, row.id, row);
  });

  // INVARIANT GUARD, no break: RLS hides another household's row whatever the predicate says.
  it("(f) an application id of another household is not_found", async () => {
    const s = await setupPipeline(households);
    const other = await setupPipeline(households);
    const foreign = await insertApplicationAt(other, "new");

    const err = await errorOf(transitionApplication(s.moderator.context, foreign.id, "screened"));
    expect(err).toBeInstanceOf(ApplicationTransitionError);
    expect((err as ApplicationTransitionError).code).toBe("not_found");
    await expectUntouched(other, foreign.id, foreign);
  });

  it("(g) a malformed id is not_found", async () => {
    const s = await setupPipeline(households);
    for (const bad of ["not-a-uuid", "", uuid().toUpperCase().slice(0, 30)]) {
      const err = await errorOf(transitionApplication(s.moderator.context, bad, "screened"));
      expect(err).toBeInstanceOf(ApplicationTransitionError);
      expect((err as ApplicationTransitionError).code).toBe("not_found");
    }
  });
});

describe("transitionApplication: a step that is not built yet (D6a)", () => {
  it("(h) a moderator asking for a pending row gets step_not_available, and nothing changes", async () => {
    const s = await setupPipeline(households);
    const invited = await insertApplicationAt(s, "invited");
    const interviewed = await insertApplicationAt(s, "interviewed");

    for (const [row, to] of [
      [invited, "scheduled"],
      [interviewed, "offer_made"],
    ] as const) {
      const err = await errorOf(transitionApplication(s.moderator.context, row.id, to));
      expect(err).toBeInstanceOf(ApplicationTransitionError);
      expect((err as ApplicationTransitionError).code).toBe("step_not_available");
      await expectUntouched(s, row.id, row);
    }
  });

  it("(h2) an undeclared pair is still an InvalidTransitionError", async () => {
    const s = await setupPipeline(households);
    const row = await insertApplicationAt(s, "new");
    const err = await errorOf(transitionApplication(s.moderator.context, row.id, "invited"));
    expect(err).toBeInstanceOf(InvalidTransitionError);
    await expectUntouched(s, row.id, row);
  });

  it("(h3) a member without the permission gets the permission refusal for a pending row, not step_not_available", async () => {
    const s = await setupPipeline(households);
    const member = await claimPlainMember(s.hh, "PlainMember", accountIds);
    const row = await insertApplicationAt(s, "invited");
    const err = await errorOf(transitionApplication(member.context, row.id, "scheduled"));
    expect(err).toBeInstanceOf(PermissionDeniedError);
    await expectUntouched(s, row.id, row);
  });

  it("(i) a reopening counts as a way back: a granted resident is refused, a moderator succeeds", async () => {
    const s = await setupPipeline(households);
    const member = await claimPlainMember(s.hh, "GrantedMember", accountIds);
    await grantPermissions(s.hh, member.accountId, ["change_application_state"]);
    const rejected = await insertApplicationAt(s, "rejected_by_household");

    const err = await errorOf(transitionApplication(member.context, rejected.id, "screened"));
    expect(err).toBeInstanceOf(PermissionDeniedError);
    await expectUntouched(s, rejected.id, rejected);

    const result = await transitionApplication(s.moderator.context, rejected.id, "screened");
    expect(result.state).toBe("screened");
    expect((await readApplication(s, rejected.id)).state).toBe("screened");
  });

  it("(j) a moderator moves invited -> screened, a state_only backward row", async () => {
    const s = await setupPipeline(households);
    const row = await insertApplicationAt(s, "invited");
    const result = await transitionApplication(s.moderator.context, row.id, "screened");
    expect(result.state).toBe("screened");
    const events = await eventsOf(s, row.id, "application.state_changed");
    expect(events).toHaveLength(1);
    expect(events[0].payload).toEqual({ fromState: "invited", toState: "screened" });
  });
});

describe("transitionApplication: serialised on the application row (D7)", () => {
  // The deterministic pattern of revoked-membership-sign-in.test.ts: a real transaction holds the
  // row lock uncommitted, so the outcome does not depend on the pooler serialising anything.
  it("2.5 a transition waits for a writer of the same row, then decides on the committed state", async () => {
    const s = await setupPipeline(households);
    const row = await insertApplicationAt(s, "new");

    let markLocked!: () => void;
    const locked = new Promise<void>((resolve) => (markLocked = resolve));
    let release!: () => void;
    const gate = new Promise<void>((resolve) => (release = resolve));

    const holder = withSessionContext(s.moderator.context, async (tx) => {
      await tx.select({ id: application.id }).from(application).where(eq(application.id, row.id)).for("update");
      markLocked();
      await gate;
      await tx.update(application).set({ state: "screened", stateChangedAt: new Date() }).where(eq(application.id, row.id));
    });
    await locked;

    const transition = transitionApplication(s.moderator.context, row.id, "screened");
    const outcome = transition.then(() => "resolved" as const, (e: unknown) => e);
    // While the holder is uncommitted the transition must not have decided.
    const settledWhileHeld = await settlesWithin(outcome, 2000);
    release();
    await holder;
    const result = await outcome;

    expect(settledWhileHeld).toBe(false);
    // It re-read `screened`, so `screened -> screened` is undeclared.
    expect(result).toBeInstanceOf(InvalidTransitionError);
    expect((await readApplication(s, row.id)).state).toBe("screened");
    // Only the holder wrote: no state_changed event was recorded by the refused transition.
    expect(await eventsOf(s, row.id)).toHaveLength(0);
  }, 30_000);
});
