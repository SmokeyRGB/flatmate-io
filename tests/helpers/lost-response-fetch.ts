// Lost Supabase requests (measured 2026-09-28 with a traced full suite). From the dev
// machine, an HTTPS request to flatmate-io-dev's Auth API is sometimes written to the socket in
// full and never answered. GoTrue never sees it: in one traced window the client got 2,334
// responses and waited on 9 more, and GoTrue logged exactly 2,334 requests from that address,
// none slower than 1.3s. Undici waits 300s for response headers, so the test dies at its 60s
// timeout and, when the lost call is teardown's deleteUser, the afterEach hook dies with it — the
// intermittent `Test timed out in 60000ms` set that differed on every run. Postgres traffic,
// which goes to the pooler directly rather than through the API gateway, never hung.
//
// So each Supabase request gets its own deadline, and a request whose answer did not come is sent
// again. Only the transport changes, and only then: a response that does arrive, error or not, is
// returned exactly as before, and each resend is printed, so how often it happens stays visible.
// Test-only (tests/setup.ts installs it): the application's own provider calls have no deadline
// in production, which is a separate question from the suite's reliability.

export interface LostResponseOptions {
  origin: string;
  deadlineMs: number;
  attempts: number;
  warn?: (message: string) => void;
}

// A resend must never let a test pass that should fail. For reads, a PUT of the same values and a
// DELETE (deleteTestAccount already accepts the 404 a repeat gets), a second copy leaves the same
// state. createUser and the password grant are not idempotent, but a duplicate cannot slip through:
// Auth addresses are unique, so if a first createUser ever did arrive, the second is refused with
// email_exists and the test fails loudly; a sign-in that did arrive only leaves a GoTrue session
// this application never reads.
//
// What a lost-but-processed request leaves behind (a user whose id the test never learned, an
// unobserved GoTrue session) is left by the lost response itself, resend or not: without the
// resend the test times out and cleanup cannot find that user either. The resend only changes
// the outcome when the first copy never arrived — every one of the traced cases — and then the
// test passes instead of timing out. Do not "reconcile" by deleting the user with that address
// before resending: tests that provoke email_exists on purpose would lose their pre-existing user
// and could pass wrongly (PR #37 review).
// Any other POST fails at the deadline instead of being resent, until someone makes that case.
function isSafeToResend(method: string, pathname: string): boolean {
  if (["GET", "HEAD", "PUT", "DELETE"].includes(method)) return true;
  return method === "POST" && (pathname === "/auth/v1/token" || pathname === "/auth/v1/admin/users");
}

export function withLostResponseDeadline(
  fetchImpl: typeof fetch,
  { origin, deadlineMs, attempts, warn = console.warn }: LostResponseOptions,
): typeof fetch {
  return async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    // supabase-js always passes a URL string and a string body, which can be sent again as-is; a
    // Request object or a streamed body could not be, so those pass through untouched.
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : undefined;
    if (url === undefined || new URL(url).origin !== origin || init?.body instanceof ReadableStream) {
      return fetchImpl(input, init);
    }
    const method = (init?.method ?? "GET").toUpperCase();
    const pathname = new URL(url).pathname;
    const tries = isSafeToResend(method, pathname) ? attempts : 1;

    for (let attempt = 1; ; attempt++) {
      // The deadline covers the wait for response headers only and is cleared once they arrive,
      // so it can never abort the caller's read of a body that did come.
      const deadline = new AbortController();
      const timer = setTimeout(() => deadline.abort(new DOMException("no response", "TimeoutError")), deadlineMs);
      const signal = init?.signal ? AbortSignal.any([init.signal, deadline.signal]) : deadline.signal;
      try {
        return await fetchImpl(input, { ...init, signal });
      } catch (error) {
        // Anything but our own deadline (a refused connection, the caller's own abort) is not a
        // lost request and propagates unchanged.
        if (!deadline.signal.aborted || init?.signal?.aborted) throw error;
        const what = `${method} ${pathname}: no response within ${deadlineMs}ms (attempt ${attempt} of ${tries})`;
        if (attempt >= tries) throw new Error(`Supabase request lost — ${what}`, { cause: error });
        warn(`[tests/helpers/lost-response-fetch.ts] Supabase request lost, resending — ${what}`);
      } finally {
        clearTimeout(timer);
      }
    }
  };
}
