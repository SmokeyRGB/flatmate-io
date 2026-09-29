import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { withLostResponseDeadline } from "../../helpers/lost-response-fetch";

// tests/helpers/lost-response-fetch.ts, against a local server that swallows chosen requests the
// way flatmate-io-dev's Auth API sometimes does from the dev machine: the request arrives, and no
// response ever leaves.
let server: Server;
let origin: string;
let seen: string[];
let swallow: (request: IncomingMessage, index: number) => boolean;
let status: number;
const held: ServerResponse[] = [];

beforeEach(async () => {
  seen = [];
  swallow = () => false;
  status = 200;
  server = createServer((request, response) => {
    seen.push(`${request.method} ${request.url}`);
    if (swallow(request, seen.length)) {
      held.push(response);
      return;
    }
    response.writeHead(status, { "content-type": "application/json" });
    response.end(JSON.stringify({ n: seen.length }));
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterEach(async () => {
  for (const response of held.splice(0)) response.destroy();
  server.closeAllConnections();
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

function wrapped(warnings: string[] = []) {
  return withLostResponseDeadline(fetch, { origin, deadlineMs: 300, attempts: 3, warn: (m) => warnings.push(m) });
}

describe("withLostResponseDeadline", () => {
  it("resends a DELETE whose response was lost and returns the answer that arrives", async () => {
    swallow = (_request, index) => index === 1;
    const warnings: string[] = [];

    const response = await wrapped(warnings)(`${origin}/auth/v1/admin/users/x`, { method: "DELETE" });

    expect(await response.json()).toEqual({ n: 2 });
    expect(seen).toEqual(["DELETE /auth/v1/admin/users/x", "DELETE /auth/v1/admin/users/x"]);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain("DELETE /auth/v1/admin/users/x: no response within 300ms (attempt 1 of 3)");
  });

  it("resends createUser and the password grant, the two POSTs it knows are safe", async () => {
    swallow = (_request, index) => index === 1 || index === 3;
    const send = wrapped();

    const created = await send(`${origin}/auth/v1/admin/users`, { method: "POST", body: "{}" });
    const token = await send(`${origin}/auth/v1/token?grant_type=password`, { method: "POST", body: "{}" });

    expect(created.status).toBe(200);
    expect(token.status).toBe(200);
    expect(seen).toEqual([
      "POST /auth/v1/admin/users",
      "POST /auth/v1/admin/users",
      "POST /auth/v1/token?grant_type=password",
      "POST /auth/v1/token?grant_type=password",
    ]);
  });

  it("gives up after the last attempt with an error naming the request", async () => {
    swallow = () => true;

    await expect(wrapped()(`${origin}/auth/v1/admin/users/x`)).rejects.toThrow(
      "Supabase request lost — GET /auth/v1/admin/users/x: no response within 300ms (attempt 3 of 3)",
    );
    expect(seen).toHaveLength(3);
  });

  it("never resends any other POST, and fails at the first deadline instead", async () => {
    swallow = () => true;

    await expect(wrapped()(`${origin}/auth/v1/invite`, { method: "POST", body: "{}" })).rejects.toThrow(
      "Supabase request lost — POST /auth/v1/invite: no response within 300ms (attempt 1 of 1)",
    );
    expect(seen).toEqual(["POST /auth/v1/invite"]);
  });

  it("returns a response that does arrive exactly as sent, error status included, without resending", async () => {
    status = 500;

    const response = await wrapped()(`${origin}/auth/v1/admin/users/x`, { method: "PUT", body: "{}" });

    expect(response.status).toBe(500);
    expect(seen).toEqual(["PUT /auth/v1/admin/users/x"]);
  });

  it("never aborts the read of a body whose headers arrived before the deadline", async () => {
    // Answer the first request's headers at once and its body only after the 300ms deadline.
    server.removeAllListeners("request");
    server.on("request", (request: IncomingMessage, response: ServerResponse) => {
      seen.push(`${request.method} ${request.url}`);
      response.writeHead(200, { "content-type": "application/json" });
      response.flushHeaders();
      setTimeout(() => response.end(JSON.stringify({ late: true })), 500);
    });

    const response = await wrapped()(`${origin}/auth/v1/admin/users/x`);

    expect(await response.json()).toEqual({ late: true });
    expect(seen).toHaveLength(1);
  });

  it("passes the caller's own abort through instead of resending", async () => {
    swallow = () => true;
    const controller = new AbortController();
    setTimeout(() => controller.abort(), 50);

    await expect(wrapped()(`${origin}/auth/v1/admin/users/x`, { signal: controller.signal })).rejects.toMatchObject({
      name: "AbortError",
    });
    expect(seen).toHaveLength(1);
  });

  it("leaves requests to any other origin alone", async () => {
    swallow = () => true;
    const otherOrigin = withLostResponseDeadline(fetch, {
      origin: "https://elsewhere.example.test",
      deadlineMs: 50,
      attempts: 3,
    });
    const controller = new AbortController();
    setTimeout(() => controller.abort(), 400);

    // Still pending well past the 50ms deadline: no deadline was applied to it.
    await expect(otherOrigin(`${origin}/auth/v1/admin/users/x`, { signal: controller.signal })).rejects.toMatchObject({
      name: "AbortError",
    });
    expect(seen).toHaveLength(1);
  });
});
