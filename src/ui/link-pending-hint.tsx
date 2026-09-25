"use client";

import { useLinkStatus } from "next/link";

// loading-feedback design.md D5: rendered as a child of a <Link>. useLinkStatus() is only valid
// inside a descendant of <Link> (this version's next/link, see node_modules/next/dist/docs). The
// slot is always rendered at a fixed size, so nothing shifts when the spinner appears — only the
// slot's own content toggles.
export function LinkPendingHint() {
  const { pending } = useLinkStatus();
  return (
    <span className="link-pending-hint" aria-hidden="true">
      {pending && <span className="spinner" />}
    </span>
  );
}
