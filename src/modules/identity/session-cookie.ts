import "server-only";
import { cookies } from "next/headers";
import { resolveSessionContext } from "./repository";
import { isUuid, type SessionContext } from "@/db/session-context";

const COOKIE_NAME = "flatmate_session";

// Cookie value is `${sessionId}.${householdId}` — householdId is not a secret (C-1.4: "keine
// Sicherheitsgrenze, nur Zuordnung"), so storing it in plain cookie text costs nothing; the actual
// bearer credential is sessionId, which only resolves to a live context via a DB row that must be
// unrevoked and unexpired (identity/repository.ts's resolveSessionContext).
export async function setSessionCookie(sessionId: string, householdId: string): Promise<void> {
  const store = await cookies();
  store.set(COOKIE_NAME, `${sessionId}.${householdId}`, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 90, // matches Session.expiresAt's long-lived default (research.md-adjacent)
  });
}

export async function clearSessionCookie(): Promise<void> {
  const store = await cookies();
  store.delete(COOKIE_NAME);
}

export interface CurrentSession {
  sessionId: string;
  context: SessionContext;
}

// FR-1.6/AC-1.6: reads the fixed acting identity for the current request. Returns null if there is
// no cookie, or the session it names is revoked/expired/gone — never partially trusts a stale
// cookie.
export async function getCurrentSession(): Promise<CurrentSession | null> {
  const store = await cookies();
  const raw = store.get(COOKIE_NAME)?.value;
  if (!raw) return null;

  const separatorIndex = raw.indexOf(".");
  if (separatorIndex === -1) return null;
  const sessionId = raw.slice(0, separatorIndex);
  const householdId = raw.slice(separatorIndex + 1);

  // A tampered or stale cookie can carry a non-UUID segment (e.g. `sessionId.not-a-uuid`), which
  // would otherwise reach withSessionContext's assertUuid and throw a plain Error instead of the
  // documented no-session path. Fail closed here, before it gets that far.
  if (!isUuid(sessionId) || !isUuid(householdId)) return null;

  const context = await resolveSessionContext(sessionId, householdId);
  if (!context) return null;
  return { sessionId, context };
}
