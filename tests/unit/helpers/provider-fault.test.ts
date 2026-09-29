import { createServer, type Server } from "node:http";
import { afterEach, describe, expect, it } from "vitest";
import { injectProviderFault } from "../../helpers/provider-fault";

// auth-provider-deadline design.md D12 / tasks.md 3.2: a local node:http server that DELAYS its
// answer 500ms, well past the caller's own 200ms deadline — this is what lets
// "forward-then-drop" prove the server actually saw and answered the request while the caller
// still experiences an abort.
let server: Server | undefined;
let baseUrl: string;
let seenByServer: string[] = [];

async function startDelayedServer(delayMs: number): Promise<string> {
  seenByServer = [];
  server = createServer((req, res) => {
    seenByServer.push(`${req.method} ${req.url}`);
    setTimeout(() => {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ ok: true }));
    }, delayMs);
  });
  await new Promise<void>((resolve) => server!.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  const port = typeof address === "object" && address ? address.port : 0;
  return `http://127.0.0.1:${port}`;
}

// A net beneath each test's own injector.restore() — if an assertion throws before a test reaches
// its own restore() call, globalThis.fetch would otherwise stay wrapped for every later test in
// this file, corrupting them all through nested wrapper layers rather than failing cleanly.
const REAL_FETCH = globalThis.fetch;

afterEach(async () => {
  globalThis.fetch = REAL_FETCH;
  if (server) {
    await new Promise<void>((resolve) => server!.close(() => resolve()));
    server = undefined;
  }
});

async function fetchWithDeadline(url: string, deadlineMs: number, method = "GET"): Promise<Response> {
  return fetch(url, { method, signal: AbortSignal.timeout(deadlineMs) });
}

describe("injectProviderFault", () => {
  it("forward-then-drop: the server saw and answered, forwardCompleted is true, the caller sees an abort", async () => {
    baseUrl = await startDelayedServer(500);
    const injector = injectProviderFault([{ method: "GET", path: /\/probe/, mode: "forward-then-drop" }]);

    await expect(fetchWithDeadline(`${baseUrl}/probe`, 200)).rejects.toBeTruthy();
    // Give the forward promise time to actually finish reading the delayed response.
    await new Promise((resolve) => setTimeout(resolve, 500));

    expect(injector.seen).toHaveLength(1);
    expect(injector.seen[0].outcome).toBe("forwarded-then-dropped");
    expect(injector.seen[0].forwardCompleted).toBe(true);
    expect(injector.seen[0].forwardIncomplete).toBeFalsy();

    injector.restore();
  });

  it("drop-before: the server never sees the request", async () => {
    baseUrl = await startDelayedServer(500);
    const injector = injectProviderFault([{ method: "GET", path: /\/probe/, mode: "drop-before" }]);

    await expect(fetchWithDeadline(`${baseUrl}/probe`, 200)).rejects.toBeTruthy();
    await new Promise((resolve) => setTimeout(resolve, 600));

    expect(seenByServer).toHaveLength(0);
    expect(injector.seen).toHaveLength(1);
    expect(injector.seen[0].outcome).toBe("dropped-before");

    injector.restore();
  });

  it("occurrence forms 2, [1,3], {from:2} select exactly those matches", async () => {
    baseUrl = await startDelayedServer(0);

    // occurrence = 2: only the second matching request is dropped.
    {
      const injector = injectProviderFault([{ method: "GET", path: /\/a/, occurrence: 2, mode: "drop-before" }]);
      const r1 = await fetch(`${baseUrl}/a`, { signal: AbortSignal.timeout(2000) });
      expect(r1.ok).toBe(true);
      await expect(fetch(`${baseUrl}/a`, { signal: AbortSignal.timeout(200) })).rejects.toBeTruthy();
      const r3 = await fetch(`${baseUrl}/a`, { signal: AbortSignal.timeout(2000) });
      expect(r3.ok).toBe(true);
      expect(injector.seen.map((s) => s.outcome)).toEqual(["passed-through", "dropped-before", "passed-through"]);
      injector.restore();
    }

    // occurrence = [1, 3]: first and third are dropped, second passes.
    {
      const injector = injectProviderFault([{ method: "GET", path: /\/b/, occurrence: [1, 3], mode: "drop-before" }]);
      await expect(fetch(`${baseUrl}/b`, { signal: AbortSignal.timeout(200) })).rejects.toBeTruthy();
      const r2 = await fetch(`${baseUrl}/b`, { signal: AbortSignal.timeout(2000) });
      expect(r2.ok).toBe(true);
      await expect(fetch(`${baseUrl}/b`, { signal: AbortSignal.timeout(200) })).rejects.toBeTruthy();
      expect(injector.seen.map((s) => s.outcome)).toEqual(["dropped-before", "passed-through", "dropped-before"]);
      injector.restore();
    }

    // occurrence = { from: 2 }: first passes, every one after is dropped.
    {
      const injector = injectProviderFault([
        { method: "GET", path: /\/c/, occurrence: { from: 2 }, mode: "drop-before" },
      ]);
      const r1 = await fetch(`${baseUrl}/c`, { signal: AbortSignal.timeout(2000) });
      expect(r1.ok).toBe(true);
      await expect(fetch(`${baseUrl}/c`, { signal: AbortSignal.timeout(200) })).rejects.toBeTruthy();
      await expect(fetch(`${baseUrl}/c`, { signal: AbortSignal.timeout(200) })).rejects.toBeTruthy();
      expect(injector.seen.map((s) => s.outcome)).toEqual(["passed-through", "dropped-before", "dropped-before"]);
      injector.restore();
    }
  });

  it("record passes through unchanged", async () => {
    baseUrl = await startDelayedServer(0);
    const injector = injectProviderFault([{ method: "GET", path: /\/probe/, mode: "record" }]);

    const response = await fetch(`${baseUrl}/probe`, { signal: AbortSignal.timeout(2000) });
    expect(response.ok).toBe(true);
    expect(injector.seen).toHaveLength(1);
    expect(injector.seen[0].outcome).toBe("passed-through");

    injector.restore();
  });

  it("restore() restores the fetch that was there before", async () => {
    baseUrl = await startDelayedServer(0);
    const before = globalThis.fetch;
    const injector = injectProviderFault([{ method: "GET", path: /\/probe/, mode: "drop-before" }]);
    expect(globalThis.fetch).not.toBe(before);
    injector.restore();
    expect(globalThis.fetch).toBe(before);
  });
});
