import { eq, sql } from "drizzle-orm";
import { afterEach, describe, expect, it } from "vitest";
import { withSessionContext } from "@/db/session-context";
import { applicationBaseline } from "@/modules/casting/application-changes";
import { ApplicationInputError } from "@/modules/casting/application-input";
import {
  ApplicationUpdateError,
  captureApplication,
  ProfileRequiredError,
  updateApplication,
} from "@/modules/casting/repository";
import { application } from "@/modules/casting/schema";
import { PermissionDeniedError } from "@/modules/identity/repository";
import { insertTestRound } from "../../helpers/applications";
import { cleanupAll, deleteTestAccount, type TestHousehold } from "../../helpers/identity";
import {
  claimPlainMember,
  eventsOf,
  readApplication,
  settlesWithin,
  setupPipeline,
  type PipelineSetup,
} from "../../helpers/pipeline";
import { uuid } from "../../helpers/uuid";

// F3 change 3 (application-pipeline), FR-3.21/3.22, AC-3.19, EC-3.5/3.6, design D4/D7, tasks 7.4.
// Real households, a real moderator, a claimed plain resident. Teardown in afterEach. G-B1: all
// data is synthetic.
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

type Row = Awaited<ReturnType<typeof readApplication>>;

// What the correction form submits for a stored row, with `patch` applied: every field as stored
// (the contacts pre-filled the way the edit page does it), the baseline of the row as read.
function formInput(_s: PipelineSetup, row: Row, patch: Record<string, unknown> = {}, baseline?: string) {
  const contacts = [row.contactEmail, row.contactPhone, row.contactOther].filter((c): c is string => c !== null);
  return {
    roundId: row.roundId,
    applicationId: row.id,
    baseline: baseline ?? applicationBaseline(row),
    applicantName: row.applicantName,
    age: row.age === null ? "" : String(row.age),
    contacts,
    messageRaw: row.messageRaw ?? "",
    attributes: (row.attributes as { label: string; value: string }[] | null) ?? [],
    collectedFrom: row.collectedFrom,
    ...patch,
  };
}

async function capture(s: PipelineSetup, input: Record<string, unknown> = {}) {
  const created = await captureApplication(s.moderator.context, {
    roundId: s.roundId,
    applicantName: "Testbewerbung Korrektur",
    collectedFrom: "data_subject",
    ...input,
  });
  return readApplication(s, created.id);
}

