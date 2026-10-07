import { and, eq, sql } from "drizzle-orm";
import { afterEach, describe, expect, it } from "vitest";
import { withSessionContext, type SessionContext } from "@/db/session-context";
import { assertPayloadAllowed, PayloadValidationError } from "@/modules/audit/repository";
import { activityEvent } from "@/modules/audit/schema";
import { ApplicationInputError, parseApplicationInput } from "@/modules/casting/application-input";
import {
  ApplicationCaptureError,
  ApplicationWriteError,
  captureApplication,
  createAndOpenRound,
  createRoom,
  createRound,
  insertCapturedApplicationTx,
} from "@/modules/casting/repository";
import { application } from "@/modules/casting/schema";
import { PermissionDeniedError } from "@/modules/identity/repository";
import { membership } from "@/modules/identity/schema";
import { claimResidentProfile } from "@/modules/identity/auth";
import { createResidentProfile } from "@/modules/identity/repository";
import {
  cleanupAll,
  createTestModerator,
  deleteTestAccount,
  registerTestHousehold,
  type TestHousehold,
} from "../../helpers/identity";
import { uuid } from "../../helpers/uuid";

// F3 change 2, tasks 6.1-6.8, 6.10, 6.10a: captureApplication against the real dev database with
// synthetic data (G-B1). Teardown is in afterEach, never a finally inside a test: a timeout aborts
// before `finally` runs (CLAUDE.md).
const households: TestHousehold[] = [];
const accountIds: string[] = [];

afterEach(async () => {
  await cleanupAll(...accountIds.map(deleteTestAccount), ...households.map((h) => h.cleanup()));
  accountIds.length = 0;
  households.length = 0;
});

interface Setup {
  hh: TestHousehold;
  moderator: { context: SessionContext; accountId: string; profileId: string };
  roundId: string;
}

// A household with a moderator and one open round (created through the real path).
async function setup(): Promise<Setup> {
  const hh = await registerTestHousehold();
  households.push(hh);
  const moderator = await createTestModerator(hh);
  const actor = { accountId: moderator.accountId, profileId: moderator.profileId };
  const room = await createRoom(hh.context, "Room A", { accountId: hh.accountId, profileId: null });
  const round = await createAndOpenRound(moderator.context, "Round", [room.id], actor);
  return { hh, moderator, roundId: round.id };
}

async function claimMember(hh: TestHousehold, name: string) {
  const actor = { accountId: hh.accountId, profileId: null };
  const profile = await createResidentProfile(hh.context, name, actor);
  const { accountId } = await claimResidentProfile(hh.context, profile.id, "test-password-not-real-1234", "de");
  accountIds.push(accountId);
  return {
    accountId,
    profileId: profile.id,
    context: { accountId, householdId: hh.householdId, profileId: profile.id } as SessionContext,
  };
}

// Reads in a resident context: `application` and application-subject events are invisible to a
// profile-less session (G-D15).
async function rowsOf(s: Setup, roundId = s.roundId) {
  return withSessionContext(s.moderator.context, (tx) =>
    tx.select().from(application).where(eq(application.roundId, roundId)),
  );
}

async function createdEvents(s: Setup) {
  return withSessionContext(s.moderator.context, (tx) =>
    tx
      .select()
      .from(activityEvent)
      .where(
        and(eq(activityEvent.householdId, s.hh.householdId), eq(activityEvent.eventType, "application.created")),
      ),
  );
}

