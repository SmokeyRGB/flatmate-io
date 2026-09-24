import { eq } from "drizzle-orm";
import { afterEach, describe, expect, it, vi } from "vitest";
import { signIn } from "@/modules/identity/auth";
import { issueJoinCode, session } from "@/modules/identity/repository";
import { withSessionContext, type SessionContext } from "@/db/session-context";
import { registerTestHousehold } from "../../helpers/identity";

// Established precedent (CLAUDE.md, join-code-never-in-query-or-log.test.ts): mock next/headers
// and next/navigation, never the DB or Supabase Auth calls themselves — this test hits the real
// flatmate-io-dev project for registration, sign-in and the revocation itself. session-cookie.ts's
// own `import "server-only"` has no effect outside a real Next server build, but the package isn't
// installed as a dependency here, so it must be stubbed for the module graph to resolve under
// vitest (same precedent as join-code-never-in-query-or-log.test.ts).
vi.mock("server-only", () => ({}));
// redirect() throws to end execution in a real Next request (design.md's own "redirect() OUTSIDE
// the try" reasoning) — the mock must do the same, or a broken implementation that redirects twice
// (task 7.6's second break) would run its SECOND, correct redirect() call right after the first,
// wrong one, and toHaveBeenCalledWith would find that second call and hide the break.
vi.mock("next/navigation", () => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`REDIRECT:${url}`);
  }),
}));

let cookieValue: string | undefined;
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: () => (cookieValue === undefined ? undefined : { value: cookieValue }),
    set: () => {},
    delete: () => {
      cookieValue = undefined;
    },
  }),
}));

const { redirect } = await import("next/navigation");
const { signOutAndReturnAction } = await import("@/app/(auth)/join/[code]/actions");

// The fixed password tests/helpers/identity.ts registers every test household with.
const TEST_PASSWORD = "test-password-not-real-1234";

function formDataWithCode(code: string): FormData {
  const fd = new FormData();
  fd.set("code", code);
  return fd;
}

async function readSession(context: SessionContext, sessionId: string) {
  return withSessionContext(context, async (tx) => {
    const [row] = await tx.select().from(session).where(eq(session.id, sessionId));
    return row ?? null;
  });
}

// design.md Decision 7 (EC-2.5's Keine-Berechtigung way forward, I3): signing out here ends ONLY
// the caller's own session — enforced by revokeSession itself, never by this action — and the
// cookie is always cleared, whether or not the body's code turns out to be well-formed.
describe("signOutAndReturnAction", () => {
  let cleanupTasks: Array<() => Promise<void>> = [];

  afterEach(async () => {
    cookieValue = undefined;
    vi.mocked(redirect).mockClear();
    const tasks = cleanupTasks;
    cleanupTasks = [];
    for (const task of tasks) {
      await task();
    }
  });

  it("revokes only the presented session, leaves the other untouched, and redirects to the same invitation", async () => {
    // registerTestHousehold (not bare registerHousehold): it is tracked in-flight, so a registration
    // that outlives the test timeout is still caught by tests/setup.ts's global sweep.
    const hh = await registerTestHousehold();
    cleanupTasks.push(hh.cleanup);
    const { context, email } = hh;
    const household = { id: hh.householdId };
    const password = TEST_PASSWORD;

    const signInA = await signIn({ kind: "household", email, password });
    const signInB = await signIn({ kind: "household", email, password });

    const beforeA = await readSession(context, signInA.session.id);
    expect(beforeA).not.toBeNull();
    expect(beforeA!.revokedAt).toBeNull();

    const issuance = await issueJoinCode(context, context.accountId, { validDays: 7, maxUses: 5 });

    cookieValue = `${signInA.session.id}.${household.id}`;
    await signOutAndReturnAction(formDataWithCode(issuance.code)).catch(() => {});

    // Every OTHER column on session A stays exactly as it was — only revokedAt changes (tasks.md's
    // rule on status-transition tests: assert every column a statement writes, not only the one
    // that motivated it).
    const afterA = await readSession(context, signInA.session.id);
    expect(afterA).not.toBeNull();
    expect(afterA!.revokedAt).not.toBeNull();
    for (const key of Object.keys(beforeA!) as Array<keyof typeof beforeA>) {
      if (key === "revokedAt") continue;
      expect(afterA![key]).toEqual(beforeA![key]);
    }

    const afterB = await readSession(context, signInB.session.id);
    expect(afterB).not.toBeNull();
    expect(afterB!.revokedAt).toBeNull();

    expect(redirect).toHaveBeenCalledWith(`/join/${issuance.code}`);
    expect(cookieValue).toBeUndefined();
  });

  it("redirects to /join for a malformed body code, and still clears the cookie", async () => {
    // registerTestHousehold (not bare registerHousehold): it is tracked in-flight, so a registration
    // that outlives the test timeout is still caught by tests/setup.ts's global sweep.
    const hh = await registerTestHousehold();
    cleanupTasks.push(hh.cleanup);
    const { context, email } = hh;
    const household = { id: hh.householdId };
    const password = TEST_PASSWORD;

    const signInA = await signIn({ kind: "household", email, password });
    cookieValue = `${signInA.session.id}.${household.id}`;

    await signOutAndReturnAction(formDataWithCode("not-a-real-code-shape")).catch(() => {});

    expect(redirect).toHaveBeenCalledWith("/join");
    expect(cookieValue).toBeUndefined();

    const afterA = await readSession(context, signInA.session.id);
    expect(afterA!.revokedAt).not.toBeNull();
  });
});