describe("updateApplication: what a correction writes (AC-3.19, FR-3.22)", () => {
  it("(a) correcting the message and the source stores both, and the audit names fields, never values", async () => {
    const s = await setupPipeline(households);
    const row = await capture(s, { messageRaw: "Alte Nachricht ALT-SENTINEL" });

    const result = await updateApplication(
      s.moderator.context,
      formInput(s, row, { messageRaw: "Neue Nachricht NEU-SENTINEL", collectedFrom: "third_party" }),
    );
    expect(result).toEqual({ changed: ["messageRaw", "collectedFrom"] });

    const after = await readApplication(s, row.id);
    expect(after.messageRaw).toBe("Neue Nachricht NEU-SENTINEL");
    expect(after.collectedFrom).toBe("third_party");

    const events = await eventsOf(s, row.id, "application.updated");
    expect(events).toHaveLength(1);
    expect(events[0].payload).toEqual({ fields: ["messageRaw", "collectedFrom"] });
    const serialised = JSON.stringify(events[0].payload);
    for (const forbidden of ["ALT-SENTINEL", "NEU-SENTINEL", "third_party", "data_subject", "Testbewerbung"]) {
      expect(serialised).not.toContain(forbidden);
    }
    expect(events[0].actorAccountId).toBe(s.moderator.accountId);
    expect(events[0].actorProfileId).toBe(s.moderator.profileId);
  });

  it("(b) a correction that changes nothing leaves every column as it was and writes no event", async () => {
    const s = await setupPipeline(households);
    const row = await capture(s, {
      age: "31",
      contacts: ["anna@example.test", "+49 30 23125 0100", "Portal: anna"],
      messageRaw: "Nachricht",
      attributes: [{ label: "Beruf", value: "Tischlerin" }],
    });

    const result = await updateApplication(s.moderator.context, formInput(s, row));
    expect(result).toEqual({ changed: [] });

    expect(await readApplication(s, row.id)).toEqual(row);
    expect(await eventsOf(s, row.id, "application.updated")).toHaveLength(0);
  });

  it("(c) source, state, household and another round are never written, and another round's id is not_found", async () => {
    const s = await setupPipeline(households);
    const other = await setupPipeline(households);
    const row = await capture(s);

    await updateApplication(
      s.moderator.context,
      formInput(s, row, {
        applicantName: "Testbewerbung Umbenannt",
        source: "paste_parser",
        state: "invited",
        householdId: other.hh.householdId,
        createdByAccountId: uuid(),
      }),
    );
    const after = await readApplication(s, row.id);
    expect(after.applicantName).toBe("Testbewerbung Umbenannt");
    expect(after.source).toBe(row.source);
    expect(after.state).toBe(row.state);
    expect(after.stateChangedAt).toEqual(row.stateChangedAt);
    expect(after.roundId).toBe(row.roundId);
    expect(after.householdId).toBe(row.householdId);
    expect(after.createdByAccountId).toBe(row.createdByAccountId);
    expect(after.createdByProfileId).toBe(row.createdByProfileId);
    expect(after.createdAt).toEqual(row.createdAt);

    // Another round of the SAME household with this application's id: not found, nothing written.
    const otherRound = await withSessionContext(s.moderator.context, (tx) =>
      insertTestRound(tx, s.hh.householdId, "draft"),
    );
    const err = await errorOf(
      updateApplication(s.moderator.context, formInput(s, after, { roundId: otherRound, applicantName: "Andere Runde" })),
    );
    expect(err).toBeInstanceOf(ApplicationUpdateError);
    expect((err as ApplicationUpdateError).code).toBe("not_found");
    expect((await readApplication(s, row.id)).applicantName).toBe("Testbewerbung Umbenannt");
  });
});

describe("updateApplication: who may, and what is refused", () => {
  it("(d) a plain resident is refused with PermissionDeniedError, and nothing changes", async () => {
    const s = await setupPipeline(households);
    const member = await claimPlainMember(s.hh, "PlainMember", accountIds);
    const row = await capture(s);

    const err = await errorOf(updateApplication(member.context, formInput(s, row, { applicantName: "Fremd" })));
    expect(err).toBeInstanceOf(PermissionDeniedError);
    expect(await readApplication(s, row.id)).toEqual(row);
    expect(await eventsOf(s, row.id, "application.updated")).toHaveLength(0);
  });

  it("(e) the household account is refused with ProfileRequiredError (no-query half: the no-query file)", async () => {
    const s = await setupPipeline(households);
    const row = await capture(s);

    const err = await errorOf(updateApplication(s.hh.context, formInput(s, row, { applicantName: "Haushalt" })));
    expect(err).toBeInstanceOf(ProfileRequiredError);
    expect(await readApplication(s, row.id)).toEqual(row);
  });

  it("(f) a whitespace name is refused naming the name field, and the stored name is unchanged", async () => {
    const s = await setupPipeline(households);
    const row = await capture(s);

    const err = await errorOf(updateApplication(s.moderator.context, formInput(s, row, { applicantName: "   " })));
    expect(err).toBeInstanceOf(ApplicationInputError);
    expect((err as ApplicationInputError).code).toBe("name_required");
    expect((err as ApplicationInputError).field).toBe("applicantName");
    expect(await readApplication(s, row.id)).toEqual(row);
    expect(await eventsOf(s, row.id, "application.updated")).toHaveLength(0);
  });

  it("(h) a correction still succeeds on a closed round (A2: Art. 16 does not end with a round)", async () => {
    const s = await setupPipeline(households);
    const row = await capture(s);
    await withSessionContext(s.hh.context, (tx) =>
      tx.execute(sql`UPDATE casting_round SET status = 'closed' WHERE id = ${s.roundId}::uuid`),
    );

    const result = await updateApplication(s.moderator.context, formInput(s, row, { applicantName: "Nach Schluss" }));
    expect(result).toEqual({ changed: ["applicantName"] });
    expect((await readApplication(s, row.id)).applicantName).toBe("Nach Schluss");
  });
});

