import { createClient, isAuthError, isAuthRetryableFetchError, type AuthError } from "@supabase/supabase-js";

// auth-provider-deadline proposal.md / .claude/rules/implementation-hazards.md, "No transaction
// spans Postgres and Supabase Auth": every application call to the identity provider goes through
// this file. It owns three things the rest of the codebase must never reimplement:
//   1. a per-request deadline (D1/D2) — no call can hang the way the 2026-09-28 measurements
//      showed a lost request hanging Node's own fetch for up to 300s, which matters most while a
//      caller holds Postgres row locks (auth.ts's changeResidentEmail/changeResidentPassword/
//      redeemPasswordReset);
//   2. one classification of a failed call — refused (the provider answered and declined) or
//      unknown (no answer, or a retryable 5xx: the request may or may not have taken effect) — so
//      no call site can read "unknown" as "refused" (a wrong password, a taken address, ...);
//   3. which calls may be sent again, and how many times, per design.md D4: a read or a password
//      check is resent once (two attempts total); a state-changing update is never blindly resent
//      by this file (its caller decides, after a read-back, per D6/D7/D8); createUser is never
//      resent at all; deleteUser is resent once, and a 404 on the repeat counts as done.
//
// An unanswered call is an unknown outcome, not a refusal (identity/provider-calls). auth-js
// (`@supabase/auth-js` lib/fetch.ts `handleError`) already turns any transport failure — a reset,
// an abort, a lost connection — into `AuthRetryableFetchError(message, 0)`, and a 500–504/520–530
// gateway answer into the same class with the real status. Every other `AuthError` is the provider
// having actually answered with a refusal.

// Admin-only client (research.md §2) — uses the service-role key, never the anon key. Server-only:
// this module must never be imported from a client component (the service-role key would end up
// in the browser bundle otherwise). Created lazily so a missing env var doesn't crash unrelated
// module imports (e.g. this file being imported transitively by a route that never calls it), and
// so a test can set AUTH_PROVIDER_DEADLINE_MS before the call it exercises (D2). The deadline
// itself is read and validated HERE, at creation, per client instance (D2: "the client is created
// per call, so a test can set the variable before the call it exercises") — not lazily inside the
// fetch wrapper, so a misconfigured value throws when the client is created, not on the first
// request.
export function supabaseAdmin() {
  const deadlineMs = readDeadlineMs();
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { fetch: (input, init) => withDeadline(deadlineMs, input, init) },
  });
}

// D2: 5s default, overridable per environment. An integer from 500 to 60000; anything else throws
// (a misconfiguration fails loudly rather than silently running unbounded) — deliberately not
// memoized, so a test can change the env var between calls to supabaseAdmin().
function readDeadlineMs(): number {
  const raw = process.env.AUTH_PROVIDER_DEADLINE_MS;
  if (raw === undefined || raw === "") return 5000;
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed < 500 || parsed > 60000) {
    throw new Error(
      `AUTH_PROVIDER_DEADLINE_MS must be an integer from 500 to 60000, got: ${JSON.stringify(raw)}`,
    );
  }
  return parsed;
}

