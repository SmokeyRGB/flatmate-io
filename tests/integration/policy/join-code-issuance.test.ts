import { eq } from "drizzle-orm";
import { afterEach, describe, expect, it } from "vitest";
import { withSessionContext } from "@/db/session-context";
import {
  claimJoinCode,
  deleteJoinCode,
  extendJoinCode,
  issueJoinCode,
  listJoinCodeIssuances,
} from "@/modules/identity/repository";
import { membership } from "@/modules/identity/schema";
import { cleanupAll, registerTestHousehold, type TestHousehold } from "../../helpers/identity";

let hh: TestHousehold | undefined;

afterEach(async () => {
  await cleanupAll(hh?.cleanup());
  hh = undefined;
});

describe("Join code issuance lifecycle (FR-2.1/FR-2.5 as amended)", () => {
  // AC-2.22: two links with different limits coexist, each judged against its own count.
  it("lets two links coexist with different limits, neither affecting the other's count", async () => {
    hh = await registerTestHousehold();
    const linkA = await issueJoinCode(hh.context, hh.accountId, { validDays: 7, maxUses: 1 });
    const linkB = await issueJoinCode(hh.context, hh.accountId, { validDays: 14, maxUses: 5 });

    expect(linkA.code).not.toBe(linkB.code);

    const claimed = await claimJoinCode(linkA.code);
    expect(claimed?.issuanceId).toBe(linkA.id);

    const issuances = await listJoinCodeIssuances(hh.context, hh.accountId);
    const rowA = issuances.find((i) => i.id === linkA.id);
    const rowB = issuances.find((i) => i.id === linkB.id);
    expect(rowA?.uses).toBe(1);
    expect(rowA?.maxUses).toBe(1);
    expect(rowB?.uses).toBe(0); // untouched by A's redemption
    expect(rowB?.maxUses).toBe(5);
  });

  // AC-2.23: deleting one link refuses it, leaves the household's other links usable, and leaves
  // memberships already created through it untouched — deleting is not the same as forgetting.
  it("deletes one link without disturbing the other link or memberships already created through it", async () => {
    hh = await registerTestHousehold();
    const linkA = await issueJoinCode(hh.context, hh.accountId, { validDays: 7, maxUses: 5 });
    const linkB = await issueJoinCode(hh.context, hh.accountId, { validDays: 7, maxUses: 5 });

    // Simulate a membership that joined through linkA (the actual join route is change 2's scope
    // — this only proves deleteJoinCode does not cascade into membership).
    const [existingMembership] = await withSessionContext(hh.context, (tx) =>
      tx.select().from(membership).where(eq(membership.accountId, hh!.accountId)),
    );
    await withSessionContext(hh.context, (tx) =>
      tx.update(membership).set({ joinedViaIssuanceId: linkA.id }).where(eq(membership.id, existingMembership.id)),
    );

    await deleteJoinCode(hh.context, hh.accountId, linkA.id);

    expect(await claimJoinCode(linkA.code)).toBeNull(); // refused
    expect((await claimJoinCode(linkB.code))?.issuanceId).toBe(linkB.id); // untouched

    const [membershipAfter] = await withSessionContext(hh.context, (tx) =>
      tx.select().from(membership).where(eq(membership.id, existingMembership.id)),
    );
    expect(membershipAfter.joinedViaIssuanceId).toBe(linkA.id); // untouched, not revoked
    expect(membershipAfter.revokedAt).toBeNull();

    const issuances = await listJoinCodeIssuances(hh.context, hh.accountId);
    const rowA = issuances.find((i) => i.id === linkA.id);
    expect(rowA?.deletedAt).not.toBeNull(); // stays visible in history, just marked
  });

  // O-15: "mit einem Tippen verlängerbar" — adds seven days, changes nothing else about the link.
  it("extending a link adds seven days and changes nothing else", async () => {
    hh = await registerTestHousehold();
    const link = await issueJoinCode(hh.context, hh.accountId, { validDays: 7, maxUses: 3 });

    const extended = await extendJoinCode(hh.context, hh.accountId, link.id);

    expect(extended.id).toBe(link.id);
    expect(extended.code).toBe(link.code);
    expect(extended.maxUses).toBe(link.maxUses);
    expect(extended.uses).toBe(link.uses);
    expect(extended.expiresAt.getTime()).toBe(link.expiresAt.getTime() + 7 * 24 * 60 * 60 * 1000);
  });

  // task 2.5/test 4.4: the founding link registerHousehold mints — exactly one, max 1, count 0,
  // expiring seven days out, minted through the same path issueJoinCode uses (not a bespoke
  // randomUUID()).
  it("gives a newly registered household exactly one link: max 1, count 0, expiring in 7 days", async () => {
    hh = await registerTestHousehold();

    const issuances = await listJoinCodeIssuances(hh.context, hh.accountId);
    expect(issuances).toHaveLength(1);
    const [founding] = issuances;
    expect(founding.maxUses).toBe(1);
    expect(founding.uses).toBe(0);
    expect(founding.deletedAt).toBeNull();

    const days = (founding.expiresAt.getTime() - founding.createdAt.getTime()) / (24 * 60 * 60 * 1000);
    expect(days).toBeCloseTo(7, 1);
  });
});
