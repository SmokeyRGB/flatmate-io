import { sql } from "drizzle-orm";
import { afterEach, describe, expect, it } from "vitest";
import { withSessionContext } from "@/db/session-context";
import { groupApplicationsByState } from "@/modules/casting/application-groups";
import { listOrganisationApplications } from "@/modules/casting/repository";
import { PermissionDeniedError } from "@/modules/identity/repository";
import { insertTestRound } from "../../helpers/applications";
import { cleanupAll, deleteTestAccount, type TestHousehold } from "../../helpers/identity";
import {
  claimPlainMember,
  insertApplicationAt,
  settlesWithin,
  setupPipeline,
} from "../../helpers/pipeline";

// F3 change 3 (application-pipeline), design D1, tasks 4.4. The list read follows the detail's
// rule: permission held through the read, own household and own round only, no message and no
// attributes.
const households: TestHousehold[] = [];
const accountIds: string[] = [];

afterEach(async () => {
  await cleanupAll(...accountIds.map(deleteTestAccount), ...households.map((h) => h.cleanup()));
  accountIds.length = 0;
  households.length = 0;
});

describe("listOrganisationApplications (AC-3.13)", () => {
  it("(a) a moderator sees the round's rows grouped by state, with the ids exact", async () => {
    const s = await setupPipeline(households);
    const n1 = await insertApplicationAt(s, "new");
    const sc = await insertApplicationAt(s, "screened");
    const n2 = await insertApplicationAt(s, "new");

    const rows = await listOrganisationApplications(s.moderator.context, s.roundId);
    expect(rows).not.toBeNull();
    expect(rows!.map((r) => r.id).sort()).toEqual([n1.id, sc.id, n2.id].sort());

    const groups = groupApplicationsByState(rows!);
    expect(groups.map((g) => [g.state, g.count])).toEqual([
      ["new", 2],
      ["screened", 1],
    ]);
    expect(groups[0].rows.map((r) => r.id).sort()).toEqual([n1.id, n2.id].sort());
    expect(groups[1].rows.map((r) => r.id)).toEqual([sc.id]);
    // The most recently captured application comes first within the list.
    const [first, second] = rows!.filter((r) => r.state === "new");
    expect(first.createdAt.getTime()).toBeGreaterThanOrEqual(second.createdAt.getTime());
  });

  it("(b) rows of another round of the same household are absent", async () => {
    const s = await setupPipeline(households);
    const mine = await insertApplicationAt(s, "new");
    const otherRound = await withSessionContext(s.moderator.context, (tx) =>
      insertTestRound(tx, s.hh.householdId, "draft"),
    );
    const elsewhere = await insertApplicationAt(s, "new", {}, otherRound);

    const rows = await listOrganisationApplications(s.moderator.context, s.roundId);
    expect(rows!.map((r) => r.id)).toEqual([mine.id]);
    const other = await listOrganisationApplications(s.moderator.context, otherRound);
    expect(other!.map((r) => r.id)).toEqual([elsewhere.id]);
  });

  // INVARIANT GUARD, no break: RLS hides another household's rows whatever the predicate says.
  it("(c) a round id of another household returns an empty list", async () => {
    const s = await setupPipeline(households);
    const other = await setupPipeline(households);
    await insertApplicationAt(other, "new");

    const rows = await listOrganisationApplications(s.moderator.context, other.roundId);
    expect(rows).toEqual([]);
  });

  it("(d) a plain resident is refused with PermissionDeniedError", async () => {
    const s = await setupPipeline(households);
    const member = await claimPlainMember(s.hh, "PlainMember", accountIds);
    await insertApplicationAt(s, "new");

    let caught: unknown;
    try {
      await listOrganisationApplications(member.context, s.roundId);
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(PermissionDeniedError);
  });

  it("(e) a malformed round id returns null", async () => {
    const s = await setupPipeline(households);
    expect(await listOrganisationApplications(s.moderator.context, "not-a-uuid")).toBeNull();
    expect(await listOrganisationApplications(s.moderator.context, "")).toBeNull();
  });

  it("(f) the result carries no message and no attributes, only the columns the list shows", async () => {
    const s = await setupPipeline(households);
    await insertApplicationAt(s, "new", {
      messageRaw: "Vertrauliche Nachricht",
      attributes: [{ label: "Beruf", value: "Testberuf" }],
      contactEmail: "bewerbung@example.test",
    });

    const rows = await listOrganisationApplications(s.moderator.context, s.roundId);
    expect(rows).toHaveLength(1);
    expect(Object.keys(rows![0]).sort()).toEqual(
      ["age", "applicantName", "collectedFrom", "contactEmail", "contactOther", "contactPhone", "createdAt", "id", "state"].sort(),
    );
    expect(rows![0]).not.toHaveProperty("messageRaw");
    expect(rows![0]).not.toHaveProperty("attributes");
    expect(JSON.stringify(rows![0])).not.toContain("Vertrauliche");
  });

  it("(g) a revocation in flight is waited for, and the read is then refused", async () => {
    const s = await setupPipeline(households);
    await insertApplicationAt(s, "new");

    let markLocked!: () => void;
    const locked = new Promise<void>((resolve) => (markLocked = resolve));
    let release!: () => void;
    const gate = new Promise<void>((resolve) => (release = resolve));

    // A stands in for a concurrent revocation: one UPDATE that revokes the membership and clears
    // its role and permissions (drizzle/0024 requires all three), held uncommitted.
    const revoking = withSessionContext(s.hh.context, async (tx) => {
      await tx.execute(
        sql`UPDATE membership SET revoked_at = now(), role = 'member', permissions = '{}'::text[]
            WHERE account_id = ${s.moderator.accountId}::uuid`,
      );
      markLocked();
      await gate;
    });
    await locked;

    const read = listOrganisationApplications(s.moderator.context, s.roundId);
    const outcome = read.then(() => "resolved" as const, (e: unknown) => e);
    // While A is uncommitted the read must not have decided (FOR SHARE waits for A's row lock).
    const settledWhileHeld = await settlesWithin(outcome, 2000);
    release();
    await revoking;
    const result = await outcome;

    expect(settledWhileHeld).toBe(false);
    expect(result).toBeInstanceOf(PermissionDeniedError);
  }, 30_000);
});