// D1: the deadline lives in the client's `global.fetch`. The GLOBAL fetch itself is resolved
// lazily — at call time, never captured at module load. That keeps tests/setup.ts's own test-only
// wrapper (fix/test-timeouts-hosted-dev, if merged) and this change's fault injector
// (tests/helpers/provider-fault.ts) underneath this deadline: both replace `globalThis.fetch`, and
// this function reads whatever is there right now, every time it runs.
//
// AbortSignal.timeout(deadlineMs) covers the WHOLE exchange, not only the response headers: undici
// honours the signal until the response body is fully consumed, and auth-js reads the body
// (`result.json()`) inside the same call that receives the Response. Promise.race against a timer
// would free neither the socket nor the pool slot (Alternatives, D1) — only an actual abort does
// that.
//
// AbortSignal.any combines the deadline with any signal the caller already passed (there is none
// today from auth-js itself, but a future caller's own signal must not be silently dropped).
export async function withDeadline(
  deadlineMs: number,
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<Response> {
  const deadlineSignal = AbortSignal.timeout(deadlineMs);
  const signal = init?.signal ? AbortSignal.any([init.signal, deadlineSignal]) : deadlineSignal;
  return globalThis.fetch(input, { ...init, signal });
}

// D3: one classification, `ok` | `refused` | `unknown`.
//  - `null` (no error): `ok`.
//  - `AuthRetryableFetchError` (status 0 — a transport failure/abort — or a retryable 5xx that
//    auth-js's own `handleError` already reclassified): `unknown`. The request may or may not have
//    taken effect at the provider.
//  - any other `AuthError` (the provider answered with a 4xx, or a non-retryable 5xx `AuthApiError`
//    the provider gave a real code for): `refused`.
//  - anything else — a rejection that never went through auth-js's own error wrapping at all —
//    is treated as `unknown` too: it did not come back as a definite refusal, so it must not be
//    read as one.
//
// The email-taken signature on the UPDATE path (a 500, "Error updating user", with no `code`) is a
// deliberate, pre-existing exception (resident-settings design.md D2) — `isEmailTakenError` in
// auth.ts runs BEFORE this classifier at that one call site and still reports `email_taken`
// (`refused`), unchanged by this file.
export function classifyProviderError(error: unknown): "ok" | "refused" | "unknown" {
  if (!error) return "ok";
  if (isAuthRetryableFetchError(error)) return "unknown";
  if (isAuthError(error)) return "refused";
  return "unknown";
}

// D3: "Every password check follows one rule" (pre-mortem finding 2) — `signIn`, the
// current-password check in `changeResidentPassword`, D11's throwaway check, the D7/D8 probes and
// phase 3's sign-in all classify a `signInWithPassword` answer through this, never through
// `classifyProviderError`. Only a clean `AuthApiError` with code `invalid_credentials` (status 400)
// means "wrong password" (or, for a probe, "not applied"). Any other refusal — a 429
// `over_request_rate_limit`, an `AuthUnknownError` from a non-JSON 4xx — says nothing about the
// password and is `unknown`, exactly like a lost answer. Otherwise a rate limit on `/token` would
// tell someone with the right password that it is wrong, and D11's throwaway checks would spend the
// same budget as a real one.
export function classifyPasswordCheck(error: unknown): "ok" | "wrong_password" | "unknown" {
  if (!error) return "ok";
  if (classifyProviderError(error) === "unknown") return "unknown";
  const authError = error as AuthError;
  // Some GoTrue versions omit `code` on this exact refusal (older/self-hosted) but always answer it
  // as a clean 400 — the status is the fallback, `code` the precise signal when present. Any other
  // refusal (a 429 `over_request_rate_limit`, an `AuthUnknownError` from a non-JSON 4xx) says
  // nothing about the password and stays `unknown`.
  if (authError.status === 400 && (authError.code === undefined || authError.code === "invalid_credentials")) {
    return "wrong_password";
  }
  return "unknown";
}

type AdminClient = ReturnType<typeof supabaseAdmin>;

// D4: getUserById is a read — sent a second time when the first answer never came, and not more
// than twice. Callers get a single result, classified once with classifyProviderError.
export async function getUserByIdWithResend(
  accountId: string,
): ReturnType<AdminClient["auth"]["admin"]["getUserById"]> {
  const first = await supabaseAdmin().auth.admin.getUserById(accountId);
  if (classifyProviderError(first.error) !== "unknown") return first;
  return supabaseAdmin().auth.admin.getUserById(accountId);
}

// D4: signInWithPassword as a password check — sent a second time only when the FIRST answer was
// itself `unknown` per classifyPasswordCheck's rule (never a plain wrong-password refusal, which
// is definite and must not be masked by a second attempt). Used by every password-check site
// (D3's "every password check follows one rule"): signIn's real grant, changeResidentPassword's
// current-password check, D11's throwaway check, confirmPasswordSet's probe, and phase 3's sign-in.
export async function signInWithPasswordWithResend(
  email: string,
  password: string,
): ReturnType<AdminClient["auth"]["signInWithPassword"]> {
  const first = await supabaseAdmin().auth.signInWithPassword({ email, password });
  if (classifyPasswordCheck(first.error) !== "unknown") return first;
  return supabaseAdmin().auth.signInWithPassword({ email, password });
}

// D4: the one exception to "a call that changes state is never blindly resent" — removing an
// account the application itself just created is sent at most twice, because a second removal of
// an already-removed account changes nothing. A 404 on the repeat counts as done (the first attempt
// must have landed, or the account never existed to begin with — either way the address is free).
export async function deleteUserWithResend(accountId: string): Promise<"ok" | "unknown"> {
  const first = await supabaseAdmin().auth.admin.deleteUser(accountId);
  if (!first.error) return "ok";
  if (classifyProviderError(first.error) !== "unknown") {
    return first.error.status === 404 ? "ok" : "unknown";
  }
  const second = await supabaseAdmin().auth.admin.deleteUser(accountId);
  if (!second.error) return "ok";
  if (second.error.status === 404) return "ok";
  return "unknown";
}

// D7: a password cannot be read — the only evidence whether a write applied is whether the new
// password now authenticates. Used by changeResidentPassword's in-transaction resolution and
// redeemPasswordReset phase 2's probe (D8). The returned provider session (on `applied`) is always
// discarded by the caller, exactly as every refusal path already discards one.
export async function confirmPasswordSet(
  email: string,
  password: string,
): Promise<"applied" | "not_applied" | "unknown"> {
  const { error } = await signInWithPasswordWithResend(email, password);
  const outcome = classifyPasswordCheck(error);
  if (outcome === "ok") return "applied";
  if (outcome === "wrong_password") return "not_applied";
  return "unknown";
}
