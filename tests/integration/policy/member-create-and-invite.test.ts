import { afterEach, describe, expect, it, vi } from "vitest";
import { type SessionContext } from "@/db/session-context";
import { getResidentList, listJoinCodeIssuances } from "@/modules/identity/repository";
import { cleanupAll, registerTestHousehold, type TestHousehold } from "../../helpers/identity";

// organisation-task-list D8 / spec identity/member-administration "Adding a resident offers their
// invitation at once": the create-profile action issues the new profile's single-use bound link as a
// second, separate repository call, for a caller holding manage_join_codes.
vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const session = vi.hoisted(() => ({ context: null as null | SessionContext }));
vi.mock("@/modules/identity/session-cookie", () => ({
  getCurrentSession: vi.fn(async () => (session.context ? { context: session.context } : null)),
}));

// The real issueJoinCode, behind a spy so a case can make it throw once ("stub the second call").
vi.mock("@/modules/identity/repository", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/modules/identity/repository")>();
  return { ...actual, issueJoinCode: vi.fn(actual.issueJoinCode) };
});

const { createResidentProfileAction } = await import("@/app/(org)/members/actions");
const repository = await import("@/modules/identity/repository");

let hh: TestHousehold | undefined;

afterEach(async () => {
  vi.restoreAllMocks();
  vi.mocked(repository.issueJoinCode).mockClear();
  await cleanupAll(hh?.cleanup());
  hh = undefined;
  session.context = null;
});

async function create(context: SessionContext, name: string) {
  session.context = context;
  const form = new FormData();
  form.set("displayName", name);
  await createResidentProfileAction(form);
}

const boundLinks = async (household: TestHousehold) =>
  (await listJoinCodeIssuances(household.context, household.accountId)).filter(
    (i) => i.residentProfileId !== null,
  );
const profileNames = async (household: TestHousehold) =>
  (await getResidentList(household.context, household.accountId)).members.map((m) => m.displayName);

describe("createResidentProfileAction issues the invitation at once", () => {
  it("the household account creating Alex yields one single-use link bound to Alex", async () => {
    hh = await registerTestHousehold();
    await create(hh.context, "Alex");

    const members = (await getResidentList(hh.context, hh.accountId)).members;
    const alex = members.find((m) => m.displayName === "Alex");
    expect(alex).toBeDefined();
    const links = await boundLinks(hh);
    expect(links).toHaveLength(1);
    expect(links[0]).toMatchObject({ residentProfileId: alex!.id, maxUses: 1, uses: 0, purpose: "join" });
  });

  // "a caller without manage_join_codes gets the profile and no link" is gone: since drizzle/0037 a
  // live moderator always holds manage_join_codes (membership_moderator_holds_role_permissions), so
  // a holder of create_resident_profile without it cannot exist. The database half is the refusal in
  // raw-sql/membership-role-integrity.test.ts ("refuses to take manage_members away from a live
  // moderator": the same constraint, which requires every value of the moderator set); the action's
  // own check stays as defence in depth (members/actions.ts).

  it("the profile survives when issuing the invitation throws", async () => {
    hh = await registerTestHousehold();
    vi.mocked(repository.issueJoinCode).mockRejectedValueOnce(new Error("provider down"));
    const logged = vi.spyOn(console, "error").mockImplementation(() => undefined);

    await expect(create(hh.context, "Alex")).resolves.toBeUndefined();

    expect(await profileNames(hh)).toContain("Alex");
    expect(await boundLinks(hh)).toHaveLength(0);
    expect(logged).toHaveBeenCalled();
  });
});
