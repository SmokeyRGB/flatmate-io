import { eq } from "drizzle-orm";
import { afterEach, describe, expect, it } from "vitest";
import { withSessionContext } from "@/db/session-context";
import { claimResidentProfile } from "@/modules/identity/auth";
import {
  createResidentProfile,
  deleteJoinCode,
  extendJoinCode,
  issueJoinCode,
  listJoinCodeIssuances,
  ResidentListActionDeniedError,
} from "@/modules/identity/repository";
import { joinCodeIssuance, membership } from "@/modules/identity/schema";
import {
  cleanupAll,
  deleteTestAccount,
  registerTestHousehold,
  type TestHousehold,
} from "../../helpers/identity";

let hhA: TestHousehold | undefined;
let hhB: TestHousehold | undefined;
const accountIds: string[] = [];

afterEach(async () => {
  await cleanupAll(...accountIds.map(deleteTestAccount), hhA?.cleanup(), hhB?.cleanup());
  accountIds.length = 0;
  hhA = undefined;
  hhB = undefined;
});

// C-2.10/G-C7, policy layer half: the SAME scoping claim as
// tests/integration/raw-sql/join-code-isolation.test.ts, through this repo's own query-builder —
// RLS itself, not the query, must do the filtering (no .where() below narrows by household).
describe("Join code issuance household isolation — policy layer (C-2.10)", () => {
  it("listJoinCodeIssuances under household A's context never returns household B's links", async () => {
    hhA = await registerTestHousehold();
    hhB = await registerTestHousehold();
    const linkB = await issueJoinCode(hhB.context, hhB.accountId, { validDays: 7, maxUses: 1 });

    const issuancesForA = await listJoinCodeIssuances(hhA.context, hhA.accountId);
    expect(issuancesForA.map((i) => i.id)).not.toContain(linkB.id);
    expect(issuancesForA.every((i) => i.householdId === hhA!.householdId)).toBe(true);
  });

  // Both halves of a claim to change another household's link are required: reading (above) and
  // writing (below) — neither a stale nor a scoped id lets a session for household A touch
  // household B's row.
  it("refuses to extend or delete a link belonging to another household", async () => {
    hhA = await registerTestHousehold();
    hhB = await registerTestHousehold();
    const linkB = await issueJoinCode(hhB.context, hhB.accountId, { validDays: 7, maxUses: 1 });

    await expect(extendJoinCode(hhA.context, hhA.accountId, linkB.id)).rejects.toThrow();
    await expect(deleteJoinCode(hhA.context, hhA.accountId, linkB.id)).rejects.toThrow();

    const [rowAfter] = await withSessionContext(hhB.context, (tx) =>
      tx.select().from(joinCodeIssuance).where(eq(joinCodeIssuance.id, linkB.id)),
    );
    expect(rowAfter.deletedAt).toBeNull();
    expect(rowAfter.expiresAt.getTime()).toBe(linkB.expiresAt.getTime());
  });
});

// FR-1.27/U-30 parity: administration and moderator are both allowed; a plain member is refused
// entirely — "not reachable at all, by any route" — for every one of the four join-code actions.
describe("Join code moderator boundary (FR-1.27/U-30)", () => {
  it("refuses a plain member and allows administration and a moderator", async () => {
    hhA = await registerTestHousehold();
    const actor = { accountId: hhA.accountId, profileId: null };

    const modProfile = await createResidentProfile(hhA.context, "Moderator", actor);
    const { accountId: modAccountId } = await claimResidentProfile(
      hhA.context,
      modProfile.id,
      "test-password-not-real-1234",
    );
    accountIds.push(modAccountId);
    await withSessionContext(hhA.context, (tx) =>
      tx.update(membership).set({ role: "moderator" }).where(eq(membership.accountId, modAccountId)),
    );

    const memberProfile = await createResidentProfile(hhA.context, "PlainMember", actor);
    const { accountId: memberAccountId } = await claimResidentProfile(
      hhA.context,
      memberProfile.id,
      "test-password-not-real-1234",
    );
    accountIds.push(memberAccountId);

    // Administration (the household account itself) and the moderator both succeed.
    const asAdminLink = await issueJoinCode(hhA.context, hhA.accountId, { validDays: 7, maxUses: 1 });
    const asModeratorLink = await issueJoinCode(hhA.context, modAccountId, { validDays: 7, maxUses: 1 });
    await expect(listJoinCodeIssuances(hhA.context, hhA.accountId)).resolves.not.toThrow();
    await expect(listJoinCodeIssuances(hhA.context, modAccountId)).resolves.not.toThrow();
    await expect(extendJoinCode(hhA.context, modAccountId, asAdminLink.id)).resolves.not.toThrow();
    await expect(deleteJoinCode(hhA.context, hhA.accountId, asModeratorLink.id)).resolves.not.toThrow();

    // A plain member is refused by all four actions.
    await expect(
      issueJoinCode(hhA.context, memberAccountId, { validDays: 7, maxUses: 1 }),
    ).rejects.toThrow(ResidentListActionDeniedError);
    await expect(listJoinCodeIssuances(hhA.context, memberAccountId)).rejects.toThrow(
      ResidentListActionDeniedError,
    );
    await expect(extendJoinCode(hhA.context, memberAccountId, asAdminLink.id)).rejects.toThrow(
      ResidentListActionDeniedError,
    );
    await expect(deleteJoinCode(hhA.context, memberAccountId, asAdminLink.id)).rejects.toThrow(
      ResidentListActionDeniedError,
    );
  });
});
