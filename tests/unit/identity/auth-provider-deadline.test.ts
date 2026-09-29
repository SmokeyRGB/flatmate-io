import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { afterEach, describe, expect, it } from "vitest";
import {
  classifyPasswordCheck,
  classifyProviderError,
  getUserByIdWithResend,
  signInWithPasswordWithResend,
  supabaseAdmin,
} from "@/modules/identity/auth-provider";

// auth-provider-deadline design.md D12: a local node:http server withholds chosen responses, the
// same shape as the test-timeouts branch's lost-response-fetch.test.ts. The admin client is
// pointed at it — no mocking of Supabase or the DB, just a stand-in transport this file fully
// controls.

type Handler = (req: IncomingMessage, res: ServerResponse, count: number, body: string) => void;

interface TestServer {
  server: Server;
  url: string;
  counts: Map<string, number>;
  close: () => Promise<void>;
}

function key(method: string | undefined, url: string | undefined): string {
  return `${method} ${(url ?? "").split("?")[0]}`;
}

async function startServer(handler: Handler): Promise<TestServer> {
  const counts = new Map<string, number>();
  const server = createServer((req, res) => {
    const k = key(req.method, req.url);
    const n = (counts.get(k) ?? 0) + 1;
    counts.set(k, n);
    let body = "";
    req.on("data", (chunk) => (body += chunk));
    req.on("end", () => handler(req, res, n, body));
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  const port = typeof address === "object" && address ? address.port : 0;
  return {
    server,
    url: `http://127.0.0.1:${port}`,
    counts,
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}

function respondJson(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { "content-type": "application/json" });
  res.end(JSON.stringify(body));
}

const ORIGINAL_ENV = {
  url: process.env.NEXT_PUBLIC_SUPABASE_URL,
  key: process.env.SUPABASE_SERVICE_ROLE_KEY,
  deadline: process.env.AUTH_PROVIDER_DEADLINE_MS,
};

let activeServer: TestServer | undefined;

afterEach(async () => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = ORIGINAL_ENV.url;
  process.env.SUPABASE_SERVICE_ROLE_KEY = ORIGINAL_ENV.key;
  process.env.AUTH_PROVIDER_DEADLINE_MS = ORIGINAL_ENV.deadline;
  if (activeServer) {
    await activeServer.close();
    activeServer = undefined;
  }
});

// tasks.md 2.4 names 300ms; design.md D2 fixes the valid range at 500-60000, so 500 (the range's
// own floor) is used here instead — see the applier's report for this discrepancy.
async function pointAdminAt(handler: Handler, deadlineMs = 500): Promise<TestServer> {
  const testServer = await startServer(handler);
  activeServer = testServer;
  process.env.NEXT_PUBLIC_SUPABASE_URL = testServer.url;
  process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service-role-key";
  process.env.AUTH_PROVIDER_DEADLINE_MS = String(deadlineMs);
  return testServer;
}

describe("auth-provider deadline", () => {
  it("a withheld response makes updateUserById return, within 2s, an error classifyProviderError calls unknown", async () => {
    await pointAdminAt(() => {
      // never respond — the deadline must abandon this, not Node's own fetch timeout
    });

    const startedAt = Date.now();
    const { error } = await supabaseAdmin().auth.admin.updateUserById("11111111-1111-4111-8111-111111111111", {
      email: "probe@example.test",
    });
    const elapsedMs = Date.now() - startedAt;

    expect(elapsedMs).toBeLessThan(2000);
    expect(classifyProviderError(error)).toBe("unknown");
  }, 5000);

  it("a 500 answer classifies as unknown", async () => {
    await pointAdminAt((_req, res) => respondJson(res, 500, { msg: "internal error" }));

    const { error } = await supabaseAdmin().auth.admin.updateUserById("11111111-1111-4111-8111-111111111111", {
      email: "probe@example.test",
    });

    expect(classifyProviderError(error)).toBe("unknown");
  }, 5000);

  it("a 422 email_exists classifies as refused", async () => {
    await pointAdminAt((_req, res) => respondJson(res, 422, { error_code: "email_exists", msg: "Email exists" }));

    const { error } = await supabaseAdmin().auth.admin.updateUserById("11111111-1111-4111-8111-111111111111", {
      email: "probe@example.test",
    });

    expect(classifyProviderError(error)).toBe("refused");
  }, 5000);

  it("on /token, a 400 invalid_credentials classifies as wrong_password", async () => {
    await pointAdminAt((_req, res) =>
      respondJson(res, 400, { error_code: "invalid_credentials", msg: "Invalid login credentials" }),
    );

    const { error } = await supabaseAdmin().auth.signInWithPassword({
      email: "probe@example.test",
      password: "whatever-not-real",
    });

    expect(classifyPasswordCheck(error)).toBe("wrong_password");
  }, 5000);

  it("on /token, a 429 over_request_rate_limit classifies as unknown", async () => {
    await pointAdminAt((_req, res) =>
      respondJson(res, 429, { error_code: "over_request_rate_limit", msg: "Rate limit exceeded" }),
    );

    const { error } = await supabaseAdmin().auth.signInWithPassword({
      email: "probe@example.test",
      password: "whatever-not-real",
    });

    expect(classifyPasswordCheck(error)).toBe("unknown");
  }, 5000);

  it("on /token, a 400 without a code is not taken for a wrong password (D3: the code, nothing broader)", async () => {
    await pointAdminAt((_req, res) => respondJson(res, 400, { msg: "Bad request" }));

    const { error } = await supabaseAdmin().auth.signInWithPassword({
      email: "probe@example.test",
      password: "whatever-not-real",
    });

    expect(classifyPasswordCheck(error)).toBe("unknown");
  }, 5000);

  it("a 429 on /token is not resent: a definite refusal, only an unanswered check gets a second copy", async () => {
    const testServer = await pointAdminAt((_req, res) =>
      respondJson(res, 429, { error_code: "over_request_rate_limit", msg: "Rate limit exceeded" }),
    );

    const { error } = await signInWithPasswordWithResend("probe@example.test", "whatever-not-real");

    expect(classifyPasswordCheck(error)).toBe("unknown");
    expect(testServer.counts.get("POST /auth/v1/token")).toBe(1);
  }, 5000);

  it("a withheld /token answer IS resent once", async () => {
    const testServer = await pointAdminAt(() => {
      // never respond
    });

    const { error } = await signInWithPasswordWithResend("probe@example.test", "whatever-not-real");

    expect(classifyPasswordCheck(error)).toBe("unknown");
    expect(testServer.counts.get("POST /auth/v1/token")).toBe(2);
  }, 5000);

  it("a normal answer is returned unchanged", async () => {
    const userId = "22222222-2222-4222-8222-222222222222";
    await pointAdminAt((_req, res) =>
      respondJson(res, 200, {
        id: userId,
        email: "someone@example.test",
        aud: "authenticated",
        role: "authenticated",
        app_metadata: {},
        user_metadata: {},
        created_at: new Date().toISOString(),
      }),
    );

    const { data, error } = await supabaseAdmin().auth.admin.getUserById(userId);

    expect(error).toBeNull();
    expect(data.user?.id).toBe(userId);
    expect(data.user?.email).toBe("someone@example.test");
  }, 5000);

  it("a withheld GET is sent twice and a withheld PUT exactly once", async () => {
    const testServer = await pointAdminAt(() => {
      // never respond to anything
    });

    const startedAt = Date.now();
    await getUserByIdWithResend("33333333-3333-4333-8333-333333333333");
    expect(Date.now() - startedAt).toBeLessThan(3000);
    expect(testServer.counts.get("GET /auth/v1/admin/users/33333333-3333-4333-8333-333333333333")).toBe(2);

    await supabaseAdmin().auth.admin.updateUserById("33333333-3333-4333-8333-333333333333", {
      email: "probe@example.test",
    });
    expect(testServer.counts.get("PUT /auth/v1/admin/users/33333333-3333-4333-8333-333333333333")).toBe(1);
  }, 5000);

  it("an invalid AUTH_PROVIDER_DEADLINE_MS throws when the client is created", () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "http://127.0.0.1:1";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service-role-key";

    process.env.AUTH_PROVIDER_DEADLINE_MS = "0";
    expect(() => supabaseAdmin()).toThrow();

    process.env.AUTH_PROVIDER_DEADLINE_MS = "abc";
    expect(() => supabaseAdmin()).toThrow();
  });
});
