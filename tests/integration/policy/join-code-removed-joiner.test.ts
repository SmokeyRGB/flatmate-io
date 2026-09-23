import { eq } from "drizzle-orm";
import { afterEach, describe, expect, it } from "vitest";
import { withSessionContext } from "@/db/session-context";
import { joinHousehold } from "@/modules/identity/auth";
import { deleteJoinCode, issueJoinCode, listJoinCodeIssuances, removeMember } from "@/modules/identity/repository";
import { joinCodeIssuance } from "@/modules/identity/schema";
import {
  cleanupAll,
  deleteTestAccount,
  registerTestHousehold,
  type TestHousehold,
} from "../../helpers/identity";

let hh: TestHousehold | undefined;
const accountIds: string[] = [];

afterEach(async () => {
  await cleanupAll(...accountIds.map(deleteTestAccount), hh?.cleanup());
  accountIds.length = 0;
  hh = undefined;
});

async function findIssuance(hh: TestHousehold, issuanceId: string) {
  const issuances = await listJoinCodeIssuances(hh.context, hh.accountId);
  const found = issuances.find((i) => i.id === issuanceId);
  if (!found) throw new Error(`issuance ${issuanceId} not found`);
  return found;
}

// design.md Decision 9 (human decision, 2026-09-22): a removed joiner is not named under their
// link, but the link that let them in carries a caution until it is deleted.
describe("The join-code list flags a link a removed member joined through", () => {
  it("omits a removed joiner's name but keeps the use count, and flags the link", async () => {
    hh = await registerTestHousehold();
    const link = await issueJoinCode(hh.context, hh.accountId, { validDays: 7, maxUses: 2 });

    const joiner = await joinHousehold(link.code, {
      displayName: "SoonRemoved",
      password: "test-password-not-real-1234",
      email: "",
    });
    accountIds.push(joiner.context.accountId);

    let issuance = await findIssuance(hh, link.id);
    expect(issuance.joinedResidentNames).toEqual(["SoonRemoved"]);
    expect(issuance.hasRemovedJoiner).toBe(false);

    await removeMember(hh.context, hh.accountId, joiner.context.accountId, "SoonRemoved");

    issuance = await findIssuance(hh, link.id);
    expect(issuance.joinedResidentNames).toEqual([]); // not named any more
    expect(issuance.hasRemovedJoiner).toBe(true);
    expect(issuance.uses).toBe(1); // the removal does not touch the link's use count
  });

  // design.md Decision 9 (revised 2026-09-23): hasRemovedJoiner is the repository's raw fact and
  // stays true regardless of the link's state — it is join-code-state.ts's
  // removedJoinerCautionApplies (unit-tested in tests/unit/identity/join-code-state.test.ts) that
  // now decides whether the UI actually shows the caution, and it requires "live", not merely
  // "expired but not deleted". This test only exercises the repository-level fact.
  it("still flags the link once it has expired (the repository fact, not the display condition)", async () => {
    hh = await registerTestHousehold();
    const link = await issueJoinCode(hh.context, hh.accountId, { validDays: 7, maxUses: 1 });

    const joiner = await joinHousehold(link.code, {
      displayName: "ExpiredLinkJoiner",
      password: "test-password-not-real-1234",
      email: "",
    });
    accountIds.push(joiner.context.accountId);
    await removeMember(hh.context, hh.accountId, joiner.context.accountId, "ExpiredLinkJoiner");

    // Force the link into the past directly — extendJoinCode only ever adds days.
    await withSessionContext(hh.context, (tx) =>
      tx
        .update(joinCodeIssuance)
        .set({ expiresAt: new Date(Date.now() - 60_000) })
        .where(eq(joinCodeIssuance.id, link.id)),
    );

    const issuance = await findIssuance(hh, link.id);
    expect(issuance.expiresAt.getTime()).toBeLessThan(Date.now());
    expect(issuance.hasRemovedJoiner).toBe(true);
  });

  it("no longer flags the link once it is deleted", async () => {
    hh = await registerTestHousehold();
    const link = await issueJoinCode(hh.context, hh.accountId, { validDays: 7, maxUses: 1 });

    const joiner = await joinHousehold(link.code, {
      displayName: "DeletedLinkJoiner",
      password: "test-password-not-real-1234",
      email: "",
    });
    accountIds.push(joiner.context.accountId);
    await removeMember(hh.context, hh.accountId, joiner.context.accountId, "DeletedLinkJoiner");

    let issuance = await findIssuance(hh, link.id);
    expect(issuance.hasRemovedJoiner).toBe(true);

    await deleteJoinCode(hh.context, hh.accountId, link.id);

    issuance = await findIssuance(hh, link.id);
    expect(issuance.deletedAt).not.toBeNull();
    expect(issuance.hasRemovedJoiner).toBe(true); // the FACT is unchanged...
    // ...but page.tsx only renders the caution when `removedJoinerCautionApplies` holds (design.md
    // Decision 9, revised 2026-09-23), which requires the link to be LIVE — a deleted link never
    // is. The repository always reports the underlying fact; the UI is what conditions on state.
  });
});
