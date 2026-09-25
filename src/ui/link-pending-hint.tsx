"use client";

import { useLinkStatus } from "next/link";

// loading-feedback design.md D5: rendered as a child of a <Link>. useLinkStatus() is only valid
// inside a descendant of <Link> (this version's next/link, see node_modules/next/dist/docs).
//
// Revised in the code review: it renders an empty marker that takes no space, and the link itself
// shows the pending state (globals.css, `a:has(.link-pending-hint[data-pending])`: dimmed, gently
// pulsing, progress cursor). A visible spinner slot beside the label made every link wider at rest
// than before, the same idle-width regression the SubmitButton had. Next's docs suggest exactly
// this kind of feedback for useLinkStatus ("a shimmer effect over the clicked link").
export function LinkPendingHint() {
  const { pending } = useLinkStatus();
  return <span className="link-pending-hint" data-pending={pending ? "" : undefined} aria-hidden="true" />;
}