describe("updateApplication: the source's history (EC-3.5, EC-3.6)", () => {
  it("(g) switching to a third party and back keeps the capture's record, and each switch is one entry", async () => {
    const s = await setupPipeline(households);
    const row = await capture(s, { collectedFrom: "third_party" });

    await updateApplication(s.moderator.context, formInput(s, row, { collectedFrom: "data_subject" }));
    const back = await readApplication(s, row.id);
    expect(back.collectedFrom).toBe("data_subject");
    await updateApplication(s.moderator.context, formInput(s, back, { collectedFrom: "third_party" }));

    const created = await eventsOf(s, row.id, "application.created");
    expect(created).toHaveLength(1);
    expect(created[0].payload).toEqual({ source: "manual_form", collectedFrom: "third_party" });
    const updated = await eventsOf(s, row.id, "application.updated");
    expect(updated).toHaveLength(2);
    for (const event of updated) expect(event.payload).toEqual({ fields: ["collectedFrom"] });
  });
});

describe("updateApplication: a stale form is refused (pre-mortem M5)", () => {
  it("(i) B's correction with a baseline from before A's save is refused as stale, and A's name stays", async () => {
    const s = await setupPipeline(households);
    const row = await capture(s);
    const baselineOfB = applicationBaseline(row);

    // A saves a corrected name.
    await updateApplication(s.moderator.context, formInput(s, row, { applicantName: "Testbewerbung von A" }));
    const eventsAfterA = await eventsOf(s, row.id, "application.updated");
    expect(eventsAfterA).toHaveLength(1);

    // B submits a message change from the form it loaded before A's save.
    const err = await errorOf(
      updateApplication(
        s.moderator.context,
        formInput(s, row, { messageRaw: "Nachricht von B" }, baselineOfB),
      ),
    );
    expect(err).toBeInstanceOf(ApplicationUpdateError);
    expect((err as ApplicationUpdateError).code).toBe("stale");

    const after = await readApplication(s, row.id);
    expect(after.applicantName).toBe("Testbewerbung von A");
    expect(after.messageRaw).toBeNull();
    expect(await eventsOf(s, row.id, "application.updated")).toHaveLength(1);
  });

  // The deterministic pattern of revoked-membership-sign-in.test.ts: a real transaction holds the
  // row lock uncommitted, so the outcome does not depend on the pooler serialising anything.
  it("(j) a correction waits for a concurrent writer of the row, then is refused as stale, writing nothing", async () => {
    const s = await setupPipeline(households);
    const row = await capture(s);
    const baseline = applicationBaseline(row);

    let markLocked!: () => void;
    const locked = new Promise<void>((resolve) => (markLocked = resolve));
    let release!: () => void;
    const gate = new Promise<void>((resolve) => (release = resolve));

    // The holder locks the row and, once released, commits ONLY applicant_name = X.
    const holder = withSessionContext(s.moderator.context, async (tx) => {
      await tx.select({ id: application.id }).from(application).where(eq(application.id, row.id)).for("update");
      markLocked();
      await gate;
      await tx.update(application).set({ applicantName: "Testbewerbung X" }).where(eq(application.id, row.id));
    });
    await locked;

    // The correction submits applicantName = X too, and everything else unchanged.
    const correction = updateApplication(
      s.moderator.context,
      formInput(s, row, { applicantName: "Testbewerbung X" }, baseline),
    );
    const outcome = correction.then(() => "resolved" as const, (e: unknown) => e);
    const settledWhileHeld = await settlesWithin(outcome, 2000);
    release();
    await holder;
    const result = await outcome;

    expect(settledWhileHeld).toBe(false);
    // Without the row lock the correction would read the pre-commit row, pass the baseline, diff
    // against the old name and write a spurious application.updated event. With it, the row it
    // sees is the holder's, so the baseline no longer matches.
    expect(result).toBeInstanceOf(ApplicationUpdateError);
    expect((result as ApplicationUpdateError).code).toBe("stale");
    expect(await eventsOf(s, row.id, "application.updated")).toHaveLength(0);
    expect((await readApplication(s, row.id)).applicantName).toBe("Testbewerbung X");
  }, 30_000);
});