async function expectNothingWritten(s: Setup, roundId = s.roundId) {
  expect(await rowsOf(s, roundId)).toHaveLength(0);
  expect(await createdEvents(s)).toHaveLength(0);
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// True when the promise settles (either way) within `ms`.
async function settlesWithin(promise: Promise<unknown>, ms: number): Promise<boolean> {
  return Promise.race([promise.then(() => true, () => true), sleep(ms).then(() => false)]);
}

describe("captureApplication: what is written (AC-3.1, AC-3.3, AC-3.11)", () => {
  it("6.1 a moderator captures with a name only; every written column is asserted", async () => {
    const s = await setup();
    const before = Date.now();
    const created = await captureApplication(s.moderator.context, {
      roundId: s.roundId,
      applicantName: "Testbewerbung Nur Name",
      collectedFrom: "data_subject",
      // A submission must never choose the intake path: the repository sets source itself (FR-3.6).
      source: "paste_parser",
    });

    const [row] = await rowsOf(s);
    expect(row.id).toBe(created.id);
    expect(row.applicantName).toBe("Testbewerbung Nur Name");
    expect(row.state).toBe("new");
    expect(row.source).toBe("manual_form");
    expect(row.collectedFrom).toBe("data_subject");
    expect(row.age).toBeNull();
    expect(row.contactEmail).toBeNull();
    expect(row.contactPhone).toBeNull();
    expect(row.contactOther).toBeNull();
    expect(row.messageRaw).toBeNull();
    expect(row.attributes).toBeNull();
    expect(row.roundId).toBe(s.roundId);
    expect(row.householdId).toBe(s.hh.householdId);
    expect(row.createdByAccountId).toBe(s.moderator.accountId);
    expect(row.createdByProfileId).toBe(s.moderator.profileId);
    expect(row.stateChangedAt).toBeInstanceOf(Date);
    expect(row.createdAt).toBeInstanceOf(Date);
    expect(row.createdAt.getTime()).toBeGreaterThanOrEqual(before - 60_000);
    expect(row.retentionUntil).toBeNull();
    expect(row.becameResidentId).toBeNull();
    expect(row.deletedAt).toBeNull();
    // Deliberate break: make the repository insert `source` from input, and this fails because the
    // raw input above says "paste_parser" (argued: it needs an edit to the repository and the new
    // columns on dev).
  });

  it("6.2 collected_from is a stored value, read back by raw SQL (AC-3.7)", async () => {
    const s = await setup();
    const created = await captureApplication(s.moderator.context, {
      roundId: s.roundId,
      applicantName: "Testbewerbung Roh",
      collectedFrom: "data_subject",
    });
    const rows = await withSessionContext(s.moderator.context, (tx) =>
      tx.execute<{ collected_from: string; is_null: boolean }>(
        sql`SELECT collected_from, collected_from IS NULL AS is_null FROM application WHERE id = ${created.id}::uuid`,
      ),
    );
    expect(rows[0].collected_from).toBe("data_subject");
    expect(rows[0].is_null).toBe(false);
    // Deliberate break (ARGUED, needs a schema edit): adding `.default("data_subject")` to the
    // column and dropping the explicit value in the repository would keep THIS test green, because
    // a defaulted column also reads back as 'data_subject'. That is why 6.9 exists: an INSERT
    // without collected_from must be REFUSED by the database (23502), and a default would let it
    // succeed. This test alone would not catch the default.
  });

  it("6.3 two captures through the same form keep their own source: third_party and data_subject, both manual_form", async () => {
    const s = await setup();
    await captureApplication(s.moderator.context, {
      roundId: s.roundId,
      applicantName: "Testbewerbung Dritte",
      collectedFrom: "third_party",
    });
    await captureApplication(s.moderator.context, {
      roundId: s.roundId,
      applicantName: "Testbewerbung Selbst",
      collectedFrom: "data_subject",
    });
    const rows = await rowsOf(s);
    const byName = Object.fromEntries(rows.map((r) => [r.applicantName, r]));
    expect(byName["Testbewerbung Dritte"].collectedFrom).toBe("third_party");
    expect(byName["Testbewerbung Selbst"].collectedFrom).toBe("data_subject");
    expect(rows.every((r) => r.source === "manual_form")).toBe(true);
  });

  it("6.4 an empty or whitespace name is refused with name_required and writes nothing; two equal names are both created", async () => {
    const s = await setup();
    for (const applicantName of ["", "   ", "\t\n"]) {
      let caught: unknown;
      try {
        await captureApplication(s.moderator.context, { roundId: s.roundId, applicantName, collectedFrom: "data_subject" });
      } catch (err) {
        caught = err;
      }
      expect(caught).toBeInstanceOf(ApplicationInputError);
      expect((caught as ApplicationInputError).code).toBe("name_required");
      expect((caught as ApplicationInputError).field).toBe("applicantName");
    }
    await expectNothingWritten(s);

    // EC-3.1 / EC-3.11: the same name twice is not an error.
    const input = { roundId: s.roundId, applicantName: "Testbewerbung Doppelt", collectedFrom: "data_subject" };
    const [first, second] = await Promise.all([
      captureApplication(s.moderator.context, input),
      captureApplication(s.moderator.context, input),
    ]);
    expect(first.id).not.toBe(second.id);
    expect(await rowsOf(s)).toHaveLength(2);
  });
});

describe("captureApplication: who may (AC-3.5)", () => {
  it("6.5 a plain member is refused for the permission and writes nothing; a granted member succeeds", async () => {
    const s = await setup();
    const member = await claimMember(s.hh, "PlainMember");
    const input = { roundId: s.roundId, applicantName: "Testbewerbung Mitglied", collectedFrom: "data_subject" };

    await expect(captureApplication(member.context, input)).rejects.toThrow(PermissionDeniedError);
    await expectNothingWritten(s);

    await withSessionContext(s.hh.context, (tx) =>
      tx.update(membership).set({ permissions: ["create_application"] }).where(eq(membership.accountId, member.accountId)),
    );
    const created = await captureApplication(member.context, input);
    expect(created.id).toBeTruthy();
    const [row] = await rowsOf(s);
    expect(row.createdByAccountId).toBe(member.accountId);
    expect(row.createdByProfileId).toBe(member.profileId);
  });

  it("6.5 a context naming another profile of the household is refused (a stale session claim), and writes nothing", async () => {
    const s = await setup();
    const other = await claimMember(s.hh, "OtherResident");
    const staleClaim: SessionContext = { ...s.moderator.context, profileId: other.profileId };
    await expect(
      captureApplication(staleClaim, { roundId: s.roundId, applicantName: "Testbewerbung Fremd", collectedFrom: "data_subject" }),
    ).rejects.toThrow(PermissionDeniedError);
    await expectNothingWritten(s);
  });

  // The household-account refusal, with the spy proving no query ran, lives in
  // application-household-account-no-query.test.ts (it needs @/db/session-context mocked).
});

describe("captureApplication: the round (AC-3.4)", () => {
  it("6.6 a draft round and a closed round are refused with round_not_open; another household's round and a random uuid with round_not_found", async () => {
    const s = await setup();
    const modActor = { accountId: s.moderator.accountId, profileId: s.moderator.profileId };
    const room = await createRoom(s.hh.context, "Room B", { accountId: s.hh.accountId, profileId: null });
    const draft = await createRound(s.moderator.context, "Draft", [room.id], modActor);
    const input = (roundId: string) => ({ roundId, applicantName: "Testbewerbung Runde", collectedFrom: "data_subject" });

    const expectCode = async (roundId: string, code: string) => {
      let caught: unknown;
      try {
        await captureApplication(s.moderator.context, input(roundId));
      } catch (err) {
        caught = err;
      }
      expect(caught).toBeInstanceOf(ApplicationCaptureError);
      expect((caught as ApplicationCaptureError).code).toBe(code);
    };

    await expectCode(draft.id, "round_not_open");

    // A closed round, via raw SQL (no close function exists yet).
    await withSessionContext(s.hh.context, (tx) =>
      tx.execute(sql`UPDATE casting_round SET status = 'closed' WHERE id = ${s.roundId}::uuid`),
    );
    await expectCode(s.roundId, "round_not_open");

    // Another household's round is refused exactly as one that does not exist.
    const other = await setup();
    await expectCode(other.roundId, "round_not_found");
    await expectCode(uuid(), "round_not_found");
    // A malformed id: still a coded refusal, with no database error.
    await expectCode("not-a-uuid", "round_not_found");

    await expectNothingWritten(s, draft.id);
    await expectNothingWritten(s);
  });

  it("6.7 a round close in flight is waited for, and the capture then decides on the committed status (EC-3.9)", async () => {
    const s = await setup();
    let markLocked!: () => void;
    const locked = new Promise<void>((resolve) => (markLocked = resolve));
    let release!: () => void;
    const gate = new Promise<void>((resolve) => (release = resolve));

    // Tx A: changes the round's status and stays uncommitted (a stand-in for a future close).
    const closing = withSessionContext(s.hh.context, async (tx) => {
      await tx.execute(sql`UPDATE casting_round SET status = 'closed' WHERE id = ${s.roundId}::uuid`);
      markLocked();
      await gate;
    });
    await locked;

    const capture = captureApplication(s.moderator.context, {
      roundId: s.roundId,
      applicantName: "Testbewerbung Wartet",
      collectedFrom: "data_subject",
    });
    const early = capture.then(() => "resolved", (e) => e);
    // While A is uncommitted the capture must not have decided. (FOR SHARE on the round row waits
    // for A's row lock.) If it settles inside the window, the round read is not locking.
    const settledWhileHeld = await settlesWithin(early, 2000);
    release();
    await closing;
    const outcome = await early;

    expect(settledWhileHeld).toBe(false);
    expect(outcome).toBeInstanceOf(ApplicationCaptureError);
    expect((outcome as ApplicationCaptureError).code).toBe("round_not_open");
    await expectNothingWritten(s);
    // Deliberate break: remove `.for("share")` on the round read in captureApplication, and the
    // capture resolves (it sees the OLD committed status 'open') while A is uncommitted, so
    // `settledWhileHeld` is true and this test fails. Argued, not run: it needs an edit to the
    // repository and the migrations on dev.
  }, 30_000);

  it("6.8 a membership revoked in flight is waited for, and the capture is then refused for the permission", async () => {
    const s = await setup();
    let markLocked!: () => void;
    const locked = new Promise<void>((resolve) => (markLocked = resolve));
    let release!: () => void;
    const gate = new Promise<void>((resolve) => (release = resolve));

    // Tx A stands in for a concurrent revocation (revokeMembershipForProfileTx): one UPDATE that
    // revokes the membership and clears its role and permissions (drizzle/0024 requires all
    // three), held uncommitted.
    const revoking = withSessionContext(s.hh.context, async (tx) => {
      await tx.execute(
        sql`UPDATE membership SET revoked_at = now(), role = 'member', permissions = '{}'::text[]
            WHERE account_id = ${s.moderator.accountId}::uuid`,
      );
      markLocked();
      await gate;
    });
    await locked;

    const capture = captureApplication(s.moderator.context, {
      roundId: s.roundId,
      applicantName: "Testbewerbung Entzogen",
      collectedFrom: "data_subject",
    });
    const early = capture.then(() => "resolved", (e) => e);
    const settledWhileHeld = await settlesWithin(early, 2000);
    release();
    await revoking;
    const outcome = await early;

    expect(settledWhileHeld).toBe(false);
    expect(outcome).toBeInstanceOf(PermissionDeniedError);
    await expectNothingWritten(s);
    // Deliberate break: move the permission check back outside the transaction
    // (assertHasPermission, which reads in its own transaction without a lock), and the capture
    // succeeds against the OLD committed membership while A is uncommitted. Argued, not run.
  }, 30_000);
});

describe("captureApplication: the audit event (FR-3.7, G-D7)", () => {
  it("6.10 exactly one application.created event, naming the actors, whose payload is only { source, collectedFrom }", async () => {
    const s = await setup();
    const values = {
      applicantName: "SENTINEL-EVT-NAME-4d1e",
      contactEmail: "sentinel-evt-4d1e@example.test",
      contactPhone: "+49 30 23125 4171",
      contactOther: "SENTINEL-EVT-OTHER-4d1e",
      messageRaw: "SENTINEL-EVT-MESSAGE-4d1e",
      attrLabel: "SENTINEL-EVT-ATTRLABEL-4d1e",
      attrValue: "SENTINEL-EVT-ATTRVALUE-4d1e",
    };
    const created = await captureApplication(s.moderator.context, {
      roundId: s.roundId,
      applicantName: values.applicantName,
      age: 33,
      contacts: [values.contactEmail, values.contactPhone, values.contactOther],
      messageRaw: values.messageRaw,
      attributes: [{ label: values.attrLabel, value: values.attrValue }],
      collectedFrom: "third_party",
    });

    const events = await createdEvents(s);
    expect(events).toHaveLength(1);
    const [event] = events;
    expect(event.subjectType).toBe("application");
    expect(event.subjectId).toBe(created.id);
    expect(event.actorAccountId).toBe(s.moderator.accountId);
    expect(event.actorProfileId).toBe(s.moderator.profileId);
    expect(Object.keys(event.payload as object).sort()).toEqual(["collectedFrom", "source"]);
    expect(event.payload).toEqual({ source: "manual_form", collectedFrom: "third_party" });

    // No field value anywhere in the event row.
    const serialised = JSON.stringify(event);
    for (const value of Object.values(values)) expect(serialised).not.toContain(value);
  });

  it("6.10 the allowlist itself refuses a field value: applicantName in the payload throws", () => {
    // Runs without a database. Deliberate break: add `applicantName` to the payload in
    // insertCapturedApplicationTx and recordActivityEvent throws this PayloadValidationError, so a
    // capture fails. And the test above would ALSO fail if the allowlist were widened to accept it,
    // because it pins the payload keys to exactly { collectedFrom, source }.
    expect(() =>
      assertPayloadAllowed("application.created", { source: "manual_form", collectedFrom: "data_subject", applicantName: "x" }),
    ).toThrow(PayloadValidationError);
    expect(() =>
      assertPayloadAllowed("application.created", { source: "manual_form", collectedFrom: "data_subject" }),
    ).not.toThrow();
  });
});

describe("captureApplication: no value leaves in an error (design D4, pre-mortem 1)", () => {
  it("6.10a a forced database refusal of the insert rethrows an ApplicationWriteError carrying only SQLSTATE and constraint", async () => {
    const s = await setup();
    const other = await setup(); // a real round of ANOTHER household: the pairing trigger refuses it
    const sentinels = {
      applicantName: "SENTINEL-ERR-NAME-7a90",
      contactEmail: "sentinel-err-7a90@example.test",
      contactPhone: "+49 30 23125 7290",
      contactOther: "SENTINEL-ERR-OTHER-7a90",
      messageRaw: "SENTINEL-ERR-MESSAGE-7a90",
      attrLabel: "SENTINEL-ERR-ATTRLABEL-7a90",
      attrValue: "SENTINEL-ERR-ATTRVALUE-7a90",
    };
    const parsed = parseApplicationInput({
      applicantName: sentinels.applicantName,
      age: 41,
      contacts: [sentinels.contactEmail, sentinels.contactPhone, sentinels.contactOther],
      messageRaw: sentinels.messageRaw,
      attributes: [{ label: sentinels.attrLabel, value: sentinels.attrValue }],
      collectedFrom: "data_subject",
    });

    // The test seam: insertCapturedApplicationTx is the write half captureApplication uses, called
    // here with a round id captureApplication's own round check would have refused. The database
    // refuses it (the pairing trigger, 23503).
    let caught: unknown;
    try {
      await withSessionContext(s.moderator.context, (tx) =>
        insertCapturedApplicationTx(tx, s.moderator.context, other.roundId, parsed),
      );
    } catch (err) {
      caught = err;
    }

    expect(caught).toBeInstanceOf(ApplicationWriteError);
    const err = caught as ApplicationWriteError;
    expect(err.sqlState).toBe("23503");
    expect(err.constraint).toBe("application_round_same_household");
    expect(err.code).toBe("db_refused");
    expect((err as { cause?: unknown }).cause).toBeUndefined();

    const everything = JSON.stringify({
      message: err.message,
      stack: err.stack,
      props: Object.getOwnPropertyNames(err).map((k) => [k, String((err as unknown as Record<string, unknown>)[k])]),
    });
    for (const sentinel of Object.values(sentinels)) expect(everything).not.toContain(sentinel);
    await expectNothingWritten(s);

    // The action's own logging is asserted in tests/unit/casting/capture-action.test.ts (spy on
    // console, error class mocked): nothing but { code, sqlState, constraint } is ever logged.
    // Deliberate break: rethrow the original error from insertCapturedApplicationTx instead of a
    // fresh ApplicationWriteError, and this fails (the Drizzle message carries "params: ..." with
    // every sentinel, and the class check fails). Argued, not run: it needs an edit to the
    // repository and 0023 on dev.
  }, 60_000);
});
