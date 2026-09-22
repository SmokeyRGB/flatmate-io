import { sql } from "drizzle-orm";
import { afterEach, describe, expect, it } from "vitest";
import { withSessionContext } from "@/db/session-context";
import { joinHousehold } from "@/modules/identity/auth";
import { issueJoinCode } from "@/modules/identity/repository";
import { cleanupAll, deleteTestAccount, registerTestHousehold, type TestHousehold } from "../../helpers/identity";
import { uuid } from "../../helpers/uuid";

let hh: TestHousehold | undefined;
let joinerAccountId: string | undefined;

afterEach(async () => {
  await cleanupAll(joinerAccountId ? deleteTestAccount(joinerAccountId) : undefined, hh?.cleanup());
  joinerAccountId = undefined;
  hh = undefined;
});

// G-C7: the join path writes four household-scoped tables (resident_profile, account, membership,
// session) through a route that starts with no session at all — this is the raw-SQL half the
// policy-layer test in join-by-link.test.ts cannot exercise on its own. Same scenario, issued as a
// raw SQL string under the application role with RLS in force from ANOTHER household's session
// context, bypassing this repo's own repository-layer abstraction entirely.
describe("Join-by-link household isolation — raw SQL (G-C7)", () => {
  it("shows none of the joined household's profile, account, membership or session rows to another household", async () => {
    hh = await registerTestHousehold();
    const link = await issueJoinCode(hh.context, hh.accountId, { validDays: 7, maxUses: 1 });

    const result = await joinHousehold(link.code, {
      displayName: "Jonas",
      password: "test-password-not-real-1234",
      email: "",
    });
    joinerAccountId = result.context.accountId;
    const joinedProfileId = result.context.profileId!;
    const joinedAccountId = result.context.accountId;

    // A second, unrelated household's session context — no household row need exist behind it for
    // a bare SELECT to be scoped correctly (household-scoping.test.ts's own precedent).
    const otherHouseholdId = uuid();
    const otherContext = { accountId: uuid(), householdId: otherHouseholdId, profileId: null };

    const [profileRows, accountRows, membershipRows, sessionRows] = await withSessionContext(
      otherContext,
      async (tx) => [
        await tx.execute<{ id: string }>(sql`SELECT id FROM resident_profile WHERE id = ${joinedProfileId}::uuid`),
        await tx.execute<{ id: string }>(sql`SELECT id FROM account WHERE id = ${joinedAccountId}::uuid`),
        await tx.execute<{ id: string }>(sql`SELECT id FROM membership WHERE account_id = ${joinedAccountId}::uuid`),
        await tx.execute<{ id: string }>(sql`SELECT id FROM session WHERE account_id = ${joinedAccountId}::uuid`),
      ],
    );

    expect(profileRows).toHaveLength(0);
    expect(accountRows).toHaveLength(0);
    expect(membershipRows).toHaveLength(0);
    expect(sessionRows).toHaveLength(0);

    // Sanity: the same raw SQL, from the JOINED household's own context, DOES see the rows —
    // proving the emptiness above is RLS scoping, not a broken query.
    const [profileRowsOwn, accountRowsOwn, membershipRowsOwn, sessionRowsOwn] = await withSessionContext(
      hh.context,
      async (tx) => [
        await tx.execute<{ id: string }>(sql`SELECT id FROM resident_profile WHERE id = ${joinedProfileId}::uuid`),
        await tx.execute<{ id: string }>(sql`SELECT id FROM account WHERE id = ${joinedAccountId}::uuid`),
        await tx.execute<{ id: string }>(sql`SELECT id FROM membership WHERE account_id = ${joinedAccountId}::uuid`),
        await tx.execute<{ id: string }>(sql`SELECT id FROM session WHERE account_id = ${joinedAccountId}::uuid`),
      ],
    );
    expect(profileRowsOwn).toHaveLength(1);
    expect(accountRowsOwn).toHaveLength(1);
    expect(membershipRowsOwn).toHaveLength(1);
    expect(sessionRowsOwn).toHaveLength(1);
  });
});
