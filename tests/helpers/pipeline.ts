import { and, eq } from "drizzle-orm";
import { withSessionContext, type SessionContext } from "@/db/session-context";
import { claimResidentProfile } from "@/modules/identity/auth";
import { createResidentProfile } from "@/modules/identity/repository";
import { membership } from "@/modules/identity/schema";
import { activityEvent } from "@/modules/audit/schema";
import { createAndOpenRound, createRoom } from "@/modules/casting/repository";
import { application } from "@/modules/casting/schema";
import { syntheticApplication } from "./applications";
import { createTestModerator, registerTestHousehold, type TestHousehold } from "./identity";

// Shared setup for the F3 change 3 integration tests (application-pipeline): a real household with
// a moderator and one open round, claimed plain residents, direct inserts of an application in any
// state, and the two helpers the deterministic concurrency cases share. G-B1: synthetic data only.
// Teardown stays in each file's afterEach (CLAUDE.md "Tests that can fail"): the caller pushes what
// it needs to clean up onto its own arrays.

export interface PipelineSetup {
  hh: TestHousehold;
  moderator: { context: SessionContext; accountId: string; profileId: string };
  roundId: string;
}

// A household with a moderator and one open round (created through the real path).
export async function setupPipeline(track: TestHousehold[]): Promise<PipelineSetup> {
  const hh = await registerTestHousehold();
  track.push(hh);
  const moderator = await createTestModerator(hh);
  const actor = { accountId: moderator.accountId, profileId: moderator.profileId };
  const room = await createRoom(hh.context, "Room A", { accountId: hh.accountId, profileId: null });
  const round = await createAndOpenRound(moderator.context, "Round", [room.id], actor);
  return { hh, moderator, roundId: round.id };
}

// A claimed plain resident: holds no application permission at all. Its account id goes onto
// `accountIds` so the caller's afterEach deletes the Auth user.
export async function claimPlainMember(hh: TestHousehold, name: string, accountIds: string[]) {
  const profile = await createResidentProfile(hh.context, name, { accountId: hh.accountId, profileId: null });
  const { accountId } = await claimResidentProfile(hh.context, profile.id, "test-password-not-real-1234", "de");
  accountIds.push(accountId);
  return {
    accountId,
    profileId: profile.id,
    context: { accountId, householdId: hh.householdId, profileId: profile.id } as SessionContext,
  };
}

// The matrix's individual grant (a resident holds `change_application_state` by a grant, which is
// legal), by direct SQL through the household context.
export async function grantPermissions(hh: TestHousehold, accountId: string, permissions: string[]) {
  await withSessionContext(hh.context, (tx) =>
    tx.update(membership).set({ permissions }).where(eq(membership.accountId, accountId)),
  );
}

// Inserts an application straight into the table at any state (through the moderator's context).
export async function insertApplicationAt(
  s: PipelineSetup,
  state: (typeof application.$inferInsert)["state"],
  overrides: Partial<typeof application.$inferInsert> = {},
  roundId = s.roundId,
) {
  const [row] = await withSessionContext(s.moderator.context, (tx) =>
    tx
      .insert(application)
      .values(
        syntheticApplication(
          {
            householdId: s.hh.householdId,
            roundId,
            createdByAccountId: s.moderator.accountId,
            createdByProfileId: s.moderator.profileId,
          },
          { state, ...overrides },
        ),
      )
      .returning(),
  );
  return row;
}

export async function readApplication(s: PipelineSetup, id: string) {
  const [row] = await withSessionContext(s.moderator.context, (tx) =>
    tx.select().from(application).where(eq(application.id, id)),
  );
  return row;
}

export async function eventsOf(s: PipelineSetup, subjectId: string, eventType?: string) {
  return withSessionContext(s.moderator.context, (tx) =>
    tx
      .select()
      .from(activityEvent)
      .where(
        eventType
          ? and(eq(activityEvent.subjectId, subjectId), eq(activityEvent.eventType, eventType))
          : eq(activityEvent.subjectId, subjectId),
      ),
  );
}

export const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// True when the promise settles (either way) within `ms`.
export async function settlesWithin(promise: Promise<unknown>, ms: number): Promise<boolean> {
  return Promise.race([promise.then(() => true, () => true), sleep(ms).then(() => false)]);
}

// Holds an open transaction in the household's session until `release()` is called, after running
// `work` inside it (uncommitted). Resolves `started` once `work` has run. The deterministic pattern
// of tests/integration/policy/revoked-membership-sign-in.test.ts: a real concurrent writer whose
// lock the function under test must wait for, instead of relying on the pooler serialising
// one-statement transactions by accident.
export function holdTransaction(
  context: SessionContext,
  work: (tx: Parameters<Parameters<typeof withSessionContext>[1]>[0]) => Promise<void>,
) {
  let markStarted!: () => void;
  const started = new Promise<void>((resolve) => (markStarted = resolve));
  let release!: () => void;
  const gate = new Promise<void>((resolve) => (release = resolve));
  const done = withSessionContext(context, async (tx) => {
    await work(tx);
    markStarted();
    await gate;
  });
  return { started, release, done };
}
