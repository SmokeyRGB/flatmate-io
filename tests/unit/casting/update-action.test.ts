import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// F3 change 3 (application-pipeline), design D4/D5: the correction's server action, in the shape of
// capture-action.test.ts. It returns only { status, code, field? }, logs at most
// { code, sqlState, constraint }, and redirects to the detail with ?updated=1 when something changed
// and ?updated=0 when nothing did (human walkthrough, 2026-09-29: a no-op save announced
// „Änderungen gespeichert"). The repository is mocked; a distinct sentinel sits in every submitted
// field, and neither the returned state, nor anything logged, nor a redirect may contain one.
vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({ cookies: vi.fn() }));

class RedirectSignal extends Error {
  constructor(readonly target: string) {
    super("NEXT_REDIRECT");
  }
}
vi.mock("next/navigation", () => ({
  redirect: vi.fn((target: string) => {
    throw new RedirectSignal(target);
  }),
}));

vi.mock("@/modules/identity/session-cookie", () => ({
  getCurrentSession: vi.fn(async () => ({
    context: {
      accountId: "11111111-1111-1111-1111-111111111111",
      householdId: "22222222-2222-2222-2222-222222222222",
      profileId: "44444444-4444-4444-4444-444444444444",
    },
  })),
}));

const updateApplication = vi.hoisted(() => vi.fn());
vi.mock("@/modules/casting/repository", async () => {
  const actual = await vi.importActual<typeof import("@/modules/casting/repository")>(
    "@/modules/casting/repository",
  );
  return { ...actual, updateApplication };
});

const { updateApplicationAction } = await import(
  "@/app/(org)/rounds/[id]/applications/[applicationId]/edit/actions"
);
const { ApplicationUpdateError, ApplicationWriteError, ProfileRequiredError } = await import(
  "@/modules/casting/repository"
);
const { ApplicationInputError } = await import("@/modules/casting/application-input");
const { PermissionDeniedError } = await import("@/modules/identity/repository");

const ROUND_ID = "33333333-3333-3333-3333-333333333333";
const APPLICATION_ID = "55555555-5555-5555-5555-555555555555";
const DETAIL = `/rounds/${ROUND_ID}/applications/${APPLICATION_ID}`;

const SENTINELS = {
  applicantName: "SENTINEL-NAME-c0ffee",
  age: "SENTINEL-AGE-1",
  contactEmail: "SENTINEL-EMAIL-c0ffee@example.test",
  messageRaw: "SENTINEL-MESSAGE-c0ffee",
  attrLabel: "SENTINEL-ATTRLABEL-c0ffee",
  attrValue: "SENTINEL-ATTRVALUE-c0ffee",
};

function formData(): FormData {
  const fd = new FormData();
  fd.set("roundId", ROUND_ID);
  fd.set("applicationId", APPLICATION_ID);
  fd.set("baseline", "0".repeat(64));
  fd.set("applicantName", SENTINELS.applicantName);
  fd.set("age", SENTINELS.age);
  fd.append("contact", SENTINELS.contactEmail);
  fd.set("message", SENTINELS.messageRaw);
  fd.append("attrLabel", SENTINELS.attrLabel);
  fd.append("attrValue", SENTINELS.attrValue);
  fd.set("collectedFrom", "data_subject");
  return fd;
}

const idle = { status: "idle" } as const;
let logged: unknown[][] = [];

beforeEach(() => {
  logged = [];
  updateApplication.mockReset();
  for (const method of ["error", "log", "warn", "info"] as const) {
    vi.spyOn(console, method).mockImplementation((...args: unknown[]) => {
      logged.push(args);
    });
  }
});

afterEach(() => {
  vi.restoreAllMocks();
});

function expectNoSentinel(value: unknown) {
  const text = JSON.stringify(value) ?? "";
  for (const sentinel of Object.values(SENTINELS)) expect(text).not.toContain(sentinel);
}

describe("updateApplicationAction: where a correction lands", () => {
  // Break: always redirect with ?updated=1, and this fails.
  it("a correction that changed nothing lands on the detail with ?updated=0", async () => {
    updateApplication.mockResolvedValue({ changed: [] });
    await expect(updateApplicationAction(idle, formData())).rejects.toMatchObject({
      target: `${DETAIL}?updated=0`,
    });
  });

  it("a correction that changed a field lands on the detail with ?updated=1", async () => {
    updateApplication.mockResolvedValue({ changed: ["messageRaw"] });
    const signal = await updateApplicationAction(idle, formData()).catch((err: unknown) => err);
    expect(signal).toBeInstanceOf(RedirectSignal);
    expect((signal as RedirectSignal).target).toBe(`${DETAIL}?updated=1`);
    expectNoSentinel((signal as RedirectSignal).target);
    expect(logged).toEqual([]);
  });

  it("passes the raw input and the baseline on to the repository", async () => {
    updateApplication.mockResolvedValue({ changed: [] });
    await updateApplicationAction(idle, formData()).catch(() => undefined);
    const [, input] = updateApplication.mock.calls[0];
    expect(input).toMatchObject({ roundId: ROUND_ID, applicationId: APPLICATION_ID, baseline: "0".repeat(64) });
    expect(input.contacts).toEqual([SENTINELS.contactEmail]);
    expect(input.messageRaw).toBe(SENTINELS.messageRaw);
  });
});

describe("updateApplicationAction: only a code and at most a field ever come back", () => {
  const cases: [string, () => Error, Record<string, unknown>][] = [
    [
      "an input refusal",
      () => new ApplicationInputError("name_required", "applicantName"),
      { status: "error", code: "name_required", field: "applicantName" },
    ],
    ["a stale form", () => new ApplicationUpdateError("stale"), { status: "error", code: "stale" }],
    ["an unknown application", () => new ApplicationUpdateError("not_found"), { status: "error", code: "not_found" }],
    ["a missing permission", () => new PermissionDeniedError("create_application"), { status: "error", code: "permission_denied" }],
    ["a profile-less session", () => new ProfileRequiredError("updateApplication"), { status: "error", code: "profile_required" }],
    [
      "a database refusal",
      () => new ApplicationWriteError("23514", "application_age_range"),
      { status: "error", code: "save_failed" },
    ],
    [
      "an unexpected error whose message carries every typed value",
      () => new Error(`Failed query: update ... params: ${Object.values(SENTINELS).join(", ")}`),
      { status: "error", code: "save_failed" },
    ],
  ];

  for (const [label, makeError, expected] of cases) {
    it(`${label}: the state is exactly { status, code, field? }, with no submitted value in it or in any log`, async () => {
      updateApplication.mockRejectedValue(makeError());
      const state = await updateApplicationAction(idle, formData());
      expect(state).toEqual(expected);
      expectNoSentinel(state);
      expectNoSentinel(logged);
    });
  }
});
