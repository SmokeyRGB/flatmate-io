"use server";

import { redirect } from "next/navigation";
import { revokeSession } from "@/modules/identity/repository";
import { clearSessionCookie, getCurrentSession } from "@/modules/identity/session-cookie";

// FR-1.6/ADR-013: the only way to change the acting identity — end this session, sign in again.
// No control anywhere mutates acting_profile_id in place.
export async function signOutAction(): Promise<void> {
  const current = await getCurrentSession();
  if (current) {
    await revokeSession(current.context, current.sessionId);
  }
  await clearSessionCookie();
  redirect("/sign-in");
}
