import { eq } from "drizzle-orm";
import { afterEach, describe, expect, it } from "vitest";
import { withSessionContext } from "@/db/session-context";
import { ProfileRequiredError } from "@/modules/casting/repository";
import { castVote, getAwaitingVoteCounts, getScreeningPass, VoteError } from "@/modules/deliberation/repository";
import { membership } from "@/modules/identity/schema";
import { cleanupAll, createNonResidentModerator, deleteTestAccount, type TestHousehold } from "../../helpers/identity";
import {
  claimPlainMember,
  holdTransaction,
  insertApplicationAt,
  setupPipeline,
  settlesWithin,
} from "../../helpers/pipeline";
import { readVotes, thrownBy } from "../../helpers/votes";

const households: TestHousehold[] = [];
const accountIds: string[] = [];

afterEach(async () => {
  await cleanupAll(...accountIds.map(deleteTestAccount), ...households.map((h) => h.cleanup()));
  accountIds.length = 0;
  households.length = 0;
});

// Strips the stored `vote` from a live resident membership by direct SQL as the household account:
// legal until the contract migration makes the resident set's floor `vote`. This is what a row
// written by old code (a join or claim from a branch without F3 change 2b) looks like.
async function stripVote(hh: TestHousehold, accountId: string) {
  await withSessionContext(hh.context, (tx) =>
    tx.update(membership).set({ permissions: [] }).where(eq(membership.accountId, accountId)),
  );
}

// AC-1.5/FR-1.7: the household account cannot cast a vote, by any route the repository exposes.
// Tested on the real path, castVote: the stored permission `vote` (the resident set, F3 change 2b)
// is checked inside its insert transaction. `vote` is held by a resident membership only — the
// household account and a moderator without a resident profile hold none.
describe("Only a membership holding vote can vote (FR-1.7, F3 change 2b)", () => {
  it("the household account is refused castVote, the deck and the count: it has no resident profile", async () => {
    const s = await setupPipeline(households);
    const app = await insertApplicationAt(s, "new");

    await expect(
      castVote(s.hh.context, { roundId: s.roundId, applicationId: app.id, value: "good" }),
    ).rejects.toThrow(ProfileRequiredError);
    await expect(getScreeningPass(s.hh.context, null)).rejects.toThrow(ProfileRequiredError);
    expect((await getAwaitingVoteCounts(s.hh.context)).size).toBe(0);
  });

  it("a moderator without a resident profile is refused castVote and given no deck", async () => {
    const s = await setupPipeline(households);
    const app = await insertApplicationAt(s, "new");
    const nonResident = await createNonResidentModerator(s.hh);

    await expect(
      castVote(nonResident.context, { roundId: s.roundId, applicationId: app.id, value: "good" }),
    ).rejects.toThrow(ProfileRequiredError);
    await expect(getScreeningPass(nonResident.context, null)).rejects.toThrow(ProfileRequiredError);
    expect((await getAwaitingVoteCounts(nonResident.context)).size).toBe(0);
    expect(await readVotes(s.moderator.context, app.id)).toHaveLength(0);
  });

  it("a plain resident and a resident moderator both vote", async () => {
    const s = await setupPipeline(households);
    const app = await insertApplicationAt(s, "new");
    const resident = await claimPlainMember(s.hh, "Voter", accountIds);

    await castVote(resident.context, { roundId: s.roundId, applicationId: app.id, value: "good" });
    // s.moderator is a claimed resident appointed moderator: it holds the moderator set AND the
    // resident set, so voting stays independent of moderating (S-04).
    await castVote(s.moderator.context, { roundId: s.roundId, applicationId: app.id, value: "definitely" });
    expect(await readVotes(s.moderator.context, app.id)).toHaveLength(2);
  });

  // Transition case, labelled as such: 0029's resident floor is still empty, so a live resident row
  // without `vote` (what old-code joins write) is accepted by the database; the gate then refuses
  // it. The contract migration makes the row itself impossible.
  it("transition: a live resident row without vote is refused not_eligible, and records nothing", async () => {
    const s = await setupPipeline(households);
    const app = await insertApplicationAt(s, "new");
    const resident = await claimPlainMember(s.hh, "Stripped", accountIds);
    await stripVote(s.hh, resident.accountId);

    const err = await thrownBy(() =>
      castVote(resident.context, { roundId: s.roundId, applicationId: app.id, value: "good" }),
    );
    expect(err).toBeInstanceOf(VoteError);
    expect((err as VoteError).code).toBe("not_eligible");
    expect(await readVotes(s.moderator.context, app.id)).toHaveLength(0);
    // the two deck reads agree
    expect(await getScreeningPass(resident.context, null)).toEqual({ kind: "refused", reason: "not_eligible" });
    expect((await getAwaitingVoteCounts(resident.context)).size).toBe(0);
  });

  // In flight: the household strips `vote` in a held, uncommitted transaction (the profile stays
  // active and the participation intact, so vote_guard alone would let the vote through). castVote
  // takes FOR SHARE on the voter's membership inside its transaction, so it waits for that writer
  // and, once it commits, is refused. A held move-out would not do: vote_guard step 4 locks the
  // profile and refuses anyway, which makes that variant an invariant guard, not a regression test.
  // The 2 s wait is timing evidence; the break (the vote check before the transaction, an unlocked
  // read) records the vote.
  it("in flight: a vote waits for a held removal of its vote permission, then is refused not_eligible", async () => {
    const s = await setupPipeline(households);
    const app = await insertApplicationAt(s, "new");
    const resident = await claimPlainMember(s.hh, "InFlight", accountIds);

    const held = holdTransaction(s.hh.context, async (tx) => {
      await tx.update(membership).set({ permissions: [] }).where(eq(membership.accountId, resident.accountId));
    });
    await held.started;
    const attempt = castVote(resident.context, { roundId: s.roundId, applicationId: app.id, value: "good" }).then(
      () => null as null | unknown,
      (e: unknown) => e,
    );
    // Capture the timing result, release and await the held transaction, and only then assert: a
    // failed assertion must not leave the uncommitted UPDATE blocking afterEach cleanup.
    const settledWhileHeld = await settlesWithin(attempt, 2000);
    held.release();
    await held.done;
    expect(settledWhileHeld).toBe(false);
    const err = await attempt;
    expect(err).toBeInstanceOf(VoteError);
    expect((err as VoteError).code).toBe("not_eligible");
    expect(await readVotes(s.moderator.context, app.id)).toHaveLength(0);
  });
});
