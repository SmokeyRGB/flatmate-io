// auth-provider-deadline design.md D12: transport-level FAULT INJECTION against the real
// flatmate-io-dev GoTrue, not mocking the provider (human decision, explore, 2026-09-28). Every
// request still reaches, or would reach, the real service; this only controls whether the
// application ever sees its answer. Install AFTER the fixtures that set a test up (e.g.
// registerTestHousehold, or issuing a join/reset link) — those calls must not count as occurrences
// and must never be dropped, so this must be installed once the household/link a test exercises
// already exists.
//
// Interaction with tests/helpers/lost-response-fetch.ts (PR #37, installed by tests/setup.ts): its
// resend wrapper sits BELOW this injector, and it stays there on purpose (design.md D12 planned a
// bypass; dropped once the merged wrapper could be read). `drop-before` never calls through, so
// the wrapper never sees that request. `forward-then-drop` passes no signal down, so the wrapper
// applies its own 8s deadline to the forward. It resends only a forward that was itself lost,
// which is what keeps the forward from failing: the fault needs the request applied, and a
// second copy of a PUT sets the same values. A resent createUser applies only if the first copy
// never arrived; if it did arrive, email_exists fails the test loudly. Either way the fault still
// holds: the application's own deadline ends its wait, and the answer never reaches it.
export interface SeenRequest {
  method: string;
  url: string;
  body: unknown;
  rule?: Rule;
  outcome: "dropped-before" | "forwarded-then-dropped" | "passed-through";
  // Only meaningful for outcome "forwarded-then-dropped": whether GoTrue's full response body was
  // read before the caller's own abort landed, and (its negation, recorded only when the abort
  // came first) forwardIncomplete — see injectProviderFault's own comment.
  forwardCompleted?: boolean;
  forwardIncomplete?: boolean;
}

export type Occurrence = number | number[] | { from: number } | "every";

export interface Rule {
  method: string;
  path: RegExp;
  occurrence?: Occurrence;
  mode: "drop-before" | "forward-then-drop" | "record";
}

export interface FaultInjectorHandle {
  seen: SeenRequest[];
  restore: () => void;
}

function occurrenceMatches(occurrence: Occurrence | undefined, n: number): boolean {
  if (occurrence === undefined || occurrence === "every") return true;
  if (typeof occurrence === "number") return n === occurrence;
  if (Array.isArray(occurrence)) return occurrence.includes(n);
  return n >= occurrence.from;
}

function parseBody(raw: unknown): unknown {
  if (typeof raw !== "string" || raw.length === 0) return raw ?? null;
  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
}

// D12: "installs ONE wrapper at globalThis.fetch and returns { seen, restore }" — a single
// installation holding a LIST of rules, so one test covers several faults without stacking
// wrappers (pre-mortem finding 6). The first matching rule (by method + path + occurrence,
// occurrences counted per rule over that rule's own matches) wins; an unmatched request, or one
// whose occurrence is not selected by any rule, passes through unchanged.
export function injectProviderFault(rules: Rule[]): FaultInjectorHandle {
  const seen: SeenRequest[] = [];
  const matchCounts = new Map<Rule, number>();
  const originalFetch = globalThis.fetch;

  const wrapped: typeof fetch = async (input, init) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : (input as Request).url;
    const method = (init?.method ?? (typeof input === "object" && "method" in input ? (input as Request).method : "GET")).toUpperCase();
    const path = new URL(url).pathname;
    const bodyRaw = init?.body;
    const bodyText = typeof bodyRaw === "string" ? bodyRaw : undefined;

    let matchedRule: Rule | undefined;
    for (const rule of rules) {
      if (rule.method.toUpperCase() !== method) continue;
      if (!rule.path.test(path)) continue;
      const n = (matchCounts.get(rule) ?? 0) + 1;
      matchCounts.set(rule, n);
      if (occurrenceMatches(rule.occurrence, n)) {
        matchedRule = rule;
        break;
      }
      // This rule matched the request shape but not this occurrence — a LATER rule may still
      // apply, so keep scanning; this rule's own count above is already incremented for its own
      // matches, independent of whether this particular occurrence was selected.
    }

    if (!matchedRule || matchedRule.mode === "record") {
      const response = await originalFetch(input, init);
      seen.push({ method, url, body: parseBody(bodyText), rule: matchedRule, outcome: "passed-through" });
      return response;
    }

    if (matchedRule.mode === "drop-before") {
      const record: SeenRequest = {
        method,
        url,
        body: parseBody(bodyText),
        rule: matchedRule,
        outcome: "dropped-before",
      };
      seen.push(record);
      const signal = init?.signal;
      if (!signal) {
        // No signal at all means this call would hang forever with no deadline to release it —
        // this should never happen once auth-provider.ts's withDeadline is in place, but fail
        // loudly rather than hang the test suite silently if it ever does.
        throw new Error("provider-fault: drop-before rule matched a request with no AbortSignal");
      }
      return new Promise<Response>((_resolve, reject) => {
        if (signal.aborted) {
          reject(signal.reason);
          return;
        }
        signal.addEventListener("abort", () => reject(signal.reason), { once: true });
      });
    }

    // forward-then-drop: forward WITHOUT the caller's signal (so a slow GoTrue answer is not cut
    // off by this test's own deadline — the point is to observe whether the request actually
    // landed, not to race it), and ALWAYS reject at the caller's own abort regardless of how far
    // the forward has gotten.
    const record: SeenRequest = {
      method,
      url,
      body: parseBody(bodyText),
      rule: matchedRule,
      outcome: "forwarded-then-dropped",
    };
    seen.push(record);
    const forwardInit = init ? { ...init, signal: undefined } : init;

    // The forward runs to its own conclusion independently of the caller's abort below —
    // `forwardCompleted` is set once GoTrue's (or the test server's) full response body has
    // actually been read, whenever that happens, even if it is well after the caller already saw
    // an abort. `forwardIncomplete` means something different: the forward attempt itself never
    // reached a completed response at all (it errored — including because something upstream, a
    // broken implementation forwarding the caller's own signal, aborted IT too) — never merely
    // "hadn't finished yet at the instant the caller's own deadline fired", which is the normal,
    // expected shape of this fault and must not itself count as incomplete.
    (async () => {
      const response = await originalFetch(input, forwardInit);
      await response.clone().arrayBuffer();
      record.forwardCompleted = true;
      return response;
    })().catch((err) => {
      record.forwardIncomplete = true;
      // Swallow: the forward's own result is never returned to the caller (who always sees the
      // abort below instead), so this must not surface as an unhandled rejection.
      void err;
    });

    const signal = init?.signal;
    if (!signal) {
      throw new Error("provider-fault: forward-then-drop rule matched a request with no AbortSignal");
    }

    return new Promise<Response>((_resolve, reject) => {
      const onAbort = () => reject(signal.reason);
      if (signal.aborted) {
        onAbort();
        return;
      }
      signal.addEventListener("abort", onAbort, { once: true });
    });
  };

  globalThis.fetch = wrapped;

  return {
    seen,
    restore: () => {
      globalThis.fetch = originalFetch;
    },
  };
}
