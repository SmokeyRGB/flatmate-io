import { eq } from "drizzle-orm";
import { afterEach, describe, expect, it } from "vitest";
import { withSessionContext } from "@/db/session-context";
import { application } from "@/modules/casting/schema";
import { getApplication, ProfileRequiredError, transitionApplication } from "@/modules/casting/repository";
import { registerTestHousehold, type TestHousehold } from "../../helpers/identity";
import { uuid } from "../../helpers/uuid";

let hh: TestHousehold | undefined;

afterEach(async () => {
  if (hh) await hh.cleanup();
  hh = undefined;
});

// [GUARDED] G-D15 (policy layer) — GUARDRAIL: G-D15 — siehe GUARDRAILS.md / ADR-014.
// openspec application-requires-resident-profile, design Decision 4: a household-account session
// (no resident profile acting) gets no Application data through the repository, and a refusal
// carries its own error rather than arriving as "Application not found" once RLS hides the row.
describe("[GUARDED] G-D15: no Application is visible or writable without a resident profile (policy layer)", () => {
  it("getApplication returns null, transitionApplication refuses with ProfileRequiredError, and nothing changes", async () => {
    hh = await registerTestHousehold();
    const residentProfileId = uuid();
    const residentContext = { ...hh.context, profileId: residentProfileId };

    const [seed] = await withSessionContext(residentContext, (tx) =>
      tx
        .insert(application)
        .values({
          householdId: hh!.householdId,
          state: "new",
          createdByAccountId: hh!.accountId,
          createdByProfileId: residentProfileId,
        })
        .returning(),
    );

    // hh.context.profileId is already null (a household-account session).
    const seenByHousehold = await getApplication(hh.context, seed.id);
    expect(seenByHousehold).toBeNull();

    const actor = { accountId: hh.accountId, profileId: null };
    let caught: unknown;
    try {
      await transitionApplication(hh.context, seed.id, "screened", actor);
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(ProfileRequiredError);
    expect((caught as ProfileRequiredError).code).toBe("profile_required");

    const [afterAttempt] = await withSessionContext(residentContext, (tx) =>
      tx.select().from(application).where(eq(application.id, seed.id)),
    );
    expect(afterAttempt.state).toBe("new");
    expect(afterAttempt.stateChangedAt).toEqual(seed.stateChangedAt);

    // A resident context's getApplication still returns the row.
    const seenByResident = await getApplication(residentContext, seed.id);
    expect(seenByResident).not.toBeNull();
    expect(seenByResident!.id).toBe(seed.id);
  });

  // Decision 6 / tests/helpers/identity.ts cleanupHousehold: the RESTRICTIVE policy would make the
  // application arm of the cleanup CTE a silent no-op under a profile-less context, so
  // cleanupHousehold runs it under a synthetic profile instead. Verified here directly: seed an
  // Application, run hh.cleanup(), and confirm zero application rows remain for the household.
  it("hh.cleanup() removes seeded Application rows despite the new RESTRICTIVE policy", async () => {
    hh = await registerTestHousehold();
    const residentProfileId = uuid();
    const residentContext = { ...hh.context, profileId: residentProfileId };
    const householdId = hh.householdId;

    await withSessionContext(residentContext, (tx) =>
      tx.insert(application).values({
        householdId,
        state: "new",
        createdByAccountId: hh!.accountId,
        createdByProfileId: residentProfileId,
      }),
    );

    await hh.cleanup();
    hh = undefined;

    const remaining = await withSessionContext(
      { accountId: uuid(), householdId, profileId: uuid() },
      (tx) => tx.select().from(application).where(eq(application.householdId, householdId)),
    );
    expect(remaining).toHaveLength(0);
  });

  // Deliberate break, seen failing 2026-09-24: removing the early
  // `if (context.profileId === null) throw new ProfileRequiredError(...)` in
  // transitionApplication makes this test fail on the error CODE, because the RESTRICTIVE policy
  // still hides the row and the function instead throws a plain Error("Application not found")
  // ("expected Error: Application not found: … to be an instance of ProfileRequiredError").
});
