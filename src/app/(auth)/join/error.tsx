"use client";

import { de } from "@/ui/strings";

const t = de.join.unexpectedError;

// design.md Decision 5: sits at the `join/` level, so it covers `/join` AND `/join/[code]` alike —
// a failed page load, a throw from `signOutAndReturnAction`, or a throw from the manual-entry
// action all land here. G-A5: this route's unexpected-failure text is exactly where a code could
// leak into a log or a screen, so this component NEVER logs to a browser or terminal console and
// NEVER renders the underlying failure's own text or its generated digest identifier — the
// no-logging rule also covers Next's default browser-to-terminal forwarding, which would otherwise
// carry a logged failure straight into the dev terminal. The copy is deliberately generic (not "the
// join failed") because it also covers the sign-out and manual-entry paths, none of which are about
// joining specifically. tests/unit/identity/join-error-boundary-silent.test.ts (task 7.5) checks
// this file's own source text for the patterns this comment is deliberately not spelling out.
//
// This Next version's error boundary takes `{ error, retry }`, not the older `{ error, reset }`
// (node_modules/next/dist/docs/.../file-conventions/error.md).
export default function JoinErrorBoundary({
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  return (
    <div className="space-y-4">
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
