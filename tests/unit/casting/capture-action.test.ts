import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// design D4/D6 and the spec's "a refusal never echoes what was typed": the server action returns
// only { status, code, field? } and logs at most { code, sqlState, constraint }. The repository is
// mocked to throw each error class; a distinct sentinel sits in every submitted field, and neither
// the returned state nor anything logged may contain one.
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

const captureApplication = vi.hoisted(() => vi.fn());
vi.mock("@/modules/casting/repository", async () => {
  const actual = await vi.importActual<typeof import("@/modules/casting/repository")>(
    "@/modules/casting/repository",
  );
  return { ...actual, captureApplication };
});

const { captureApplicationAction } = await import("@/app/(org)/rounds/[id]/applications/new/actions");
const { ApplicationCaptureError, ApplicationWriteError, ProfileRequiredError } = await import(
  "@/modules/casting/repository"
);
const { ApplicationInputError } = await import("@/modules/casting/application-input");
const { PermissionDeniedError } = await import("@/modules/identity/repository");

const ROUND_ID = "33333333-3333-3333-3333-333333333333";
const CREATED_ID = "55555555-5555-5555-5555-555555555555";

const SENTINELS = {
  applicantName: "SENTINEL-NAME-c0ffee",
  age: "SENTINEL-AGE-1",
  contactEmail: "SENTINEL-EMAIL-c0ffee@example.test",
  contactPhone: "SENTINEL-PHONE-c0ffee",
  contactOther: "SENTINEL-OTHER-c0ffee",
  messageRaw: "SENTINEL-MESSAGE-c0ffee",
  attrLabel: "SENTINEL-ATTRLABEL-c0ffee",
  attrValue: "SENTINEL-ATTRVALUE-c0ffee",
};

function formData(collectedFrom = "data_subject"): FormData {
  const fd = new FormData();
  fd.set("roundId", ROUND_ID);
  fd.set("applicantName", SENTINELS.applicantName);
  fd.set("age", SENTINELS.age);
  fd.set("contactEmail", SENTINELS.contactEmail);
  fd.set("contactPhone", SENTINELS.contactPhone);
  fd.set("contactOther", SENTINELS.contactOther);
  fd.set("messageRaw", SENTINELS.messageRaw);
  fd.append("attrLabel", SENTINELS.attrLabel);
  fd.append("attrValue", SENTINELS.attrValue);
  fd.set("collectedFrom", collectedFrom);
  return fd;
}

const idle = { status: "idle" } as const;
let logged: unknown[][] = [];

beforeEach(() => {
  logged = [];
  captureApplication.mockReset();
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

describe("captureApplicationAction: only a code and at most a field ever come back", () => {
  const cases: [string, () => Error, Record<string, unknown>][] = [
    [
      "an input refusal",
      () => new ApplicationInputError("name_required", "applicantName"),
      { status: "error", code: "name_required", field: "applicantName" },
    ],
    [
      "a too-long field",
      () => new ApplicationInputError("too_long", "messageRaw"),
      { status: "error", code: "too_long", field: "messageRaw" },
    ],
    ["a missing permission", () => new PermissionDeniedError("create_application"), { status: "error", code: "permission_denied" }],
    ["a profile-less session", () => new ProfileRequiredError("captureApplication"), { status: "error", code: "profile_required" }],
    ["a closed round", () => new ApplicationCaptureError("round_not_open"), { status: "error", code: "round_not_open" }],
    ["an unknown round", () => new ApplicationCaptureError("round_not_found"), { status: "error", code: "round_not_found" }],
    [
      "a database refusal",
      () => new ApplicationWriteError("23514", "application_age_range"),
      { status: "error", code: "save_failed" },
    ],
    [
      "an unexpected error whose message carries every typed value",
      () => new Error(`Failed query: insert ... params: ${Object.values(SENTINELS).join(", ")}`),
      { status: "error", code: "save_failed" },
    ],
  ];

  for (const [label, makeError, expected] of cases) {
    it(`${label}: the state is exactly { status, code, field? }, with no submitted value in it or in any log`, async () => {
      captureApplication.mockRejectedValue(makeError());
      const state = await captureApplicationAction(idle, formData());
      expect(state).toEqual(expected);
      expectNoSentinel(state);
      expectNoSentinel(logged);
    });
  }

  it("a database refusal logs at most { code, sqlState, constraint }", async () => {
    captureApplication.mockRejectedValue(new ApplicationWriteError("23514", "application_age_range"));
    await captureApplicationAction(idle, formData());
    expect(logged).toEqual([[{ code: "db_refused", sqlState: "23514", constraint: "application_age_range" }]]);
  });

  it("passes the raw input on to the repository, and lets it decide", async () => {
    captureApplication.mockRejectedValue(new ApplicationCaptureError("round_not_open"));
    await captureApplicationAction(idle, formData("third_party"));
    expect(captureApplication).toHaveBeenCalledTimes(1);
    const [, input] = captureApplication.mock.calls[0];
    expect(input).toMatchObject({ roundId: ROUND_ID, collectedFrom: "third_party" });
    expect(input.attributes).toEqual([{ label: SENTINELS.attrLabel, value: SENTINELS.attrValue }]);
  });
});

describe("captureApplicationAction: where a saved capture lands", () => {
  it("data_subject returns to the round with the success notice", async () => {
    captureApplication.mockResolvedValue({ id: CREATED_ID });
    await expect(captureApplicationAction(idle, formData("data_subject"))).rejects.toMatchObject({
      target: `/rounds/${ROUND_ID}?saved=1`,
    });
  });

  it("third_party lands on the application's detail, where the duty and text are", async () => {
    captureApplication.mockResolvedValue({ id: CREATED_ID });
    await expect(captureApplicationAction(idle, formData("third_party"))).rejects.toMatchObject({
      target: `/rounds/${ROUND_ID}/applications/${CREATED_ID}`,
    });
  });

  it("a redirect is not swallowed as an error: it is thrown outside the try/catch", async () => {
    captureApplication.mockResolvedValue({ id: CREATED_ID });
    await expect(captureApplicationAction(idle, formData())).rejects.toBeInstanceOf(RedirectSignal);
    expect(logged).toEqual([]);
  });
});
