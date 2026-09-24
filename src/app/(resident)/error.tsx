"use client";

import { de } from "@/ui/strings";

const t = de.resident.unexpectedError;

// design.md Decision 11: one shared error boundary for every `(resident)` screen. Mirrors
// `src/app/(auth)/join/error.tsx` exactly: G-A5-shaped reasoning applies here too (any request
// data reaching this boundary must never leak into a log or the screen), so it NEVER logs to a
// browser or terminal console and NEVER renders the underlying failure's own text or its digest —
// it destructures only `retry` from its props, never `error`. tests/unit/start/dashboard-error-
// boundary-silent.test.ts checks this file's own source text.
//
// This Next version's error boundary takes `{ error, retry }`, not the older `{ error, reset }`.
export default function ResidentErrorBoundary({
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  return (
    <div className="mx-auto max-w-md space-y-4 p-6">
      <div role="alert" className="callout callout-caution">
        <div>
          <p>{t.heading}</p>
          <p>{t.body}</p>
        </div>
      </div>
      <button type="button" onClick={() => retry()} className="btn btn-primary w-full">
        {t.retry}
      </button>
    </div>
  );
}
