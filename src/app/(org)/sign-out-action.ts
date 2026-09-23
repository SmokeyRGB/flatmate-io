"use server";

import { redirect } from "next/navigation";
import { revokeSession } from "@/modules/identity/repository";
import { clearSessionCookie, getCurrentSession } from "@/modules/identity/session-cookie";

// FR-1.6/ADR-013: the only way to change the acting identity — end this session, sign in again.
// No control anywhere mutates acting_profile_id in place.
//
// review fix: revokeSession can now throw (e.g. PermissionDeniedError on a stale/foreign session
// id). The cookie must be cleared regardless, so the browser never keeps presenting a session
// that failed to revoke — hence the try/finally. redirect() stays OUTSIDE the try: Next.js
// implements it by throwing, and a throw from inside the try would just be caught by the
// (nonexistent) catch and re-thrown through finally anyway, but keeping it outside makes the
// control flow explicit rather than relying on that.
export async function signOutAction(): Promise<void> {
  const current = await getCurrentSession();
  if (current) {
    try {
      await revokeSession(current.context, current.sessionId);
    } finally {
      await clearSessionCookie();
    }
  } else {
    await clearSessionCookie();
  }
  redirect("/sign-in");
}
